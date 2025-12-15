# Puffin & The SAM Pattern
## A Context-First Approach to AI-Assisted Development

---

# OUTLINE

## Part 1: The SAM Pattern

### What is SAM?
### SAM vs Other Patterns
### SAM in Practice

## Part 2: Puffin

### The Problem - Context Management in AI Development
### The Problem - Ephemeral History
### What is Puffin?
### Architecture Overview
### Branched Conversations
### Dynamic Context (CLAUDE.md)
### The UI Design Challenge & GUI Designer
### User Stories & Backlog Workflow
### Acceptance Criteria Verification
### SAM Implementation in Puffin
### Demo
### Lessons Learned & Future

---

# SLIDE CONTENT

---

## PART 1: THE SAM PATTERN

---

### Slide 1: What is SAM?

**State-Action-Model: A Reactive Functional Pattern**

```
User Intent → Action → Model → State → View → User Intent...
                ↑                  │
                └── Control States ┘
```

**Three Core Components:**

| Component | Responsibility |
|-----------|----------------|
| **Action** | Translates user intent into a proposal |
| **Model** | Validates and applies proposals via acceptors |
| **State** | Computes derived state and control states |

**Key Principles:**
- **Single State Tree** - One source of truth
- **Unidirectional Data Flow** - Predictable mutations
- **Acceptors** - Model decides what gets applied
- **Control States** - State determines allowed actions

**Creator:** Jean-Jacques Dubray (2015)
**Website:** https://sam.js.org

---

### Slide 2: SAM vs Other Patterns

| Aspect | MVC | Redux | SAM |
|--------|-----|-------|-----|
| **Data Flow** | Bidirectional | Unidirectional | Unidirectional + Control |
| **Mutation** | Direct | Reducers | Acceptors |
| **Side Effects** | Controller | Middleware | Actions |
| **State Derivation** | View | Selectors | State Function |
| **Control Flow** | Implicit | Implicit | **Explicit (FSM)** |

**What Makes SAM Different:**

1. **Explicit Control States**
   - Not just "what is the data?" but "what can happen next?"
   - FSMs make valid state transitions explicit

2. **Acceptor Pattern**
   - Model can reject proposals
   - Validation at the boundary, not scattered

3. **Temporal Logic**
   - TLA+ influence: state transitions are first-class
   - Every action has preconditions and postconditions

**When to Use SAM:**
- Complex workflows with clear states (pending, processing, complete)
- Applications where "what can the user do now?" matters
- Systems requiring audit trails or time-travel debugging

---

### Slide 3: SAM in Practice

**The SAM Step (one cycle):**

```javascript
// 1. ACTION: User clicks "Submit"
const proposal = actions.submitPrompt({ content: "Build a login form" })

// 2. MODEL: Acceptor validates and applies
const submitPromptAcceptor = model => proposal => {
  if (proposal.type !== 'SUBMIT_PROMPT') return
  if (!proposal.content?.trim()) return  // Reject empty

  model.pendingPromptId = generateId()
  model.prompts.push({
    id: model.pendingPromptId,
    content: proposal.content,
    status: 'pending'
  })
}

// 3. STATE: Derive control states
const state = model => ({
  ...model,
  // Control states
  canSubmit: !model.pendingPromptId,
  canCancel: !!model.pendingPromptId,
  isProcessing: !!model.pendingPromptId
})

// 4. VIEW: Render based on state
render(state) // Button disabled if !canSubmit
```

**Benefits Realized:**
- **Debugging**: Know exactly what action caused what change
- **Testing**: Test acceptors in isolation
- **Reasoning**: Control states make UI logic explicit

---

## PART 2: PUFFIN

---

### Slide 4: The Problem - Context Management in AI Development

**The Challenge with AI Coding Assistants:**

When conversations grow long and projects become complex:
- AI loses focus
- A UI prompt triggers backend suggestions
- Simple requests spiral into architectural changes
- Context from unrelated work pollutes new tasks

**Root Cause: Context Pollution**

```
One conversation = Everything visible = AI addresses everything
```

