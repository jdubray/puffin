/**
 * Reply markdown rendering — shared by the Prompt and Sekkei panes.
 *
 * The security-relevant case is first: replies are model output, so raw HTML
 * in them must never reach the DOM as markup.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let renderMarkdown, simpleMarkdown, escapeHtml, isSafeUrl

before(async () => {
  ;({ renderMarkdown, simpleMarkdown, escapeHtml, isSafeUrl } =
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

  it('never delegates to a third-party parser, whatever the page has loaded', () => {
    // A marked.js on window must not become a path to unescaped HTML: no
    // regex scrubber is a match for a real parser's output.
    const text = '**bold** and `code`'
    const before = renderMarkdown(text)
    globalThis.window = { marked: { parse: () => '<img src=x onerror=alert(1)>' } }
    try {
      assert.strictEqual(renderMarkdown(text), before)
      assert.ok(!renderMarkdown(text).includes('onerror'))
    } finally {
      delete globalThis.window
    }
    assert.strictEqual(before, simpleMarkdown(text))
  })
})

describe('link safety', () => {
  it('refuses javascript: links but keeps the text visible', () => {
    const html = renderMarkdown('[click me](javascript:fetch("/steal"))')
    assert.ok(!/<a/.test(html), 'must not become a clickable anchor')
    assert.ok(!html.includes('href'))
    assert.ok(html.includes('click me'))
  })

  it('refuses data:, vbscript: and file: targets', () => {
    for (const url of ['data:text/html;base64,PHN2Zz4=', 'vbscript:msgbox(1)', 'file:///etc/passwd']) {
      assert.strictEqual(isSafeUrl(url), false, url)
      assert.ok(!/<a/.test(renderMarkdown(`[x](${url})`)), url)
    }
  })

  it('sees through entity-encoded and control-character schemes', () => {
    assert.strictEqual(isSafeUrl('java&#115;cript:alert(1)'), false)
    assert.strictEqual(isSafeUrl('&#106;avascript:alert(1)'), false)
    assert.strictEqual(isSafeUrl('java\u0000script:alert(1)'), false)
    assert.strictEqual(isSafeUrl('  javascript:alert(1)'), false)
    assert.strictEqual(isSafeUrl('JaVaScRiPt:alert(1)'), false)
  })

  it('allows the schemes a reply legitimately uses', () => {
    for (const url of ['https://example.com/spec', 'http://127.0.0.1:3300/mcp',
      'mailto:jj@example.com', '#gate-7', '/docs/architecture.md', './notes.md']) {
      assert.strictEqual(isSafeUrl(url), true, url)
    }
  })

  it('gives external links rel="noopener noreferrer"', () => {
    const html = renderMarkdown('[the spec](https://example.com/spec)')
    assert.match(html, /<a href="https:\/\/example\.com\/spec" target="_blank" rel="noopener noreferrer">/)
  })
})
