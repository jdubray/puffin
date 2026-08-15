/**
 * Every nav tab must reach a view that can actually show itself.
 *
 * This guards a failure that has now happened twice, silently both times: a
 * view is added to the markup and the nav, but missing from a whitelist — so
 * the tab highlights and the screen stays blank, with no error anywhere. It
 * used to be possible because there were two separate lists (the SAM acceptor's
 * and app.js's); they are one constant now, and these tests hold the markup,
 * the constant and the components in agreement.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const indexHtml = fs.readFileSync(
  path.join(repoRoot, 'src', 'renderer', 'index.html'), 'utf-8')

let BUILT_IN_VIEWS

before(async () => {
  ;({ BUILT_IN_VIEWS } = await import('../src/shared/constants.js'))
})

/** Views the nav offers, in markup order. */
function navViews() {
  return [...indexHtml.matchAll(/<button[^>]*class="nav-btn[^"]*"[^>]*data-view="([^"]+)"/g)]
    .map(m => m[1])
}

/** Sections that exist to be shown. */
function viewSections() {
  // `class="view active"` on the default tab — match the class prefix, not the
  // whole attribute.
  return [...indexHtml.matchAll(/<section id="([a-z-]+)-view" class="view/g)].map(m => m[1])
}

describe('built-in views', () => {
  it('offers a nav button only for views the switcher knows', () => {
    for (const view of navViews()) {
      assert.ok(BUILT_IN_VIEWS.includes(view),
        `nav offers "${view}" but BUILT_IN_VIEWS does not list it — the tab would do nothing`)
    }
  })

  it('has a section for every view the nav offers', () => {
    const sections = viewSections()
    for (const view of navViews()) {
      assert.ok(sections.includes(view),
        `nav offers "${view}" but there is no <section id="${view}-view">`)
    }
  })

  it('includes the views this session added', () => {
    for (const view of ['specs', 'board', 'docs', 'polygraph']) {
      assert.ok(BUILT_IN_VIEWS.includes(view), view)
    }
  })

  it('names each view once', () => {
    assert.strictEqual(new Set(BUILT_IN_VIEWS).size, BUILT_IN_VIEWS.length)
  })

  it('gives the Docs view a root element for its component to render into', () => {
    assert.match(indexHtml, /<div id="docs-view-root">/)
  })
})
