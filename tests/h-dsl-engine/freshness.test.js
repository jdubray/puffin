'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const fsP = require('fs').promises
const path = require('path')
const os = require('os')

const {
  checkFreshness,
  incrementalUpdate,
  ensureFresh,
  classifyNewFile,
  SOURCE_EXTENSIONS
} = require('../../h-dsl-engine/lib/freshness')

// ---------------------------------------------------------------------------
// Helpers — temp directory with model files
// ---------------------------------------------------------------------------

let tmpDir, projectRoot, dataDir

async function setupTempProject() {
  tmpDir = await fsP.mkdtemp(path.join(os.tmpdir(), 'hdsl-fresh-'))
  projectRoot = tmpDir
  dataDir = path.join(tmpDir, '.puffin', 'cre')
  await fsP.mkdir(dataDir, { recursive: true })
}

async function cleanupTempProject() {
  if (tmpDir) {
    await fsP.rm(tmpDir, { recursive: true, force: true })
  }
}

async function writeModel(instance, schema) {
  await fsP.writeFile(
    path.join(dataDir, 'instance.json'),
    JSON.stringify(instance || { artifacts: {}, dependencies: [], flows: {} }),
    'utf-8'
  )
  await fsP.writeFile(
    path.join(dataDir, 'schema.json'),
    JSON.stringify(schema || { elementTypes: {} }),
    'utf-8'
  )
}

function makeInstance(artifactPaths) {
  const artifacts = {}
  for (const p of artifactPaths) {
    artifacts[p] = { type: 'module', kind: 'module', summary: '', exports: [], tags: [], size: 100 }
  }
  return { artifacts, dependencies: [], flows: {} }
}

// ---------------------------------------------------------------------------
// classifyNewFile
// ---------------------------------------------------------------------------

describe('classifyNewFile', () => {
  it('classifies test files', () => {
    assert.equal(classifyNewFile('src/__tests__/foo.test.js'), 'test')
  })

  it('classifies config files', () => {
    assert.equal(classifyNewFile('.eslintrc.js'), 'config')
  })

  it('classifies jsx as view', () => {
    assert.equal(classifyNewFile('src/components/Button.jsx'), 'view')
  })

  it('classifies service files', () => {
    assert.equal(classifyNewFile('src/services/auth.js'), 'service')
  })

  it('classifies utility files', () => {
    assert.equal(classifyNewFile('src/utils/format.js'), 'utility')
  })

  it('classifies barrel files', () => {
    assert.equal(classifyNewFile('src/components/index.js'), 'barrel')
  })

  it('defaults to module', () => {
    assert.equal(classifyNewFile('src/foo.js'), 'module')
  })
})

// ---------------------------------------------------------------------------
// SOURCE_EXTENSIONS
// ---------------------------------------------------------------------------

describe('SOURCE_EXTENSIONS', () => {
  it('includes JS/TS extensions', () => {
    assert.ok(SOURCE_EXTENSIONS.has('.js'))
    assert.ok(SOURCE_EXTENSIONS.has('.ts'))
    assert.ok(SOURCE_EXTENSIONS.has('.jsx'))
    assert.ok(SOURCE_EXTENSIONS.has('.tsx'))
    assert.ok(SOURCE_EXTENSIONS.has('.mjs'))
    assert.ok(SOURCE_EXTENSIONS.has('.cjs'))
  })

  it('excludes non-source extensions', () => {
    assert.ok(!SOURCE_EXTENSIONS.has('.json'))
    assert.ok(!SOURCE_EXTENSIONS.has('.css'))
    assert.ok(!SOURCE_EXTENSIONS.has('.md'))
  })
})

// ---------------------------------------------------------------------------
// checkFreshness — missing model
// ---------------------------------------------------------------------------

describe('checkFreshness — missing model', () => {
  beforeEach(async () => {
    await setupTempProject()
  })

  afterEach(async () => {
    await cleanupTempProject()
  })

  it('returns missing status when instance.json does not exist', async () => {
    // Don't write any model files
    const r = await checkFreshness({ projectRoot, dataDir })
    assert.equal(r.status, 'missing')
    assert.equal(r.modelExists, false)
    assert.equal(r.stale, true)
  })
})

// ---------------------------------------------------------------------------
// checkFreshness — non-git project
// ---------------------------------------------------------------------------

describe('checkFreshness — non-git project', () => {
  beforeEach(async () => {
    await setupTempProject()
    await writeModel()
  })

  afterEach(async () => {
    await cleanupTempProject()
  })

  it('returns unknown status for non-git directory', async () => {
    const r = await checkFreshness({ projectRoot, dataDir })
    assert.equal(r.status, 'unknown')
    assert.equal(r.modelExists, true)
    assert.equal(r.stale, false)
    assert.ok(r.reason.includes('git'))
  })
})

// ---------------------------------------------------------------------------
// incrementalUpdate
// ---------------------------------------------------------------------------

