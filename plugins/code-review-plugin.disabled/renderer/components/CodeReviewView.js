import { StoryListPanel } from './StoryListPanel.js'
import { CenterPanel } from './CenterPanel.js'
import { AiGenerator } from './AiGenerator.js'

const POLL_INTERVAL_MS = 1500
const PLUGIN_NAME = 'code-review-plugin'

// Returns unwrapped data directly; throws on IPC error.
async function invoke(handler, args = {}) {
  return window.puffin.plugins.invoke(PLUGIN_NAME, handler, args)
}

export class CodeReviewView {
  constructor(container, pluginContext) {
    this._container = container
    this._context = pluginContext
    this._stories = []
    this._activeStoryId = null
    this._runningStoryIds = new Set()
    this._isRunning = false
    this._isSorting = false
    this._activeRunId = null
    this._pollTimer = null
    this._listPanel = null
    this._centerPanel = null
    this._branches = []
    this._currentBranch = ''
    this._generator = new AiGenerator(pluginContext)
  }

  init() {
    this._container.innerHTML = '<div class="cr-layout"><div class="cr-left-panel"></div><div class="cr-center-panel"></div></div>'
    const leftEl = this._container.querySelector('.cr-left-panel')
    const centerEl = this._container.querySelector('.cr-center-panel')

    this._listPanel = new StoryListPanel(leftEl, {
      onAction: (type, story) => this._onStoryAction(type, story),
      onRunStart: (storyIds, branch) => this._startRun(storyIds, branch),
      onSort: () => this._sortStories()
    })

    this._centerPanel = new CenterPanel(centerEl, this._context, {
      onStorySaved: (story) => this._onStorySaved(story)
    })

    this._loadStories()
    this._loadBranches()
  }

  async _loadBranches() {
    try {
      const state = await window.puffin.state.get()
      const branchMap = state?.history?.branches || {}
      this._branches = Object.values(branchMap).map(b => ({ id: b.id, name: b.name }))
      this._currentBranch = state?.history?.activeBranch || ''
    } catch (err) {
      console.warn('[code-review-plugin] loadBranches failed:', err.message)
    }
    this._render()
  }

  onActivate() {
    this._loadStories()
  }

  onDeactivate() {}

