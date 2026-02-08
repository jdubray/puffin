/**
 * Diagram Response Parser
 *
 * Validates, sanitizes, and converts Claude's JSON diagram response into
 * valid Excalidraw elements.
 *
 * Runs in the renderer process where Excalidraw APIs are available.
 *
 * DESIGN NOTE: We intentionally do NOT use Excalidraw's convertToExcalidrawElements()
 * because it always regenerates IDs internally, breaking cross-element references
 * (containerId, arrow start/end bindings, frameId, frame children). It also throws
 * on various skeleton shapes (frames without children, text with containerId but
 * missing x/y, etc.). Our own converter produces fully-formed elements that
 * updateScene() accepts directly.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_ELEMENT_TYPES = new Set([
  'rectangle', 'diamond', 'ellipse',
  'arrow', 'line',
  'text',
  'freedraw',
  'frame'
])

const CONTAINER_TYPES = new Set(['rectangle', 'diamond', 'ellipse'])
const LINEAR_TYPES = new Set(['arrow', 'line'])
const CONTAINER_BIND_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'arrow', 'line'])

const VALID_FILL_STYLES = new Set(['hachure', 'cross-hatch', 'solid', 'zigzag'])
const VALID_STROKE_STYLES = new Set(['solid', 'dashed', 'dotted'])
const VALID_ARROWHEADS = new Set(['arrow', 'bar', 'dot', 'triangle'])
const VALID_TEXT_ALIGN = new Set(['left', 'center', 'right'])
const VALID_VERTICAL_ALIGN = new Set(['top', 'middle', 'bottom'])
const VALID_FONT_FAMILIES = new Set([1, 2, 3, 4])
const VALID_ROUGHNESS = new Set([0, 1, 2])
const VALID_STROKE_WIDTHS = new Set([1, 2, 4])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function generateSeed() {
  return Math.floor(Math.random() * 2000000000)
}

// ─── Response Validation ──────────────────────────────────────────────────────

function validateResponse(response) {
  const errors = []
  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response is not an object'] }
  }
  if (!Array.isArray(response.elements)) {
    errors.push('Response missing "elements" array')
  } else if (response.elements.length === 0) {
    errors.push('Response "elements" array is empty')
  }
  return { valid: errors.length === 0, errors }
}

// ─── Element Sanitization ─────────────────────────────────────────────────────

/**
 * Sanitize a raw AI element into a clean skeleton with only valid properties.
 */
