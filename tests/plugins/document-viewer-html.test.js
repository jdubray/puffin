/**
 * The document viewer reads HTML.
 *
 * It refused before, which made it useless for exactly the artifacts this
 * project now generates — a self-contained page written into docs/. The file
 * is flagged `isHtml` so the renderer puts it in a sandboxed frame rather than
 * treating it as text or, worse, injecting it into the app's own document.
 */

'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  DocumentScanner, SUPPORTED_EXTENSIONS, HTML_EXTENSIONS
} = require('../../plugins/document-viewer-plugin/document-scanner.js')

let projectDir
let scanner

const quietLogger = { info() {}, warn() {}, error() {}, debug() {} }

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-docview-'))
  const docs = path.join(projectDir, 'docs')
  fs.mkdirSync(docs, { recursive: true })
  fs.writeFileSync(path.join(docs, 'report.html'),
    '<!DOCTYPE html><title>Report</title><p>hello')
  fs.writeFileSync(path.join(docs, 'legacy.htm'), '<p>older</p>')
  fs.writeFileSync(path.join(docs, 'notes.md'), '# Notes')
  fs.writeFileSync(path.join(docs, 'build.log'), 'not a document')
  scanner = new DocumentScanner(projectDir, quietLogger)
})

after(() => fs.rmSync(projectDir, { recursive: true, force: true }))

const filesOf = (node) =>
  node.type === 'file' ? [node] : (node.children || []).flatMap(filesOf)

describe('document viewer — HTML support', () => {
  it('lists .html and .htm as supported', async () => {
    const { root } = await scanner.scanDirectory()
    const files = filesOf(root)
    const byName = Object.fromEntries(files.map(f => [f.name, f]))

    assert.strictEqual(byName['report.html'].isSupported, true)
    assert.strictEqual(byName['legacy.htm'].isSupported, true)
    assert.strictEqual(byName['notes.md'].isSupported, true)
    assert.strictEqual(byName['build.log'].isSupported, false,
      'an unknown extension is still refused')
  })

  it('flags HTML so the renderer can sandbox it, and not as markdown', async () => {
    const content = await scanner.getFileContent(
      path.join(projectDir, 'docs', 'report.html'))
    assert.strictEqual(content.isHtml, true)
    assert.strictEqual(content.isMarkdown, false)
    assert.strictEqual(content.isImage, false)
    assert.match(content.content, /<!DOCTYPE html>/)
  })

  it('leaves markdown alone', async () => {
    const content = await scanner.getFileContent(
      path.join(projectDir, 'docs', 'notes.md'))
    assert.strictEqual(content.isMarkdown, true)
    assert.strictEqual(content.isHtml, false)
  })

  it('keeps the two extension lists in agreement', () => {
    for (const ext of HTML_EXTENSIONS) {
      assert.ok(SUPPORTED_EXTENSIONS.includes(ext),
        `${ext} is rendered as HTML but not listed as supported`)
    }
  })

  it('still refuses a path outside docs/', async () => {
    fs.writeFileSync(path.join(projectDir, 'outside.html'), '<p>nope')
    await assert.rejects(
      () => scanner.getFileContent(path.join(projectDir, 'outside.html')))
  })
})
