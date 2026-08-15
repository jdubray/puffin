/**
 * Language detection and the validation lane it selects.
 *
 * The point is not the detection itself but what it prevents: routing a Python
 * component through polygen, which emits JavaScript and would have nothing to
 * produce. "Not applicable" and "broken" are different answers, and the lane
 * chooser exists so the pipeline can say which one it is.
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { detectProjectLanguage, validationLaneFor } = require('../src/main/project-language.js')

let dir

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-lang-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const write = (name, body = '{}') => fs.writeFileSync(path.join(dir, name), body)

describe('detectProjectLanguage', () => {
  it('reads TypeScript ahead of JavaScript, since a TS project also has package.json', () => {
    write('package.json')
    write('tsconfig.json')
    const result = detectProjectLanguage(dir)
    assert.strictEqual(result.language, 'typescript')
    assert.strictEqual(result.evidence, 'tsconfig.json')
    assert.strictEqual(result.polygenApplicable, true)
  })

  it('recognises the languages polygen cannot emit', () => {
    for (const [file, language] of [
      ['pyproject.toml', 'python'], ['go.mod', 'go'],
      ['Cargo.toml', 'rust'], ['Gemfile', 'ruby']
    ]) {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      write(file)
      const result = detectProjectLanguage(dir)
      assert.strictEqual(result.language, language, file)
      assert.strictEqual(result.polygenApplicable, false, file)
      // Losing polygen never means losing the checker
      assert.strictEqual(result.verifierApplicable, true, file)
    }
  })

  it('says unknown rather than guessing when no build file is recognised', () => {
    write('README.md', '# just docs')
    const result = detectProjectLanguage(dir)
    assert.strictEqual(result.language, null)
    assert.strictEqual(result.polygenApplicable, false)
  })

  it('handles no project at all', () => {
    assert.strictEqual(detectProjectLanguage(null).language, null)
  })
})

describe('validationLaneFor', () => {
  it('names capture-ready as the skill for every language polygen cannot serve', () => {
    for (const language of ['python', 'go', 'rust', 'java', null]) {
      const lane = validationLaneFor({ isStateMachine: true, language })
      assert.strictEqual(lane.lane, 'captured', String(language))
      assert.strictEqual(lane.skill, 'capture-ready', String(language))
    }
  })

  it('sends a JS state machine down the generated lane', () => {
    const lane = validationLaneFor({ isStateMachine: true, language: 'javascript' })
    assert.strictEqual(lane.lane, 'generated')
    assert.strictEqual(lane.generator, 'polygen')
    assert.match(lane.proof, /model check/)
  })

  it('proves a non-JS state machine by its corpus, and says so plainly', () => {
    const lane = validationLaneFor({ isStateMachine: true, language: 'python' })
    assert.strictEqual(lane.lane, 'captured')
    assert.strictEqual(lane.generator, null, 'nothing generates it')
    assert.strictEqual(lane.skill, 'capture-ready', 'the skill that makes the corpus fall out')
    // The correction that matters: the checker derives its transition relation
    // from a SAM v2 JS module, so it cannot explore a Python one. Claiming a
    // model check here would be claiming a proof nobody ran.
    assert.doesNotMatch(lane.proof, /model check/)
    assert.match(lane.proof, /corpus|replay/)
    assert.match(lane.why, /python/)
  })

  it('proves non-stateful code with its acceptance verifier', () => {
    const lane = validationLaneFor({ isStateMachine: false, language: 'javascript' })
    assert.strictEqual(lane.lane, 'acceptance')
    assert.strictEqual(lane.generator, null)
    assert.strictEqual(lane.proof, 'acceptance verifier')
    assert.match(lane.why, /no state graph/)
  })

  it('does not offer polygen for non-stateful code even in JavaScript', () => {
    for (const language of ['javascript', 'typescript', 'python', null]) {
      assert.strictEqual(
        validationLaneFor({ isStateMachine: false, language }).generator, null, String(language))
    }
  })
})
