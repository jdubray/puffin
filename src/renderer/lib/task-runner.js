/**
 * task-runner - The one implementation path for a task on the board.
 *
 *   implement(task) → new thread in the task's workspace → session ends →
 *   review pass → PASS: Done · ISSUES: needs-fix (Fix → review again, 2 rounds) ·
 *   error/cancel: failed
 *
 * `runPlan(planId)` is a queue over this path: one task at a time, in
 * plan_step order, stopping at the first task that does not reach Done.
 * See docs/PLAN_TO_BOARD_SPEC.md §4.5–§4.6 and §8.
 */

import { implementationPrompt, reviewPrompt, fixPrompt, reviewOutcome, reviewExcerpt } from './task-prompts.js'

export const MAX_FIX_ROUNDS = 2

export class TaskRunner {
  /**
   * @param {Object} deps
   * @param {Object} deps.intents - SAM intents (updateUserStory, setTaskRun, clearTaskRun, setPlanRun, selectPrompt, switchView)
   * @param {Function} deps.getState - () => app state
   * @param {Function} deps.getPromptEditor - () => PromptEditorComponent
   * @param {Function} deps.showToast
   * @param {Object} [deps.planApi] - window.puffin.plan (gitHead)
   * @param {Function} [deps.isSessionRunning] - async () => boolean
   * @param {Object} [deps.options]
   * @param {boolean} [deps.options.autoReview=true] - Review each task after its session
   * @param {boolean} [deps.options.autoFix=false] - Fix review issues without asking (bounded by MAX_FIX_ROUNDS)
   */
  constructor({ intents, getState, getPromptEditor, showToast, planApi, isSessionRunning, options = {} }) {
    this.intents = intents
    this.getState = getState
    this.getPromptEditor = getPromptEditor
    this.showToast = showToast || (() => {})
    this.planApi = planApi || null
    this.isSessionRunning = isSessionRunning || (async () => false)
    this.autoReview = options.autoReview !== false
    this.autoFix = options.autoFix === true
  }

