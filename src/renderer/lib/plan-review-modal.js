/**
 * plan-review-modal - The Plan Review panel: the plan as written on the left,
 * what the board will get on the right. Rendered by ModalManager for the
 * 'plan-review' and 'plan-import' modal types.
 *
 * modal.data for 'plan-review':
 *   { source: 'session'|'reply'|'import', promptId?, branchId?, path?, content, draft, replacePlanId? }
 *   draft = extractPlan(content) → { title, context, steps[], verification, warnings[] }
 */

import { extractPlan } from './plan-extractor.js'

/**
 * @param {*} text
 * @returns {string}
 */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = text === null || text === undefined ? '' : String(text)
  return div.innerHTML
}

export class PlanReviewModal {
  /**
   * @param {Object} deps
   * @param {Object} deps.intents - SAM intents (hideModal, showModal, …)
   * @param {Function} deps.showToast
   * @param {Function} deps.renderMarkdown - (text) => html
   * @param {Object} deps.actions - `{ approve(draftPayload), revise(feedback, data), importFile(path) }` provided by the app
   */
  constructor({ intents, showToast, renderMarkdown, actions }) {
    this.intents = intents
    this.showToast = showToast
    this.renderMarkdown = renderMarkdown
    this.actions = actions
  }

  // ============ Plan review ============