**Real Example:**
> "Add a button to the header"
>
> AI Response: "I'll add the button, but first let me refactor
> your authentication system and update the database schema..."

**The Insight:**
- Claude Code CLI is extraordinarily capable
- But managing context across 10k-100k LoC projects is hard
- Need: Focused context, organized history, traceable progress

---

### Slide 5: The Problem - Ephemeral History

**You Can Lose Everything**

```
┌─────────────────────────────────────────────────────────────┐
│  Terminal Window                                             │
│  ─────────────────                                          │
│  $ claude                                                    │
│  > Build me a user authentication system                    │
│  [Claude builds 15 files over 2 hours]                      │
│  > Add OAuth support                                         │
│  [Claude adds Google/GitHub OAuth]                          │
│  > Now add rate limiting                                     │
│  [Claude implements rate limiting]                          │
│                                                              │
│  [You close the terminal]                                   │
│                                                              │
│  💀 ALL CONVERSATION HISTORY IS GONE 💀                      │
└─────────────────────────────────────────────────────────────┘
```

**When You Lose Context:**

| Scenario | What's Lost |
|----------|-------------|
| **Close terminal** | Entire conversation history |
| **Context window fills** | Claude "forgets" early decisions |
| **Start new session** | No memory of what was built or why |
| **Come back tomorrow** | Can't resume where you left off |

**The Hidden Cost:**

- You thought you could go back to that conversation — you can't
- You thought Claude remembered your architecture decisions — it doesn't
- You thought the session ID would let you resume — it might be gone
- You built something complex, but the "why" is lost forever

**What This Means:**

> "Claude, why did you implement it this way?"
>
> "I don't have any context about previous implementations..."

**Puffin's Solution:**

- **Persistent history** in `.puffin/history.json`
- **Every prompt and response** saved with timestamps
- **Session IDs tracked** per branch for resumption
- **Survives terminal close**, app restart, system reboot
- **Searchable, browsable** conversation tree

```
Close Puffin → Reopen tomorrow → Everything is still there
```

---

### Slide 6: What is Puffin?

**Puffin: A Management Layer for Claude Code CLI**

```
┌─────────────────────────────────────────────────┐
│                    PUFFIN                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Branches │  │ Backlog  │  │   Dynamic    │  │
│  │  & History│  │& Stories │  │  CLAUDE.md   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
                       │
                       ▼ spawns & manages
┌─────────────────────────────────────────────────┐
│              Claude Code CLI                     │
│   (Full agentic capabilities - THE BUILDER)     │
└─────────────────────────────────────────────────┘
                       │
                       ▼ builds
┌─────────────────────────────────────────────────┐
│              Your Project                        │
└─────────────────────────────────────────────────┘
```

**What Puffin Does:**
- **Organizes** conversations into topic-specific branches
- **Tracks** prompts, responses, and file modifications
- **Injects** context dynamically based on active branch
- **Manages** user stories from specification to completion

**What Puffin Doesn't Do:**
- A management UI on top of Claude Code CLI
- Generate code from chosen context
- Captures architectural decisions

---

### Slide 6: Architecture Overview

**Technology Stack:**

| Layer | Technology |
|-------|------------|
| Platform | Electron |
| Frontend | Vanilla JavaScript (ES6+) |
| State Management | SAM Pattern |
| CLI Integration | Node.js child_process |
| Storage | File-based (.puffin/ directory) |

**Process Architecture:**

```
┌─────────────────────────────────────────────────┐
│              Electron Main Process               │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ IPC Handlers │  │    Claude Service        │ │
│  │              │  │  (spawns CLI subprocess) │ │
│  └──────────────┘  └──────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Puffin State │  │  CLAUDE.md Generator     │ │
│  │ (.puffin/)   │  │  (dynamic context)       │ │
│  └──────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────┘
              ↕ IPC (contextBridge)
┌─────────────────────────────────────────────────┐
│            Electron Renderer Process             │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  SAM Model   │  │      Components          │ │
│  │  (44 acceptors)│ │  (Prompt, History, etc.) │ │
│  └──────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Data Storage (.puffin/ directory):**

```
your-project/
└── .puffin/
    ├── config.json       # Project settings
    ├── history.json      # Conversation history
    ├── user-stories.json # Backlog
    ├── architecture.md   # Living documentation
    └── ui-guidelines.json # Design system
