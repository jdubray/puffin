/**
 * First-Run Plugin Setup
 *
 * Full-screen overlay shown on first launch. Lists all available plugins so the
 * user can decide which ones to enable before the main UI loads.
 */

/** Plugins enabled by default (all others are opt-in). */
const DEFAULT_ENABLED = new Set([
  'document-editor-plugin',
  'claude-config-plugin',
  'stats-plugin',
  'toast-history-plugin',
  'document-viewer-plugin',
  'calendar',
  'memory-plugin',
  'prompt-template-plugin',
])

export class FirstRunSetup {
  constructor() {
    this._overlay = null
    this._resolve = null
  }

  /**
   * Show the plugin picker and wait for the user to confirm.
   * Returns a Promise that resolves when the user clicks "Start Puffin".
   * @returns {Promise<void>}
   */
  async show() {
    const pluginsResult = await window.puffin.plugins.list()
    const plugins = (pluginsResult.plugins || []).filter(
      p => p.name !== 'designer-plugin'  // already disabled, skip
    )

    return new Promise((resolve) => {
      this._resolve = resolve
      this._render(plugins)
    })
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _render(plugins) {
    const overlay = document.createElement('div')
    overlay.id = 'first-run-overlay'
    overlay.className = 'first-run-overlay'

    overlay.innerHTML = `
      <div class="first-run-container">
        <div class="first-run-header">
          <div class="first-run-logo">🐦</div>
          <h1 class="first-run-title">Welcome to Puffin</h1>
          <p class="first-run-subtitle">
            Choose which plugins to enable. You can change this later in Settings.
          </p>
        </div>

        <div class="first-run-plugins" id="first-run-plugin-list">
          ${this._renderPluginList(plugins)}
        </div>

        <div class="first-run-footer">
          <button class="first-run-select-all" id="first-run-select-all">Select all</button>
          <button class="first-run-btn-primary" id="first-run-continue">Start Puffin</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)
    this._overlay = overlay

    // Keep card highlight in sync when checkbox changes
    overlay.querySelectorAll('.first-run-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('.first-run-plugin-card').classList.toggle('is-checked', cb.checked)
      })
    })

    overlay.querySelector('#first-run-select-all').addEventListener('click', () => {
      this._toggleAll(overlay, plugins)
    })

    overlay.querySelector('#first-run-continue').addEventListener('click', () => {
      this._confirm(overlay, plugins)
    })
  }

  _renderPluginList(plugins) {
    const groups = [
      {
        label: 'Standard',
        description: 'Recommended for most users',
        names: ['document-editor-plugin', 'claude-config-plugin', 'stats-plugin',
                'toast-history-plugin', 'document-viewer-plugin', 'calendar'],
      },
      {
        label: 'Power Tools',
        description: 'Useful for advanced workflows',
        names: ['memory-plugin', 'prompt-template-plugin', 'excalidraw-plugin',
                'outcome-lifecycle-plugin', 'rlm-document-plugin', 'hdsl-viewer-plugin'],
      },
    ]

    const byName = Object.fromEntries(plugins.map(p => [p.name, p]))

    return groups.map(group => {
      const items = group.names
        .map(name => byName[name])
        .filter(Boolean)

      if (items.length === 0) return ''

      return `
        <div class="first-run-group">
          <div class="first-run-group-header">
            <span class="first-run-group-label">${group.label}</span>
            <span class="first-run-group-desc">${group.description}</span>
          </div>
          <div class="first-run-group-items">
            ${items.map(p => this._renderPluginCard(p)).join('')}
          </div>
        </div>
      `
    }).join('')
  }

  _renderPluginCard(plugin) {
    const checked = DEFAULT_ENABLED.has(plugin.name)
    return `
      <label class="first-run-plugin-card ${checked ? 'is-checked' : ''}" data-plugin="${plugin.name}">
        <input type="checkbox" class="first-run-checkbox" data-plugin="${plugin.name}"
               ${checked ? 'checked' : ''} />
        <div class="first-run-plugin-info">
          <span class="first-run-plugin-name">${plugin.manifest?.displayName || plugin.name}</span>
          <span class="first-run-plugin-desc">${plugin.manifest?.description || ''}</span>
        </div>
      </label>
    `
  }

  _toggleAll(overlay, plugins) {
    const checkboxes = overlay.querySelectorAll('.first-run-checkbox')
    const allChecked = Array.from(checkboxes).every(cb => cb.checked)
    checkboxes.forEach(cb => {
      cb.checked = !allChecked
      cb.closest('.first-run-plugin-card').classList.toggle('is-checked', !allChecked)
    })
    overlay.querySelector('#first-run-select-all').textContent = allChecked ? 'Select all' : 'Deselect all'
  }

  async _confirm(overlay, plugins) {
    const btn = overlay.querySelector('#first-run-continue')
    btn.disabled = true
    btn.textContent = 'Starting…'

    const checked = new Set(
      Array.from(overlay.querySelectorAll('.first-run-checkbox:checked')).map(cb => cb.dataset.plugin)
    )
    const disabledPlugins = plugins.map(p => p.name).filter(name => !checked.has(name))

    await window.puffin.plugins.completeSetup(disabledPlugins)

    overlay.classList.add('first-run-fadeout')
    overlay.addEventListener('animationend', () => {
      overlay.remove()
      this._overlay = null
      this._resolve()
    }, { once: true })
  }
}
