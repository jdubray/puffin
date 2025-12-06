/**
 * Puffin - Main Process
 *
 * Entry point for the Electron application.
 * Handles window creation and IPC setup.
 *
 * Puffin opens a directory (like VSCode) and stores state in .puffin/
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { setupIpcHandlers } = require('./ipc-handlers')

// Keep a global reference of the window object
let mainWindow = null

// The directory Puffin is currently working with
let currentProjectPath = null

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
