/**
 * Plugin Manager
 *
 * Full-screen modal for managing Puffin plugins.
 * Opened via --plugins CLI flag or File > Manage Plugins...
 */

export class PluginManager {
  constructor() {
    this._overlay = null
  }

  async show() {
    if (this._overlay) return
    const [pluginsResult, activeResult] = await Promise.all([
      window.puffin.plugins.list(),
      window.puffin.plugins.listActive()
    ])
    const plugins = (pluginsResult.plugins || []).filter(p => p.name !== 'designer-plugin')
    const activeSet = new Set(activeResult.plugins || [])
    this._render(plugins, activeSet)
  }

  hide() {
    if (!this._overlay) return
    this._overlay.classList.add('pm-fadeout')
    this._overlay.addEventListener('animationend', () => {
      this._overlay?.remove()
      this._overlay = null
    }, { once: true })
  }

  // ---------------------------------------------------------------------------

  _render(plugins, activeSet) {
    const overlay = document.createElement('div')
    overlay.className = 'pm-overlay'
    overlay.innerHTML = `
      <div class="pm-container">
        <div class="pm-header">
          <h2 class="pm-title">Plugin Manager</h2>
          <button class="pm-close" title="Close">✕</button>
        </div>
        <div class="pm-tabs">
          <button class="pm-tab pm-tab-active" data-tab="installed">Installed</button>
          <button class="pm-tab" data-tab="install">Install New</button>
        </div>
        <div class="pm-body">
          <div class="pm-panel pm-panel-active" data-panel="installed">
            ${this._renderInstalledTab(plugins, activeSet)}
          </div>
          <div class="pm-panel" data-panel="install">
            ${this._renderInstallTab()}
          </div>
        </div>
      </div>
    `

    overlay.querySelector('.pm-close').addEventListener('click', () => this.hide())

    // Tab switching
    overlay.querySelectorAll('.pm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.pm-tab').forEach(t => t.classList.remove('pm-tab-active'))
        overlay.querySelectorAll('.pm-panel').forEach(p => p.classList.remove('pm-panel-active'))
        tab.classList.add('pm-tab-active')
        overlay.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('pm-panel-active')
      })
    })

    // Enable/disable toggles
    overlay.querySelectorAll('.pm-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const name = toggle.dataset.plugin
        const row = toggle.closest('.pm-plugin-row')
        const statusEl = row.querySelector('.pm-plugin-status')
        toggle.disabled = true
        try {
          if (toggle.checked) {
            await window.puffin.plugins.enable(name)
            statusEl.textContent = 'active'
            statusEl.className = 'pm-plugin-status pm-status-active'
          } else {
            await window.puffin.plugins.disable(name)
            statusEl.textContent = 'inactive'
            statusEl.className = 'pm-plugin-status pm-status-inactive'
          }
        } catch (err) {
          toggle.checked = !toggle.checked // revert
        } finally {
          toggle.disabled = false
        }
      })
    })

    // Install form
    const installBtn = overlay.querySelector('#pm-install-btn')
    if (installBtn) {
      installBtn.addEventListener('click', () => this._handleInstall(overlay))
    }

    document.body.appendChild(overlay)
    this._overlay = overlay
  }

  _renderInstalledTab(plugins, activeSet) {
    if (plugins.length === 0) {
      return '<p class="pm-empty">No plugins found.</p>'
    }
    return `
      <div class="pm-plugin-list">
        ${plugins.map(p => this._renderPluginRow(p, activeSet.has(p.name))).join('')}
      </div>
    `
  }

  _renderPluginRow(plugin, isActive) {
    const displayName = plugin.manifest?.displayName || plugin.name
    const description = plugin.manifest?.description || ''
    const version = plugin.manifest?.version || ''
    return `
      <div class="pm-plugin-row">
        <div class="pm-plugin-info">
          <span class="pm-plugin-name">${displayName}</span>
          <span class="pm-plugin-version">${version}</span>
          <span class="pm-plugin-desc">${description}</span>
        </div>
        <div class="pm-plugin-controls">
          <span class="pm-plugin-status ${isActive ? 'pm-status-active' : 'pm-status-inactive'}">
            ${isActive ? 'active' : 'inactive'}
          </span>
          <label class="pm-toggle-label">
            <input type="checkbox" class="pm-toggle" data-plugin="${plugin.name}" ${isActive ? 'checked' : ''} />
            <span class="pm-toggle-track"></span>
          </label>
        </div>
      </div>
    `
  }

  _renderInstallTab() {
    return `
      <div class="pm-install-form">
        <p class="pm-install-help">
          Enter the path to a plugin directory containing <code>puffin-plugin.json</code>.
          The plugin will be copied to <code>~/.puffin/plugins/</code> and activated on the next launch.
        </p>
        <div class="pm-install-row">
          <input type="text" class="pm-install-input" id="pm-install-source"
                 placeholder="/path/to/my-plugin  or  ~/dev/my-plugin" />
          <button class="pm-install-btn" id="pm-install-btn">Install</button>
        </div>
        <div class="pm-install-result" id="pm-install-result"></div>
      </div>
    `
  }

  async _handleInstall(overlay) {
    const input = overlay.querySelector('#pm-install-source')
    const resultEl = overlay.querySelector('#pm-install-result')
    const btn = overlay.querySelector('#pm-install-btn')
    const source = input.value.trim()

    if (!source) {
      resultEl.textContent = 'Please enter a path.'
      resultEl.className = 'pm-install-result pm-result-error'
      return
    }

    btn.disabled = true
    btn.textContent = 'Installing\u2026'
    resultEl.textContent = ''

    try {
      const result = await window.puffin.plugins.install(source)
      if (result.success) {
        resultEl.textContent = `\u2713 Plugin "${result.pluginName}" installed. Restart Puffin to activate it.`
        resultEl.className = 'pm-install-result pm-result-success'
        input.value = ''
      } else {
        resultEl.textContent = `Error: ${result.error}`
        resultEl.className = 'pm-install-result pm-result-error'
      }
    } catch (err) {
      resultEl.textContent = `Error: ${err.message}`
      resultEl.className = 'pm-install-result pm-result-error'
    } finally {
      btn.disabled = false
      btn.textContent = 'Install'
    }
  }
}