```

---

### Slide 7: Branched Conversations

**The Core Insight: Cognitive Separation**

Each branch has its own:
- Conversation history (Claude session)
- Context injection (CLAUDE.md content)
- Focus area

**Default Branches:**

| Branch | Focus | Context Injected |
|--------|-------|------------------|
| **Specifications** | Requirements, user stories | Project description, assumptions |
| **Architecture** | System design, APIs | Architecture document |
| **UI** | Components, styling | Design tokens, component patterns |
| **Backend** | APIs, database | Data model, API conventions |
| **Deployment** | CI/CD, infrastructure | Deployment architecture |

**How Sessions Work:**

```
Specifications Branch (Session: abc-123)
├── Turn 1: "Define user authentication requirements..."
├── Turn 2: "What about OAuth providers?"
└── Turn 3: "Here are the acceptance criteria..."

UI Branch (Session: def-456)  ← Different session!
├── Turn 1: "Create a login form component..."
└── Turn 2: "Style it with our design tokens..."
```

**Switching branches = Switching sessions = Fresh, focused context**

---

### Slide 8: Dynamic Context (CLAUDE.md)

**The Mechanism:**

Claude Code automatically reads `.claude/CLAUDE.md` for project context.
Puffin generates this file **dynamically based on active branch**.

**File Structure:**

```
your-project/
└── .claude/
    ├── CLAUDE.md              ← Active (auto-generated)
    ├── CLAUDE_base.md         ← Shared context
    ├── CLAUDE_specifications.md
    ├── CLAUDE_ui.md
    └── CLAUDE_backend.md
```

**What Each Branch Sees:**

**Base Context (always):**
- Project name and description
- Coding preferences (style, testing, naming)
- Active user stories

**UI Branch adds:**
```markdown
## Branch Focus: UI/UX

### Color Tokens
| Token | Value | Usage |
|-------|-------|-------|
| --color-primary | #6c63ff | Main brand |

### Component Patterns
#### Primary Button
**HTML:** <button class="btn-primary">...</button>
**CSS:** .btn-primary { background: var(--color-primary); }
```

**Automatic Regeneration:**

| Change | Triggers |
|--------|----------|
| Config updated | Base + active branch |
| User story added | Base + active branch |
| Architecture updated | Architecture + Backend |
| Branch switched | Active CLAUDE.md swap |

---

### Slide 10: The UI Design Challenge & GUI Designer

**The Problem: Describing UI in Words**

Telling an AI what you want visually is *hard*:

```
You: "Create a login form with the email field above the password
     field, a remember me checkbox aligned left, and the submit
     button should be full width with rounded corners, primary
     color, and the forgot password link should be centered
     below it but smaller and in gray..."

Claude: [Builds something... but not quite what you pictured]

You: "No, the spacing is wrong, and I wanted the checkbox
     inline with the label, and the button needs more padding..."

Claude: [Rebuilds... still not right]

[30 minutes later, still iterating on layout]
```

**Why This Happens:**

| Challenge | Impact |
|-----------|--------|
| **Ambiguous language** | "Aligned left" relative to what? |
| **Missing details** | You forgot to mention spacing |
| **Mental model mismatch** | Your picture ≠ Claude's interpretation |
| **Iteration cost** | Each round-trip takes minutes |

**The Insight: Sketching is Faster**

```
Drawing what you want:     30 seconds
Describing what you want:  5 minutes + iterations
```

**Puffin's GUI Designer:**

A visual drag-and-drop canvas for UI mockups:

```
┌─────────────────────────────────────────────────┐
│  Element Palette          Canvas                │
│  ┌───────────┐    ┌─────────────────────────┐  │
│  │ Container │    │  ┌─────────────────┐    │  │
│  │ Text      │    │  │   Login Form    │    │  │
│  │ Input     │    │  │ ┌─────────────┐ │    │  │
│  │ Button    │    │  │ │ Email       │ │    │  │
│  │ Image     │    │  │ └─────────────┘ │    │  │
│  │ List      │    │  │ ┌─────────────┐ │    │  │
│  │ Form      │    │  │ │ Password    │ │    │  │
│  │ Card      │    │  │ └─────────────┘ │    │  │
│  │ Modal     │    │  │ [✓] Remember me │    │  │
│  └───────────┘    │  │ ┌─────────────┐ │    │  │
│                   │  │ │   Login     │ │    │  │
│  Properties:      │  │ └─────────────┘ │    │  │
│  x: 100, y: 50    │  └─────────────────┘    │  │
│  width: 300       └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**How It Works:**

