/**
 * docs/ browsing — a recursive scan over markdown and HTML, and a loader whose
 * guard is path containment rather than a ban on slashes.
 *
 * The traversal cases matter most: `filename` now legitimately contains
 * separators, so the old "no slashes" rule is gone and realpath containment is
 * the only thing standing between a renderer-supplied string and the disk.
 */

'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { PuffinState } = require('../src/main/puffin-state.js')

let projectDir
let state

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-docs-'))
  const docs = path.join(projectDir, 'docs')
  fs.mkdirSync(path.join(docs, 'design'), { recursive: true })
  fs.mkdirSync(path.join(docs, '.hidden'), { recursive: true })

  fs.writeFileSync(path.join(docs, 'readme.md'), '# Readme\n\nTop level.')
  fs.writeFileSync(path.join(docs, 'pipeline.html'), '<!DOCTYPE html><title>P</title><p>hi')
  fs.writeFileSync(path.join(docs, 'design', 'sekkei.md'), '# Sekkei\n\nNested.')
  fs.writeFileSync(path.join(docs, 'design', 'notes.txt'), 'not a document')
  fs.writeFileSync(path.join(docs, '.hidden', 'secret.md'), 'should not be listed')
  fs.writeFileSync(path.join(projectDir, 'outside.md'), 'outside the docs tree')

  state = new PuffinState()
  state.projectPath = projectDir
})

after(() => fs.rmSync(projectDir, { recursive: true, force: true }))

describe('scanDesignDocuments', () => {
  it('walks subdirectories and reports paths relative to docs/', async () => {
    const docs = await state.scanDesignDocuments()
    assert.deepStrictEqual(docs.map(d => d.filename),
      ['design/sekkei.md', 'pipeline.html', 'readme.md'])
  })

  it('takes markdown and HTML, and nothing else', async () => {
    const docs = await state.scanDesignDocuments()
    assert.deepStrictEqual(
      docs.map(d => d.kind).sort(), ['html', 'markdown', 'markdown'])
    assert.ok(!docs.some(d => d.filename.endsWith('.txt')))
  })

  it('skips dot directories', async () => {
    const docs = await state.scanDesignDocuments()
    assert.ok(!docs.some(d => d.filename.includes('.hidden')))
  })

  it('returns nothing when the project has no docs/', async () => {
    const bare = new PuffinState()
    bare.projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-nodocs-'))
    try {
      assert.deepStrictEqual(await bare.scanDesignDocuments(), [])
    } finally {
      fs.rmSync(bare.projectPath, { recursive: true, force: true })
    }
  })
})

describe('loadDesignDocument', () => {
  it('reads a nested document', async () => {
    const doc = await state.loadDesignDocument('design/sekkei.md')
    assert.strictEqual(doc.kind, 'markdown')
    assert.match(doc.content, /Nested/)
  })

  it('reads HTML and marks it as such, so the reader can sandbox it', async () => {
    const doc = await state.loadDesignDocument('pipeline.html')
    assert.strictEqual(doc.kind, 'html')
    assert.match(doc.content, /<!DOCTYPE html>/)
  })

  it('refuses to climb out of docs/', async () => {
    for (const attempt of ['../outside.md', 'design/../../outside.md', '../../etc/passwd.md']) {
      await assert.rejects(() => state.loadDesignDocument(attempt),
        /escapes the docs directory|not found/, attempt)
    }
  })

  it('refuses an absolute path', async () => {
    const absolute = path.join(projectDir, 'outside.md')
    await assert.rejects(() => state.loadDesignDocument(absolute),
      /escapes the docs directory|not found/)
  })

  it('refuses a file type it will not render', async () => {
    await assert.rejects(() => state.loadDesignDocument('design/notes.txt'),
      /only \.md, \.html and \.htm/)
    await assert.rejects(() => state.loadDesignDocument('../../.ssh/id_rsa'),
      /only \.md, \.html and \.htm/)
  })

  it('refuses a symlink that points outside docs/', async (t) => {
    const link = path.join(projectDir, 'docs', 'escape.md')
    try {
      await fsp.symlink(path.join(projectDir, 'outside.md'), link)
    } catch {
      return t.skip('symlinks not permitted in this environment')
    }
    try {
      await assert.rejects(() => state.loadDesignDocument('escape.md'),
        /escapes the docs directory/)
    } finally {
      await fsp.unlink(link)
    }
  })

  it('rejects empty and non-string input', async () => {
    for (const bad of ['', null, undefined, 42]) {
      await assert.rejects(() => state.loadDesignDocument(bad), /Invalid filename/)
    }
  })
})
