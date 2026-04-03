/**
 * TooltipEngine
 *
 * Lightweight fixed-position tooltip for [data-tooltip] and [data-help-active]
 * attributes. Uses position:fixed so it is never clipped by overflow:hidden
 * ancestors — works for sidebar sections, plugin views, modals, anywhere.
 *
 * Activation:
 *   - [data-tooltip="text"] — always visible (branches, threads, etc.)
 *   - [data-help-active="text"] — visible when Help Mode is on (set by HelpModeController)
 *
 * Call initTooltipEngine() once at app startup. Event delegation handles all
 * elements including those injected by plugins after init.
 */

const SHOW_DELAY_MS = 380   // ms before tooltip appears
const OFFSET_Y      = 12    // px above cursor

export function initTooltipEngine() {
  const el = _createTooltipEl()
  document.body.appendChild(el)

  let _target     = null
  let _showTimer  = null

  // ---- Event delegation via capture (catches all DOM, including plugins) -----

  document.addEventListener('mouseover', (e) => {
    const target = _findTarget(e.target)
    if (!target || target === _target) return
    _cancel()
    _target = target
    const text = _getText(target)
    if (!text) return
    _showTimer = setTimeout(() => _show(el, text, e.clientX, e.clientY), SHOW_DELAY_MS)
  }, true)

  document.addEventListener('mousemove', (e) => {
    if (!_target || el.style.display === 'none') return
    _position(el, e.clientX, e.clientY)
  }, true)

  document.addEventListener('mouseout', (e) => {
    if (!_target) return
    // Only hide when leaving the target itself (not moving between its children)
    const related = e.relatedTarget
    if (!_target.contains(related)) {
      _cancel()
      _hide(el)
    }
  }, true)

  // Hide on scroll or focus change
  document.addEventListener('scroll', () => _cancel() && _hide(el), true)
  document.addEventListener('keydown', () => { _cancel(); _hide(el) }, true)

  function _cancel() {
    clearTimeout(_showTimer)
    _showTimer = null
    _target = null
    return true
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _createTooltipEl() {
  const el = document.createElement('div')
  el.id = 'puffin-tooltip'
  el.setAttribute('role', 'tooltip')
  el.setAttribute('aria-live', 'polite')
  Object.assign(el.style, {
    position:       'fixed',
    zIndex:         '99999',
    pointerEvents:  'none',
    maxWidth:       '260px',
    padding:        '0.4rem 0.65rem',
    background:     '#0d0d1a',
    color:          '#e0e0f0',
    fontSize:       '0.72rem',
    lineHeight:     '1.5',
    border:         '1px solid rgba(108,99,255,0.35)',
    borderRadius:   '6px',
    boxShadow:      '0 4px 18px rgba(0,0,0,0.55)',
    whiteSpace:     'pre-wrap',
    wordBreak:      'break-word',
    display:        'none',
    transition:     'opacity 0.12s ease',
    opacity:        '0',
  })
  return el
}

function _findTarget(node) {
  // Walk up from hovered node to find an element with a tooltip attribute
  let el = node
  while (el && el !== document.body) {
    if (el.nodeType === Node.ELEMENT_NODE &&
        (el.hasAttribute('data-tooltip') || el.hasAttribute('data-help-active'))) {
      return el
    }
    el = el.parentElement
  }
  return null
}

function _getText(target) {
  // data-help-active (set by HelpModeController) takes precedence in help mode
  return target.getAttribute('data-help-active') || target.getAttribute('data-tooltip') || ''
}

function _show(el, text, x, y) {
  el.textContent = text
  el.style.display = 'block'
  el.style.opacity = '0'
  _position(el, x, y)
  // Trigger fade-in on next frame
  requestAnimationFrame(() => { el.style.opacity = '1' })
}

function _hide(el) {
  el.style.display = 'none'
  el.style.opacity = '0'
}

function _position(el, x, y) {
  const vw  = window.innerWidth
  const vh  = window.innerHeight
  const tw  = el.offsetWidth  || 200
  const th  = el.offsetHeight || 40

  let left = x - tw / 2
  let top  = y - th - OFFSET_Y

  // Clamp horizontally
  left = Math.max(8, Math.min(left, vw - tw - 8))
  // Flip below cursor if too close to top
  if (top < 8) top = y + OFFSET_Y + 4

  el.style.left = `${Math.round(left)}px`
  el.style.top  = `${Math.round(top)}px`
}
