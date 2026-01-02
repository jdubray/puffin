/**
 * Puffin - Main Process
 *
 * Entry point for the Electron application.
 * Handles window creation and IPC setup.
 *
 * Puffin opens a directory (like VSCode) and stores state in .puffin/
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const { setupIpcHandlers, setupPluginHandlers, setupPluginManagerHandlers, setupViewRegistryHandlers, setupPluginStyleHandlers, getPuffinState, setClaudeServicePluginManager } = require('./ipc-handlers')
const { PluginLoader, PluginManager, HistoryService } = require('./plugins')

// Keep a global reference of the window object
let mainWindow = null

// The directory Puffin is currently working with
let currentProjectPath = null

// Plugin system instances
let pluginLoader = null
let pluginManager = null
let historyService = null

/**
 * Create the application menu
 */
function createMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    // App Menu (macOS only)
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { label: 'About Puffin', role: 'about' },
        { type: 'separator' },
        { label: 'Hide Puffin', role: 'hide' },
        { label: 'Hide Others', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' }
      ]
    }] : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Profile',
          submenu: [
            {
              label: 'View Profile',
              accelerator: 'CmdOrCtrl+Shift+P',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('profile:view')
                }
              }
            },
            {
              label: 'Create Profile',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('profile:create')
                }
              }
            },
            {
              label: 'Edit Profile',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('profile:edit')
                }
              }
            },
            { type: 'separator' },
            {
              label: 'Export Profile...',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('profile:export')
                }
              }
            },
            {
              label: 'Import Profile...',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('profile:import')
                }
              }
            },
            { type: 'separator' },
            {
              label: 'Delete Profile',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('profile:delete')
                }
              }
            }
          ]
        },
        { type: 'separator' },
        ...(isMac ? [
          { label: 'Close', role: 'close' }
        ] : [
          { label: 'Exit', role: 'quit' }
        ])
      ]
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        ...(isMac ? [
          { label: 'Paste and Match Style', role: 'pasteandmatchstyle' },
          { label: 'Delete', role: 'delete' },
          { label: 'Select All', role: 'selectall' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { label: 'Start Speaking', role: 'startspeaking' },
              { label: 'Stop Speaking', role: 'stopspeaking' }
            ]
          }
        ] : [
          { label: 'Delete', role: 'delete' },
          { type: 'separator' },
          { label: 'Select All', role: 'selectall' }
        ])
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forcereload' },
        { label: 'Toggle Developer Tools', role: 'toggledevtools' },
        { type: 'separator' },
        { label: 'Actual Size', role: 'resetzoom' },
        { label: 'Zoom In', role: 'zoomin' },
        { label: 'Zoom Out', role: 'zoomout' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', role: 'togglefullscreen' }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Close', role: 'close' },
        ...(isMac ? [
          { type: 'separator' },
          { label: 'Bring All to Front', role: 'front' }
        ] : [])
      ]
    },

    // Help Menu
    {
      role: 'help',
      submenu: [
        {
          label: 'About Puffin',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://github.com/jdubray/puffin')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Puffin',
    icon: path.join(__dirname, '../renderer/img/logo.png'),
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Load the main HTML file
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  // Open DevTools in development
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools()
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle window ready - send project path if we have one
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app:ready', {
      projectPath: currentProjectPath
    })
  })
}

/**
 * Show directory picker dialog
 * @returns {Promise<string|null>} Selected directory path or null
 */
