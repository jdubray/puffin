import { AiGenerator } from './AiGenerator.js'

export class StoryEditor {
  constructor(container, pluginContext, { story, onSaved }) {
    this._container = container
    this._context = pluginContext
    this._story = story || { id: null, title: '', description: '', acceptanceCriteria: [], ris: '', assertions: [], reviewServiceClass: null }
    this._onSaved = onSaved
    this._generator = new AiGenerator(pluginContext)
    this._saving = false
  }

  init() {
    const ac = Array.isArray(this._story.acceptanceCriteria)
      ? this._story.acceptanceCriteria.join('\n')
      : (this._story.acceptanceCriteria || '')

    this._container.innerHTML = `
      <div class="cr-editor">
        <h3>${this._story.id ? 'Edit Story' : 'New Story'}</h3>
        <div class="cr-field">
          <label>Title</label>
          <input class="cr-input cr-title" value="${this._esc(this._story.title)}" placeholder="Database Integrity Review">
        </div>
        <div class="cr-field">
          <label>Description</label>
          <textarea class="cr-textarea cr-description" rows="3" placeholder="As a developer, I want…">${this._esc(this._story.description)}</textarea>
        </div>
        <div class="cr-field">
          <label>Acceptance Criteria <span class="cr-hint">(one per line)</span></label>
          <textarea class="cr-textarea cr-ac" rows="8" placeholder="- Review detects…">${this._esc(ac)}</textarea>
        </div>
        <div class="cr-field">
          <label>Review Service Class <span class="cr-hint">(optional — links to src/main/review/)</span></label>
          <input class="cr-input cr-service-class" value="${this._esc(this._story.reviewServiceClass || '')}" placeholder="DatabaseIntegrityReview">
        </div>
        <div class="cr-ai-status" style="display:none"></div>
        <div class="cr-toolbar">
          <button class="cr-btn cr-btn-primary cr-save-btn">Save &amp; Regenerate</button>
          <button class="cr-btn cr-cancel-btn">Cancel</button>
        </div>
      </div>
    `

    this._container.querySelector('.cr-save-btn').addEventListener('click', () => this._save())
    this._container.querySelector('.cr-cancel-btn').addEventListener('click', () => this.destroy())
  }

  async _save() {
    if (this._saving) return
    this._saving = true

    const title = this._container.querySelector('.cr-title').value.trim()
    const description = this._container.querySelector('.cr-description').value.trim()
    const acRaw = this._container.querySelector('.cr-ac').value.trim()
    const serviceClass = this._container.querySelector('.cr-service-class').value.trim()

    if (!title) {
      this._setStatus('error', 'Title is required.')
      this._saving = false
      return
    }

    const acceptanceCriteria = acRaw.split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)

    const draft = { ...this._story, title, description, acceptanceCriteria, reviewServiceClass: serviceClass || null }

    // Save first
    this._setStatus('info', 'Saving…')
    let saved
    try {
      saved = await window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story: draft })
    } catch (err) {
      this._setStatus('error', `Save failed: ${err.message}`)
      this._saving = false
      return
    }

    // AI pipeline
    this._setStatus('info', 'Refining acceptance criteria…')
    try {
      const refinedAc = await this._generator.generateAc(saved)
      saved.acceptanceCriteria = refinedAc
      await window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story: saved })

      this._setStatus('info', 'Generating RIS…')
      const ris = await this._generator.generateRis(saved)
      saved.ris = ris
      await window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story: saved })

      this._setStatus('info', 'Generating implementation assertions…')
      const assertions = await this._generator.generateAssertions(saved)
      saved.assertions = assertions
      saved = await window.puffin.plugins.invoke('code-review-plugin', 'saveStory', { story: saved })
    } catch (err) {
      console.warn('[code-review-plugin] AI pipeline partial failure:', err)
      this._setStatus('error', `AI generation failed: ${err.message}. Story saved without regeneration.`)
    }

    this._setStatus('success', 'Saved.')
    this._saving = false
    this._onSaved(saved)
  }

  _setStatus(type, msg) {
    const el = this._container.querySelector('.cr-ai-status')
    el.style.display = 'block'
    el.className = `cr-ai-status cr-status-${type}`
    el.textContent = msg
  }

  destroy() {
    this._container.innerHTML = ''
  }

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