function sanitizeElement(element, index) {
  const warnings = []
  const prefix = `elements[${index}]`

  if (!element || typeof element !== 'object') {
    return { element: null, warnings: [`${prefix}: not an object, skipped`] }
  }

  if (!element.type || !VALID_ELEMENT_TYPES.has(element.type)) {
    return { element: null, warnings: [`${prefix}: invalid type "${element.type}", skipped`] }
  }

  const s = { type: element.type }

  // ID — preserve AI's id or generate one
  s.id = (element.id && typeof element.id === 'string') ? element.id : generateId()

  // Position
  s.x = typeof element.x === 'number' && isFinite(element.x) ? element.x : 0
  s.y = typeof element.y === 'number' && isFinite(element.y) ? element.y : 0

  // Dimensions for containers
  if (CONTAINER_TYPES.has(element.type)) {
    s.width = typeof element.width === 'number' && element.width > 0 ? element.width : 200
    s.height = typeof element.height === 'number' && element.height > 0 ? element.height : 80
  }

  // Dimensions for linear
  if (LINEAR_TYPES.has(element.type)) {
    if (typeof element.width === 'number') s.width = element.width
    if (typeof element.height === 'number') s.height = element.height
  }

  // Points (arrows/lines)
  if (LINEAR_TYPES.has(element.type)) {
    if (Array.isArray(element.points) && element.points.length >= 2) {
      s.points = element.points
        .filter(p => Array.isArray(p) && p.length >= 2)
        .map(p => [
          typeof p[0] === 'number' && isFinite(p[0]) ? p[0] : 0,
          typeof p[1] === 'number' && isFinite(p[1]) ? p[1] : 0
        ])
      if (s.points.length < 2) s.points = [[0, 0], [100, 0]]
    } else {
      s.points = [[0, 0], [100, 0]]
    }
  }

  // Arrow-specific
  if (element.type === 'arrow') {
    s.startArrowhead = (element.startArrowhead === null || VALID_ARROWHEADS.has(element.startArrowhead))
      ? element.startArrowhead : null
    s.endArrowhead = (element.endArrowhead === null || VALID_ARROWHEADS.has(element.endArrowhead))
      ? element.endArrowhead : 'arrow'
    // Bindings — store raw, resolve after all elements known
    if (element.start && typeof element.start === 'object' && element.start.id) {
      s._startBindId = String(element.start.id)
    }
    if (element.end && typeof element.end === 'object' && element.end.id) {
      s._endBindId = String(element.end.id)
    }
  }

  // Text-specific
  if (element.type === 'text') {
    if (typeof element.text === 'string' && element.text.length > 0) {
      s.text = element.text
    } else {
      return { element: null, warnings: [`${prefix}: text element missing "text", skipped`] }
    }
    if (typeof element.fontSize === 'number' && element.fontSize > 0) s.fontSize = element.fontSize
    if (VALID_FONT_FAMILIES.has(element.fontFamily)) s.fontFamily = element.fontFamily
    if (VALID_TEXT_ALIGN.has(element.textAlign)) s.textAlign = element.textAlign
    if (VALID_VERTICAL_ALIGN.has(element.verticalAlign)) s.verticalAlign = element.verticalAlign
    if (typeof element.containerId === 'string') s.containerId = element.containerId
  }

  // Frame-specific
  if (element.type === 'frame') {
    if (typeof element.name === 'string') s.name = element.name
    if (typeof element.width === 'number') s.width = element.width
    if (typeof element.height === 'number') s.height = element.height
  }

  // Visual properties
  if (typeof element.strokeColor === 'string') s.strokeColor = element.strokeColor
  if (typeof element.backgroundColor === 'string') s.backgroundColor = element.backgroundColor
  if (VALID_FILL_STYLES.has(element.fillStyle)) s.fillStyle = element.fillStyle
  if (VALID_STROKE_WIDTHS.has(element.strokeWidth)) s.strokeWidth = element.strokeWidth
  if (VALID_STROKE_STYLES.has(element.strokeStyle)) s.strokeStyle = element.strokeStyle
  if (VALID_ROUGHNESS.has(element.roughness)) s.roughness = element.roughness
  if (typeof element.opacity === 'number' && element.opacity >= 0 && element.opacity <= 100) {
    s.opacity = element.opacity
  }
  if (typeof element.angle === 'number' && isFinite(element.angle)) s.angle = element.angle
  if (element.roundness && typeof element.roundness === 'object') s.roundness = element.roundness
  if (typeof element.locked === 'boolean') s.locked = element.locked

  // Grouping
  if (Array.isArray(element.groupIds)) {
    s.groupIds = element.groupIds.filter(g => typeof g === 'string')
  }
  if (typeof element.frameId === 'string') s.frameId = element.frameId

  return { element: s, warnings }
}

// ─── Element Builder ──────────────────────────────────────────────────────────

/**
 * Build a full Excalidraw element from a sanitized skeleton.
 * Produces elements that updateScene() accepts directly.
 */
function buildElement(skeleton) {
  const base = {
    id: skeleton.id,
    type: skeleton.type,
    x: skeleton.x ?? 0,
    y: skeleton.y ?? 0,
    width: skeleton.width ?? 0,
    height: skeleton.height ?? 0,
    angle: skeleton.angle ?? 0,
    strokeColor: skeleton.strokeColor || '#1e1e1e',
    backgroundColor: skeleton.backgroundColor || 'transparent',
    fillStyle: skeleton.fillStyle || 'solid',
    strokeWidth: skeleton.strokeWidth || 2,
    strokeStyle: skeleton.strokeStyle || 'solid',
    roughness: skeleton.roughness ?? 1,
    opacity: skeleton.opacity ?? 100,
    groupIds: skeleton.groupIds || [],
    frameId: skeleton.frameId || null,
    roundness: skeleton.roundness || null,
    seed: generateSeed(),
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: skeleton.locked || false
  }

  if (skeleton.type === 'text') {
    const text = skeleton.text || ''
    const fontSize = skeleton.fontSize || 20
    const fontFamily = skeleton.fontFamily || 1
    const lines = text.split('\n')
    const maxLen = Math.max(...lines.map(l => l.length), 1)

    return {
      ...base,
      text,
      fontSize,
      fontFamily,
      textAlign: skeleton.textAlign || 'center',
      verticalAlign: skeleton.verticalAlign || 'middle',
      lineHeight: 1.25,
      baseline: Math.round(fontSize * 0.8),
      width: maxLen * fontSize * 0.6,
      height: lines.length * fontSize * 1.25,
      containerId: skeleton.containerId || null,
      originalText: text,
      autoResize: true
    }
  }

  if (skeleton.type === 'arrow' || skeleton.type === 'line') {
    return {
      ...base,
      points: skeleton.points || [[0, 0], [100, 0]],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: skeleton.startArrowhead ?? null,
      endArrowhead: skeleton.endArrowhead ?? (skeleton.type === 'arrow' ? 'arrow' : null),
      _startBindId: skeleton._startBindId || null,
      _endBindId: skeleton._endBindId || null
    }
  }

  if (skeleton.type === 'frame') {
    return {
      ...base,
      name: skeleton.name || null,
      width: skeleton.width || 800,
      height: skeleton.height || 400
    }
  }

  // Container types (rectangle, ellipse, diamond) and any other type
  return {
    ...base,
    width: skeleton.width || 200,
    height: skeleton.height || 80
  }
}

