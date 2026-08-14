/**
 * Follow-up extraction — turning a reply's own offer of next work into a
 * checklist, so accepting it doesn't mean retyping it.
 *
 * The conservative half matters as much as the recognising half: a checklist
 * that appears when nothing was offered is worse than no checklist.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let extractFollowUps

before(async () => {
  ;({ extractFollowUps } = await import('../src/renderer/components/specs-view/specs-view.js'))
})

describe('extractFollowUps', () => {
  it('picks up a trailing offer, trimmed to the proposal', () => {
    const reply = [
      'I rebuilt the 41 composes-of edges parent to child; gates 2 and 2.b are green.',
      '',
      'Want me to author the missing acceptance and prompt specs for the 8 components now?',
      'That would close gate 5, leaving only the pre-code integration gate (which resolves',
      'once code generation actually happens).'
    ].join('\n')

    const found = extractFollowUps(reply)
    assert.strictEqual(found.length, 1)
    assert.strictEqual(
      found[0].text,
      'Want me to author the missing acceptance and prompt specs for the 8 components now?')
  })

  it('prefers the list when the offer introduces one', () => {
    const reply = [
      'The graph is repaired. Should I also:',
      '- attach acceptance specs to the 8 components',
      '- add the NFR spec under the system node',
      '* re-run the verifier afterwards',
      '',
      'Let me know.'
    ].join('\n')

    assert.deepStrictEqual(extractFollowUps(reply).map(f => f.text), [
      'attach acceptance specs to the 8 components',
      'add the NFR spec under the system node',
      're-run the verifier afterwards'
    ])
  })

  it('handles numbered lists and a blank line before them', () => {
    const reply = [
      'I can take this further.',
      '',
      '1. Author the four spec kinds per component',
      '2. Wire the acceptance verifier command',
      ''
    ].join('\n')

    assert.deepStrictEqual(extractFollowUps(reply).map(f => f.text), [
      'Author the four spec kinds per component',
      'Wire the acceptance verifier command'
    ])
  })

  it('offers nothing when the reply proposes nothing', () => {
    const reply = [
      'Created 42 nodes across 5 strata. The verifier reports 6 of 8 gates passing;',
      'gate 7 fails because there is no package.json at source_dir yet, which is',
      'expected before any code exists.'
    ].join('\n')
    assert.deepStrictEqual(extractFollowUps(reply), [])
  })

  it('ignores fragments too short to be an instruction', () => {
    assert.deepStrictEqual(extractFollowUps('Should I?'), [])
    assert.deepStrictEqual(extractFollowUps('I can.'), [])
  })

  it('dedupes repeats and caps the list', () => {
    const repeated = Array.from({ length: 12 },
      (_, i) => `- author the acceptance spec for component ${i % 3}`)
    const found = extractFollowUps(['Want me to do these?', ...repeated].join('\n'))
    assert.strictEqual(found.length, 3)
  })

  it('survives empty and non-string input', () => {
    assert.deepStrictEqual(extractFollowUps(''), [])
    assert.deepStrictEqual(extractFollowUps(null), [])
    assert.deepStrictEqual(extractFollowUps(undefined), [])
  })

  it('gives every item a stable id for the checkbox list', () => {
    const found = extractFollowUps('Want me to attach the missing acceptance specs now?')
    assert.match(found[0].id, /^fu-\d+$/)
  })
})
