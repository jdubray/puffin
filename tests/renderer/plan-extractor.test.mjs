/**
 * plan-extractor tests — markdown plans of three shapes become board steps.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractPlan, planFileFromActivity } from '../../src/renderer/lib/plan-extractor.js'

const PUFFIN_SHAPED = `# Add plan support

## Context
Plans should reach the board.

## Steps
1. **Add the migration** in \`src/main/database/migrations/012_add_plans.js\`
   - [ ] plans table exists
   - [ ] columns added to both story tables
2. **Extend the repository** in \`src/main/database/repositories/user-story-repository.js\` after step 1
   - [ ] round-trips the new fields
3. /archlens how does a plan reach the board?
4. **Wire IPC** — requires steps 1 and 2
   Tests:
   - plan:create returns tasks

## Verification
- Run node --test
- step 4: the Backlog shows the tasks
`

const FREE_FORM = `# Add subtract function to math.js

## Context
\`math.js\` currently exports only \`add\`. Add a \`subtract\` function following the same style, plus a test file.

## Changes
- **math.js**: add \`function subtract(a,b){return a-b}\` and include it in \`module.exports\`.
- **math.test.js** (new): test \`add\` and \`subtract\` using Node's built-in \`node:test\` + \`assert\`.

## Verification
Run \`node --test math.test.js\` and confirm both tests pass.
`

const HEADINGS_ONLY = `# Refactor the loader

## Summary
Why we do this.

## Split the parser
Move parsing into its own module \`src/parser.js\`.

## Add caching
After step 1, cache parsed results.

## Risks
Might break things.
`

describe('extractPlan', () => {
  it('reads a Puffin-shaped plan: ordered steps, checkboxes, dependencies, skills, files, verification', () => {
    const plan = extractPlan(PUFFIN_SHAPED)
    assert.equal(plan.title, 'Add plan support')
    assert.equal(plan.context, 'Plans should reach the board.')
    assert.equal(plan.steps.length, 4)
    const [s1, s2, s3, s4] = plan.steps
    assert.equal(s1.title, 'Add the migration in src/main/database/migrations/012_add_plans.js')
    assert.deepEqual(s1.acceptanceCriteria, ['plans table exists', 'columns added to both story tables'])
    assert.deepEqual(s1.files, ['src/main/database/migrations/012_add_plans.js'])
    assert.deepEqual(s1.dependsOn, [])
    assert.deepEqual(s2.dependsOn, [0])
    assert.equal(s3.skill, '/archlens how does a plan reach the board?')
    assert.deepEqual(s4.dependsOn, [0, 1])
    // its own Tests: bullet, then the whole-plan verification: the unnamed bullet and the one naming step 4
    assert.deepEqual(s4.acceptanceCriteria, ['plan:create returns tasks', 'Run node --test', 'step 4: the Backlog shows the tasks'])
    assert.ok(plan.steps.every(s => s.include === true))
    assert.deepEqual(plan.warnings, [])
  })

  it('reads a free-form plan (bulleted Changes section) as one step per bullet', () => {
    const plan = extractPlan(FREE_FORM)
    assert.equal(plan.title, 'Add subtract function to math.js')
    assert.equal(plan.steps.length, 2)
    assert.equal(plan.steps[0].title, 'math.js: add function subtract(a,b){return a-b} and include it in module.exports.')
    assert.deepEqual(plan.steps[0].files, []) // bold, not backticked; `module.exports` is not a file
    assert.ok(plan.steps[1].title.startsWith('math.test.js (new)'))
    // whole-plan verification with no step reference goes to the last step
    assert.equal(plan.steps[1].acceptanceCriteria.length, 1)
    assert.match(plan.steps[1].acceptanceCriteria[0], /node --test math\.test\.js/)
  })

  it('falls back to level-2 headings, skipping Summary/Risks sections', () => {
    const plan = extractPlan(HEADINGS_ONLY)
    assert.equal(plan.context, 'Why we do this.')
    assert.deepEqual(plan.steps.map(s => s.title), ['Split the parser', 'Add caching'])
    assert.deepEqual(plan.steps[1].dependsOn, [0])
    assert.deepEqual(plan.steps[0].files, ['src/parser.js'])
  })

  it('makes the whole plan one step when nothing extracts, with a warning', () => {
    const plan = extractPlan('Just do the thing.\nThen the other thing.')
    assert.equal(plan.steps.length, 1)
    assert.equal(plan.title, 'Just do the thing.')
    assert.match(plan.warnings[0], /No steps/)
  })

  it('ignores YAML front matter and CRLF line endings', () => {
    const plan = extractPlan('---\r\npuffin_plan_id: x\r\n---\r\n# T\r\n\r\n## Steps\r\n1. one\r\n2. two\r\n')
    assert.equal(plan.title, 'T')
    assert.deepEqual(plan.steps.map(s => s.title), ['one', 'two'])
  })
})

describe('planFileFromActivity', () => {
  it('returns the newest write under ~/.claude/plans (or plan)', () => {
    const files = [
      { path: 'C:\\Users\\me\\code\\x\\src\\a.js', action: 'write' },
      { path: 'C:\\Users\\me\\.claude\\plans\\first.md', action: 'write' },
      { path: '/home/me/.claude/plan/second.md', action: 'write' }
    ]
    assert.equal(planFileFromActivity(files), '/home/me/.claude/plan/second.md')
    assert.equal(planFileFromActivity([{ path: '/x/y.md' }]), null)
    assert.equal(planFileFromActivity(null), null)
  })
})