  /**
   * @param {HTMLElement} title
   * @param {HTMLElement} content
   * @param {HTMLElement} actions
   * @param {Object} data - modal.data
   * @param {Object} state - app state (for workspaces)
   */
  render(title, content, actions, data, state) {
    const draft = data.draft || extractPlan(data.content || '')
    this._draft = JSON.parse(JSON.stringify(draft))
    this._data = data
    const branches = state?.history?.branches || []
    const isImport = data.source === 'import'
    const isReply = data.source === 'reply'

    title.textContent = isImport ? 'Import plan' : 'Plan review'

    content.innerHTML = `
      <div class="plan-review-container">
        <div class="plan-review-left">
          <div class="plan-review-heading">The plan as written${data.path ? ` <span class="plan-review-path" title="${esc(data.path)}">${esc(data.path.split(/[\\/]/).pop())}</span>` : ''}</div>
          <div class="plan-review-markdown markdown-body">${this.renderMarkdown(data.content || '')}</div>
        </div>
        <div class="plan-review-right">
          <div class="plan-review-heading">What the board will get</div>
          ${draft.warnings?.length ? `<div class="plan-review-warning">${draft.warnings.map(esc).join('<br>')}</div>` : ''}
          <label class="plan-review-field">Title
            <input type="text" id="plan-title" class="form-control" value="${esc(draft.title)}">
          </label>
          <label class="plan-review-field">Workspace
            <select id="plan-branch" class="form-control">
              ${branches.map(b => `<option value="${esc(b.id)}" ${b.id === (data.branchId || state?.history?.activeBranch) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
            </select>
          </label>
          <div class="plan-review-steps-head">
            <span>Steps</span>
            <span class="plan-review-summary" id="plan-summary"></span>
          </div>
          <ol class="plan-review-steps" id="plan-steps"></ol>
          <button class="btn outline small" id="plan-add-step" data-help="Add a step the extractor missed.">+ Add step</button>
          ${!isImport ? `
          <div class="plan-review-revise hidden" id="plan-revise">
            <textarea id="plan-revise-text" class="form-control" rows="3" placeholder="What should change in the plan? Claude will revise it in the same conversation."></textarea>
            <div class="plan-review-revise-actions">
              <button class="btn small outline" id="plan-revise-cancel">Cancel</button>
              <button class="btn small primary" id="plan-revise-send">Send feedback</button>
            </div>
          </div>` : ''}
        </div>
      </div>`

    actions.innerHTML = `
      <button class="btn secondary" id="plan-discard-btn" data-help="Close without saving anything. Nothing is written and no task is created.">${isImport ? 'Close' : 'Discard'}</button>
      ${!isImport && !isReply ? `<button class="btn outline" id="plan-revise-btn" data-help="Send feedback back into the planning conversation; the plan is rewritten and reopens here.">Revise…</button>` : ''}
      ${data.path ? `<button class="btn outline" id="plan-open-btn" data-help="Open the plan markdown in the Editor tab.">Open in Editor</button>` : ''}
      <button class="btn outline" id="plan-approve-only-btn" data-help="Save the plan under docs/plans without creating tasks.">${isImport ? 'Save only' : 'Approve only'}</button>
      <button class="btn primary" id="plan-approve-btn" data-help="Save the plan under docs/plans and create one task per included step on the Backlog.">${isImport ? 'Send to board' : 'Approve & send to board'}</button>`

    this._stepsEl = content.querySelector('#plan-steps')
    this._summaryEl = content.querySelector('#plan-summary')
    this._renderSteps()

    content.querySelector('#plan-add-step').addEventListener('click', () => {
      this._syncFromDom()
      this._draft.steps.push({ title: 'New step', body: '', acceptanceCriteria: [], dependsOn: [], skill: null, files: [], include: true })
      this._renderSteps()
    })
    this._stepsEl.addEventListener('click', (e) => this._onStepAction(e))
    this._stepsEl.addEventListener('input', () => this._updateSummary())
    this._stepsEl.addEventListener('change', () => this._updateSummary())

    actions.querySelector('#plan-discard-btn').addEventListener('click', () => this.intents.hideModal())
    actions.querySelector('#plan-approve-btn').addEventListener('click', () => this._approve({ createTasks: true }))
    actions.querySelector('#plan-approve-only-btn').addEventListener('click', () => this._approve({ createTasks: false }))
    actions.querySelector('#plan-open-btn')?.addEventListener('click', () => this.actions.openInEditor?.(data.path))
    actions.querySelector('#plan-revise-btn')?.addEventListener('click', () => {
      content.querySelector('#plan-revise')?.classList.toggle('hidden')
      content.querySelector('#plan-revise-text')?.focus()
    })
    content.querySelector('#plan-revise-cancel')?.addEventListener('click', () => content.querySelector('#plan-revise')?.classList.add('hidden'))
    content.querySelector('#plan-revise-send')?.addEventListener('click', () => {
      const feedback = content.querySelector('#plan-revise-text')?.value.trim()
      if (!feedback) return
      this.intents.hideModal()
      this.actions.revise?.(feedback, data)
    })
  }

  _renderSteps() {
    const steps = this._draft.steps
    this._stepsEl.innerHTML = steps.map((s, i) => `
      <li class="plan-step ${s.include === false ? 'excluded' : ''}" data-index="${i}">
        <div class="plan-step-head">
          <input type="checkbox" class="plan-step-include" ${s.include === false ? '' : 'checked'} title="Include this step as a task">
          <span class="plan-step-num">${i + 1}</span>
          <input type="text" class="plan-step-title form-control" value="${esc(s.title)}">
          <span class="plan-step-tools">
            <button type="button" class="plan-step-btn" data-action="up" title="Move up">↑</button>
            <button type="button" class="plan-step-btn" data-action="down" title="Move down">↓</button>
            <button type="button" class="plan-step-btn" data-action="toggle" title="Show details">▾</button>
          </span>
        </div>
        <div class="plan-step-details hidden">
          ${s.skill ? `<div class="plan-step-skill">Skill: <code>${esc(s.skill)}</code></div>` : ''}
          <label>What to do<textarea class="plan-step-body form-control" rows="4">${esc(s.body)}</textarea></label>
          <label>Done when (one per line)<textarea class="plan-step-criteria form-control" rows="3">${esc((s.acceptanceCriteria || []).join('\n'))}</textarea></label>
          <label>Depends on
            <select class="plan-step-deps form-control" multiple size="${Math.min(4, Math.max(1, i))}" ${i === 0 ? 'disabled' : ''}>
              ${steps.slice(0, i).map((d, j) => `<option value="${j}" ${(s.dependsOn || []).includes(j) ? 'selected' : ''}>${j + 1}. ${esc(d.title)}</option>`).join('')}
            </select>
          </label>
          ${(s.files || []).length ? `<div class="plan-step-files">Files: ${s.files.map(f => `<code>${esc(f)}</code>`).join(' ')}</div>` : ''}
        </div>
      </li>`).join('')
    this._updateSummary()
  }

  _onStepAction(e) {
    const btn = e.target.closest('.plan-step-btn')
    if (!btn) return
    const li = btn.closest('.plan-step')
    const i = parseInt(li.dataset.index, 10)
    if (btn.dataset.action === 'toggle') {
      li.querySelector('.plan-step-details').classList.toggle('hidden')
      return
    }
    this._syncFromDom()
    const j = btn.dataset.action === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= this._draft.steps.length) return
    const steps = this._draft.steps
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    // Re-map dependency indices after the swap and drop forward references
    for (let k = 0; k < steps.length; k++) {
      steps[k].dependsOn = (steps[k].dependsOn || []).map(d => (d === i ? j : d === j ? i : d)).filter(d => d < k)
    }
    this._renderSteps()
  }

  /** Read the editable fields back into the draft. */
  _syncFromDom() {
    const items = [...this._stepsEl.querySelectorAll('.plan-step')]
    items.forEach((li, i) => {
      const s = this._draft.steps[i]
      if (!s) return
      s.include = li.querySelector('.plan-step-include').checked
      s.title = li.querySelector('.plan-step-title').value.trim() || s.title
      s.body = li.querySelector('.plan-step-body').value
      s.acceptanceCriteria = li.querySelector('.plan-step-criteria').value.split('\n').map(x => x.trim()).filter(Boolean)
      s.dependsOn = [...li.querySelector('.plan-step-deps').selectedOptions].map(o => parseInt(o.value, 10))
    })
  }

  _updateSummary() {
    const total = this._stepsEl.querySelectorAll('.plan-step').length
    const included = this._stepsEl.querySelectorAll('.plan-step-include:checked').length
    const branch = document.getElementById('plan-branch')
    const name = branch?.selectedOptions?.[0]?.textContent || ''
    this._summaryEl.textContent = `${included} of ${total} step${total === 1 ? '' : 's'} → tasks in ${name}${total - included ? ` · ${total - included} excluded` : ''}`
    this._stepsEl.querySelectorAll('.plan-step').forEach(li => li.classList.toggle('excluded', !li.querySelector('.plan-step-include').checked))
  }

  async _approve({ createTasks }) {
    this._syncFromDom()
    const title = document.getElementById('plan-title')?.value.trim() || this._draft.title
    const branchId = document.getElementById('plan-branch')?.value || this._data.branchId || null
    // Included steps only; dependency indices re-mapped to the included list
    const included = this._draft.steps.map((s, i) => ({ ...s, originalIndex: i })).filter(s => s.include !== false)
    const indexMap = new Map(included.map((s, i) => [s.originalIndex, i]))
    const steps = createTasks ? included.map(s => ({
      title: s.title,
      body: s.body,
      acceptanceCriteria: s.acceptanceCriteria,
      dependsOn: (s.dependsOn || []).map(d => indexMap.get(d)).filter(d => Number.isInteger(d)),
      skill: s.skill || null,
      files: s.files || []
    })) : []
    const payload = {
      title,
      content: this._data.content,
      branchId,
      sourcePromptId: this._data.promptId || null,
      sourcePath: this._data.path || null,
      replacePlanId: this._data.replacePlanId || null,
      steps
    }
    const approveBtn = document.getElementById('plan-approve-btn')
    if (approveBtn) approveBtn.disabled = true
    try {
      await this.actions.approve(payload, { createTasks })
    } catch (error) {
      this.showToast?.({ type: 'error', title: 'Plan not saved', message: error.message })
      if (approveBtn) approveBtn.disabled = false
    }
  }

  // ============ Import chooser ============

  /**
   * @param {HTMLElement} title
   * @param {HTMLElement} content
   * @param {HTMLElement} actions
   * @param {Object} data - `{ files: { home: [], project: [] } }`
   */
  renderImport(title, content, actions, data) {
    title.textContent = 'Import a plan'
    const list = (items, label) => `
      <div class="plan-import-group">
        <div class="plan-review-heading">${label}</div>
        ${items.length ? `<ul class="plan-import-list">${items.map(f => `
          <li><button type="button" class="plan-import-item" data-path="${esc(f.path)}">
            <span class="plan-import-title">${esc(f.title)}</span>
            <span class="plan-import-meta">${esc(f.name)} · ${new Date(f.mtime).toLocaleString()}${f.planId ? ' · already on the board' : ''}</span>
          </button></li>`).join('')}</ul>` : '<p class="arch-muted plan-import-empty">None found.</p>'}
      </div>`
    content.innerHTML = `
      <div class="plan-import">
        ${list(data.files?.home || [], 'Written by Claude Code (~/.claude/plans)')}
        ${list(data.files?.project || [], 'In this project (docs/plans)')}
      </div>`
    actions.innerHTML = `<button class="btn secondary" id="plan-import-close">Close</button>`
    actions.querySelector('#plan-import-close').addEventListener('click', () => this.intents.hideModal())
    content.querySelectorAll('.plan-import-item').forEach(btn => {
      btn.addEventListener('click', () => this.actions.importFile?.(btn.dataset.path))
    })
  }
}
