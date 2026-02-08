'use strict'

/**
 * @module diagram-prompt-builder
 * Constructs Claude prompts for AI-generated diagrams in Excalidraw format.
 *
 * Each diagram type (architecture, sequence, flowchart, component) has a
 * dedicated builder that produces a { system, task, constraints } triple
 * compatible with the CRE prompt pipeline and sendPrompt().
 *
 * AI output targets the ExcalidrawElementSkeleton[] format accepted by
 * @excalidraw/excalidraw's convertToExcalidrawElements().
 */

// ─── Excalidraw Element Schema Reference ───────────────────────────────────
// Embedded in every prompt so the AI knows exactly what properties to emit.

const ELEMENT_SCHEMA = `
EXCALIDRAW ELEMENT SCHEMA — ExcalidrawElementSkeleton[]
=======================================================
Output a JSON array of element skeletons. Each element MUST have a "type" field.
The output will be passed to convertToExcalidrawElements() which fills in defaults.

**CRITICAL PATTERN**: Containers (rectangles, ellipses) and arrows MUST have separate text elements for labels.
EXAMPLE - Creating a labeled box:
  [
    { type: "rectangle", id: "box-1", x: 100, y: 100, width: 200, height: 80, backgroundColor: "#a5d8ff" },
    { type: "text", text: "Service Name", containerId: "box-1", textAlign: "center", verticalAlign: "middle" }
  ]
EXAMPLE - Creating a labeled arrow:
  [
    { type: "arrow", id: "arr-1", x: 200, y: 150, points: [[0,0],[100,0]], start: {id:"box-1"}, end: {id:"box-2"} },
    { type: "text", text: "HTTP", containerId: "arr-1", textAlign: "center" }
  ]

COMMON PROPERTIES (all types):
  x: number               — X position (required)
  y: number               — Y position (required)
  id: string              — Unique element id (required — use descriptive ids like "svc-auth", "arrow-1")
  strokeColor: string     — Stroke color, e.g. "#1e1e1e"
  backgroundColor: string — Fill color, e.g. "#a5d8ff" (empty string "" for transparent)
  fillStyle: "solid" | "hachure" | "cross-hatch" | "zigzag"
  strokeWidth: 1 | 2 | 4  — Thin / bold / extra-bold
  strokeStyle: "solid" | "dashed" | "dotted"
  roughness: 0 | 1 | 2    — 0=architect (clean), 1=artist (sketch), 2=cartoonist
  opacity: number          — 0–100
  angle: number            — Rotation in radians
  groupIds: string[]       — Group membership
  locked: boolean

CONTAINER TYPES (rectangle, diamond, ellipse):
  width: number            — Width (required)
  height: number           — Height (required)
  roundness: { type: 3 }   — Rounded corners (type 3 = adaptive radius)
  backgroundColor: string  — Background color (e.g. "#a5d8ff", "#b2f2bb")

**CRITICAL**: To add text inside a container, create a SEPARATE text element with containerId:
  Example:
    { type: "rectangle", id: "svc-auth", x: 100, y: 100, width: 200, height: 80, ... }
    { type: "text", text: "Auth Service", containerId: "svc-auth", fontSize: 16,
      fontFamily: 2, textAlign: "center", verticalAlign: "middle" }

ARROW TYPE:
  type: "arrow"
  x, y: number             — Start position
  width: number            — Horizontal span
  height: number           — Vertical span
  points: [[0,0], [dx,dy]] — Path points relative to x,y
  startArrowhead: "arrow" | "bar" | "dot" | "triangle" | null
  endArrowhead: "arrow" | "bar" | "dot" | "triangle" | null
  start: { id: "<source element id>" }   — Bind to source element
  end: { id: "<target element id>" }     — Bind to target element
  strokeStyle: "solid" | "dashed"        — **USE "dashed" for async/events, "solid" for sync/data**

**CRITICAL**: To label an arrow, create a SEPARATE text element with containerId:
  Example:
    { type: "arrow", id: "arr-1", start: {id: "box1"}, end: {id: "box2"}, ... }
    { type: "text", text: "HTTP API", containerId: "arr-1", fontSize: 14,
      fontFamily: 2, textAlign: "center" }

LINE TYPE:
  type: "line"
  x, y: number
  points: [[0,0], [dx,dy], ...]

TEXT TYPE (for labels AND standalone text):
  type: "text"
  text: string             — The text content (required)
  x, y: number             — Position (ignored if containerId is set)
  fontSize: number         — Default 20
  fontFamily: 1 | 2 | 3
  textAlign: "left" | "center" | "right"
  verticalAlign: "top" | "middle" | "bottom"  — Required if containerId is set
  containerId: string | null  — Set to container element id to bind text inside it
                              — null for standalone text elements

FRAME TYPE:
  type: "frame"
  x, y, width, height: number
  name: string             — Frame label
`

