/**
 * dom - Small helpers shared by the Architecture tab components.
 */

const PLUGIN = 'architecture-plugin'

/**
 * Escape text for HTML.
 * @param {*} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return ''
  const div = document.createElement('div')
  div.textContent = String(text)
  return div.innerHTML
}

/**
 * Invoke a handler on the plugin's main-process side.
 * @param {string} handler
 * @param {Object} [args]
 * @returns {Promise<*>}
 */
export function invoke(handler, args = {}) {
  return window.puffin.plugins.invoke(PLUGIN, handler, args)
}

/**
 * Render markdown into an element (async; the element shows escaped text meanwhile).
 * @param {HTMLElement} el
 * @param {string} markdown
 */
export async function renderMarkdownInto(el, markdown) {
  const text = String(markdown || '')
  el.innerHTML = `<p>${escapeHtml(text).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  if (!text || !window.puffin?.marked?.parse) return
  try {
    const html = await window.puffin.marked.parse(text)
    if (el.isConnected) el.innerHTML = html
  } catch {
    /* keep the fallback */
  }
}

/**
 * Show a Puffin toast when available.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 */
export function toast(message, type = 'info') {
  const app = window.puffinApp
  if (app && typeof app.showToast === 'function') {
    app.showToast(message, type)
  } else {
    console[type === 'error' ? 'error' : 'log'](`[Architecture] ${message}`)
  }
}

/**
 * Status badge markup for a component status.
 * @param {string} status
 * @returns {string}
 */
export function statusBadge(status) {
  const s = status === 'planned' ? 'planned' : 'built'
  return `<span class="arch-badge arch-badge-${s}">${s}</span>`
}

/**
 * Small helper to build an element.
 * @param {string} tag
 * @param {Object} [attrs]
 * @param {string} [html]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
    else if (v !== undefined && v !== null) node.setAttribute(k, v)
  }
  if (html) node.innerHTML = html
  return node
}

/**
 * Current Puffin theme for diagrams.
 * @returns {'light'|'dark'}
 */
export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/**
 * Open a repository file in the Editor tab.
 * @param {string} absolutePath
 * @returns {Promise<boolean>}
 */
export async function openInEditor(absolutePath) {
  const app = window.puffinApp
  const viewId = 'document-editor-plugin:document-editor-view'
  if (!app?.sidebarViewManager || !app?.pluginViewContainer) return false
  try {
    await app.sidebarViewManager.activateView(viewId)
    const editor = app.pluginViewContainer.getComponent
      ? app.pluginViewContainer.getComponent(viewId)
      : app.pluginViewContainer.loadedComponents?.get(viewId)
    if (editor && typeof editor.openFileByPath === 'function') {
      await editor.openFileByPath(absolutePath)
      return true
    }
  } catch (error) {
    console.warn('[Architecture] openInEditor failed:', error)
  }
  return false
}

/**
 * Submit a prompt through the Prompt tab so it is recorded in history.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function submitPrompt(text) {
  const editor = window.puffinApp?.components?.promptEditor
  if (!editor || typeof editor.submitExternal !== 'function') return false
  return editor.submitExternal(text)
}

/**
 * Whether a Claude session is running.
 * @returns {Promise<boolean>}
 */
export async function isSessionRunning() {
  try {
    return !!(await window.puffin?.claude?.isRunning?.())
  } catch {
    return false
  }
}
