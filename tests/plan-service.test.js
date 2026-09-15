/**
 * PlanService Tests
 *
 * Plans on disk (docs/plans, ~/.claude/plans) and tasks on the board, against
 * a temp project and an in-memory fake of the two repositories.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const fsp = require('fs').promises
const os = require('os')
const path = require('path')

const { PlanService, slugify, splitFrontMatter, titleOf, withFrontMatter } = require('../src/main/plan-service')

/** In-memory stand-ins for UserStoryRepository / PlanRepository. */
function fakeDb() {
  const stories = new Map()
  const plans = new Map()
  return {
    storyRows: stories,
    planRows: plans,
    userStories: {
      create: (s) => { const row = { status: 'pending', runState: 'idle', runMeta: {}, dependsOn: [], ...s }; stories.set(s.id, row); return row },
      findAll: () => [...stories.values()].filter(s => s.status !== 'archived'),
      findById: (id) => stories.get(id) || null,
      update: (id, u) => { const cur = stories.get(id); if (!cur) return null; const next = { ...cur, ...u }; stories.set(id, next); return next },
      deleteById: (id) => stories.delete(id)
    },
    plans: {
      create: (p) => { const row = { status: 'approved', ...p }; plans.set(p.id, row); return row },
      findById: (id) => plans.get(id) || null,
      findAll: ({ branchId } = {}) => [...plans.values()].filter(p => !branchId || p.branchId === branchId),
      update: (id, u) => { const cur = plans.get(id); if (!cur) return null; const next = { ...cur, ...u }; plans.set(id, next); return next },
      delete: (id) => plans.delete(id)
    }
  }
}

const PLAN_MD = `# Add subtract to math.js

## Context
math.js only has add.

## Steps
1. **Add subtract** in \`math.js\`
   - [ ] exports subtract
2. **Add tests** in \`math.test.js\` after step 1
   - [ ] node --test passes

## Verification
Run node --test.
`