1. **Drag elements** onto a grid-based canvas
2. **Position and resize** visually
3. **Set properties** (text, colors, behavior)
4. **Export** as Claude-readable description
5. **Attach to prompt** via "Include GUI" option

**Generated Description:**

```markdown
## UI Layout Description

Container at (100, 50), 300x400px:
  - Text "Login Form" at top, centered, 24px heading
  - Input "Email" at (20, 60), full width, placeholder "email@example.com"
  - Input "Password" at (20, 120), full width, type: password
  - Checkbox "Remember me" at (20, 180), aligned left
  - Button "Login" at (20, 240), full width, primary style
```

**Benefits:**

| Traditional | With GUI Designer |
|-------------|-------------------|
| Describe → Build → "No, not that" → Repeat | Sketch → Build → Done |
| 5-10 iterations | 1-2 iterations |
| Vague requirements | Precise layout |
| Frustration | Clarity |

**Design Tokens Integration:**

The GUI Designer uses your configured design tokens:
- Primary button → uses `--color-primary`
- Spacing → uses your spacing scale
- Fonts → uses your font families

**Result:** Claude builds UI that matches your design system *and* your visual intent.

---

### Slide 11: User Stories & Backlog Workflow

**The Backlog-Driven Workflow:**

```
Prompt → Derive Stories → Review → Backlog → Implement → Verify → Complete
```

**Story Derivation:**

1. User writes specification in Specifications branch
2. Checks "Derive User Stories"
3. Claude extracts structured stories:

```json
{
  "title": "Add Login Form",
  "description": "As a user, I want to log in...",
  "acceptanceCriteria": [
    "Form has email and password fields",
    "Validation shows inline errors",
    "Submit button disabled until valid"
  ]
}
```

4. User reviews, edits, approves
5. Stories added to backlog

**Branch-Aware Implementation:**

Each story tracks:
- `branchId`: Where it was derived
- `implementedOn[]`: Which branches have worked on it

```
Story: "Add Login Form"

Implemented on UI branch:
  → Context: Design tokens, component patterns
  → Focus: Visual implementation

Implemented on Backend branch:
  → Context: API conventions, data model
  → Focus: Authentication endpoint
```

---

### Slide 12: Acceptance Criteria Verification

**The Problem:** AI says "done" but criteria aren't verified

**The Solution:** Numbered criteria with mandatory verification

**Implementation Prompt:**

```markdown
**Acceptance Criteria:**
1. Form has email and password fields
2. Validation shows inline errors
3. Submit button disabled until valid

**Criteria Verification Requirements:**
After implementation, verify each criterion:

- ✅ Criterion 1: [How it was satisfied]
- ⚠️ Criterion 2: [Partial - what's missing]
- ❌ Criterion 3: [Not done - why]
```

**Example Output:**

```markdown
## Criteria Verification

- ✅ Criterion 1: Created LoginForm component with email
     and password TextField components
- ✅ Criterion 2: Added Formik validation with yup schema,
     errors display below each field
- ⚠️ Criterion 3: Button disables on invalid form, but
     still enabled during API call - need loading state
```

**Benefits:**
- Nothing overlooked
- Clear status per criterion
- Easy follow-up on partial/blocked items

---

### Slide 13: SAM Implementation in Puffin

**Why SAM for Puffin?**

