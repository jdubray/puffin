/**
 * Reply markdown rendering — shared by the Prompt and Sekkei panes.
 *
 * The security-relevant case is first: replies are model output, so raw HTML
 * in them must never reach the DOM as markup.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let renderMarkdown, simpleMarkdown, escapeHtml

before(async () => {
  ;({ renderMarkdown, simpleMarkdown, escapeHtml } =
    await import('../src/renderer/lib/markdown.js'))
})

describe('renderMarkdown', () => {
  it('escapes HTML in the reply before applying any markup', () => {
    const html = renderMarkdown('Consider <script>alert(1)</script> and <b>raw</b> tags.')
    assert.ok(!html.includes('<script>'), 'script tag must not survive')
    assert.ok(!html.includes('<b>raw</b>'), 'raw HTML must not survive')
    assert.ok(html.includes('&lt;script&gt;'))
  })

  it('renders the markers a verifier report actually uses', () => {
    const reply = [
      '**7/8 gates pass.** The only remaining failure is `7.integration_check`,',
      'which needs `package.json`/`tsconfig.json` at `source_dir`.',
      '',
      'What changed (58 total ops):',
      '- **16 new spec nodes** (`net_new`): `.spec.acceptance` and `.spec.prompt`',
      '- **8 `glm_update_node`** calls (one per component)',
      '- **8 `glm_apply_patch`** calls'
    ].join('\n')

    const html = renderMarkdown(reply)
    assert.ok(html.includes('<strong>7/8 gates pass.</strong>'))
    assert.ok(html.includes('<code>7.integration_check</code>'))
    assert.ok(html.includes('<ul>'))
    assert.ok(html.includes('<strong>16 new spec nodes</strong>'))
    // The literal markers are gone — that was the bug being fixed
    assert.ok(!html.includes('**'))
  })

  it('renders headings, links and fenced code', () => {
    const html = renderMarkdown([
      '## Status',
      '',
      'See [the spec](https://example.com/spec).',
      '',
      '```js',
      'const x = 1',
      '```'
    ].join('\n'))

    assert.ok(html.includes('<h2>Status</h2>'))
    assert.ok(html.includes('<a href="https://example.com/spec"'))
    assert.ok(html.includes('<pre><code class="language-js">'))
  })

  it('renders a pipe table', () => {
    const html = renderMarkdown([
      '| Gate | Status |',
      '| --- | --- |',
      '| 2.stratum_hierarchy | pass |',
      '| 7.integration_check | fail |'
    ].join('\n'))

    assert.ok(html.includes('<table>'))
    assert.ok(html.includes('<th>Gate</th>'))
    assert.ok(html.includes('<td>7.integration_check</td>'))
  })

  it('breaks the line after a run of tool markers so prose does not run into them', () => {
    const html = renderMarkdown('💻📖📖⚙️\nCreated 42 nodes.')
    assert.match(html, /💻📖📖⚙️<br>/u)
  })

  it('is safe on empty and missing input', () => {
    assert.strictEqual(renderMarkdown(''), '')
    assert.strictEqual(renderMarkdown(null), '')
    assert.strictEqual(renderMarkdown(undefined), '')
  })

  it('escapes quotes so rendered text can never break out of an attribute', () => {
    assert.strictEqual(escapeHtml('a "b" <c> & d'), 'a &quot;b&quot; &lt;c&gt; &amp; d')
  })

  it('renders identically whether called directly or through the fallback', () => {
    const text = '**bold** and `code`'
    assert.strictEqual(renderMarkdown(text), simpleMarkdown(text))
  })
})
