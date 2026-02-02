'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const os = require('os')

const HdslViewerPlugin = require('../../plugins/hdsl-viewer-plugin/index.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hdsl-viewer-test-'))
}

function makeContext(projectPath) {
  const handlers = {}
  const actions = {}
  return {
    projectPath,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registerIpcHandler(name, fn) { handlers[name] = fn },
    registerAction(name, fn) { actions[name] = fn },
    _handlers: handlers,
    _actions: actions
  }
}

/**
 * Create a fresh clone of the plugin to avoid shared state between tests.
 */
function clonePlugin() {
  return Object.create(HdslViewerPlugin)
}

// ---------------------------------------------------------------------------
// activate / deactivate
// ---------------------------------------------------------------------------

describe('HdslViewerPlugin — lifecycle', () => {
  let tmpDir, plugin

  beforeEach(() => {
    tmpDir = makeTmpDir()
    plugin = clonePlugin()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('activate registers 4 IPC handlers and 3 actions', async () => {
    const ctx = makeContext(tmpDir)
    await plugin.activate(ctx)
    assert.equal(Object.keys(ctx._handlers).length, 4)
    assert.equal(Object.keys(ctx._actions).length, 3)
    assert.ok(ctx._handlers.getSchema)
    assert.ok(ctx._handlers.getInstance)
    assert.ok(ctx._handlers.getAnnotations)
    assert.ok(ctx._handlers.getAnnotation)
  })

  it('deactivate clears _creDir', async () => {
    const ctx = makeContext(tmpDir)
    await plugin.activate(ctx)
    assert.ok(plugin._creDir)
    await plugin.deactivate()
    assert.equal(plugin._creDir, null)
  })
})

// ---------------------------------------------------------------------------
// _readJson
// ---------------------------------------------------------------------------

describe('HdslViewerPlugin — _readJson', () => {
  let tmpDir, plugin

  beforeEach(() => {
    tmpDir = makeTmpDir()
    plugin = clonePlugin()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads and parses a valid JSON file', async () => {
    const filePath = path.join(tmpDir, 'data.json')
    fs.writeFileSync(filePath, JSON.stringify({ hello: 'world' }))
    const result = await plugin._readJson(filePath, 'test')
    assert.deepEqual(result, { hello: 'world' })
  })

  it('throws descriptive error when file missing', async () => {
    const filePath = path.join(tmpDir, 'missing.json')
    await assert.rejects(
      () => plugin._readJson(filePath, 'schema'),
      (err) => {
        assert.ok(err.message.includes('No schema file found'))
        assert.ok(err.message.includes('hdsl-bootstrap.js'))
        return true
      }
    )
  })

  it('throws on malformed JSON', async () => {
    const filePath = path.join(tmpDir, 'bad.json')
    fs.writeFileSync(filePath, '{ broken json')
    await assert.rejects(
      () => plugin._readJson(filePath, 'instance'),
      (err) => {
        assert.ok(err.message.includes('Failed to read instance'))
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// _walkDir
// ---------------------------------------------------------------------------

describe('HdslViewerPlugin — _walkDir', () => {
  let tmpDir, plugin

  beforeEach(() => {
    tmpDir = makeTmpDir()
    plugin = clonePlugin()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds files matching extension recursively', async () => {
    // Create nested structure
    const sub = path.join(tmpDir, 'sub')
    fs.mkdirSync(sub)
    fs.writeFileSync(path.join(tmpDir, 'a.an.md'), 'a')
    fs.writeFileSync(path.join(sub, 'b.an.md'), 'b')
    fs.writeFileSync(path.join(tmpDir, 'c.txt'), 'c') // should be excluded

    const results = await plugin._walkDir(tmpDir, '.an.md')
    assert.equal(results.length, 2)
    assert.ok(results.some(r => r.endsWith('a.an.md')))
    assert.ok(results.some(r => r.endsWith('b.an.md')))
  })

  it('returns empty array for empty directory', async () => {
    const results = await plugin._walkDir(tmpDir, '.an.md')
    assert.deepEqual(results, [])
  })

  it('throws for non-existent directory', async () => {
    await assert.rejects(
      () => plugin._walkDir(path.join(tmpDir, 'nope'), '.an.md')
    )
  })
})

// ---------------------------------------------------------------------------
// getAnnotation — path traversal guard
// ---------------------------------------------------------------------------

describe('HdslViewerPlugin — getAnnotation path traversal', () => {
  let tmpDir, plugin

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    plugin = clonePlugin()
    const ctx = makeContext(tmpDir)
    await plugin.activate(ctx)

    // Create annotations dir with a file
    const annDir = path.join(tmpDir, '.puffin', 'cre', 'annotations')
    fs.mkdirSync(annDir, { recursive: true })
    fs.writeFileSync(path.join(annDir, 'test.an.md'), '# Test')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads a valid annotation file', async () => {
    const result = await plugin.getAnnotation({ filePath: 'test.an.md' })
    assert.equal(result.path, 'test.an.md')
    assert.equal(result.content, '# Test')
  })

  it('rejects path traversal with ../', async () => {
    await assert.rejects(
      () => plugin.getAnnotation({ filePath: '../../../etc/passwd' }),
      (err) => {
        assert.ok(err.message.includes('within the annotations directory'))
        return true
      }
    )
  })

  it('rejects absolute path traversal', async () => {
    await assert.rejects(
      () => plugin.getAnnotation({ filePath: '/etc/passwd' }),
      (err) => {
        // On Windows this resolves inside annDir; on Unix it escapes.
        // Either way, the guard or ENOENT should prevent reading outside.
        return true
      }
    )
  })

  it('throws when filePath is missing', async () => {
    await assert.rejects(
      () => plugin.getAnnotation({}),
      (err) => {
        assert.ok(err.message.includes('filePath is required'))
        return true
      }
    )
  })

  it('throws when args is null', async () => {
    await assert.rejects(
      () => plugin.getAnnotation(null),
      (err) => {
        assert.ok(err.message.includes('filePath is required'))
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// getAnnotations
// ---------------------------------------------------------------------------

describe('HdslViewerPlugin — getAnnotations', () => {
  let tmpDir, plugin

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    plugin = clonePlugin()
    const ctx = makeContext(tmpDir)
    await plugin.activate(ctx)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when annotations dir missing', async () => {
    const result = await plugin.getAnnotations()
    assert.deepEqual(result, [])
  })

  it('lists annotation files with normalized paths', async () => {
    const annDir = path.join(tmpDir, '.puffin', 'cre', 'annotations')
    const subDir = path.join(annDir, 'sub')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(annDir, 'root.an.md'), 'r')
    fs.writeFileSync(path.join(subDir, 'nested.an.md'), 'n')
    fs.writeFileSync(path.join(annDir, 'ignore.txt'), 'x')

    const result = await plugin.getAnnotations()
    assert.equal(result.length, 2)
    assert.ok(result.some(r => r.path === 'root.an.md'))
    assert.ok(result.some(r => r.path === 'sub/nested.an.md'))
  })
})

// ---------------------------------------------------------------------------
// getSchema / getInstance
// ---------------------------------------------------------------------------

describe('HdslViewerPlugin — getSchema / getInstance', () => {
  let tmpDir, plugin

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    plugin = clonePlugin()
    const ctx = makeContext(tmpDir)
    await plugin.activate(ctx)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getSchema returns parsed schema.json', async () => {
    const creDir = path.join(tmpDir, '.puffin', 'cre')
    fs.mkdirSync(creDir, { recursive: true })
    fs.writeFileSync(path.join(creDir, 'schema.json'), JSON.stringify({ version: '1.0' }))

    const result = await plugin.getSchema()
    assert.deepEqual(result, { version: '1.0' })
  })

  it('getInstance returns parsed instance.json', async () => {
    const creDir = path.join(tmpDir, '.puffin', 'cre')
    fs.mkdirSync(creDir, { recursive: true })
    fs.writeFileSync(path.join(creDir, 'instance.json'), JSON.stringify({ artifacts: {} }))

    const result = await plugin.getInstance()
    assert.deepEqual(result, { artifacts: {} })
  })

  it('getSchema throws when file missing', async () => {
    await assert.rejects(
      () => plugin.getSchema(),
      (err) => {
        assert.ok(err.message.includes('No schema file found'))
        return true
      }
    )
  })
})
