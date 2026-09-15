/**
 * task-runner tests — the card's implementation path and the plan queue over it,
 * driven with a fake state, fake intents and a fake prompt editor.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { TaskRunner, MAX_FIX_ROUNDS } from '../../src/renderer/lib/task-runner.js'
import { REVIEW_PASS_MARKER, REVIEW_ISSUES_MARKER, implementationPrompt, reviewPrompt, planningSuffix, reviewOutcome, replanPrompt } from '../../src/renderer/lib/task-prompts.js'

/** A tiny SAM stand-in: intents mutate a state object the runner reads back. */
function harness({ tasks, plans = [], running = false }) {
  const state = {
    userStories: tasks.map(t => ({ status: 'pending', runState: 'idle', runMeta: {}, dependsOn: [], acceptanceCriteria: [], ...t })),
    plans,
    taskRun: null,
    planRun: null,
    history: { activeBranch: 'ws', raw: { activeBranch: 'ws', branches: { ws: { prompts: [] } } } }
  }
  const submitted = []
  const builtIn = []
  const toasts = []
  const intents = {
    updateUserStory: (id, u) => { const i = state.userStories.findIndex(s => s.id === id); state.userStories[i] = { ...state.userStories[i], ...u } },
    setTaskRun: (run) => { state.taskRun = run },
    clearTaskRun: () => { state.taskRun = null },
    setPlanRun: (pr) => { state.planRun = pr },
    selectBranch: (id) => { state.history.activeBranch = id; state.history.raw.activeBranch = id; state.history.raw.branches[id] ||= { prompts: [] } },
    selectPrompt: () => {},
    switchView: () => {}
  }
  const editor = {
    submitExternal: async (text, opts) => {
      submitted.push({ text, opts })
      const branch = state.history.raw.branches[state.history.raw.activeBranch]
      branch.prompts.push({ id: `prompt-${submitted.length}`, content: text, title: opts.title })
      return true
    },
    _submitBuiltInPrompt: async (text, opts) => { builtIn.push({ text, opts }) }
  }
  const runner = new TaskRunner({
    intents,
    getState: () => state,
    getPromptEditor: () => editor,
    showToast: (t) => toasts.push(t),
    planApi: { gitHead: async () => 'abc123' },
    isSessionRunning: async () => running
  })
  return { state, runner, submitted, builtIn, toasts, task: (id) => state.userStories.find(s => s.id === id) }
}

