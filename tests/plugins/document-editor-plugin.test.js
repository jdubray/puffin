/**
 * Document Editor Plugin Tests
 *
 * Tests for the Document Editor plugin structure, lifecycle, and core functionality.
 */

const path = require('path')
const fs = require('fs').promises
const os = require('os')

// Plugin module
const DocumentEditorPlugin = require('../../plugins/document-editor-plugin/index')

describe('DocumentEditorPlugin', () => {
  let mockContext
  let testDir
  let userDataDir

  beforeEach(async () => {
    // Create temp directories for tests
    testDir = path.join(os.tmpdir(), `document-editor-test-${Date.now()}`)
    userDataDir = path.join(testDir, 'userData')
    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(userDataDir, { recursive: true })

    // Create mock plugin context
    mockContext = {
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      registerIpcHandler: jest.fn(),
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          send: jest.fn()
        }
      }
    }

    // Mock electron app.getPath
    jest.mock('electron', () => ({
      app: {
        getPath: jest.fn(() => userDataDir)
      },
      dialog: {
        showOpenDialog: jest.fn(),
        showSaveDialog: jest.fn()
      }
    }), { virtual: true })
  })

  afterEach(async () => {
    // Deactivate plugin if active
    if (DocumentEditorPlugin.context) {
      await DocumentEditorPlugin.deactivate()
    }

    // Reset plugin state
    DocumentEditorPlugin.recentFiles = []
    DocumentEditorPlugin.fileWatchers = new Map()
    DocumentEditorPlugin.allowedBasePaths = []

    // Cleanup temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('Plugin Structure', () => {
    it('should have required name property', () => {
      expect(DocumentEditorPlugin.name).toBe('document-editor-plugin')
    })

    it('should have required lifecycle methods', () => {
      expect(typeof DocumentEditorPlugin.activate).toBe('function')
      expect(typeof DocumentEditorPlugin.deactivate).toBe('function')
    })

    it('should have null initial context', () => {
      expect(DocumentEditorPlugin.context).toBeNull()
    })

    it('should have empty initial state', () => {
      expect(DocumentEditorPlugin.recentFiles).toEqual([])
      expect(DocumentEditorPlugin.fileWatchers).toBeInstanceOf(Map)
      expect(DocumentEditorPlugin.fileWatchers.size).toBe(0)
    })
  })

  describe('isExtensionSupported()', () => {
    it('should support common text file extensions', () => {
      expect(DocumentEditorPlugin.isExtensionSupported('test.txt')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.md')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.js')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.ts')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.json')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.html')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.css')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.py')).toBe(true)
    })

    it('should support files without extension', () => {
      expect(DocumentEditorPlugin.isExtensionSupported('Makefile')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('Dockerfile')).toBe(true)
    })

    it('should be case-insensitive for extensions', () => {
      expect(DocumentEditorPlugin.isExtensionSupported('test.JS')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.MD')).toBe(true)
      expect(DocumentEditorPlugin.isExtensionSupported('test.TXT')).toBe(true)
    })
  })

  describe('getExtension()', () => {
    it('should return lowercase extension with dot', () => {
      expect(DocumentEditorPlugin.getExtension('test.js')).toBe('.js')
      expect(DocumentEditorPlugin.getExtension('test.MD')).toBe('.md')
      expect(DocumentEditorPlugin.getExtension('path/to/file.tsx')).toBe('.tsx')
    })

    it('should return empty string for files without extension', () => {
      expect(DocumentEditorPlugin.getExtension('Makefile')).toBe('')
      expect(DocumentEditorPlugin.getExtension('README')).toBe('')
    })
  })
})