async function pickDirectory() {
  const result = await dialog.showOpenDialog({
    title: 'Open Project Directory',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Open Project'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Parse command line arguments for project path
 */
function getProjectPathFromArgs() {
  // Skip electron and script paths
  const args = process.argv.slice(app.isPackaged ? 1 : 2)

  // Find a path argument (not a flag)
  for (const arg of args) {
    if (!arg.startsWith('-') && !arg.startsWith('--')) {
      // Check if it's a valid directory
      const fs = require('fs')
      try {
        const stat = fs.statSync(arg)
        if (stat.isDirectory()) {
          return path.resolve(arg)
        }
      } catch {
        // Not a valid path, continue
      }
    }
  }

  return null
}

/**
 * Application lifecycle handlers
 */

// Ready to create windows
app.whenReady().then(async () => {
  // Check if project path was passed as argument
  currentProjectPath = getProjectPathFromArgs()

  // If no path provided, show directory picker
  if (!currentProjectPath) {
    currentProjectPath = await pickDirectory()
  }

  // If still no path (user cancelled), quit
  if (!currentProjectPath) {
    console.log('No project directory selected, exiting.')
    app.quit()
    return
  }

  console.log('Opening project:', currentProjectPath)

  // Update window title with project name
  const projectName = path.basename(currentProjectPath)

  // Setup IPC handlers before creating window
  setupIpcHandlers(ipcMain, currentProjectPath)

  // Initialize plugin loader
  // In development, load plugins from the project's plugins/ directory
  // In production, this will use ~/.puffin/plugins/
  const isDevelopment = process.env.NODE_ENV !== 'production'
  const pluginsDir = isDevelopment
    ? path.join(__dirname, '..', '..', 'plugins')
    : path.join(require('os').homedir(), '.puffin', 'plugins')

  pluginLoader = new PluginLoader({ pluginsDir })
  console.log(`[Plugins] Loading from: ${pluginsDir}`)

  // Setup plugin event logging
  pluginLoader.on('plugin:discovered', ({ plugin }) => {
    console.log(`[Plugins] Discovered: ${plugin.displayName} (${plugin.name}@${plugin.version})`)
  })

  pluginLoader.on('plugin:validated', ({ plugin }) => {
    console.log(`[Plugins] Validated: ${plugin.name}`)
  })

  pluginLoader.on('plugin:validation-failed', ({ plugin, errors }) => {
    console.warn(`[Plugins] Validation failed for ${plugin.name}:`, errors.map(e => e.message).join('; '))
  })

  pluginLoader.on('plugin:loaded', ({ plugin }) => {
    console.log(`[Plugins] Loaded: ${plugin.name}`)
  })

  pluginLoader.on('plugin:load-failed', ({ plugin, error }) => {
    console.error(`[Plugins] Failed to load ${plugin.name}:`, error.message)
  })

  pluginLoader.on('plugins:complete', ({ loaded, failed }) => {
    console.log(`[Plugins] Complete: ${loaded.length} loaded, ${failed.length} failed`)
  })

  // Setup plugin IPC handlers
  setupPluginHandlers(ipcMain, pluginLoader)

  // Load plugins (non-blocking, errors are logged but don't crash app)
  // Create history service with lazy puffinState access
  historyService = new HistoryService({
    getPuffinState: getPuffinState
  })

  pluginLoader.loadPlugins()
    .then(() => {
      // Initialize plugin manager after plugins are loaded
      // Pass history service so plugins can access it
      pluginManager = new PluginManager({
        loader: pluginLoader,
        ipcMain: ipcMain,
        services: {
          history: historyService
        },
        projectPath: currentProjectPath
      })

      // Setup plugin manager event logging
      pluginManager.on('plugin:activated', ({ name }) => {
        console.log(`[PluginManager] Activated: ${name}`)
      })

      pluginManager.on('plugin:activation-failed', ({ name, error }) => {
        console.error(`[PluginManager] Activation failed for ${name}:`, error.message)
      })

      pluginManager.on('plugin:deactivated', ({ name }) => {
        console.log(`[PluginManager] Deactivated: ${name}`)
      })

      pluginManager.on('plugin:enabled', ({ name }) => {
        console.log(`[PluginManager] Enabled: ${name}`)
      })

      pluginManager.on('plugin:disabled', ({ name }) => {
        console.log(`[PluginManager] Disabled: ${name}`)
      })

      // Setup plugin manager IPC handlers
      setupPluginManagerHandlers(ipcMain, pluginManager, mainWindow)

      // Setup view registry IPC handlers
      setupViewRegistryHandlers(ipcMain, pluginManager.getViewRegistry(), mainWindow)

      // Setup plugin style handlers
      setupPluginStyleHandlers(ipcMain, pluginManager)

      // Connect plugin manager to Claude service for branch focus retrieval
      setClaudeServicePluginManager(pluginManager)

      // Initialize and activate enabled plugins
      return pluginManager.initialize()
    })
    .then(({ activated, failed, disabled }) => {
      console.log(`[PluginManager] Initialization complete: ${activated.length} activated, ${failed.length} failed, ${disabled.length} disabled`)
    })
    .catch(err => {
      console.error('[Plugins] Error during plugin initialization:', err.message)
    })

  // Create the application menu
  createMenu()

  createWindow()

  // Update title after window is created
  if (mainWindow) {
    mainWindow.setTitle(`Puffin - ${projectName}`)
  }

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup plugins before app exits
app.on('before-quit', async (event) => {
  if (pluginManager && !pluginManager.shuttingDown) {
    event.preventDefault()
    try {
      await pluginManager.shutdown()
    } catch (error) {
      console.error('[App] Error during plugin shutdown:', error.message)
    }
    app.quit()
  }
})

// Handle second instance (single instance lock)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    // Check if second instance has a path argument
    const args = commandLine.slice(1)
    for (const arg of args) {
      if (!arg.startsWith('-')) {
        const fs = require('fs')
        try {
          const stat = fs.statSync(arg)
          if (stat.isDirectory()) {
            // Could open new window with this path
            // For now, just focus existing window
            break
          }
        } catch {
          // Continue
        }
      }
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Security: Disable navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault()
    }
  })
})