describe('TaskRunner', () => {
  let h
  beforeEach(() => {
    h = harness({
      plans: [{ id: 'p1', title: 'Plan P', context: 'Why.', total: 2, done: 0 }],
      tasks: [
        { id: 't1', title: 'First', description: 'do first', acceptanceCriteria: ['a works'], planId: 'p1', planStep: 1, branchId: 'backend' },
        { id: 't2', title: 'Second', description: 'do second', planId: 'p1', planStep: 2, dependsOn: ['t1'], branchId: 'backend' }
      ]
    })
  })

  it('refuses blocked tasks and explains why', async () => {
    assert.equal(h.runner.blockReason(h.task('t2')), 'Waiting on: First')
    assert.equal(await h.runner.implement('t2'), false)
    assert.match(h.toasts[0].message, /Waiting on/)
  })

  it('implements a task: Doing/running, new titled thread in the task workspace, prompt carries plan context', async () => {
    assert.equal(await h.runner.implement('t1'), true)
    const t = h.task('t1')
    assert.equal(t.status, 'in-progress')
    assert.equal(t.runState, 'running')
    assert.equal(t.runMeta.headBefore, 'abc123')
    assert.equal(t.threadId, 'prompt-1')
    assert.equal(h.state.history.activeBranch, 'backend')
    assert.deepEqual(h.state.taskRun && { storyId: h.state.taskRun.storyId, phase: h.state.taskRun.phase }, { storyId: 't1', phase: 'implement' })
    const { text, opts } = h.submitted[0]
    assert.equal(opts.newThread, true)
    assert.equal(opts.title, 'First')
    assert.equal(opts.mode, 'build')
    assert.match(text, /^# Task 1 of 2 from plan "Plan P": First/)
    assert.match(text, /- a works/)
    assert.match(text, /▶ 1\. First/)
    assert.match(text, /· 2\. Second/)
    assert.match(text, /Implement only this task/)
    assert.equal(h.runner.blockReason(h.task('t2')), 'A task is already running: First')
  })

  it('reviews after the session, then completes on PASS and advances the plan run', async () => {
    await h.runner.runPlan('p1')
    assert.equal(h.state.planRun.current, 't1')
    // implement session ends → review is submitted in the same thread
    await h.runner.onSessionComplete({ content: 'done', sessionId: 's1' }, [{ path: '/x/a.js', action: 'write' }])
    assert.equal(h.task('t1').runState, 'reviewing')
    assert.equal(h.state.taskRun.phase, 'review')
    assert.equal(h.builtIn.length, 1)
    assert.match(h.builtIn[0].text, /Review the changes made for task 1 "First"/)
    assert.match(h.builtIn[0].text, /- a works/)
    // review passes → Done, plan run moves to t2 (now unblocked)
    await h.runner.onSessionComplete({ content: `all good\n${REVIEW_PASS_MARKER}`, sessionId: 's2' }, [])
    const t1 = h.task('t1')
    assert.equal(t1.status, 'completed')
    assert.equal(t1.runState, 'reviewed')
    assert.deepEqual(t1.runMeta.filesModified, ['/x/a.js'])
    assert.deepEqual(t1.runMeta.sessionIds, ['s1', 's2'])
    assert.equal(t1.runMeta.headAfter, 'abc123')
    assert.equal(h.state.planRun.current, 't2')
    assert.equal(h.task('t2').runState, 'running')
    assert.equal(h.submitted.length, 2)
    assert.match(h.submitted[1].text, /✓ 1\. First \(touched: \/x\/a\.js\)/)
  })

  it('marks needs-fix on ISSUES, fix re-reviews, and two rounds end in needs-human', async () => {
    await h.runner.implement('t1')
    await h.runner.onSessionComplete({ content: 'x' }, [])
    await h.runner.onSessionComplete({ content: `bad\n${REVIEW_ISSUES_MARKER}` }, [])
    assert.equal(h.task('t1').runState, 'needs-fix')
    assert.equal(h.state.taskRun, null)
    assert.match(h.task('t1').runMeta.reviewExcerpt, /bad/)

    await h.runner.fix('t1')
    assert.equal(h.task('t1').runState, 'fixing')
    assert.equal(h.state.taskRun.fixRounds, 1)
    assert.match(h.builtIn.at(-1).text, /fix round 1/)
    await h.runner.onSessionComplete({ content: 'fixed' }, [])           // fix session → review
    assert.equal(h.state.taskRun.phase, 'review')
    await h.runner.onSessionComplete({ content: REVIEW_ISSUES_MARKER }, []) // still issues → needs-fix (round 1 < 2)
    assert.equal(h.task('t1').runState, 'needs-fix')

    await h.runner.fix('t1')
    assert.equal(h.state.taskRun.fixRounds, MAX_FIX_ROUNDS)
    await h.runner.onSessionComplete({ content: 'fixed again' }, [])
    await h.runner.onSessionComplete({ content: REVIEW_ISSUES_MARKER }, [])
    assert.equal(h.task('t1').runState, 'needs-human')

    await h.runner.markDoneAnyway('t1')
    assert.equal(h.task('t1').status, 'completed')
    assert.equal(h.task('t1').runMeta.acceptedWithIssues, true)
  })

  it('records failures and cancellations, stops a plan run, and retries with the error', async () => {
    await h.runner.runPlan('p1')
    h.runner.onSessionError('boom')
    assert.equal(h.task('t1').runState, 'failed')
    assert.equal(h.task('t1').runMeta.lastError, 'boom')
    assert.equal(h.state.planRun.stopped, true)
    assert.match(h.state.planRun.reason, /First: Session error/)

    await h.runner.retry('t1')
    assert.equal(h.task('t1').runState, 'running')
    assert.match(h.submitted.at(-1).text, /Previous attempt[\s\S]*boom/)
    await h.runner.onSessionComplete({ content: '', cancelled: true }, [])
    assert.equal(h.task('t1').runState, 'cancelled')
  })

  it('refuses to start while a Claude session is running, and reopen resets a task', async () => {
    const busy = harness({ tasks: [{ id: 'x', title: 'X' }], running: true })
    assert.equal(await busy.runner.implement('x'), false)
    assert.match(busy.toasts[0].message, /already running/)
    h.state.userStories[0].status = 'completed'
    h.runner.reopen('t1')
    assert.equal(h.task('t1').status, 'pending')
    assert.equal(h.task('t1').runState, 'idle')
  })
})

describe('task-prompts', () => {
  it('planning suffix lists skills and forbids subagents', () => {
    const s = planningSuffix([{ name: 'archlens', description: 'Map architecture' }])
    assert.match(s, /\/archlens — Map architecture/)
    assert.match(s, /do not launch subagents/)
    assert.match(planningSuffix([]), /none found/)
  })

  it('skill steps are launched as the skill line', () => {
    const p = implementationPrompt({ task: { id: 'a', title: 'Map it', skill: '/archlens how?', planStep: 3, acceptanceCriteria: ['diagram exists'] }, plan: { title: 'P' }, siblings: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
    assert.ok(p.startsWith('/archlens how?'))
    assert.match(p, /Task 3 of 3 from plan "P": Map it\. Done when: diagram exists\./)
  })

  it('review outcome parsing and replan prompt', () => {
    assert.equal(reviewOutcome(`ok ${REVIEW_PASS_MARKER}`), 'pass')
    assert.equal(reviewOutcome(`${REVIEW_PASS_MARKER} but ${REVIEW_ISSUES_MARKER}`), 'issues')
    assert.equal(reviewOutcome('nothing'), 'unknown')
    assert.match(reviewPrompt({ title: 'T' }), /no explicit criteria/)
    const r = replanPrompt({ planFile: 'docs/plans/x.md', tasks: [{ title: 'done', status: 'completed' }, { title: 'open', status: 'pending' }] })
    assert.match(r, /- ✓ done/)
    assert.match(r, /- · open/)
  })
})