describe('incrementalUpdate', () => {
  beforeEach(async () => {
    await setupTempProject()
  })

  afterEach(async () => {
    await cleanupTempProject()
  })

  it('removes deleted artifacts', async () => {
    const instance = makeInstance(['src/old.js', 'src/keep.js'])
    instance.dependencies = [
      { from: 'src/old.js', to: 'src/keep.js', kind: 'import' },
      { from: 'src/keep.js', to: 'src/old.js', kind: 'call' }
    ]
    await writeModel(instance)

    // src/old.js does NOT exist on disk
    // src/keep.js should remain
    await fsP.mkdir(path.join(projectRoot, 'src'), { recursive: true })
    await fsP.writeFile(path.join(projectRoot, 'src', 'keep.js'), 'module.exports = {}')

    const r = await incrementalUpdate({
      projectRoot,
      dataDir,
      changedFiles: ['src/old.js']
    })

    assert.deepEqual(r.removed, ['src/old.js'])
    assert.equal(r.added.length, 0)
    assert.equal(r.newArtifactCount, 1)
    // Dependencies involving old.js should be removed
    assert.equal(r.newDependencyCount, 0)
  })

  it('adds new artifacts', async () => {
    await writeModel(makeInstance([]))
    await fsP.mkdir(path.join(projectRoot, 'src'), { recursive: true })
    await fsP.writeFile(path.join(projectRoot, 'src', 'new.js'), 'export default 1')

    const r = await incrementalUpdate({
      projectRoot,
      dataDir,
      changedFiles: ['src/new.js']
    })

    assert.deepEqual(r.added, ['src/new.js'])
    assert.equal(r.newArtifactCount, 1)

    // Verify the instance was written back
    const updated = JSON.parse(await fsP.readFile(path.join(dataDir, 'instance.json'), 'utf-8'))
    assert.ok(updated.artifacts['src/new.js'])
    assert.equal(updated.artifacts['src/new.js'].type, 'module')
  })

  it('updates modified artifacts', async () => {
    const instance = makeInstance(['src/mod.js'])
    instance.artifacts['src/mod.js'].size = 50
    await writeModel(instance)
    await fsP.mkdir(path.join(projectRoot, 'src'), { recursive: true })
    await fsP.writeFile(path.join(projectRoot, 'src', 'mod.js'), 'x'.repeat(200))

    const r = await incrementalUpdate({
      projectRoot,
      dataDir,
      changedFiles: ['src/mod.js']
    })

    assert.deepEqual(r.modified, ['src/mod.js'])
    const updated = JSON.parse(await fsP.readFile(path.join(dataDir, 'instance.json'), 'utf-8'))
    assert.ok(updated.artifacts['src/mod.js'].size >= 200)
  })

  it('handles mixed adds, modifications, and removals', async () => {
    const instance = makeInstance(['src/a.js', 'src/b.js'])
    await writeModel(instance)
    await fsP.mkdir(path.join(projectRoot, 'src'), { recursive: true })
    await fsP.writeFile(path.join(projectRoot, 'src', 'b.js'), 'updated')
    await fsP.writeFile(path.join(projectRoot, 'src', 'c.js'), 'new file')

    const r = await incrementalUpdate({
      projectRoot,
      dataDir,
      changedFiles: ['src/a.js', 'src/b.js', 'src/c.js']
    })

    assert.deepEqual(r.removed, ['src/a.js'])
    assert.deepEqual(r.modified, ['src/b.js'])
    assert.deepEqual(r.added, ['src/c.js'])
    assert.equal(r.totalChanged, 3)
    assert.equal(r.newArtifactCount, 2) // b + c
  })
})

// ---------------------------------------------------------------------------
// ensureFresh
// ---------------------------------------------------------------------------

describe('ensureFresh', () => {
  beforeEach(async () => {
    await setupTempProject()
  })

  afterEach(async () => {
    await cleanupTempProject()
  })

  it('returns bootstrap-required when model is missing', async () => {
    const r = await ensureFresh({ projectRoot, dataDir })
    assert.equal(r.action, 'bootstrap-required')
    assert.equal(r.freshness.status, 'missing')
  })

  it('returns force-refresh action when flag is set', async () => {
    await writeModel()
    const r = await ensureFresh({ projectRoot, dataDir, forceRefresh: true })
    assert.equal(r.action, 'rebuild-required')
    assert.equal(r.freshness.status, 'force-refresh')
    assert.equal(r.freshness.stale, true)
  })

  it('returns none action when model exists in non-git project', async () => {
    await writeModel()
    const r = await ensureFresh({ projectRoot, dataDir })
    assert.equal(r.action, 'none')
    assert.equal(r.freshness.stale, false)
  })
})

// ---------------------------------------------------------------------------
// classifyNewFile — edge cases
// ---------------------------------------------------------------------------

describe('classifyNewFile — edge cases', () => {
  it('classifies model files', () => {
    assert.equal(classifyNewFile('src/models/User.js'), 'model')
  })

  it('classifies tsx as view', () => {
    assert.equal(classifyNewFile('src/pages/Home.tsx'), 'view')
  })

  it('classifies api files as service', () => {
    assert.equal(classifyNewFile('src/api/endpoints.js'), 'service')
  })
})