// ─── Layout Best Practices ─────────────────────────────────────────────────

const LAYOUT_GUIDELINES = `
LAYOUT BEST PRACTICES:
- **LABELING CONTAINERS (CRITICAL)**: Every rectangle/ellipse/diamond MUST have a text element with containerId.
  Example pattern for EVERY container:
    { type: "rectangle", id: "box-1", x: 100, y: 100, width: 200, height: 80, ... },
    { type: "text", text: "Box Label", containerId: "box-1", textAlign: "center", verticalAlign: "middle" }
- **LABELING ARROWS (CRITICAL)**: Every arrow SHOULD have a text element with containerId.
  Example pattern for arrows:
    { type: "arrow", id: "arr-1", start: {id: "box-1"}, end: {id: "box-2"}, ... },
    { type: "text", text: "HTTP", containerId: "arr-1", textAlign: "center" }
- SPACING: Keep at least 80px between elements. Group related elements within 40px.
- ALIGNMENT: Align element centers on a grid. Use consistent x or y values for rows/columns.
- FLOW DIRECTION: Architecture/component diagrams flow left-to-right or top-to-bottom.
  Sequence diagrams flow top-to-bottom. Flowcharts flow top-to-bottom.
- SIZING: Standard box size 200×80. Decision diamonds 120×120. Keep proportions consistent.
- COLORS: Use a limited palette. Differentiate categories with distinct background colors.
  Suggested palette:
    "#a5d8ff" (blue)    — services, components
    "#b2f2bb" (green)   — databases, storage
    "#ffd8a8" (orange)  — external systems, APIs
    "#e8cfff" (purple)  — queues, messaging
    "#ffc9c9" (red)     — warnings, errors
    "#fff3bf" (yellow)  — notes, annotations
- IDS: Give every element a unique, descriptive id (e.g. "svc-auth", "db-users", "arrow-auth-to-db").
`

// ─── Output Constraints (shared) ───────────────────────────────────────────

const OUTPUT_CONSTRAINTS = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "elements": [
    { "type": "rectangle", "id": "...", "x": 0, "y": 0, "width": 200, "height": 80, ... },
    { "type": "arrow", "id": "...", "x": 0, "y": 0, "points": [[0,0],[200,0]], "start": {"id":"..."}, "end": {"id":"..."}, ... },
    ...
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff"
  }
}

RULES:
- Output raw JSON only — no markdown code blocks, no commentary
- Every element MUST have a unique "id" field
- Every container (rectangle, diamond, ellipse) MUST have x, y, width, height
- Every arrow MUST have points array AND start/end bindings to element ids
- Use roughness: 0 and fontFamily: 2 for clean, professional diagrams
- Keep all coordinates positive (x >= 20, y >= 20)
- Arrows: set width and height to match the bounding box of points
- Standalone text labels should use type "text", not container labels
- Do NOT include any properties not listed in the schema`

// ─── Diagram Type Builders ─────────────────────────────────────────────────

/**
 * Supported diagram types.
 * @enum {string}
 */
const DiagramType = {
  ARCHITECTURE: 'architecture',
  SEQUENCE: 'sequence',
  FLOWCHART: 'flowchart',
  COMPONENT: 'component'
}

/**
 * Builds a prompt for generating an architecture diagram.
 * Architecture diagrams show system components as boxes with arrows indicating
 * data flow, API calls, or dependencies between them.
 *
 * @param {Object} params
 * @param {string} params.description - What the architecture diagram should show
 * @param {string[]} [params.components] - Named components to include
 * @param {string} [params.style] - Visual style preference ("clean"|"sketch")
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildArchitecturePrompt({ description, components = [], style = 'clean' }) {
  const roughness = style === 'sketch' ? 1 : 0

  const system = `You are an expert software architect and diagram designer. You produce Excalidraw-compatible JSON that visualizes system architecture clearly and precisely.
${ELEMENT_SCHEMA}
${LAYOUT_GUIDELINES}`

  const componentsList = components.length > 0
    ? `\nCOMPONENTS TO INCLUDE:\n${components.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}\n`
    : ''

  const task = `Generate an ARCHITECTURE DIAGRAM for the following system:

