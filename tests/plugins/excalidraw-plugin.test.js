/**
 * Tests for Excalidraw Plugin
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs').promises
const os = require('os')

// ============ Storage Tests ============

describe('ExcalidrawStorage', () => {
  let ExcalidrawStorage, DuplicateNameError
  let storage
  let testDir

  before(async () => {
    const mod = require('../../plugins/excalidraw-plugin/excalidraw-storage')
    ExcalidrawStorage = mod.ExcalidrawStorage
    DuplicateNameError = mod.DuplicateNameError
  })

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `excalidraw-test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`)
    storage = new ExcalidrawStorage(testDir, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    })
    await storage.ensureDesignsDirectory()
  })

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  // Helper to build valid scene data
  function makeScene(elements = []) {
    return {
      elements,
      appState: { theme: 'light' },
      files: {}
    }
  }

  describe('ensureDesignsDirectory', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = path.join(testDir, 'nested', 'subdir')
      const s = new ExcalidrawStorage(newDir, { debug: () => {} })
      await s.ensureDesignsDirectory()

      const stat = await fs.stat(newDir)
      assert.ok(stat.isDirectory())
    })

    it('should not throw if directory already exists', async () => {
      await storage.ensureDesignsDirectory()
      // Second call should not throw
      await storage.ensureDesignsDirectory()
    })
  })

  describe('sanitizeFilename', () => {
    it('should replace non-alphanumeric characters with underscore', () => {
      assert.strictEqual(storage.sanitizeFilename('My Design!'), 'my_design_')
    })

    it('should lowercase the result', () => {
      assert.strictEqual(storage.sanitizeFilename('HelloWorld'), 'helloworld')
    })

    it('should preserve hyphens and underscores', () => {
      assert.strictEqual(storage.sanitizeFilename('my-design_v2'), 'my-design_v2')
    })

    it('should handle empty-ish names', () => {
      assert.strictEqual(storage.sanitizeFilename('!!!'), '___')
    })
  })

  describe('validateFilename', () => {
    it('should accept valid .excalidraw filenames', () => {
      assert.doesNotThrow(() => storage.validateFilename('test.excalidraw'))
    })

    it('should reject empty filename', () => {
      assert.throws(() => storage.validateFilename(''), /non-empty string/)
    })

    it('should reject null filename', () => {
      assert.throws(() => storage.validateFilename(null), /non-empty string/)
    })

    it('should reject non-string filename', () => {
      assert.throws(() => storage.validateFilename(123), /non-empty string/)
    })

    it('should reject path traversal with ..', () => {
      assert.throws(() => storage.validateFilename('../test.excalidraw'), /path traversal/)
    })

    it('should reject path traversal with forward slash', () => {
      assert.throws(() => storage.validateFilename('sub/test.excalidraw'), /path traversal/)
    })

    it('should reject path traversal with backslash', () => {
      assert.throws(() => storage.validateFilename('sub\\test.excalidraw'), /path traversal/)
    })

    it('should reject non-.excalidraw extension', () => {
      assert.throws(() => storage.validateFilename('test.json'), /\.excalidraw file/)
    })

    it('should reject .json extension', () => {
      assert.throws(() => storage.validateFilename('test.json'), /\.excalidraw file/)
    })
  })

  describe('validateSceneData', () => {
    it('should accept valid scene data', () => {
      assert.doesNotThrow(() => storage.validateSceneData({ elements: [] }))
    })

    it('should reject null scene data', () => {
      assert.throws(() => storage.validateSceneData(null), /must be an object/)
    })

    it('should reject non-object scene data', () => {
      assert.throws(() => storage.validateSceneData('string'), /must be an object/)
    })

    it('should reject scene data without elements array', () => {
      assert.throws(() => storage.validateSceneData({ elements: 'not-array' }), /elements must be an array/)
    })

    it('should reject scene data with missing elements', () => {
      assert.throws(() => storage.validateSceneData({}), /elements must be an array/)
    })
  })

  describe('saveDesign', () => {
    it('should save a design and return filename + meta', async () => {
      const result = await storage.saveDesign('Test Design', makeScene([{ id: '1', type: 'rectangle' }]), { description: 'A test' })

      assert.strictEqual(result.filename, 'test_design.excalidraw')
      assert.ok(result.design.id)
      assert.strictEqual(result.design.name, 'Test Design')
      assert.strictEqual(result.design.description, 'A test')
      assert.strictEqual(result.design.elementCount, 1)
      assert.ok(result.design.createdAt)
      assert.ok(result.design.lastModified)
    })

    it('should create both .excalidraw and .meta.json files', async () => {
      await storage.saveDesign('FileCheck', makeScene())

      const sceneExists = await fs.stat(path.join(testDir, 'filecheck.excalidraw')).then(() => true, () => false)
      const metaExists = await fs.stat(path.join(testDir, 'filecheck.meta.json')).then(() => true, () => false)

      assert.ok(sceneExists, '.excalidraw file should exist')
      assert.ok(metaExists, '.meta.json file should exist')
    })

    it('should write valid Excalidraw scene format', async () => {
      await storage.saveDesign('Format Test', makeScene([{ id: 'el1', type: 'text' }]))

      const content = await fs.readFile(path.join(testDir, 'format_test.excalidraw'), 'utf-8')
      const scene = JSON.parse(content)

      assert.strictEqual(scene.type, 'excalidraw')
      assert.strictEqual(scene.version, 2)
      assert.strictEqual(scene.source, 'puffin-excalidraw-plugin')
      assert.ok(Array.isArray(scene.elements))
      assert.ok(typeof scene.appState === 'object')
      assert.ok(typeof scene.files === 'object')
    })

    it('should throw on empty name', async () => {
      await assert.rejects(
        () => storage.saveDesign('', makeScene()),
        /name is required/
      )
    })

    it('should throw on invalid scene data', async () => {
      await assert.rejects(
        () => storage.saveDesign('Bad Scene', { elements: 'not-array' }),
        /elements must be an array/
      )
    })

    it('should throw DuplicateNameError on duplicate name', async () => {
      await storage.saveDesign('Unique', makeScene())

      try {
        await storage.saveDesign('Unique', makeScene())
        assert.fail('Expected DuplicateNameError')
      } catch (err) {
        assert.strictEqual(err.code, 'DUPLICATE_NAME')
        assert.strictEqual(err.duplicateName, 'Unique')
        assert.strictEqual(err.existingFilename, 'unique.excalidraw')
      }
    })

    it('should default metadata fields when not provided', async () => {
      const result = await storage.saveDesign('Defaults', makeScene())

      assert.strictEqual(result.design.description, '')
      assert.strictEqual(result.design.thumbnailData, null)
    })

    it('should save thumbnailData when provided in metadata', async () => {
      const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
      const result = await storage.saveDesign('With Thumb', makeScene([{ id: '1' }]), {
        description: 'Has thumbnail',
        thumbnailData: thumbnail
      })

      assert.strictEqual(result.design.thumbnailData, thumbnail)

      // Verify persisted in meta file
      const metaContent = await fs.readFile(path.join(testDir, 'with_thumb.meta.json'), 'utf-8')
      const meta = JSON.parse(metaContent)
      assert.strictEqual(meta.thumbnailData, thumbnail)
    })

    it('should write source as puffin-excalidraw-plugin in scene file', async () => {
      await storage.saveDesign('Source Check', makeScene())

      const content = await fs.readFile(path.join(testDir, 'source_check.excalidraw'), 'utf-8')
      const scene = JSON.parse(content)
      assert.strictEqual(scene.source, 'puffin-excalidraw-plugin')
    })
  })

  describe('loadDesign', () => {
    it('should load a previously saved design', async () => {
      const saved = await storage.saveDesign('Load Me', makeScene([{ id: '1', type: 'arrow' }]))
      const loaded = await storage.loadDesign(saved.filename)

      assert.ok(loaded.scene)
      assert.ok(loaded.meta)
      assert.strictEqual(loaded.scene.type, 'excalidraw')
      assert.strictEqual(loaded.scene.elements.length, 1)
      assert.strictEqual(loaded.meta.name, 'Load Me')
    })

    it('should throw for non-existent design', async () => {
      await assert.rejects(
        () => storage.loadDesign('nonexistent.excalidraw'),
        /Design not found/
      )
    })

    it('should handle missing meta file gracefully', async () => {
      // Save, then delete meta file
      await storage.saveDesign('No Meta', makeScene([{ id: '1' }]))
      await fs.unlink(path.join(testDir, 'no_meta.meta.json'))

      const loaded = await storage.loadDesign('no_meta.excalidraw')

      assert.ok(loaded.scene)
      assert.ok(loaded.meta)
      assert.strictEqual(loaded.meta.name, 'no_meta')
      assert.strictEqual(loaded.meta.elementCount, 1)
    })

    it('should reject invalid filename', async () => {
      await assert.rejects(
        () => storage.loadDesign('../evil.excalidraw'),
        /path traversal/
      )
    })
  })

  describe('listDesigns', () => {
    it('should return empty array when no designs exist', async () => {
      const list = await storage.listDesigns()
      assert.ok(Array.isArray(list))
      assert.strictEqual(list.length, 0)
    })

    it('should list all saved designs', async () => {
      await storage.saveDesign('Design A', makeScene([{ id: '1' }]))
      await storage.saveDesign('Design B', makeScene([{ id: '2' }, { id: '3' }]))

      const list = await storage.listDesigns()

      assert.strictEqual(list.length, 2)
      const names = list.map(d => d.name).sort()
      assert.deepStrictEqual(names, ['Design A', 'Design B'])
    })

    it('should return correct structure per entry', async () => {
      await storage.saveDesign('Structure Test', makeScene([{ id: '1' }]), { description: 'desc' })

      const list = await storage.listDesigns()
      const entry = list[0]

      assert.ok(entry.filename)
      assert.ok(entry.id)
      assert.strictEqual(entry.name, 'Structure Test')
      assert.strictEqual(entry.description, 'desc')
      assert.strictEqual(entry.elementCount, 1)
      assert.ok(entry.metadata)
      assert.ok(entry.metadata.createdAt)
    })

    it('should include thumbnailData in listed designs', async () => {
      const thumbnail = 'data:image/png;base64,DDDD'
      await storage.saveDesign('With Thumbnail', makeScene(), { thumbnailData: thumbnail })
      await storage.saveDesign('No Thumbnail', makeScene())

      const list = await storage.listDesigns()
      const withThumb = list.find(d => d.name === 'With Thumbnail')
      const noThumb = list.find(d => d.name === 'No Thumbnail')

      assert.strictEqual(withThumb.thumbnailData, thumbnail)
      assert.strictEqual(noThumb.thumbnailData, null)
    })

    it('should return empty array if directory does not exist', async () => {
      const s = new ExcalidrawStorage(path.join(testDir, 'nonexistent'), { debug: () => {}, warn: () => {} })
      const list = await s.listDesigns()
      assert.deepStrictEqual(list, [])
    })

    it('should skip malformed files', async () => {
      await storage.saveDesign('Good One', makeScene())
      // Write a malformed .excalidraw file
      await fs.writeFile(path.join(testDir, 'bad.excalidraw'), 'not json', 'utf-8')

      const list = await storage.listDesigns()
      assert.strictEqual(list.length, 1)
      assert.strictEqual(list[0].name, 'Good One')
    })
  })

  describe('updateDesign', () => {
    it('should update scene data', async () => {
      const { filename } = await storage.saveDesign('Update Me', makeScene([{ id: '1' }]))

      const newScene = makeScene([{ id: '1' }, { id: '2', type: 'ellipse' }])
      const updated = await storage.updateDesign(filename, { sceneData: newScene })

      assert.strictEqual(updated.scene.elements.length, 2)
      assert.strictEqual(updated.meta.elementCount, 2)
    })

    it('should update description without changing scene', async () => {
      const { filename } = await storage.saveDesign('Desc Update', makeScene([{ id: '1' }]))

      const updated = await storage.updateDesign(filename, { description: 'New description' })

      assert.strictEqual(updated.meta.description, 'New description')
      assert.strictEqual(updated.scene.elements.length, 1) // unchanged
    })

    it('should update lastModified timestamp', async () => {
      const { filename, design } = await storage.saveDesign('Time Check', makeScene())
      const originalTime = design.lastModified

      // Small delay to ensure timestamp changes
      await new Promise(r => setTimeout(r, 10))

      const updated = await storage.updateDesign(filename, { description: 'updated' })
      assert.notStrictEqual(updated.meta.lastModified, originalTime)
    })

    it('should update thumbnailData', async () => {
      const { filename } = await storage.saveDesign('Thumb Update', makeScene())

      const thumbnail = 'data:image/png;base64,AAAA'
      const updated = await storage.updateDesign(filename, { thumbnailData: thumbnail })

      assert.strictEqual(updated.meta.thumbnailData, thumbnail)
    })

    it('should preserve existing thumbnailData when not in updates', async () => {
      const thumbnail = 'data:image/png;base64,BBBB'
      const { filename } = await storage.saveDesign('Thumb Preserve', makeScene(), { thumbnailData: thumbnail })

      const updated = await storage.updateDesign(filename, { description: 'new desc' })

      assert.strictEqual(updated.meta.thumbnailData, thumbnail)
      assert.strictEqual(updated.meta.description, 'new desc')
    })

    it('should allow clearing thumbnailData with null', async () => {
      const thumbnail = 'data:image/png;base64,CCCC'
      const { filename } = await storage.saveDesign('Thumb Clear', makeScene(), { thumbnailData: thumbnail })

      const updated = await storage.updateDesign(filename, { thumbnailData: null })

      assert.strictEqual(updated.meta.thumbnailData, null)
    })

    it('should throw for non-existent design', async () => {
      await assert.rejects(
        () => storage.updateDesign('missing.excalidraw', { description: 'x' }),
        /Design not found/
      )
    })
  })

  describe('deleteDesign', () => {
    it('should delete both scene and meta files', async () => {
      const { filename } = await storage.saveDesign('Delete Me', makeScene())
      const result = await storage.deleteDesign(filename)

      assert.strictEqual(result, true)

      const sceneExists = await fs.stat(path.join(testDir, filename)).then(() => true, () => false)
      const metaExists = await fs.stat(path.join(testDir, 'delete_me.meta.json')).then(() => true, () => false)

      assert.strictEqual(sceneExists, false)
      assert.strictEqual(metaExists, false)
    })

    it('should throw for non-existent design', async () => {
      await assert.rejects(
        () => storage.deleteDesign('missing.excalidraw'),
        /Design not found/
      )
    })

    it('should handle missing meta file gracefully', async () => {
      await storage.saveDesign('No Meta Del', makeScene())
      await fs.unlink(path.join(testDir, 'no_meta_del.meta.json'))

      const result = await storage.deleteDesign('no_meta_del.excalidraw')
      assert.strictEqual(result, true)
    })
  })

  describe('renameDesign', () => {
    it('should rename design and update files', async () => {
      const { filename } = await storage.saveDesign('Old Name', makeScene())
      const result = await storage.renameDesign(filename, 'New Name')

      assert.strictEqual(result.oldFilename, 'old_name.excalidraw')
      assert.strictEqual(result.newFilename, 'new_name.excalidraw')
      assert.strictEqual(result.design.name, 'New Name')

      // Old files should be gone
      const oldExists = await fs.stat(path.join(testDir, 'old_name.excalidraw')).then(() => true, () => false)
      assert.strictEqual(oldExists, false)

      // New files should exist
      const newExists = await fs.stat(path.join(testDir, 'new_name.excalidraw')).then(() => true, () => false)
      assert.ok(newExists)
    })

    it('should throw DuplicateNameError when target name exists', async () => {
      await storage.saveDesign('First', makeScene())
      const { filename } = await storage.saveDesign('Second', makeScene())

      try {
        await storage.renameDesign(filename, 'First')
        assert.fail('Expected DuplicateNameError')
      } catch (err) {
        assert.strictEqual(err.code, 'DUPLICATE_NAME')
      }
    })

    it('should allow rename to same normalized name', async () => {
      const { filename } = await storage.saveDesign('same', makeScene())
      const result = await storage.renameDesign(filename, 'same')

      assert.strictEqual(result.newFilename, 'same.excalidraw')
    })

    it('should throw on empty new name', async () => {
      const { filename } = await storage.saveDesign('Has Name', makeScene())

      await assert.rejects(
        () => storage.renameDesign(filename, ''),
        /New name is required/
      )
    })
  })

  describe('isNameUnique', () => {
    it('should return true for unique name', async () => {
      const result = await storage.isNameUnique('Brand New')
      assert.strictEqual(result, true)
    })

    it('should return false for existing name', async () => {
      await storage.saveDesign('Taken', makeScene())
      const result = await storage.isNameUnique('Taken')
      assert.strictEqual(result, false)
    })

    it('should exclude specified filename from check', async () => {
      await storage.saveDesign('Self Check', makeScene())
      const result = await storage.isNameUnique('Self Check', 'self_check.excalidraw')
      assert.strictEqual(result, true)
    })
  })

  describe('exportDesign', () => {
    it('should return valid JSON string with scene and metadata', async () => {
      const { filename } = await storage.saveDesign('Export Me', makeScene([{ id: '1' }]), { description: 'for export' })

      const json = await storage.exportDesign(filename)
      const parsed = JSON.parse(json)

      assert.strictEqual(parsed.type, 'excalidraw')
      assert.strictEqual(parsed.version, 2)
      assert.ok(Array.isArray(parsed.elements))
      assert.ok(parsed.ppiMetadata)
      assert.strictEqual(parsed.ppiMetadata.name, 'Export Me')
    })
  })

  describe('importDesign', () => {
    it('should import Excalidraw JSON and create design', async () => {
      const exportData = JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [{ id: '1', type: 'text' }],
        appState: {},
        files: {},
        ppiMetadata: { name: 'Imported', description: 'From export' }
      })

      const result = await storage.importDesign(exportData)

      assert.strictEqual(result.filename, 'imported.excalidraw')
      assert.strictEqual(result.design.name, 'Imported')
      assert.strictEqual(result.design.description, 'From export')
    })

    it('should use provided name over embedded name', async () => {
      const exportData = JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: {},
        ppiMetadata: { name: 'Original' }
      })

      const result = await storage.importDesign(exportData, 'Override Name')
      assert.strictEqual(result.design.name, 'Override Name')
    })

    it('should use fallback name when no name provided', async () => {
      const exportData = JSON.stringify({
        elements: [],
        appState: {}
      })

      const result = await storage.importDesign(exportData)
      assert.strictEqual(result.design.name, 'Imported Design')
    })

    it('should preserve thumbnailData from ppiMetadata on import', async () => {
      const thumbnail = 'data:image/png;base64,EEEE'
      const exportData = JSON.stringify({
        elements: [{ id: '1' }],
        appState: {},
        ppiMetadata: { name: 'Thumb Import', thumbnailData: thumbnail }
      })

      const result = await storage.importDesign(exportData)
      assert.strictEqual(result.design.thumbnailData, thumbnail)
    })

    it('should throw on non-string import content', async () => {
      await assert.rejects(
        () => storage.importDesign(null),
        /non-empty string/
      )
      await assert.rejects(
        () => storage.importDesign(''),
        /non-empty string/
      )
      await assert.rejects(
        () => storage.importDesign(123),
        /non-empty string/
      )
    })

    it('should reject import content exceeding size limit', async () => {
      // Create a string just over the limit
      const { ExcalidrawStorage: ES } = require('../../plugins/excalidraw-plugin/excalidraw-storage')
      const oversized = 'x'.repeat(ES.MAX_IMPORT_SIZE + 1)

      await assert.rejects(
        () => storage.importDesign(oversized),
        /Import content too large/
      )
    })

    it('should throw on duplicate import name', async () => {
      await storage.saveDesign('Already Exists', makeScene())

      const exportData = JSON.stringify({
        elements: [],
        appState: {},
        ppiMetadata: { name: 'Already Exists' }
      })

      try {
        await storage.importDesign(exportData)
        assert.fail('Expected DuplicateNameError')
      } catch (err) {
        assert.strictEqual(err.code, 'DUPLICATE_NAME')
      }
    })
  })

  describe('DuplicateNameError', () => {
    it('should have correct properties', () => {
      const err = new DuplicateNameError('test', 'test.excalidraw')

      assert.strictEqual(err.name, 'DuplicateNameError')
      assert.strictEqual(err.code, 'DUPLICATE_NAME')
      assert.strictEqual(err.duplicateName, 'test')
      assert.strictEqual(err.existingFilename, 'test.excalidraw')
      assert.ok(err.message.includes('test'))
      assert.ok(err instanceof Error)
    })
  })
})

// ============ Plugin Entry Point Tests ============

describe('Excalidraw Plugin', () => {
  let ExcalidrawPlugin

  before(async () => {
    ExcalidrawPlugin = require('../../plugins/excalidraw-plugin/index')
  })

  describe('Plugin Structure', () => {
    it('should have valid manifest', async () => {
      const manifestPath = path.join(__dirname, '../../plugins/excalidraw-plugin/puffin-plugin.json')
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      assert.strictEqual(manifest.name, 'excalidraw-plugin')
      assert.strictEqual(manifest.version, '1.0.0')
      assert.strictEqual(manifest.displayName, 'Sketcher')
      assert.strictEqual(manifest.main, 'index.js')
      assert.ok(manifest.contributes)
      assert.ok(manifest.contributes.views)
      assert.strictEqual(manifest.contributes.views.length, 1)
      assert.strictEqual(manifest.contributes.views[0].id, 'excalidraw-view')
      assert.strictEqual(manifest.contributes.views[0].name, 'Sketcher')
      assert.strictEqual(manifest.contributes.views[0].icon, '✏️')
      assert.strictEqual(manifest.contributes.views[0].order, 51)
    })

    it('should declare all 9 IPC handlers in manifest', async () => {
      const manifestPath = path.join(__dirname, '../../plugins/excalidraw-plugin/puffin-plugin.json')
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      const expectedHandlers = [
        'excalidraw:saveDesign',
        'excalidraw:loadDesign',
        'excalidraw:listDesigns',
        'excalidraw:updateDesign',
        'excalidraw:deleteDesign',
        'excalidraw:renameDesign',
        'excalidraw:checkNameUnique',
        'excalidraw:exportDesign',
        'excalidraw:importDesign'
      ]

      assert.deepStrictEqual(manifest.extensionPoints.ipcHandlers, expectedHandlers)
    })

    it('should declare 4 programmatic actions in manifest', async () => {
      const manifestPath = path.join(__dirname, '../../plugins/excalidraw-plugin/puffin-plugin.json')
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      assert.deepStrictEqual(manifest.extensionPoints.actions, [
        'saveDesign', 'loadDesign', 'listDesigns', 'deleteDesign'
      ])
    })

    it('should export activate and deactivate methods', () => {
      assert.ok(typeof ExcalidrawPlugin.activate === 'function')
      assert.ok(typeof ExcalidrawPlugin.deactivate === 'function')
    })
  })

  describe('Plugin Activation', () => {
    let mockContext
    let testDir

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `excalidraw-plugin-test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`)
      await fs.mkdir(testDir, { recursive: true })

      mockContext = {
        projectPath: testDir,
        log: {
          info: () => {},
          debug: () => {},
          warn: () => {},
          error: () => {}
        },
        registeredHandlers: {},
        registeredActions: {},
        registerIpcHandler: function(name, handler) {
          this.registeredHandlers[name] = handler
        },
        registerAction: function(name, action) {
          this.registeredActions[name] = action
        }
      }
    })

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true })
      } catch (e) {}
    })

    it('should activate successfully with valid context', async () => {
      await ExcalidrawPlugin.activate(mockContext)

      assert.strictEqual(ExcalidrawPlugin.context, mockContext)
      assert.ok(ExcalidrawPlugin.storage)
    })

    it('should register all 9 IPC handlers', async () => {
      await ExcalidrawPlugin.activate(mockContext)

      const expectedHandlers = [
        'saveDesign', 'loadDesign', 'listDesigns', 'updateDesign',
        'deleteDesign', 'renameDesign', 'checkNameUnique',
        'exportDesign', 'importDesign'
      ]

      for (const name of expectedHandlers) {
        assert.ok(mockContext.registeredHandlers[name], `Handler '${name}' should be registered`)
      }
    })

    it('should register all 4 programmatic actions', async () => {
      await ExcalidrawPlugin.activate(mockContext)

      const expectedActions = ['saveDesign', 'loadDesign', 'listDesigns', 'deleteDesign']

      for (const name of expectedActions) {
        assert.ok(mockContext.registeredActions[name], `Action '${name}' should be registered`)
      }
    })

    it('should create designs directory on activation', async () => {
      await ExcalidrawPlugin.activate(mockContext)

      const designsDir = path.join(testDir, '.puffin', 'excalidraw-designs')
      const stat = await fs.stat(designsDir)
      assert.ok(stat.isDirectory())
    })

    it('should throw error without projectPath', async () => {
      const invalidContext = { ...mockContext, projectPath: null }

      await assert.rejects(
        () => ExcalidrawPlugin.activate(invalidContext),
        { message: 'Excalidraw plugin requires projectPath in context' }
      )
    })

    it('should deactivate successfully', async () => {
      await ExcalidrawPlugin.activate(mockContext)
      await ExcalidrawPlugin.deactivate()

      assert.strictEqual(ExcalidrawPlugin.storage, null)
    })
  })

  describe('IPC Handlers', () => {
    let mockContext
    let testDir

    before(async () => {
      testDir = path.join(os.tmpdir(), `excalidraw-ipc-test-${Date.now()}`)
      await fs.mkdir(testDir, { recursive: true })

      mockContext = {
        projectPath: testDir,
        log: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
        registeredHandlers: {},
        registeredActions: {},
        registerIpcHandler: function(name, handler) {
          this.registeredHandlers[name] = handler
        },
        registerAction: function(name, action) {
          this.registeredActions[name] = action
        }
      }
      await ExcalidrawPlugin.activate(mockContext)
    })

    after(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true })
      } catch (e) {}
    })

    it('should handle saveDesign IPC call', async () => {
      const handler = mockContext.registeredHandlers.saveDesign
      const result = await handler({
        name: 'IPC Save Test',
        sceneData: { elements: [{ id: '1' }], appState: {}, files: {} }
      })

      assert.ok(result.filename)
      assert.ok(result.design)
      assert.strictEqual(result.design.name, 'IPC Save Test')
    })

    it('should handle listDesigns IPC call', async () => {
      const handler = mockContext.registeredHandlers.listDesigns
      const result = await handler()

      assert.ok(Array.isArray(result))
      assert.ok(result.length >= 1)
    })

    it('should handle loadDesign IPC call', async () => {
      const handler = mockContext.registeredHandlers.loadDesign
      const result = await handler('ipc_save_test.excalidraw')

      assert.ok(result.scene)
      assert.ok(result.meta)
    })

    it('should handle updateDesign IPC call', async () => {
      const handler = mockContext.registeredHandlers.updateDesign
      const result = await handler({
        filename: 'ipc_save_test.excalidraw',
        updates: { description: 'Updated via IPC' }
      })

      assert.strictEqual(result.meta.description, 'Updated via IPC')
    })

    it('should handle checkNameUnique IPC call', async () => {
      const handler = mockContext.registeredHandlers.checkNameUnique
      const result = await handler({ name: 'Totally New Name' })
      assert.strictEqual(result, true)
    })

    it('should handle exportDesign IPC call', async () => {
      const handler = mockContext.registeredHandlers.exportDesign
      const result = await handler('ipc_save_test.excalidraw')

      assert.ok(typeof result === 'string')
      const parsed = JSON.parse(result)
      assert.strictEqual(parsed.type, 'excalidraw')
    })

    it('should handle renameDesign IPC call', async () => {
      // Save a fresh design to rename
      await mockContext.registeredHandlers.saveDesign({
        name: 'Rename Source',
        sceneData: { elements: [], appState: {}, files: {} }
      })

      const handler = mockContext.registeredHandlers.renameDesign
      const result = await handler({ oldFilename: 'rename_source.excalidraw', newName: 'Renamed Target' })

      assert.strictEqual(result.newFilename, 'renamed_target.excalidraw')
    })

    it('should handle deleteDesign IPC call', async () => {
      // Save something to delete
      await mockContext.registeredHandlers.saveDesign({
        name: 'To Delete',
        sceneData: { elements: [], appState: {}, files: {} }
      })

      const handler = mockContext.registeredHandlers.deleteDesign
      const result = await handler('to_delete.excalidraw')
      assert.strictEqual(result, true)
    })

    it('should handle importDesign IPC call', async () => {
      const handler = mockContext.registeredHandlers.importDesign
      const json = JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [{ id: 'imp1' }],
        appState: {},
        files: {},
        ppiMetadata: { name: 'IPC Import' }
      })

      const result = await handler({ jsonContent: json })
      assert.strictEqual(result.design.name, 'IPC Import')
    })
  })
})

// ============ Sidebar/CRUD Tests ============

describe('Design List Sidebar Requirements', () => {
  let ExcalidrawStorage
  let storage
  let testDir

  before(async () => {
    const mod = require('../../plugins/excalidraw-plugin/excalidraw-storage')
    ExcalidrawStorage = mod.ExcalidrawStorage
  })

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `excalidraw-sidebar-test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`)
    storage = new ExcalidrawStorage(testDir, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    })
    await storage.ensureDesignsDirectory()
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {}
  })

  function makeScene(elements = []) {
    return {
      elements,
      appState: { theme: 'light' },
      files: {}
    }
  }

  describe('listDesigns for sidebar display', () => {
    it('should return description and thumbnailData per entry for sidebar rendering', async () => {
      const thumb = 'data:image/png;base64,FFFF'
      await storage.saveDesign('Sidebar Entry', makeScene([{ id: '1' }]), {
        description: 'A useful description',
        thumbnailData: thumb
      })

      const list = await storage.listDesigns()
      const entry = list[0]

      assert.strictEqual(entry.name, 'Sidebar Entry')
      assert.strictEqual(entry.description, 'A useful description')
      assert.strictEqual(entry.thumbnailData, thumb)
      assert.strictEqual(entry.elementCount, 1)
      assert.ok(entry.metadata.lastModified, 'should have lastModified for relative timestamps')
      assert.ok(entry.metadata.createdAt, 'should have createdAt')
    })

    it('should support sorting by lastModified (most recent first)', async () => {
      await storage.saveDesign('Oldest', makeScene())
      await new Promise(r => setTimeout(r, 10))
      await storage.saveDesign('Middle', makeScene())
      await new Promise(r => setTimeout(r, 10))
      await storage.saveDesign('Newest', makeScene())

      const list = await storage.listDesigns()

      // Sort client-side same as ExcalidrawView._sortDefinitions
      const sorted = list.slice().sort((a, b) => {
        const aTime = a.metadata?.lastModified || ''
        const bTime = b.metadata?.lastModified || ''
        return bTime.localeCompare(aTime)
      })

      assert.strictEqual(sorted[0].name, 'Newest')
      assert.strictEqual(sorted[1].name, 'Middle')
      assert.strictEqual(sorted[2].name, 'Oldest')
    })
  })

  describe('renameDesign (inline rename)', () => {
    it('should rename design and preserve thumbnailData', async () => {
      const thumb = 'data:image/png;base64,GGGG'
      const { filename } = await storage.saveDesign('Original', makeScene(), { thumbnailData: thumb })

      const result = await storage.renameDesign(filename, 'Renamed')

      assert.strictEqual(result.design.name, 'Renamed')
      assert.strictEqual(result.newFilename, 'renamed.excalidraw')

      // Verify thumbnail persisted through rename
      const loaded = await storage.loadDesign(result.newFilename)
      assert.strictEqual(loaded.meta.thumbnailData, thumb)
    })

    it('should update lastModified after rename', async () => {
      const { filename, design } = await storage.saveDesign('Time Rename', makeScene())
      const originalTime = design.lastModified

      await new Promise(r => setTimeout(r, 10))
      const result = await storage.renameDesign(filename, 'Time Renamed')

      assert.notStrictEqual(result.design.lastModified, originalTime)
    })
  })

  describe('deleteDesign (confirmation workflow)', () => {
    it('should remove from list after deletion', async () => {
      await storage.saveDesign('Keep', makeScene())
      const { filename } = await storage.saveDesign('Remove', makeScene())

      await storage.deleteDesign(filename)

      const list = await storage.listDesigns()
      assert.strictEqual(list.length, 1)
      assert.strictEqual(list[0].name, 'Keep')
    })
  })
})

// ============ Renderer Component Tests ============

describe('ExcalidrawView Component', () => {
  it('should export ExcalidrawView class', () => {
    // Renderer components use ES module syntax — verify file exists
    const componentPath = path.join(__dirname, '../../plugins/excalidraw-plugin/renderer/components/ExcalidrawView.js')
    assert.ok(fs.stat(componentPath))
  })

  it('should have CSS stylesheet', async () => {
    const cssPath = path.join(__dirname, '../../plugins/excalidraw-plugin/renderer/styles/excalidraw-view.css')
    const stat = await fs.stat(cssPath)
    assert.ok(stat.isFile())
  })

  it('should include sidebar, modal, notification, and animation styles', async () => {
    const cssPath = path.join(__dirname, '../../plugins/excalidraw-plugin/renderer/styles/excalidraw-view.css')
    const content = await fs.readFile(cssPath, 'utf-8')

    // Sidebar design items
    assert.ok(content.includes('.sidebar-design-item'), 'should have sidebar design item styles')
    assert.ok(content.includes('.design-thumbnail'), 'should have thumbnail styles')
    assert.ok(content.includes('.element-count-badge'), 'should have element count badge')
    assert.ok(content.includes('.design-timestamp'), 'should have timestamp styles')
    assert.ok(content.includes('.design-description'), 'should have description styles')

    // Inline rename
    assert.ok(content.includes('.inline-rename-input'), 'should have inline rename styles')

    // Delete animation
    assert.ok(content.includes('.fade-out'), 'should have fade-out animation')

    // Loading/Error/Empty states
    assert.ok(content.includes('.loading-spinner'), 'should have loading spinner')
    assert.ok(content.includes('.sidebar-error'), 'should have error state')
    assert.ok(content.includes('.sidebar-empty-state'), 'should have empty state')

    // Focus indicators (accessibility)
    assert.ok(content.includes(':focus-visible'), 'should have focus-visible indicators')

    // Delete confirmation
    assert.ok(content.includes('.delete-confirm-message'), 'should have delete confirmation styles')
  })
})

describe('Renderer Components Index', () => {
  it('should have index.js entry point', async () => {
    const indexPath = path.join(__dirname, '../../plugins/excalidraw-plugin/renderer/components/index.js')
    const stat = await fs.stat(indexPath)
    assert.ok(stat.isFile())
  })
})

// ============ View Component Tests (AC2) ============

describe('ExcalidrawView Component Structure', () => {
  let viewSource

  before(async () => {
    const viewPath = path.join(__dirname, '../../plugins/excalidraw-plugin/renderer/components/ExcalidrawView.js')
    viewSource = await fs.readFile(viewPath, 'utf-8')
  })

  describe('Class definition and exports', () => {
    it('should export ExcalidrawView as named export', () => {
      assert.ok(viewSource.includes('export class ExcalidrawView'))
    })

    it('should export ExcalidrawView as default export', () => {
      assert.ok(viewSource.includes('export default ExcalidrawView'))
    })
  })

  describe('Constructor initializes required state', () => {
    it('should accept element and options parameters', () => {
      assert.ok(viewSource.includes('constructor(element, options'))
    })

    it('should initialize scene state: elements, appState, files', () => {
      assert.ok(viewSource.includes('this.elements = []'))
      assert.ok(viewSource.includes('this.appState = {}'))
      assert.ok(viewSource.includes('this.files = {}'))
    })

    it('should initialize UI state: definitions, loading, error, currentFilename, theme', () => {
      assert.ok(viewSource.includes('this.definitions = []'))
      assert.ok(viewSource.includes('this.loading = true'))
      assert.ok(viewSource.includes('this.error = null'))
      assert.ok(viewSource.includes('this.currentFilename = null'))
      assert.ok(viewSource.includes("this.theme = 'dark'"))
    })

    it('should bind keyboard handler for cleanup', () => {
      assert.ok(viewSource.includes('this._keyboardHandler = this._handleKeyboard.bind(this)'))
    })
  })

  describe('Lifecycle methods', () => {
    it('should have init() that sets className and calls render', () => {
      assert.ok(viewSource.includes('async init()'))
      assert.ok(viewSource.includes("this.container.className = 'excalidraw-view'"))
      assert.ok(viewSource.includes('this.render()'))
    })

    it('should register keydown listener in init', () => {
      assert.ok(viewSource.includes("document.addEventListener('keydown', this._keyboardHandler)"))
    })

    it('should load definitions in init', () => {
      assert.ok(viewSource.includes('await this.loadDefinitions()'))
    })

    it('should have onActivate() that refreshes definitions', () => {
      assert.ok(viewSource.includes('onActivate()'))
      assert.ok(viewSource.includes('this.loadDefinitions()'))
    })

    it('should have onDeactivate() that preserves state', () => {
      assert.ok(viewSource.includes('onDeactivate()'))
    })

    it('should have destroy() that removes keyboard listener', () => {
      assert.ok(viewSource.includes('destroy()'))
      assert.ok(viewSource.includes("document.removeEventListener('keydown', this._keyboardHandler)"))
    })

    it('should null out container and references in destroy', () => {
      assert.ok(viewSource.includes('this.container = null'))
      assert.ok(viewSource.includes('this.canvasContainer = null'))
      assert.ok(viewSource.includes('this.sidebarList = null'))
    })

    it('should clear state arrays in destroy', () => {
      // destroy() resets elements, appState, files, definitions
      // Extract from the destroy method to end-of-class by looking for the method
      const destroyIdx = viewSource.indexOf('destroy()')
      assert.ok(destroyIdx > -1, 'should have destroy method')
      const destroySection = viewSource.substring(destroyIdx, destroyIdx + 500)
      assert.ok(destroySection.includes('this.elements = []'), 'should reset elements')
      assert.ok(destroySection.includes('this.definitions = []'), 'should reset definitions')
    })
  })

  describe('Toolbar rendering', () => {
    it('should render toolbar with role="toolbar"', () => {
      assert.ok(viewSource.includes('role="toolbar"'))
    })

    it('should render New button with Ctrl+N tooltip', () => {
      assert.ok(viewSource.includes('title="New Design (Ctrl+N)"'))
    })

    it('should render Save button with Ctrl+S tooltip', () => {
      assert.ok(viewSource.includes('title="Save Design (Ctrl+S)"'))
    })

    it('should render Export button with Ctrl+E tooltip', () => {
      assert.ok(viewSource.includes('title="Export Design (Ctrl+E)"'))
    })

    it('should render Import button', () => {
      assert.ok(viewSource.includes('id="excalidraw-import-btn"'))
    })

    it('should render Clear button', () => {
      assert.ok(viewSource.includes('id="excalidraw-clear-btn"'))
    })

    it('should render theme toggle button', () => {
      assert.ok(viewSource.includes('id="excalidraw-theme-btn"'))
    })

    it('should include aria-labels on all toolbar buttons', () => {
      assert.ok(viewSource.includes('aria-label="New Design"'))
      assert.ok(viewSource.includes('aria-label="Save Design"'))
      assert.ok(viewSource.includes('aria-label="Clear Canvas"'))
      assert.ok(viewSource.includes('aria-label="Export Design"'))
      assert.ok(viewSource.includes('aria-label="Import Design"'))
      assert.ok(viewSource.includes('aria-label="Toggle light/dark theme"'))
    })
  })

  describe('Canvas area rendering', () => {
    it('should render canvas container with id', () => {
      assert.ok(viewSource.includes('id="excalidraw-canvas"'))
    })

    it('should render canvas placeholder', () => {
      assert.ok(viewSource.includes('excalidraw-canvas-placeholder'))
    })

    it('should show element count in placeholder', () => {
      assert.ok(viewSource.includes('elements in scene'))
    })
  })

  describe('Sidebar rendering', () => {
    it('should render sidebar with role="complementary"', () => {
      assert.ok(viewSource.includes('role="complementary"'))
    })

    it('should render sidebar designs list with role="list"', () => {
      assert.ok(viewSource.includes('role="list"'))
    })

    it('should show loading state when loading', () => {
      assert.ok(viewSource.includes('this._renderLoadingState()'))
    })

    it('should show error state with retry button', () => {
      assert.ok(viewSource.includes('this._renderErrorState()'))
      assert.ok(viewSource.includes('retry-btn'))
    })

    it('should show empty state when no designs', () => {
      assert.ok(viewSource.includes('sidebar-empty-state'))
      assert.ok(viewSource.includes('No designs yet'))
    })

    it('should render design items with role="listitem" and tabindex', () => {
      assert.ok(viewSource.includes('role="listitem"'))
      assert.ok(viewSource.includes('tabindex="0"'))
    })

    it('should render thumbnails with lazy loading (data-src)', () => {
      assert.ok(viewSource.includes('data-src='))
      assert.ok(viewSource.includes('thumbnail-lazy'))
    })

    it('should render element count badges', () => {
      assert.ok(viewSource.includes('element-count-badge'))
    })

    it('should render relative timestamps', () => {
      assert.ok(viewSource.includes('design-timestamp'))
      assert.ok(viewSource.includes('_formatRelativeTime'))
    })

    it('should render description with truncation', () => {
      assert.ok(viewSource.includes('design-description'))
      assert.ok(viewSource.includes('.substring(0, 40)'))
    })

    it('should render load, rename, and delete action buttons per item', () => {
      assert.ok(viewSource.includes('design-load-btn'))
      assert.ok(viewSource.includes('design-rename-btn'))
      assert.ok(viewSource.includes('design-delete-btn'))
    })
  })

  describe('Keyboard shortcuts', () => {
    it('should handle Ctrl+S for save', () => {
      assert.ok(viewSource.includes("e.key === 's'"))
      assert.ok(viewSource.includes('this.showSaveDialog()'))
    })

    it('should handle Ctrl+N for new', () => {
      assert.ok(viewSource.includes("e.key === 'n'"))
      assert.ok(viewSource.includes('this.newDesign()'))
    })

    it('should handle Ctrl+E for export', () => {
      assert.ok(viewSource.includes("e.key === 'e'"))
      assert.ok(viewSource.includes('this.showExportDialog()'))
    })

    it('should skip shortcuts when modal is open', () => {
      assert.ok(viewSource.includes("document.querySelector('.excalidraw-modal-overlay')"))
    })
  })

  describe('Inline rename workflow', () => {
    it('should have _startInlineRename method', () => {
      assert.ok(viewSource.includes('_startInlineRename(item, filename)'))
    })

    it('should replace name span with input on rename', () => {
      assert.ok(viewSource.includes("input.className = 'inline-rename-input'"))
      assert.ok(viewSource.includes('nameSpan.replaceWith(input)'))
    })

    it('should commit on Enter key', () => {
      assert.ok(viewSource.includes("e.key === 'Enter'"))
    })

    it('should revert on Escape key', () => {
      assert.ok(viewSource.includes("e.key === 'Escape'"))
      assert.ok(viewSource.includes('this._revertInlineRename'))
    })

    it('should commit on blur with delay', () => {
      assert.ok(viewSource.includes("input.addEventListener('blur'"))
      assert.ok(viewSource.includes('setTimeout'))
    })

    it('should have _revertInlineRename that restores span', () => {
      assert.ok(viewSource.includes('_revertInlineRename(input, originalName)'))
      assert.ok(viewSource.includes('input.replaceWith(span)'))
    })
  })

  describe('Delete confirmation modal', () => {
    it('should show confirmation with design name', () => {
      assert.ok(viewSource.includes('Delete design'))
      assert.ok(viewSource.includes('This cannot be undone'))
    })

    it('should have cancel and confirm buttons', () => {
      assert.ok(viewSource.includes('excalidraw-delete-cancel'))
      assert.ok(viewSource.includes('excalidraw-delete-confirm'))
    })

    it('should apply fade-out animation before deleting', () => {
      assert.ok(viewSource.includes("item.classList.add('fade-out')"))
      assert.ok(viewSource.includes('setTimeout(r, 300)'))
    })
  })

  describe('Focus trapping (accessibility)', () => {
    it('should have _trapFocus method', () => {
      assert.ok(viewSource.includes('_trapFocus(modal)'))
    })

    it('should cycle focus on Tab key', () => {
      assert.ok(viewSource.includes("e.key !== 'Tab'"))
      assert.ok(viewSource.includes('first.focus()'))
      assert.ok(viewSource.includes('last.focus()'))
    })

    it('should trap focus in save dialog', () => {
      // Verify _trapFocus is called in showSaveDialog
      const saveDialogMatch = viewSource.match(/showSaveDialog\(\)\s*\{[\s\S]*?\n\s{2}\}/)
      assert.ok(saveDialogMatch)
      assert.ok(saveDialogMatch[0].includes('this._trapFocus'))
    })

    it('should trap focus in delete confirmation', () => {
      const deleteMatch = viewSource.match(/_showDeleteConfirmation[\s\S]*?closeModal\)/)
      assert.ok(deleteMatch)
      assert.ok(viewSource.includes('_trapFocus(modal)'))
    })
  })

  describe('Notification system', () => {
    it('should show notifications with role="status" and aria-live', () => {
      assert.ok(viewSource.includes("notification.setAttribute('role', 'status')"))
      assert.ok(viewSource.includes("notification.setAttribute('aria-live', 'polite')"))
    })

    it('should auto-dismiss after 3 seconds', () => {
      assert.ok(viewSource.includes('3000'))
    })

    it('should support success, error, and info types', () => {
      assert.ok(viewSource.includes('excalidraw-notification-${type}'))
    })
  })

  describe('Save workflow', () => {
    it('should have showSaveDialog with name and description fields', () => {
      assert.ok(viewSource.includes('excalidraw-design-name'))
      assert.ok(viewSource.includes('excalidraw-design-desc'))
    })

    it('should update existing design when currentFilename is set', () => {
      assert.ok(viewSource.includes("'excalidraw-plugin', 'updateDesign'"))
    })

    it('should save new design when no currentFilename', () => {
      assert.ok(viewSource.includes("'excalidraw-plugin', 'saveDesign'"))
    })

    it('should handle DuplicateNameError on save', () => {
      assert.ok(viewSource.includes("err.code === 'DUPLICATE_NAME'"))
    })
  })

  describe('Export workflow', () => {
    it('should have export dialog with JSON, PNG, SVG options', () => {
      assert.ok(viewSource.includes("data-format=\"json\""))
      assert.ok(viewSource.includes("data-format=\"png\""))
      assert.ok(viewSource.includes("data-format=\"svg\""))
    })

    it('should copy JSON to clipboard on export', () => {
      assert.ok(viewSource.includes('navigator.clipboard.writeText'))
    })
  })

  describe('Import workflow', () => {
    it('should have hidden file input for import', () => {
      assert.ok(viewSource.includes('excalidraw-file-input'))
      assert.ok(viewSource.includes("accept=\".excalidraw,.json\""))
    })

    it('should validate JSON before import', () => {
      assert.ok(viewSource.includes('JSON.parse(jsonContent)'))
      assert.ok(viewSource.includes('malformed JSON'))
    })

    it('should validate Excalidraw schema', () => {
      assert.ok(viewSource.includes('not a valid Excalidraw file'))
    })

    it('should show import name dialog', () => {
      assert.ok(viewSource.includes('showImportNameDialog'))
    })
  })

  describe('Theme toggle', () => {
    it('should toggle between light and dark themes', () => {
      assert.ok(viewSource.includes("this.theme === 'dark' ? 'light' : 'dark'"))
    })

    it('should update canvas container CSS classes', () => {
      assert.ok(viewSource.includes("classList.toggle('theme-light'"))
      assert.ok(viewSource.includes("classList.toggle('theme-dark'"))
    })
  })

  describe('Utility methods', () => {
    it('should have escapeHtml for XSS prevention', () => {
      assert.ok(viewSource.includes('escapeHtml(str)'))
      assert.ok(viewSource.includes('&amp;'))
      assert.ok(viewSource.includes('&lt;'))
      assert.ok(viewSource.includes('&gt;'))
      assert.ok(viewSource.includes('&quot;'))
    })

    it('should have _formatRelativeTime for relative timestamps', () => {
      assert.ok(viewSource.includes('_formatRelativeTime(isoTime)'))
      assert.ok(viewSource.includes('just now'))
      assert.ok(viewSource.includes('m ago'))
      assert.ok(viewSource.includes('h ago'))
      assert.ok(viewSource.includes('d ago'))
      assert.ok(viewSource.includes('w ago'))
    })

    it('should have _lazyLoadThumbnails using requestAnimationFrame', () => {
      assert.ok(viewSource.includes('_lazyLoadThumbnails()'))
      assert.ok(viewSource.includes('requestAnimationFrame'))
    })

    it('should have getSceneData that checks excalidrawAPI first', () => {
      assert.ok(viewSource.includes('getSceneData()'))
      assert.ok(viewSource.includes('this.excalidrawAPI'))
    })

    it('should have generateThumbnail method', () => {
      assert.ok(viewSource.includes('async generateThumbnail()'))
    })
  })
})

// ============ Integration Tests (AC3) ============

describe('Excalidraw Integration Workflows', () => {
  let ExcalidrawStorage
  let storage
  let testDir

  before(async () => {
    const mod = require('../../plugins/excalidraw-plugin/excalidraw-storage')
    ExcalidrawStorage = mod.ExcalidrawStorage
  })

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `excalidraw-integration-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`)
    storage = new ExcalidrawStorage(testDir, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    })
    await storage.ensureDesignsDirectory()
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {}
  })

  function makeScene(elements = []) {
    return {
      elements,
      appState: { theme: 'dark', viewBackgroundColor: '#1a1a2e' },
      files: {}
    }
  }

  describe('Save → Load round-trip', () => {
    it('should preserve all scene data through save and load', async () => {
      const elements = [
        { id: 'rect1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50 },
        { id: 'arrow1', type: 'arrow', x: 50, y: 50, points: [[0, 0], [100, 100]] }
      ]
      const scene = {
        elements,
        appState: { theme: 'dark', viewBackgroundColor: '#1a1a2e', zoom: { value: 1.5 } },
        files: { 'file1': { mimeType: 'image/png', dataURL: 'data:...' } }
      }

      const saved = await storage.saveDesign('Round Trip', scene, {
        description: 'Testing persistence',
        thumbnailData: 'data:image/png;base64,ROUNDTRIP'
      })

      const loaded = await storage.loadDesign(saved.filename)

      // Scene integrity
      assert.strictEqual(loaded.scene.elements.length, 2)
      assert.strictEqual(loaded.scene.elements[0].id, 'rect1')
      assert.strictEqual(loaded.scene.elements[0].width, 100)
      assert.strictEqual(loaded.scene.elements[1].id, 'arrow1')
      assert.strictEqual(loaded.scene.elements[1].type, 'arrow')

      // AppState preserved
      assert.strictEqual(loaded.scene.appState.theme, 'dark')
      assert.strictEqual(loaded.scene.appState.viewBackgroundColor, '#1a1a2e')
      assert.deepStrictEqual(loaded.scene.appState.zoom, { value: 1.5 })

      // Files preserved
      assert.ok(loaded.scene.files.file1)
      assert.strictEqual(loaded.scene.files.file1.mimeType, 'image/png')

      // Metadata integrity
      assert.strictEqual(loaded.meta.name, 'Round Trip')
      assert.strictEqual(loaded.meta.description, 'Testing persistence')
      assert.strictEqual(loaded.meta.elementCount, 2)
      assert.strictEqual(loaded.meta.thumbnailData, 'data:image/png;base64,ROUNDTRIP')
    })

    it('should preserve Excalidraw format fields (type, version, source)', async () => {
      const { filename } = await storage.saveDesign('Format Check', makeScene([{ id: '1' }]))
      const loaded = await storage.loadDesign(filename)

      assert.strictEqual(loaded.scene.type, 'excalidraw')
      assert.strictEqual(loaded.scene.version, 2)
      assert.strictEqual(loaded.scene.source, 'puffin-excalidraw-plugin')
    })
  })

  describe('Save → Update → Load', () => {
    it('should reflect updates after save and update', async () => {
      const { filename } = await storage.saveDesign('Updateable', makeScene([{ id: '1' }]), {
        description: 'Original'
      })

      const newScene = makeScene([{ id: '1' }, { id: '2' }, { id: '3' }])
      await storage.updateDesign(filename, {
        sceneData: newScene,
        description: 'Updated with more elements',
        thumbnailData: 'data:image/png;base64,UPDATED'
      })

      const loaded = await storage.loadDesign(filename)

      assert.strictEqual(loaded.scene.elements.length, 3)
      assert.strictEqual(loaded.meta.description, 'Updated with more elements')
      assert.strictEqual(loaded.meta.elementCount, 3)
      assert.strictEqual(loaded.meta.thumbnailData, 'data:image/png;base64,UPDATED')
    })
  })

  describe('Export → Parse → Import', () => {
    it('should export valid JSON that can be re-imported', async () => {
      const { filename } = await storage.saveDesign('Export Source', makeScene([
        { id: 'e1', type: 'text', text: 'Hello' },
        { id: 'e2', type: 'rectangle' }
      ]), {
        description: 'For export',
        thumbnailData: 'data:image/png;base64,EXPORT'
      })

      // Export
      const json = await storage.exportDesign(filename)
      const parsed = JSON.parse(json)

      // Validate export structure
      assert.strictEqual(parsed.type, 'excalidraw')
      assert.strictEqual(parsed.version, 2)
      assert.ok(Array.isArray(parsed.elements))
      assert.strictEqual(parsed.elements.length, 2)
      assert.ok(parsed.ppiMetadata)
      assert.strictEqual(parsed.ppiMetadata.name, 'Export Source')
      assert.strictEqual(parsed.ppiMetadata.description, 'For export')

      // Import the exported JSON with a new name
      const imported = await storage.importDesign(json, 'Imported Copy')

      assert.strictEqual(imported.design.name, 'Imported Copy')
      assert.strictEqual(imported.design.description, 'For export')
      assert.strictEqual(imported.design.elementCount, 2)

      // Verify the imported design loads correctly
      const loaded = await storage.loadDesign(imported.filename)
      assert.strictEqual(loaded.scene.elements.length, 2)
      assert.strictEqual(loaded.scene.elements[0].id, 'e1')
    })

    it('should handle import of minimal valid Excalidraw JSON', async () => {
      const minimalJson = JSON.stringify({
        elements: [{ id: 'min1', type: 'line' }],
        appState: {}
      })

      const result = await storage.importDesign(minimalJson, 'Minimal Import')
      assert.strictEqual(result.design.name, 'Minimal Import')
      assert.strictEqual(result.design.elementCount, 1)
    })
  })

  describe('Rename → Load by new name', () => {
    it('should be loadable by new filename after rename', async () => {
      const elements = [{ id: 'r1', type: 'ellipse', rx: 50, ry: 30 }]
      const { filename } = await storage.saveDesign('Before Rename', makeScene(elements), {
        description: 'Will be renamed',
        thumbnailData: 'data:image/png;base64,RENAME'
      })

      const renamed = await storage.renameDesign(filename, 'After Rename')

      // Old filename should fail
      await assert.rejects(
        () => storage.loadDesign(filename),
        /Design not found/
      )

      // New filename should work
      const loaded = await storage.loadDesign(renamed.newFilename)
      assert.strictEqual(loaded.meta.name, 'After Rename')
      assert.strictEqual(loaded.meta.description, 'Will be renamed')
      assert.strictEqual(loaded.meta.thumbnailData, 'data:image/png;base64,RENAME')
      assert.strictEqual(loaded.scene.elements.length, 1)
      assert.strictEqual(loaded.scene.elements[0].id, 'r1')
    })

    it('should appear in list with new name after rename', async () => {
      const { filename } = await storage.saveDesign('Old List Name', makeScene())

      await storage.renameDesign(filename, 'New List Name')

      const list = await storage.listDesigns()
      const names = list.map(d => d.name)
      assert.ok(!names.includes('Old List Name'))
      assert.ok(names.includes('New List Name'))
    })
  })

  describe('Delete → List update', () => {
    it('should no longer appear in list after deletion', async () => {
      await storage.saveDesign('Keeper A', makeScene())
      await storage.saveDesign('Keeper B', makeScene())
      const { filename } = await storage.saveDesign('To Remove', makeScene())

      assert.strictEqual((await storage.listDesigns()).length, 3)

      await storage.deleteDesign(filename)

      const list = await storage.listDesigns()
      assert.strictEqual(list.length, 2)
      const names = list.map(d => d.name).sort()
      assert.deepStrictEqual(names, ['Keeper A', 'Keeper B'])
    })

    it('should fail to load after deletion', async () => {
      const { filename } = await storage.saveDesign('Gone Soon', makeScene())
      await storage.deleteDesign(filename)

      await assert.rejects(
        () => storage.loadDesign(filename),
        /Design not found/
      )
    })

    it('should allow re-creating design with same name after deletion', async () => {
      const { filename } = await storage.saveDesign('Reusable Name', makeScene([{ id: 'v1' }]))
      await storage.deleteDesign(filename)

      // Should not throw DuplicateNameError
      const result = await storage.saveDesign('Reusable Name', makeScene([{ id: 'v2' }]))
      assert.strictEqual(result.design.name, 'Reusable Name')
      assert.strictEqual(result.design.elementCount, 1)
    })
  })

  describe('Multi-design workflow', () => {
    it('should handle full CRUD lifecycle across multiple designs', async () => {
      // Create 3 designs
      const d1 = await storage.saveDesign('Design Alpha', makeScene([{ id: 'a1' }]), { description: 'First' })
      const d2 = await storage.saveDesign('Design Beta', makeScene([{ id: 'b1' }, { id: 'b2' }]), { description: 'Second' })
      const d3 = await storage.saveDesign('Design Gamma', makeScene([{ id: 'g1' }]), { description: 'Third' })

      // List should have 3
      let list = await storage.listDesigns()
      assert.strictEqual(list.length, 3)

      // Update one
      await storage.updateDesign(d2.filename, {
        sceneData: makeScene([{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]),
        description: 'Updated second'
      })

      // Rename another
      const renamedD3 = await storage.renameDesign(d3.filename, 'Design Delta')

      // Delete the first
      await storage.deleteDesign(d1.filename)

      // Final list should have 2
      list = await storage.listDesigns()
      assert.strictEqual(list.length, 2)

      const names = list.map(d => d.name).sort()
      assert.deepStrictEqual(names, ['Design Beta', 'Design Delta'])

      // Verify updated design
      const loadedBeta = await storage.loadDesign(d2.filename)
      assert.strictEqual(loadedBeta.scene.elements.length, 3)
      assert.strictEqual(loadedBeta.meta.description, 'Updated second')

      // Verify renamed design
      const loadedDelta = await storage.loadDesign(renamedD3.newFilename)
      assert.strictEqual(loadedDelta.meta.name, 'Design Delta')
    })
  })

  describe('Edge cases', () => {
    it('should handle design with empty elements array', async () => {
      const { filename } = await storage.saveDesign('Empty Design', makeScene([]))
      const loaded = await storage.loadDesign(filename)
      assert.strictEqual(loaded.scene.elements.length, 0)
      assert.strictEqual(loaded.meta.elementCount, 0)
    })

    it('should handle design with special characters in name', async () => {
      const { filename } = await storage.saveDesign('My Design (v2.1) - Draft!', makeScene([{ id: '1' }]))
      const loaded = await storage.loadDesign(filename)
      assert.strictEqual(loaded.meta.name, 'My Design (v2.1) - Draft!')
    })

    it('should handle concurrent reads of same design', async () => {
      const { filename } = await storage.saveDesign('Concurrent', makeScene([{ id: '1' }]))

      const [load1, load2, load3] = await Promise.all([
        storage.loadDesign(filename),
        storage.loadDesign(filename),
        storage.loadDesign(filename)
      ])

      assert.strictEqual(load1.meta.name, 'Concurrent')
      assert.strictEqual(load2.meta.name, 'Concurrent')
      assert.strictEqual(load3.meta.name, 'Concurrent')
    })

    it('should export and re-import with thumbnailData preserved', async () => {
      const thumb = 'data:image/png;base64,FULLCYCLE'
      const { filename } = await storage.saveDesign('Thumb Cycle', makeScene([{ id: '1' }]), {
        thumbnailData: thumb
      })

      const json = await storage.exportDesign(filename)
      const imported = await storage.importDesign(json, 'Thumb Cycle Copy')

      assert.strictEqual(imported.design.thumbnailData, thumb)
    })
  })
})