  destroy() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
    this._listPanel = null
    this._centerPanel?.destroy()
    this._centerPanel = null
    this._container.innerHTML = ''
  }

  async _loadStories() {
    try {
      const stories = await invoke('listStories')
      this._stories = Array.isArray(stories) ? stories : []
    } catch (err) {
      console.error('[code-review-plugin] Failed to load stories:', err.message)
      this._stories = []
    }
    this._render()
  }

  _render() {
    this._listPanel?.render(this._stories, this._activeStoryId, this._runningStoryIds, this._isRunning, this._branches, this._currentBranch, this._isSorting)
  }

  async _sortStories() {
    if (this._isSorting || this._isRunning) return
    this._isSorting = true
    this._render()
    try {
      const orderedIds = await this._generator.sortStories(this._stories)
      const updated = await invoke('reorderStories', { orderedIds })
      this._stories = Array.isArray(updated) ? updated : this._stories
    } catch (err) {
      console.warn('[code-review-plugin] sortStories failed:', err.message)
      window.puffin?.toast?.show?.(`Sort failed: ${err.message}`, 'error')
    } finally {
      this._isSorting = false
      this._render()
    }
  }

  _onStoryAction(type, story) {
    if (type !== 'new') this._activeStoryId = story?.id || null
    this._render()
    switch (type) {
      case 'edit':        this._centerPanel.showEditor(story); break
      case 'ris':         this._centerPanel.showRis(story); break
      case 'assertions':  this._centerPanel.showAssertions(story); break
      case 'review':      this._centerPanel.showReview(story); break
      case 'delete':      this._deleteStory(story); break
      case 'new':         this._centerPanel.showEditor(null); break
    }
  }

  async _deleteStory(story) {
    const confirmed = window.confirm(`Delete story "${story.title}"?`)
    if (!confirmed) return
    try {
      await invoke('deleteStory', { storyId: story.id })
      this._stories = this._stories.filter(s => s.id !== story.id)
      this._activeStoryId = null
      this._centerPanel.showIdle()
      this._render()
    } catch (err) {
      console.error('[code-review-plugin] deleteStory failed:', err.message)
      window.puffin?.toast?.show?.(`Delete failed: ${err.message}`, 'error')
    }
  }

  async _startRun(storyIds, branch) {
    if (this._isRunning || storyIds.length === 0) return
    this._isRunning = true
    this._runningStoryIds = new Set(storyIds)
    this._render()
    try {
      const data = await invoke('runStories', { storyIds, branch })
      this._activeRunId = data.runId
      this._startPolling()
    } catch (err) {
      console.error('[code-review-plugin] runStories failed:', err.message)
      this._isRunning = false
      this._runningStoryIds.clear()
      this._render()
      window.puffin?.toast?.show?.(`Run failed: ${err.message}`, 'error')
    }
  }

  _startPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer)
    this._pollTimer = setInterval(() => this._pollRunStatus(), POLL_INTERVAL_MS)
    this._pollRunStatus()
  }

  async _pollRunStatus() {
    if (!this._activeRunId) return
    try {
      const [run, progress] = await Promise.all([
        invoke('getRunStatus', { runId: this._activeRunId }),
        invoke('getProgress', { runId: this._activeRunId }).catch(() => ({}))
      ])
      if (!run) return

      const stillRunning = new Set()
      let totalCritical = 0
      let totalImportant = 0
      for (const [storyId, r] of Object.entries(run.results || {})) {
        if (r.status === 'running') stillRunning.add(storyId)
        totalCritical += r.findingCount?.critical || 0
        totalImportant += r.findingCount?.important || 0
      }
      this._runningStoryIds = stillRunning

      // Show partial output in center panel while running
      this._showProgress(progress, stillRunning)

      if (run.status === 'complete' || run.status === 'error') {
        clearInterval(this._pollTimer)
        this._pollTimer = null
        this._isRunning = false
        this._activeRunId = null
        this._centerPanel?.showIdle()  // clear stale progress display
        await this._loadStories()
        window.puffin?.toast?.show?.(
          `Code review complete — ${totalCritical} critical, ${totalImportant} important findings`,
          'info'
        )
      } else {
        this._render()
      }
    } catch {
      // poll errors are transient — don't stop polling
    }
  }

  _showProgress(progress, runningIds) {
    const centerEl = this._container.querySelector('.cr-center-panel')
    if (!centerEl) return

    const entries = Object.entries(progress || {}).filter(([id]) => runningIds?.has(id))
    if (entries.length === 0) {
      // No active stories — don't write anything; completion branch handles clearing
      return
    }

    const logText = entries.map(([, text]) => {
      const lines = text.split('\n').filter(Boolean)
      return lines.slice(-30).join('\n')  // last 30 lines
    }).join('\n---\n')

    const count = entries.length
    centerEl.innerHTML = `
      <div class="cr-progress-section">
        <div class="cr-progress-header">
          <span class="cr-progress-spinner">⟳</span>
          Running ${count} review${count > 1 ? 's' : ''}… (Claude is inspecting the codebase)
        </div>
        <div class="cr-progress-log">${this._escHtml(logText || 'Starting…')}</div>
      </div>
    `

    const logEl = centerEl.querySelector('.cr-progress-log')
    if (logEl) logEl.scrollTop = logEl.scrollHeight
  }

  _escHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  _onStorySaved(story) {
    const idx = this._stories.findIndex(s => s.id === story.id)
    if (idx === -1) this._stories.push(story)
    else this._stories[idx] = story
    this._activeStoryId = story.id
    this._render()
  }
}