DESCRIPTION:
${description}
${componentsList}
ARCHITECTURE DIAGRAM CONVENTIONS:
- Use rectangles for services, APIs, and application layers
- Use rectangles with green backgrounds (#b2f2bb) for databases and storage
- Use rectangles with orange backgrounds (#ffd8a8) for external systems
- Use rectangles with purple backgrounds (#e8cfff) for queues and messaging
- **CRITICAL**: Every rectangle MUST have a corresponding text element with containerId:
  Example: { type: "rectangle", id: "svc-1", backgroundColor: "#a5d8ff", ... }
           { type: "text", text: "Auth Service", containerId: "svc-1", fontSize: 16,
             fontFamily: 2, textAlign: "center", verticalAlign: "middle" }
- Use solid arrows (strokeStyle: "solid") for synchronous calls / data flow
- Use dashed arrows (strokeStyle: "dashed") for asynchronous communication / events
- **CRITICAL**: Every arrow MUST have a corresponding text element explaining the relationship:
  Example: { type: "arrow", id: "arr-1", strokeStyle: "solid", start: {...}, end: {...}, ... }
           { type: "text", text: "HTTP API", containerId: "arr-1", fontSize: 14, fontFamily: 2 }
- Arrange in layers: clients at top, services in middle, data stores at bottom
- Use roughness: ${roughness} for ${style === 'sketch' ? 'a hand-drawn look' : 'clean, professional lines'}
- Add a frame around the entire diagram with a descriptive name
- **CRITICAL**: Add documentation elements:
  1. A title text element at the top (type: "text", fontSize: 24)
  2. A legend box explaining arrow types:
     - Create a small rectangle in the bottom-right
     - Inside: text element "Legend" as container label
     - Add sample solid arrow + text "Synchronous / Data Flow"
     - Add sample dashed arrow + text "Asynchronous / Events"
  3. Optional: Add a summary text element (type: "text", fontSize: 14) describing key decisions`

  return { system, task, constraints: OUTPUT_CONSTRAINTS }
}

/**
 * Builds a prompt for generating a sequence diagram.
 * Sequence diagrams show interactions between participants over time,
 * with vertical lifelines and horizontal message arrows.
 *
 * @param {Object} params
 * @param {string} params.description - What interaction to diagram
 * @param {string[]} [params.participants] - Named participants/actors
 * @param {string} [params.style] - Visual style preference
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildSequencePrompt({ description, participants = [], style = 'clean' }) {
  const roughness = style === 'sketch' ? 1 : 0

  const system = `You are an expert at designing UML-style sequence diagrams. You produce Excalidraw-compatible JSON that clearly shows message flow between participants.
${ELEMENT_SCHEMA}
${LAYOUT_GUIDELINES}`

  const participantsList = participants.length > 0
    ? `\nPARTICIPANTS:\n${participants.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n`
    : ''

  const task = `Generate a SEQUENCE DIAGRAM for the following interaction:

DESCRIPTION:
${description}
${participantsList}
SEQUENCE DIAGRAM CONVENTIONS:
- Each participant is a rectangle at the top (width: 160, height: 50) with a label
- Draw a vertical dashed line below each participant as the lifeline
  (use type "line", strokeStyle "dashed", from participant bottom center downward)
- Horizontal arrows between lifelines represent messages:
  - Solid arrows with endArrowhead "arrow" for synchronous calls
  - Dashed arrows with endArrowhead "arrow" for responses / async
- Label each arrow with the message name
- Space participants 220px apart horizontally
- Space messages 60px apart vertically
- Number messages in sequence (1, 2, 3...) in the arrow label
- Use roughness: ${roughness}
- Activation boxes: use narrow rectangles (width: 16) on the lifeline during processing
- Use consistent colors: all participant boxes same color (#a5d8ff), lifelines gray (#868e96)`

  return { system, task, constraints: OUTPUT_CONSTRAINTS }
}

/**
 * Builds a prompt for generating a flowchart.
 * Flowcharts show process flow with decision diamonds, process boxes,
 * and directional arrows.
 *
 * @param {Object} params
 * @param {string} params.description - What process/flow to diagram
 * @param {string[]} [params.steps] - Key steps to include
 * @param {string} [params.style] - Visual style preference
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildFlowchartPrompt({ description, steps = [], style = 'clean' }) {
  const roughness = style === 'sketch' ? 1 : 0

  const system = `You are an expert at designing clear, readable flowcharts. You produce Excalidraw-compatible JSON that shows process flow with proper decision points and branching.
${ELEMENT_SCHEMA}
${LAYOUT_GUIDELINES}`

  const stepsList = steps.length > 0
    ? `\nKEY STEPS TO INCLUDE:\n${steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`
    : ''

  const task = `Generate a FLOWCHART for the following process:

DESCRIPTION:
${description}
${stepsList}
FLOWCHART CONVENTIONS:
- Start/End: rounded rectangles (roundness: { type: 3 }), backgroundColor "#b2f2bb" (green)
- Process steps: rectangles, backgroundColor "#a5d8ff" (blue)
- Decision points: diamonds, backgroundColor "#fff3bf" (yellow), label is the Yes/No question
- Input/Output: parallelogram-style — use rectangles with italic text label, backgroundColor "#ffd8a8" (orange)
- Arrows: solid with endArrowhead "arrow", labeled "Yes"/"No" at decision branches
- Flow direction: top to bottom, left-to-right for branches
- Standard sizes: process boxes 200×70, decision diamonds 140×140, start/end 160×50
- Space vertically: 100px between rows, 80px between columns for branches
- Use roughness: ${roughness}
- Keep the main "happy path" as a straight vertical line; branch alternatives to the right
- Reconnect branches back to the main flow where appropriate`

  return { system, task, constraints: OUTPUT_CONSTRAINTS }
}

/**
 * Builds a prompt for generating a component diagram.
 * Component diagrams show software components, their interfaces,
 * and dependencies between them.
 *
 * @param {Object} params
 * @param {string} params.description - What system/subsystem to diagram
 * @param {string[]} [params.components] - Named components to include
 * @param {string} [params.style] - Visual style preference
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildComponentPrompt({ description, components = [], style = 'clean' }) {
  const roughness = style === 'sketch' ? 1 : 0

  const system = `You are an expert at designing UML-style component diagrams. You produce Excalidraw-compatible JSON that shows software components, their provided/required interfaces, and dependencies.
${ELEMENT_SCHEMA}
${LAYOUT_GUIDELINES}`

  const componentsList = components.length > 0
    ? `\nCOMPONENTS TO INCLUDE:\n${components.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}\n`
    : ''

  const task = `Generate a COMPONENT DIAGRAM for the following system:

DESCRIPTION:
${description}
${componentsList}
COMPONENT DIAGRAM CONVENTIONS:
- Each component is a large rectangle (280×120) with a label and a small "component" icon
  (simulate the UML component icon with two small nested rectangles in the top-right corner)
- Group internal elements of a component using groupIds
- Provided interfaces: small circles (ellipse 20×20) on the component boundary, connected by a short line
- Required interfaces: half-circles (use a small arc/line) on the component boundary
- Dependencies: dashed arrows from requiring component to providing component
- Use distinct background colors per layer:
    "#a5d8ff" (blue) — application components
    "#b2f2bb" (green) — infrastructure components
    "#ffd8a8" (orange) — external/third-party components
    "#e8cfff" (purple) — shared/cross-cutting components
- Arrange components in a grid layout, grouped by layer or subsystem
- Use frames to delineate subsystems or deployment boundaries
- Use roughness: ${roughness}
- Label dependencies with the interface name or protocol`

  return { system, task, constraints: OUTPUT_CONSTRAINTS }
}

// ─── Unified Builder ───────────────────────────────────────────────────────

/**
 * Builds a diagram generation prompt for the specified diagram type.
 *
 * @param {Object} params
 * @param {string} params.diagramType - One of DiagramType values
 * @param {string} params.description - What the diagram should show
 * @param {string[]} [params.components] - Components/participants/steps to include
 * @param {string} [params.style] - "clean" (default) or "sketch"
 * @returns {{ system: string, task: string, constraints: string }}
 * @throws {Error} If diagramType is not recognized
 */
function buildDiagramPrompt({ diagramType, description, components = [], style = 'clean' }) {
  switch (diagramType) {
    case DiagramType.ARCHITECTURE:
      return buildArchitecturePrompt({ description, components, style })

    case DiagramType.SEQUENCE:
      return buildSequencePrompt({ description, participants: components, style })

    case DiagramType.FLOWCHART:
      return buildFlowchartPrompt({ description, steps: components, style })

    case DiagramType.COMPONENT:
      return buildComponentPrompt({ description, components, style })

    default:
      throw new Error(`Unknown diagram type: "${diagramType}". Supported: ${Object.values(DiagramType).join(', ')}`)
  }
}

/**
 * Returns metadata about supported diagram types for UI rendering.
 * @returns {Array<{type: string, label: string, description: string, icon: string}>}
 */
function getDiagramTypes() {
  return [
    {
      type: DiagramType.ARCHITECTURE,
      label: 'Architecture Diagram',
      description: 'System components, services, databases, and their connections',
      icon: '🏗️'
    },
    {
      type: DiagramType.SEQUENCE,
      label: 'Sequence Diagram',
      description: 'Message flow between participants over time',
      icon: '🔄'
    },
    {
      type: DiagramType.FLOWCHART,
      label: 'Flowchart',
      description: 'Process flow with decisions, branches, and steps',
      icon: '📊'
    },
    {
      type: DiagramType.COMPONENT,
      label: 'Component Diagram',
      description: 'Software components, interfaces, and dependencies',
      icon: '🧩'
    }
  ]
}

module.exports = {
  buildDiagramPrompt,
  buildArchitecturePrompt,
  buildSequencePrompt,
  buildFlowchartPrompt,
  buildComponentPrompt,
  getDiagramTypes,
  DiagramType,
  // Exported for testing / advanced usage
  ELEMENT_SCHEMA,
  LAYOUT_GUIDELINES,
  OUTPUT_CONSTRAINTS
}
