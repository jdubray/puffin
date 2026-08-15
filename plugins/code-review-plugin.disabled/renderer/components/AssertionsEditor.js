import { AiGenerator } from './AiGenerator.js'

const ASSERTION_TYPES = ['file_exists', 'export_exists', 'function_signature', 'file_contains', 'pattern_match']

export class AssertionsEditor {
  constructor(container, pluginContext, { story, onSaved }) {
    this._container = container
    this._story = story
    this._assertions = (story.assertions || []).map(a => ({ ...a }))
    this._generator = new AiGenerator(pluginContext)
    this._onSaved = onSaved || (() => {})
    this._dirty = false
    this._destroyed = false
  }

  init() {
    this._render()
  }

  _render() {
    const rows = this._assertions.map((a, i) => `
      <tr class="cr-assertion-row" data-idx="${i}">
        <td>
          <select class="cr-sel-type">
            ${ASSERTION_TYPES.map(t => `<option ${a.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </td>
        <td><input class="cr-input cr-assert-target" value="${this._esc(a.target)}" placeholder="src/main/foo.js"></td>
        <td><input class="cr-input cr-assert-detail" value="${this._esc(a.detail)}" placeholder="Description"></td>
        <td><button class="cr-btn cr-del-assert" data-idx="${i}" title="Delete">✕</button></td>
      </tr>
    `).join('')

    this._container.innerHTML = `
      <div class="cr-editor">
        <h3>Assertions — ${this._esc(this._story.title)}</h3>
        <table class="cr-assert-table">
          <thead>
            <tr><th>Type</th><th>Target</th><th>Detail</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="cr-ai-status" style="display:none"></div>
        <div class="cr-toolbar">
          <button class="cr-btn cr-add-btn">+ Add Assertion</button>
          <button class="cr-btn cr-regen-btn">↺ Regenerate All</button>
          <span class="cr-autosave-hint">Autosaves on change</span>
          <span class="cr-autosave-status"></span>
        </div>
      </div>
    `

    this._container.querySelectorAll('.cr-del-assert').forEach(btn => {
      btn.addEventListener('click', () => {
        this._collectFromDom()
        this._assertions.splice(parseInt(btn.dataset.idx, 10), 1)
        this._render()
        this._doSave()
      })
    })

    this._container.querySelector('.cr-add-btn').addEventListener('click', () => {
      this._collectFromDom()
      this._assertions.push({ id: crypto.randomUUID(), type: 'file_exists', target: '', detail: '', status: 'pending' })
      this._render()
      this._doSave()
    })

    this._container.querySelector('.cr-regen-btn').addEventListener('click', () => this._regenerate())

    this._container.querySelectorAll('.cr-assert-target, .cr-assert-detail, .cr-sel-type').forEach(el => {
      el.addEventListener('change', () => {
        this._dirty = true
        this._doSave()
      })
      el.addEventListener('blur', () => {
        if (this._dirty) this._doSave()
      })
    })
  }

  _collectFromDom() {
    this._container.querySelectorAll('.cr-assertion-row').forEach((row, i) => {
      if (this._assertions[i]) {
        this._assertions[i].type = row.querySelector('.cr-sel-type').value
        this._assertions[i].target = row.querySelector('.cr-assert-target').value
        this._assertions[i].detail = row.querySelector('.cr-assert-detail').value
      }
    })
  }

  async _regenerate() {
    this._setStatus('info', 'Generating assertions…')
    try {
      const assertions = await this._generator.generateAssertions(this._story)
      if (this._destroyed) return
      this._assertions = assertions
      this._render()
      this._setStatus('', '')
      await this._doSave()
    } catch (err) {
      this._setStatus('error', `Generation failed: ${err.message}`)
    }
  }

  async _doSave() {
    if (this._destroyed) return
    this._collectFromDom()
    this._dirty = false
    this._setAutoSaveStatus('saving')
    const story = { ...this._story, assertions: this._assertions }
    try {
      const saved = await window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story })
      this._story = saved || story
      if (!this._destroyed) this._setAutoSaveStatus('saved')
      this._onSaved(this._story)
    } catch (err) {
      this._dirty = true
      if (!this._destroyed) this._setAutoSaveStatus('error', err.message)
    }
  }

  _setAutoSaveStatus(state, msg) {
    if (this._destroyed) return
    const el = this._container.querySelector('.cr-autosave-status')
    if (!el) return
    if (state === 'saving') {
      el.textContent = 'Saving…'
      el.className = 'cr-autosave-status cr-autosave-saving'
    } else if (state === 'saved') {
      el.textContent = '✓ Saved'
      el.className = 'cr-autosave-status cr-autosave-ok'
      setTimeout(() => {
        if (!this._destroyed && el) { el.textContent = ''; el.className = 'cr-autosave-status' }
      }, 2000)
    } else if (state === 'error') {
      el.textContent = `⚠ ${msg || 'Save failed'}`
      el.className = 'cr-autosave-status cr-autosave-err'
    } else {
      el.textContent = ''
      el.className = 'cr-autosave-status'
    }
  }

  _setStatus(type, msg) {
    if (this._destroyed) return
    const el = this._container.querySelector('.cr-ai-status')
    if (!el) return
    if (!type) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.className = `cr-ai-status cr-status-${type}`
    el.textContent = msg
  }

  destroy() {
    this._destroyed = true
    if (this._dirty) {
      this._collectFromDom()
      const story = { ...this._story, assertions: this._assertions }
      window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story })
        .then(saved => this._onSaved(saved || story))
        .catch(() => {})
    }
    this._container.innerHTML = ''
  }

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