describe('PlanService', () => {
  let projectPath, homeDir, db, svc

  beforeEach(async () => {
    projectPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'plan-proj-'))
    homeDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'plan-home-'))
    await fsp.mkdir(path.join(homeDir, '.claude', 'plans'), { recursive: true })
    await fsp.writeFile(path.join(homeDir, '.claude', 'plans', 'clever-orbit.md'), PLAN_MD)
    db = fakeDb()
    svc = new PlanService({ projectPath, homeDir, getDatabase: () => db, log: { info() {} } })
  })

  afterEach(async () => {
    await fsp.rm(projectPath, { recursive: true, force: true })
    await fsp.rm(homeDir, { recursive: true, force: true })
  })

  it('helpers: slugify, front matter, title', () => {
    assert.equal(slugify('Add subtract to math.js!'), 'add-subtract-to-math-js')
    assert.equal(slugify(''), 'plan')
    const fm = splitFrontMatter('---\npuffin_plan_id: abc\ntitle: "T"\n---\n# Body\n')
    assert.deepEqual(fm.frontMatter, { puffin_plan_id: 'abc', title: 'T' })
    assert.equal(fm.body, '# Body\n')
    assert.equal(titleOf(PLAN_MD), 'Add subtract to math.js')
    assert.equal(titleOf('just a line\nmore'), 'just a line')
    assert.ok(withFrontMatter({ a: 1, b: '' }, 'x').startsWith('---\na: 1\n---\n\nx'))
  })

  it('lists importable plan files from home and project, newest first', async () => {
    await fsp.mkdir(path.join(projectPath, 'docs', 'plans'), { recursive: true })
    await fsp.writeFile(path.join(projectPath, 'docs', 'plans', 'old.md'), '---\npuffin_plan_id: p1\n---\n# Old plan\n')
    const files = await svc.listPlanFiles()
    assert.equal(files.home.length, 1)
    assert.equal(files.home[0].title, 'Add subtract to math.js')
    assert.equal(files.home[0].source, 'home')
    assert.equal(files.project.length, 1)
    assert.equal(files.project[0].planId, 'p1')
  })

  it('reads plan files only from the allowed directories', async () => {
    const ok = await svc.readPlanFile(path.join(homeDir, '.claude', 'plans', 'clever-orbit.md'))
    assert.equal(ok.title, 'Add subtract to math.js')
    await fsp.writeFile(path.join(projectPath, 'secret.md'), 'x')
    await assert.rejects(svc.readPlanFile(path.join(projectPath, 'secret.md')), /outside/)
  })

  it('creates a dated docs/plans file with front matter and one task per step, dependencies resolved', async () => {
    const result = await svc.createPlan({
      title: 'Add subtract to math.js',
      content: PLAN_MD,
      branchId: 'backend',
      sourcePromptId: 'prompt-1',
      sourcePath: path.join(homeDir, '.claude', 'plans', 'clever-orbit.md'),
      steps: [
        { title: 'Add subtract', body: 'in math.js', acceptanceCriteria: ['exports subtract'], dependsOn: [], files: ['math.js'] },
        { title: 'Add tests', body: 'in math.test.js', acceptanceCriteria: ['node --test passes'], dependsOn: [0], skill: null }
      ]
    })
    assert.match(result.filePath, /docs[\\/]plans[\\/]\d{4}-\d{2}-\d{2}-add-subtract-to-math-js\.md$/)
    const saved = fs.readFileSync(result.filePath, 'utf8')
    assert.ok(saved.startsWith('---\n'))
    assert.ok(saved.includes(`puffin_plan_id: ${result.plan.id}`))
    assert.ok(saved.includes('workspace: backend'))
    assert.ok(saved.includes('# Add subtract to math.js'))
    // the home file is untouched (copied, not moved)
    assert.ok(fs.existsSync(path.join(homeDir, '.claude', 'plans', 'clever-orbit.md')))

    assert.equal(result.stories.length, 2)
    const [s1, s2] = result.stories
    assert.equal(s1.planStep, 1)
    assert.equal(s2.planStep, 2)
    assert.deepEqual(s2.dependsOn, [s1.id])
    assert.equal(s1.branchId, 'backend')
    assert.equal(s1.status, 'pending')
    assert.deepEqual(s1.acceptanceCriteria, ['exports subtract'])
    assert.deepEqual(s1.runMeta.files, ['math.js'])
    assert.equal(s1.sourcePromptId, 'prompt-1')
    assert.equal(db.planRows.get(result.plan.id).filePath.replace(/\\/g, '/'), path.relative(projectPath, result.filePath).replace(/\\/g, '/'))

    // a second plan with the same title gets a distinct file
    const again = await svc.createPlan({ title: 'Add subtract to math.js', content: PLAN_MD, steps: [] })
    assert.notEqual(again.filePath, result.filePath)
  })

  it('updates a docs/plans source in place and counts plan progress', async () => {
    const first = await svc.createPlan({ title: 'Plan A', content: '# Plan A\n', branchId: 'ui', steps: [{ title: 'one' }, { title: 'two' }] })
    db.userStories.update(first.stories[0].id, { status: 'completed' })
    const reimported = await svc.createPlan({ title: 'Plan A', content: '---\nold: 1\n---\n# Plan A\nrevised', sourcePath: first.filePath, steps: [] })
    assert.equal(reimported.filePath, first.filePath)
    assert.ok(!fs.readFileSync(first.filePath, 'utf8').includes('old: 1'))

    const plans = await svc.listPlans({ branchId: 'ui' })
    const a = plans.find(p => p.id === first.plan.id)
    assert.equal(a.total, 2)
    assert.equal(a.done, 1)
    assert.deepEqual(a.taskIds, first.stories.map(s => s.id))
  })

  it('re-plan removes pending tasks of the old plan, re-links the rest, archives the old plan', async () => {
    const old = await svc.createPlan({ title: 'Old', content: '# Old\n', steps: [{ title: 'done one' }, { title: 'never started' }] })
    db.userStories.update(old.stories[0].id, { status: 'completed' })
    const next = await svc.createPlan({ title: 'New', content: '# New\n', replacePlanId: old.plan.id, steps: [{ title: 'fresh' }] })
    assert.equal(db.storyRows.has(old.stories[1].id), false)
    assert.equal(db.storyRows.get(old.stories[0].id).planId, next.plan.id)
    assert.equal(db.planRows.get(old.plan.id).status, 'archived')
    assert.ok(fs.readFileSync(next.filePath, 'utf8').includes(`replaces: ${old.plan.id}`))
  })

  it('deletes a plan: pending tasks removed, others unlinked, markdown kept', async () => {
    const p = await svc.createPlan({ title: 'Del', content: '# Del\n', steps: [{ title: 'a' }, { title: 'b' }] })
    db.userStories.update(p.stories[1].id, { status: 'in-progress' })
    const r = await svc.deletePlan(p.plan.id)
    assert.deepEqual(r, { deletedTasks: 1, unlinkedTasks: 1 })
    assert.equal(db.storyRows.get(p.stories[1].id).planId, null)
    assert.equal(db.planRows.has(p.plan.id), false)
    assert.ok(fs.existsSync(p.filePath))
  })

  it('lists project skills, commands and user skills', async () => {
    await fsp.mkdir(path.join(projectPath, '.claude', 'skills', 'deploy'), { recursive: true })
    await fsp.writeFile(path.join(projectPath, '.claude', 'skills', 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Ship it\n---\n# Deploy\n')
    await fsp.mkdir(path.join(projectPath, '.claude', 'commands'), { recursive: true })
    await fsp.writeFile(path.join(projectPath, '.claude', 'commands', 'sync.md'), 'Sync things\n')
    await fsp.mkdir(path.join(homeDir, '.claude', 'skills', 'archlens'), { recursive: true })
    await fsp.writeFile(path.join(homeDir, '.claude', 'skills', 'archlens', 'SKILL.md'), '---\nname: archlens\ndescription: Map architecture\n---\n')
    const skills = await svc.listSkills()
    assert.deepEqual(skills.map(s => `${s.name}:${s.source}`), ['archlens:user', 'deploy:project', 'sync:command'])
    assert.equal(skills[1].description, 'Ship it')
  })

  it('gitHead returns null outside a repository', async () => {
    assert.equal(await svc.gitHead(), null)
  })
})
