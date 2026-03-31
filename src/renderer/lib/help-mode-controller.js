/**
 * HelpModeController
 *
 * When help mode is active, swaps every [data-help] element's title attribute
 * to show its descriptive data-help text. When deactivated, the original title
 * values are restored exactly. A MutationObserver handles elements added to the
 * DOM after activation (e.g. plugin buttons rendered dynamically).
 */
export class HelpModeController {
  constructor() {
    /** @type {Map<Element, string>} original title values keyed by element */
    this._originals = new Map()
    this._active = false
    this._observer = null
    /** @type {Set<Element>|null} pending nodes queued for the microtask flush */
    this._pending = null
  }

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    if (enabled === this._active) return
    this._active = enabled
    if (enabled) {
      this._activate()
    } else {
      this._deactivate()
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _activate() {
    document.querySelectorAll('[data-help]').forEach(el => this._swap(el))
    this._observer = new MutationObserver(mutations => {
      // Accumulate all added element nodes into a Set, then flush in one microtask.
      // This coalesces rapid batch DOM updates (e.g. rendering 20+ story cards)
      // into a single querySelectorAll pass instead of one per mutation record.
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue
          if (!this._pending) {
            this._pending = new Set()
            Promise.resolve().then(() => this._flushPending())
          }
          this._pending.add(node)
        }
      }
    })
    this._observer.observe(document.body, { childList: true, subtree: true })
  }

  _flushPending() {
    const nodes = this._pending
    this._pending = null
    if (!nodes) return
    for (const node of nodes) {
      if (node.dataset?.help) this._swap(node)
      node.querySelectorAll('[data-help]').forEach(el => this._swap(el))
    }
  }

  _deactivate() {
    if (this._observer) {
      this._observer.disconnect()
      this._observer = null
    }
    this._pending = null // discard any queued microtask batch
    this._originals.forEach((originalTitle, el) => {
      if (originalTitle === '') {
        el.removeAttribute('title')
      } else {
        el.setAttribute('title', originalTitle)
      }
    })
    this._originals.clear()
  }

  /** Store the original title and replace with data-help content. */
  _swap(el) {
    if (this._originals.has(el)) return // already swapped
    this._originals.set(el, el.getAttribute('title') || '')
    el.setAttribute('title', el.dataset.help)
  }
}