// ─── Main Conversion Pipeline ─────────────────────────────────────────────────

function parseDiagramResponse(response) {
  const warnings = []

  // Step 1: Validate
  const validation = validateResponse(response)
  if (!validation.valid) {
    return {
      success: false, elements: [], appState: { viewBackgroundColor: '#ffffff' },
      warnings: validation.errors, error: validation.errors.join('; '),
      stats: { total: 0, converted: 0, skipped: 0 }
    }
  }

  // Step 2: Sanitize
  const sanitized = []
  let skipped = 0
  const total = response.elements.length

  for (let i = 0; i < response.elements.length; i++) {
    const { element, warnings: w } = sanitizeElement(response.elements[i], i)
    warnings.push(...w)
    if (element) sanitized.push(element)
    else skipped++
  }

  if (sanitized.length === 0) {
    return {
      success: false, elements: [], appState: { viewBackgroundColor: '#ffffff' },
      warnings, error: `All ${total} elements were invalid and skipped`,
      stats: { total, converted: 0, skipped }
    }
  }

  // Step 3: Build full elements
  const elements = sanitized.map(s => buildElement(s))

  // Build lookup by id
  const byId = new Map()
  for (const el of elements) byId.set(el.id, el)

  // Step 4: Resolve text↔container bindings
  let boundCount = 0
  for (const el of elements) {
    if (el.type !== 'text' || !el.containerId) continue
    const container = byId.get(el.containerId)
    if (container && CONTAINER_BIND_TYPES.has(container.type)) {
      // For bound text, set width to container width (with padding) so Excalidraw
      // can properly wrap and center. Height based on line count at container width.
      const padding = 10
      el.width = container.width - padding * 2
      const lines = el.text.split('\n')
      el.height = lines.length * (el.fontSize || 20) * 1.25
      // Center text inside the container
      el.x = container.x + padding
      el.y = container.y + container.height / 2 - el.height / 2
      el.textAlign = 'center'
      el.verticalAlign = 'middle'
      // Register as bound on the container
      if (!container.boundElements) container.boundElements = []
      container.boundElements.push({ id: el.id, type: 'text' })
      boundCount++
    } else {
      // containerId doesn't match any container — clear it so it renders standalone
      console.warn(`[DiagramParser] text "${el.text?.slice(0, 30)}" has invalid containerId "${el.containerId}", making standalone`)
      el.containerId = null
    }
  }

  // Step 5: Resolve arrow bindings
  for (const el of elements) {
    if (el.type !== 'arrow' && el.type !== 'line') continue
    if (el._startBindId) {
      const target = byId.get(el._startBindId)
      if (target) {
        el.startBinding = { elementId: target.id, focus: 0, gap: 1 }
        if (!target.boundElements) target.boundElements = []
        target.boundElements.push({ id: el.id, type: 'arrow' })
      }
    }
    if (el._endBindId) {
      const target = byId.get(el._endBindId)
      if (target) {
        el.endBinding = { elementId: target.id, focus: 0, gap: 1 }
        if (!target.boundElements) target.boundElements = []
        target.boundElements.push({ id: el.id, type: 'arrow' })
      }
    }
    // Clean up internal properties
    delete el._startBindId
    delete el._endBindId
  }

  const textBound = elements.filter(e => e.type === 'text' && e.containerId)
  console.log(`[DiagramParser] Built ${elements.length} elements, ${textBound.length} text bound to containers, ${skipped} skipped`)

  // Step 6: Build appState
  const rawAppState = response.appState && typeof response.appState === 'object'
    ? response.appState : {}
  const { collaborators, ...safeAppState } = rawAppState
  const appState = { viewBackgroundColor: '#ffffff', ...safeAppState }

  return {
    success: true,
    elements,
    appState,
    warnings,
    error: null,
    stats: { total, converted: elements.length, skipped }
  }
}

export { parseDiagramResponse, validateResponse, sanitizeElement }
export default parseDiagramResponse
