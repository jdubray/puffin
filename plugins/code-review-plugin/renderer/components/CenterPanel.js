import { StoryEditor } from './StoryEditor.js'
import { RisEditor } from './RisEditor.js'
import { AssertionsEditor } from './AssertionsEditor.js'
import { ReviewViewer } from './ReviewViewer.js'

export class CenterPanel {
  constructor(container, pluginContext, { onStorySaved }) {
    this._container = container
    this._context = pluginContext
    this._onStorySaved = onStorySaved
    this._current = null
    this._showIdle()
  }

  showIdle() {
    this._cleanup()
    this._showIdle()
  }

  showEditor(story) {
    this._cleanup()
    this._current = new StoryEditor(this._container, this._context, {
      story,
      onSaved: (saved) => this._onStorySaved(saved)
    })
    this._current.init()
  }

  showRis(story) {
    this._cleanup()
    this._current = new RisEditor(this._container, this._context, {
      story,
      onSaved: (saved) => this._onStorySaved(saved)
    })
    this._current.init()
  }

  showAssertions(story) {
    this._cleanup()
    this._current = new AssertionsEditor(this._container, this._context, {
      story,
      onSaved: (saved) => this._onStorySaved(saved)
    })
    this._current.init()
  }

  showReview(story) {
    this._cleanup()
    this._current = new ReviewViewer(this._container, this._context, { story })
    this._current.init()
  }

  destroy() {
    this._cleanup()
  }

  _cleanup() {
    this._current?.destroy?.()
    this._current = null
    this._container.innerHTML = ''
  }

  _showIdle() {
    this._container.innerHTML = `
      <div class="cr-idle">
        <div class="cr-idle-icon">🔍</div>
        <p>Select a story action from the left panel to get started.</p>
      </div>
    `
  }
}