describe('Path Validation', () => {
  // Test the validateFilePath function indirectly through plugin methods
  // since it's a module-level function

  let mockContext
  let testDir
  let userDataDir

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `path-validation-test-${Date.now()}`)
    userDataDir = path.join(testDir, 'userData')
    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(userDataDir, { recursive: true })

    mockContext = {
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      registerIpcHandler: jest.fn(),
      mainWindow: null
    }
  })

  afterEach(async () => {
    if (DocumentEditorPlugin.context) {
      await DocumentEditorPlugin.deactivate()
    }
    DocumentEditorPlugin.recentFiles = []
    DocumentEditorPlugin.fileWatchers = new Map()
    DocumentEditorPlugin.allowedBasePaths = []

    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('readFile() path validation', () => {
    it('should reject null file path', async () => {
      // Manually set up plugin state for testing
      DocumentEditorPlugin.context = mockContext
      DocumentEditorPlugin.allowedBasePaths = [testDir]

      const result = await DocumentEditorPlugin.readFile({ path: null })

      expect(result.error).toBeDefined()
    })

    it('should reject empty file path', async () => {
      DocumentEditorPlugin.context = mockContext
      DocumentEditorPlugin.allowedBasePaths = [testDir]

      const result = await DocumentEditorPlugin.readFile({ path: '' })

      expect(result.error).toBeDefined()
    })
  })

  describe('saveFile() path validation', () => {
    it('should reject null file path', async () => {
      DocumentEditorPlugin.context = mockContext
      DocumentEditorPlugin.allowedBasePaths = [testDir]

      const result = await DocumentEditorPlugin.saveFile({ path: null, content: 'test' })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject missing content', async () => {
      DocumentEditorPlugin.context = mockContext
      DocumentEditorPlugin.allowedBasePaths = [testDir]

      const result = await DocumentEditorPlugin.saveFile({ path: path.join(testDir, 'test.txt') })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Content is required')
    })
  })

  describe('watchFile() path validation', () => {
    it('should reject null file path', async () => {
      DocumentEditorPlugin.context = mockContext
      DocumentEditorPlugin.allowedBasePaths = [testDir]

      const result = await DocumentEditorPlugin.watchFile({ filePath: null })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('Recent Files Management', () => {
  let testDir

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `recent-files-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })

    DocumentEditorPlugin.recentFiles = []
    DocumentEditorPlugin.recentFilesPath = path.join(testDir, 'recent-files.json')
    DocumentEditorPlugin.context = {
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    }
  })

  afterEach(async () => {
    DocumentEditorPlugin.recentFiles = []
    DocumentEditorPlugin.context = null

    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('addRecentFile()', () => {
    it('should add file to recent files list', async () => {
      const filePath = path.join(testDir, 'test.txt')

      const result = await DocumentEditorPlugin.addRecentFile({ path: filePath })

      expect(result.success).toBe(true)
      expect(DocumentEditorPlugin.recentFiles.length).toBe(1)
      expect(DocumentEditorPlugin.recentFiles[0].path).toBe(filePath)
    })

    it('should include display name and timestamp', async () => {
      const filePath = path.join(testDir, 'myfile.js')

      await DocumentEditorPlugin.addRecentFile({ path: filePath })

      expect(DocumentEditorPlugin.recentFiles[0].displayName).toBe('myfile.js')
      expect(DocumentEditorPlugin.recentFiles[0].lastOpened).toBeDefined()
    })

    it('should move existing file to top of list', async () => {
      const file1 = path.join(testDir, 'file1.txt')
      const file2 = path.join(testDir, 'file2.txt')

      await DocumentEditorPlugin.addRecentFile({ path: file1 })
      await DocumentEditorPlugin.addRecentFile({ path: file2 })
      await DocumentEditorPlugin.addRecentFile({ path: file1 })

      expect(DocumentEditorPlugin.recentFiles.length).toBe(2)
      expect(DocumentEditorPlugin.recentFiles[0].path).toBe(file1)
      expect(DocumentEditorPlugin.recentFiles[1].path).toBe(file2)
    })

    it('should limit recent files to maximum count', async () => {
      // Add more than MAX_RECENT_FILES (10)
      for (let i = 0; i < 15; i++) {
        await DocumentEditorPlugin.addRecentFile({ path: path.join(testDir, `file${i}.txt`) })
      }

      expect(DocumentEditorPlugin.recentFiles.length).toBe(10)
    })

    it('should reject empty path', async () => {
      const result = await DocumentEditorPlugin.addRecentFile({ path: '' })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('saveRecentFiles() atomic write', () => {
    it('should save recent files to disk', async () => {
      DocumentEditorPlugin.recentFiles = [
        { path: '/test/file.txt', displayName: 'file.txt', lastOpened: new Date().toISOString() }
      ]

      await DocumentEditorPlugin.saveRecentFiles()

      const content = await fs.readFile(DocumentEditorPlugin.recentFilesPath, 'utf-8')
      const saved = JSON.parse(content)

      expect(saved.length).toBe(1)
      expect(saved[0].displayName).toBe('file.txt')
    })

    it('should not leave temp file on success', async () => {
      DocumentEditorPlugin.recentFiles = [
        { path: '/test/file.txt', displayName: 'file.txt', lastOpened: new Date().toISOString() }
      ]

      await DocumentEditorPlugin.saveRecentFiles()

      const tempPath = `${DocumentEditorPlugin.recentFilesPath}.tmp`
      await expect(fs.access(tempPath)).rejects.toThrow()
    })
  })
})

describe('File Watcher Management', () => {
  beforeEach(() => {
    DocumentEditorPlugin.fileWatchers = new Map()
    DocumentEditorPlugin.context = {
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      mainWindow: null
    }
    DocumentEditorPlugin.allowedBasePaths = [os.tmpdir()]
  })

  afterEach(() => {
    // Clean up any watchers
    for (const [, watcher] of DocumentEditorPlugin.fileWatchers) {
      try {
        watcher.close()
      } catch {
        // Ignore errors
      }
    }
    DocumentEditorPlugin.fileWatchers = new Map()
    DocumentEditorPlugin.context = null
    DocumentEditorPlugin.allowedBasePaths = []
  })

  describe('unwatchFile()', () => {
    it('should return success for non-watched file', async () => {
      const result = await DocumentEditorPlugin.unwatchFile({ filePath: '/some/path.txt' })

      expect(result.success).toBe(true)
    })

    it('should reject empty path', async () => {
      const result = await DocumentEditorPlugin.unwatchFile({ filePath: '' })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('Plugin Manifest', () => {
  let manifest

  beforeAll(async () => {
    const manifestPath = path.join(__dirname, '..', '..', 'plugins', 'document-editor-plugin', 'puffin-plugin.json')
    const content = await fs.readFile(manifestPath, 'utf-8')
    manifest = JSON.parse(content)
  })

  it('should have required name field', () => {
    expect(manifest.name).toBe('document-editor-plugin')
  })

  it('should have required version field', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('should have required main field', () => {
    expect(manifest.main).toBe('index.js')
  })

  it('should have displayName for UI', () => {
    expect(manifest.displayName).toBeDefined()
    expect(typeof manifest.displayName).toBe('string')
  })

  it('should have description', () => {
    expect(manifest.description).toBeDefined()
    expect(typeof manifest.description).toBe('string')
  })

  it('should have activationEvents', () => {
    expect(manifest.activationEvents).toBeDefined()
    expect(Array.isArray(manifest.activationEvents)).toBe(true)
    expect(manifest.activationEvents).toContain('onStartup')
  })

  it('should declare IPC handlers', () => {
    expect(manifest.extensionPoints).toBeDefined()
    expect(manifest.extensionPoints.ipcHandlers).toBeDefined()
    expect(Array.isArray(manifest.extensionPoints.ipcHandlers)).toBe(true)
    expect(manifest.extensionPoints.ipcHandlers).toContain('document-editor:readFile')
    expect(manifest.extensionPoints.ipcHandlers).toContain('document-editor:saveFile')
  })
})
