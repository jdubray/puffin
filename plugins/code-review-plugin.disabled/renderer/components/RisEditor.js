import { AiGenerator } from './AiGenerator.js'

export class RisEditor {
  constructor(container, pluginContext, { story, onSaved }) {
    this._container = container
    this._story = story
    this._generator = new AiGenerator(pluginContext)
    this._onSaved = onSaved || (() => {})
    this._dirty = false
    this._saveTimer = null
    this._destroyed = false
  }

  init() {
    this._container.innerHTML = `
      <div class="cr-editor">
        <h3>RIS — ${this._esc(this._story.title)}</h3>
        <div class="cr-field">
          <textarea class="cr-textarea cr-ris-content" rows="20">${this._esc(this._story.ris || '')}</textarea>
        </div>
        <div class="cr-ai-status" style="display:none"></div>
        <div class="cr-toolbar">
          <button class="cr-btn cr-regen-btn">↺ Regenerate</button>
          <span class="cr-autosave-hint">Autosaves on change</span>
          <span class="cr-autosave-status"></span>
        </div>
      </div>
    `

    const textarea = this._container.querySelector('.cr-ris-content')
    textarea.addEventListener('input', () => {
      this._dirty = true
      clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(() => this._doSave(), 800)
    })
    textarea.addEventListener('blur', () => {
      if (this._dirty) {
        clearTimeout(this._saveTimer)
        this._doSave()
      }
    })

    this._container.querySelector('.cr-regen-btn').addEventListener('click', () => this._regenerate())
  }

  async _regenerate() {
    this._setStatus('info', 'Generating RIS…')
    try {
      const ris = await this._generator.generateRis(this._story)
      if (this._destroyed) return
      this._container.querySelector('.cr-ris-content').value = ris
      this._dirty = true
      clearTimeout(this._saveTimer)
      this._setStatus('', '')
      await this._doSave()
    } catch (err) {
      this._setStatus('error', `Generation failed: ${err.message}`)
    }
  }

  async _doSave() {
    if (this._destroyed || !this._dirty) return
    const textarea = this._container.querySelector('.cr-ris-content')
    if (!textarea) return
    const ris = textarea.value
    this._dirty = false
    this._setAutoSaveStatus('saving')
    try {
      const story = { ...this._story, ris }
      const saved = await window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story })
      this._story = saved || story
      if (!this._destroyed) this._setAutoSaveStatus('saved')
      this._onSaved(this._story)
    } catch (err) {
      this._dirty = true  // retry on next blur
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
    clearTimeout(this._saveTimer)
    // Fire-and-forget: persist any unsaved change before the DOM is cleared
    if (this._dirty) {
      const textarea = this._container.querySelector('.cr-ris-content')
      if (textarea) {
        const story = { ...this._story, ris: textarea.value }
        window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story })
          .then(saved => this._onSaved(saved || story))
          .catch(() => {})
      }
    }
    this._container.innerHTML = ''
  }

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