  /**
   * SAM applies intents on the next tick; await this before reading state you just changed.
   * @returns {Promise<void>}
   */
  _settle() {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  // ============ Queries ============

  /** @returns {Object|null} */
  get run() {
    return this.getState()?.taskRun || null
  }

  /** @returns {boolean} A task session is in flight (implement, review or fix) */
  isActive() {
    return !!this.run
  }

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  task(id) {
    return (this.getState()?.userStories || []).find(s => s.id === id) || null
  }

  /**
   * Tasks of a plan in step order.
   * @param {string} planId
   * @returns {Object[]}
   */
  planTasks(planId) {
    return (this.getState()?.userStories || [])
      .filter(s => s.planId === planId)
      .sort((a, b) => (a.planStep || 0) - (b.planStep || 0))
  }

  /**
   * Why a task cannot be implemented right now, or null.
   * @param {Object} task
   * @returns {string|null}
   */
  blockReason(task) {
    if (!task) return 'Task not found'
    if (this.isActive()) {
      const current = this.task(this.run.storyId)
      return `A task is already running: ${current?.title || this.run.storyId}`
    }
    if (task.status === 'completed') return 'Already done'
    if (task.status === 'in-progress' && !['failed', 'cancelled', 'needs-fix', 'needs-human', 'idle'].includes(task.runState || 'idle')) return `Task is ${task.runState}`
    const blockers = this.unmetDependencies(task)
    if (blockers.length) return `Waiting on: ${blockers.map(b => b.title).join(', ')}`
    return null
  }

  /**
   * @param {Object} task
   * @returns {Object[]} Dependencies that are not Done
   */
  unmetDependencies(task) {
    return (task?.dependsOn || []).map(id => this.task(id)).filter(d => d && d.status !== 'completed')
  }

  // ============ Actions ============

  /**
   * Implement one task: move it to Doing, start a new thread with the task prompt.
   * @param {string} storyId
   * @param {Object} [options]
   * @param {boolean} [options.retry] - Include the previous error in the prompt
   * @returns {Promise<boolean>}
   */
  async implement(storyId, { retry = false } = {}) {
    const task = this.task(storyId)
    const reason = this.blockReason(task)
    if (reason) {
      this.showToast({ type: 'warning', title: 'Cannot implement', message: reason })
      return false
    }
    if (await this.isSessionRunning()) {
      this.showToast({ type: 'warning', title: 'Cannot implement', message: 'A Claude session is already running.' })
      return false
    }
    const editor = this.getPromptEditor()
    if (!editor?.submitExternal) {
      this.showToast({ type: 'error', title: 'Cannot implement', message: 'Prompt editor not available.' })
      return false
    }

    const state = this.getState()
    const plan = task.planId ? (state.plans || []).find(p => p.id === task.planId) : null
    const siblings = task.planId ? this.planTasks(task.planId) : []
    const planContext = plan ? { title: plan.title, context: plan.context || '' } : null
    const previousError = retry ? task.runMeta?.lastError || '' : ''
    const prompt = implementationPrompt({ task, plan: planContext, siblings, previousError })

    let headBefore = null
    try { headBefore = await this.planApi?.gitHead?.() } catch { /* not a repo */ }

    // The task's workspace becomes the active one so the thread lands there
    if (task.branchId && state.history?.activeBranch !== task.branchId) {
      this.intents.selectBranch(task.branchId)
    }

    const runMeta = { ...(task.runMeta || {}), headBefore, startedAt: new Date().toISOString(), lastError: null, fixRounds: retry ? 0 : (task.runMeta?.fixRounds || 0) }
    this.intents.updateUserStory(task.id, { status: 'in-progress', runState: 'running', runMeta })
    this.intents.setTaskRun({ storyId: task.id, phase: 'implement', fixRounds: 0, headBefore, startedAt: Date.now() })

    const ok = await editor.submitExternal(prompt, { newThread: true, title: task.title, mode: 'build' })
    if (!ok) {
      this.intents.updateUserStory(task.id, { runState: 'failed', runMeta: { ...runMeta, lastError: 'Could not start the session' } })
      this.intents.clearTaskRun()
      this.showToast({ type: 'error', title: 'Cannot implement', message: 'The prompt could not be submitted.' })
      return false
    }
    // The prompt just pushed is the thread that implements this task
    await this._settle()
    const raw = this.getState()?.history?.raw
    const prompts = raw?.branches?.[raw?.activeBranch]?.prompts || []
    const threadId = prompts[prompts.length - 1]?.id || null
    if (threadId) this.intents.updateUserStory(task.id, { threadId })
    this.intents.switchView('prompt')
    return true
  }

  /**
   * Called by the app when any Claude session completes while a task run is active.
   * @param {Object} response - `{ content, cancelled?, turns, sessionId, exitCode }`
   * @param {Object[]} filesModified
   */
  async onSessionComplete(response, filesModified = []) {
    const run = this.run
    if (!run) return
    const task = this.task(run.storyId)
    if (!task) { this.intents.clearTaskRun(); return }

    const files = (filesModified || []).filter(f => f.action === 'write' || f.action === 'edit').map(f => f.path)
    const runMeta = { ...(task.runMeta || {}) }
    runMeta.sessionIds = [...(runMeta.sessionIds || []), response?.sessionId].filter(Boolean)
    if (files.length) runMeta.filesModified = [...new Set([...(runMeta.filesModified || []), ...files])]

    if (response?.cancelled) {
      this._finish(task, { runState: 'cancelled', runMeta: { ...runMeta, lastError: 'Cancelled' } }, 'Cancelled')
      return
    }

    if (run.phase === 'implement' || run.phase === 'fix') {
      if (!this.autoReview) {
        await this._complete(task, runMeta)
        return
      }
      // Review in the same thread
      const editor = this.getPromptEditor()
      this.intents.updateUserStory(task.id, { runState: 'reviewing', runMeta })
      this.intents.setTaskRun({ ...run, phase: 'review' })
      await this._settle()
      try {
        if (!(await this._waitForIdle())) throw new Error('the previous session is still running')
        await editor._submitBuiltInPrompt(reviewPrompt(task), { maxTurns: 20 })
      } catch (error) {
        this._finish(task, { runState: 'failed', runMeta: { ...runMeta, lastError: `Review could not start: ${error.message}` } }, 'Review failed to start')
      }
      return
    }

    if (run.phase === 'review') {
      const outcome = reviewOutcome(response?.content)
      const excerpt = reviewExcerpt(response?.content)
      if (outcome === 'pass') {
        await this._complete(task, { ...runMeta, reviewExcerpt: excerpt })
        return
      }
      const rounds = run.fixRounds || 0
      if (outcome === 'issues' && rounds < MAX_FIX_ROUNDS && this.autoFix) {
        await this.fix(task.id, { runMeta: { ...runMeta, reviewExcerpt: excerpt } })
        return
      }
      const state = outcome === 'issues' ? (rounds >= MAX_FIX_ROUNDS ? 'needs-human' : 'needs-fix') : 'needs-fix'
      this._finish(task, { runState: state, runMeta: { ...runMeta, reviewExcerpt: excerpt, fixRounds: rounds } },
        state === 'needs-human' ? 'Review still finds issues after two fix rounds' : (outcome === 'unknown' ? 'Review ended without a verdict' : 'Review found issues'))
    }
  }

  /**
   * A session ended in error while a task run was active.
   * @param {string} message
   */
  onSessionError(message) {
    const run = this.run
    if (!run) return
    const task = this.task(run.storyId)
    if (!task) { this.intents.clearTaskRun(); return }
    this._finish(task, { runState: 'failed', runMeta: { ...(task.runMeta || {}), lastError: String(message || 'Session error') } }, 'Session error')
  }

  /**
   * Fix the issues a review listed, in the task's thread.
   * @param {string} storyId
   * @param {Object} [opts]
   * @returns {Promise<boolean>}
   */
  async fix(storyId, { runMeta } = {}) {
    const task = this.task(storyId)
    if (!task) return false
    if (this.isActive() && this.run.storyId !== storyId) {
      this.showToast({ type: 'warning', title: 'Cannot fix', message: 'Another task is running.' })
      return false
    }
    if (!this.isActive() && await this.isSessionRunning()) {
      this.showToast({ type: 'warning', title: 'Cannot fix', message: 'A Claude session is already running.' })
      return false
    }
    const rounds = (this.run?.fixRounds ?? task.runMeta?.fixRounds ?? 0) + 1
    const meta = { ...(runMeta || task.runMeta || {}), fixRounds: rounds }
    if (task.threadId) this.intents.selectPrompt(task.threadId)
    this.intents.updateUserStory(task.id, { status: 'in-progress', runState: 'fixing', runMeta: meta })
    this.intents.setTaskRun({ storyId: task.id, phase: 'fix', fixRounds: rounds, headBefore: task.runMeta?.headBefore || null, startedAt: Date.now() })
    await this._settle()
    const editor = this.getPromptEditor()
    try {
      if (!(await this._waitForIdle())) throw new Error('the previous session is still running')
      await editor._submitBuiltInPrompt(fixPrompt(task, rounds), { maxTurns: 40 })
    } catch (error) {
      this._finish(task, { runState: 'failed', runMeta: { ...meta, lastError: `Fix could not start: ${error.message}` } }, 'Fix failed to start')
      return false
    }
    this.intents.switchView('prompt')
    return true
  }

  /** Re-run a failed or cancelled task with the previous error in the prompt. */
  retry(storyId) {
    return this.implement(storyId, { retry: true })
  }

  /** Accept a task despite review issues. */
  async markDoneAnyway(storyId) {
    const task = this.task(storyId)
    if (!task) return
    await this._complete(task, { ...(task.runMeta || {}), acceptedWithIssues: true })
  }

  /** Put a Done task back on the board. */
  reopen(storyId) {
    const task = this.task(storyId)
    if (!task) return
    this.intents.updateUserStory(task.id, { status: 'pending', runState: 'idle', runMeta: { ...(task.runMeta || {}), reopenedAt: new Date().toISOString() } })
  }

  // ============ Plan runs ============

  /**
   * Implement every remaining task of a plan, in order, one session at a time.
   * @param {string} planId
   * @returns {Promise<boolean>}
   */
  async runPlan(planId) {
    if (this.isActive()) {
      this.showToast({ type: 'warning', title: 'Cannot run plan', message: 'A task is already running.' })
      return false
    }
    const queue = this.planTasks(planId).filter(t => t.status !== 'completed').map(t => t.id)
    if (!queue.length) {
      this.showToast({ type: 'info', title: 'Plan', message: 'Every task of this plan is done.' })
      return false
    }
    const planRun = { planId, queue, current: null, stopped: false, reason: null, startedAt: Date.now() }
    this.intents.setPlanRun(planRun)
    await this._settle()
    return this._planRunNext(planRun)
  }

  /** Continue a plan run that stopped. */
  continuePlan(planId) {
    return this.runPlan(planId)
  }

  /** Let the current task finish, then stop. */
  stopPlan() {
    const pr = this.getState()?.planRun
    if (!pr) return
    this.intents.setPlanRun({ ...pr, stopped: true, reason: 'Stopped by user' })
    if (!this.isActive()) this.intents.setPlanRun(null)
  }

  async _planRunNext(planRun = null) {
    const pr = planRun || this.getState()?.planRun
    if (!pr || pr.stopped) { if (pr?.stopped && !this.isActive()) this.intents.setPlanRun(null); return false }
    const next = pr.queue.map(id => this.task(id)).find(t => t && t.status !== 'completed')
    if (!next) {
      this.intents.setPlanRun(null)
      this.showToast({ type: 'success', title: 'Plan complete', message: 'Every task reached Done.' })
      return false
    }
    const reason = this.blockReason(next)
    if (reason) {
      this.intents.setPlanRun({ ...pr, current: next.id, stopped: true, reason })
      this.showToast({ type: 'warning', title: 'Plan run stopped', message: `${next.title}: ${reason}` })
      return false
    }
    this.intents.setPlanRun({ ...pr, current: next.id })
    await this._settle()
    const started = await this.implement(next.id)
    if (!started) this.intents.setPlanRun({ ...pr, current: next.id, stopped: true, reason: 'Could not start the task' })
    return started
  }

  // ============ Internals ============

  /**
   * The completion event can fire before the CLI process has fully closed;
   * wait (briefly) for the single-process guard to clear before chaining a session.
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>} true when idle
   */
  async _waitForIdle(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!(await this.isSessionRunning())) return true
      await new Promise(r => setTimeout(r, 250))
    }
    return false
  }

  async _complete(task, runMeta) {
    let headAfter = null
    try { headAfter = await this.planApi?.gitHead?.() } catch { /* ignore */ }
    this.intents.updateUserStory(task.id, {
      status: 'completed',
      runState: 'reviewed',
      runMeta: { ...runMeta, headAfter, finishedAt: new Date().toISOString(), lastError: null }
    })
    this.intents.clearTaskRun()
    this.showToast({ type: 'success', title: 'Task done', message: task.title })
    await this._settle()
    await this._waitForIdle()
    await this._planRunNext()
  }

  _finish(task, updates, reason) {
    this.intents.updateUserStory(task.id, { ...updates, runMeta: { ...(updates.runMeta || {}), finishedAt: new Date().toISOString() } })
    this.intents.clearTaskRun()
    const pr = this.getState()?.planRun
    if (pr) this.intents.setPlanRun({ ...pr, stopped: true, reason: `${task.title}: ${reason}` })
    this.showToast({ type: updates.runState === 'needs-fix' ? 'warning' : 'error', title: task.title, message: reason })
  }
}