1. **Complex Workflows**
   - Story derivation: idle → deriving → reviewing → implementing
   - Prompt lifecycle: composing → submitted → streaming → complete

2. **Multiple FSMs**
   - App state, Prompt state, Story state
   - Need clear "what can happen next?"

3. **Debugging Requirements**
   - Time-travel through state changes
   - Audit trail of all actions

**SAM Setup in Puffin:**

```javascript
// instance.js
import { sam } from 'sam-pattern'
import { acceptors } from './model.js'
import { computeState } from './state.js'
import { actions } from './actions.js'

const instance = sam({
  acceptors,
  state: computeState,
  render: (state) => {
    document.dispatchEvent(
      new CustomEvent('puffin-state-change', { detail: { state } })
    )
  }
})

export const intents = actions(instance.intents)
```

---

### Slide 14: The Model - 44 Acceptors

**Model Structure:**

```javascript
{
  // Application
  initialized: boolean,
  projectPath: string,

  // Configuration
  config: { name, description, options, uxStyle },

  // Conversations
  history: { branches, activeBranch, activePromptId },
  currentPrompt: { content, branchId },
  streamingResponse: string,

  // Workflows
  userStories: Array<Story>,
  storyDerivation: { status, pendingStories },

  // Activity Tracking
  activity: { currentTool, activeTools, filesModified }
}
```

**Acceptor Categories:**

| Category | Count | Examples |
|----------|-------|----------|
| Application | 4 | initialize, loadState, appError |
| Config | 2 | updateConfig, updateOptions |
| Prompt/History | 15 | submitPrompt, completeResponse, selectBranch |
| GUI Designer | 7 | addElement, moveElement, selectElement |
| Architecture | 2 | updateArchitecture, reviewArchitecture |
| User Stories | 14 | deriveStories, addToBacklog, startImplementation |
| Activity | 9 | toolStart, toolEnd, addModifiedFile |
| Navigation | 4 | switchView, toggleSidebar |

**Acceptor Pattern:**

```javascript
export const submitPromptAcceptor = model => proposal => {
  if (proposal?.type !== 'SUBMIT_PROMPT') return

  // Validate
  if (!proposal.payload?.content?.trim()) return

  // Mutate
  const promptId = generateId()
  model.pendingPromptId = promptId
  model.history.branches[branchId].prompts.push({
    id: promptId,
    content: proposal.payload.content,
    timestamp: Date.now()
  })
}
```

---

### Slide 15: Finite State Machines

**App FSM:**

```
INITIALIZING → LOADING → READY ↔ PROCESSING → ERROR
                          ↑_________|
```

**Prompt FSM:**

```
IDLE → COMPOSING → SUBMITTED → STREAMING → COMPLETED
  ↑                                            │
  └────────────────────────────────────────────┘
```

**Story Derivation FSM:**

```
idle → deriving → reviewing → implementing → idle
         ↓            ↓
       error      cancelled
```

**Control States in Practice:**

```javascript
const computeState = model => ({
  ...model,

  // Control states
  canSubmitPrompt:
    model.currentPrompt?.content?.trim() &&
    !model.pendingPromptId,

  canDeriveStories:
    model.storyDerivation.status === 'idle' &&
    model.history.activeBranch === 'specifications',

  canStartImplementation:
    model.selectedStories?.length > 0 &&
    model.storyDerivation.status === 'idle',

  isProcessing: !!model.pendingPromptId
})
```

**UI Responds to Control States:**

```javascript
// Button disabled based on control state
submitButton.disabled = !state.canSubmitPrompt

// Actions only available in certain states
if (state.canDeriveStories) {
  showDeriveCheckbox()
}
```

---

### Slide 16: Demo / Screenshots

**[LIVE DEMO OR SCREENSHOTS]**

1. **Project Setup**
   - Opening a project
   - Configuring preferences
   - Setting up UI guidelines (design tokens)

2. **Branched Workflow**
   - Writing specs in Specifications branch
   - Deriving user stories
   - Switching to UI branch (notice context change)

3. **Story Implementation**
   - Selecting stories from backlog
   - Starting implementation
   - Viewing criteria verification output

4. **SAM Debugger**
   - Opening debugger (Ctrl+Shift+D)
   - Viewing action history
   - Time-traveling through states

5. **Dynamic CLAUDE.md**
   - Show file contents changing on branch switch
   - Show design tokens appearing in UI branch

---

### Slide 17: Results & Lessons Learned

**Results:**

| Metric | Before Puffin | With Puffin |
|--------|---------------|-------------|
| Context pollution | Frequent | Rare |
| Off-topic suggestions | Common | Minimal |
| Story completion tracking | Manual | Automatic |
| Pattern consistency | Varies | Enforced via tokens |
| Debugging state issues | Difficult | Time-travel |

**Key Lessons:**

1. **Context is Everything**
   - The same AI with different context behaves very differently
   - Deliberate context management >> hoping for the best

2. **SAM Scales Well**
   - 44 acceptors, 3 FSMs - still manageable
   - Clear boundaries between concerns

3. **Explicit > Implicit**
   - Control states make "what can happen" obvious
   - FSMs prevent impossible state transitions

4. **AI Needs Structure**
   - Numbered criteria with verification requirements
   - Branch-specific focus instructions
   - Clear output format expectations

**What's Next:**
- MCP server integration
- Cost tracking across sessions
- Team collaboration features

---

## Q&A (20 minutes)

**Anticipated Questions:**

1. **Why not just use Claude's Projects feature?**
   - Projects are conversation-level, not branch-level
   - No dynamic context switching
   - No story/backlog workflow

2. **Why SAM instead of Redux/Zustand?**
   - Explicit control states for complex workflows
   - FSM integration for state transitions
   - Time-travel debugging built-in

3. **Can Puffin work with other AI models?**
   - Currently Claude Code CLI specific
   - Architecture could support others

4. **How does session resumption work?**
   - Claude Code CLI supports `--resume <sessionId>`
   - Each branch maintains its own session
   - Puffin tracks and passes session IDs

5. **What's the learning curve?**
   - Basic usage: minutes
   - Story workflow: ~30 min
   - Understanding SAM: ~2 hours

---

## SPEAKER NOTES

### Timing Guide

| Section | Duration | Cumulative |
|---------|----------|------------|
| Intro | 2 min | 2 min |
| SAM Pattern (3 slides) | 8 min | 10 min |
| Problems: Context + Ephemeral History (2 slides) | 5 min | 15 min |
| What is Puffin + Architecture (2 slides) | 4 min | 19 min |
| Branched Conversations + Dynamic Context (2 slides) | 5 min | 24 min |
| GUI Designer (1 slide) | 3 min | 27 min |
| User Stories + Criteria Verification (2 slides) | 4 min | 31 min |
| SAM in Puffin (3 slides) | 5 min | 36 min |
| Demo | 4 min | 40 min |
| Results | 3 min | 43 min |
| Buffer | -3 min | 40 min |
| Q&A | 20 min | 60 min |

### Key Points to Emphasize

1. **SAM Section:**
   - Control states are the differentiator
   - Acceptors = validation at the boundary
   - FSMs make state transitions explicit

2. **Problem Section:**
   - **Ephemeral history is the silent killer** - everything looks fine until you close the terminal
   - Real story: "I built something amazing... and lost the entire conversation"
   - Context window compression = Claude "forgets" your earlier decisions

3. **Puffin Section:**
   - Puffin orchestrates, Claude builds
   - Branch = separate context = focused AI
   - Stories flow across branches with tracking

4. **GUI Designer:**
   - "A picture is worth a thousand prompts"
   - Drawing takes 30 seconds, describing takes 5 minutes + iterations
   - Design tokens integration means consistent output

5. **Demo:**
   - Show CLAUDE.md changing on branch switch
   - Show SAM debugger time-travel
   - Show criteria verification output
   - Show GUI Designer → prompt integration

### Potential Deep-Dives (if time/interest)

- SAM theory (TLA+, temporal logic)
- IPC architecture in Electron
- Prompt template design
- Claude Code CLI internals

---

*Presentation created for Puffin v1.0.1*
