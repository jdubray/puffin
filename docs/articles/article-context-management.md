# Focused Context Management with Puffin: A New Approach to AI-Assisted Development

## The Context Problem in AI-Assisted Development

When using AI coding assistants like Claude Code, one of the biggest challenges is context management. As conversations grow longer and projects become more complex, the AI can lose focus. A prompt about UI styling might trigger the AI to refactor backend code. A simple feature request might spiral into architectural changes you didn't ask for.

The root cause? **Context pollution**. When everything is in one conversation, the AI sees everything—and tries to address everything.

Puffin solves this by introducing **focused context management**: a system of branches, sessions, and dynamic context that keeps Claude Code laser-focused on the task at hand.

## The Architecture of Focus

Puffin organizes development work into five specialized branches, each with its own conversation history and context:

| Branch | Focus Area |
|--------|------------|
| **Specifications** | Requirements, user stories, acceptance criteria |
| **Architecture** | System design, data models, API contracts |
| **UI** | Components, styling, user interactions |
| **Backend** | Server logic, APIs, database operations |
| **Deployment** | CI/CD, infrastructure, hosting |

This isn't just organization—it's **cognitive separation**. When you're working in the UI branch, Claude Code doesn't see your backend conversation history. It sees UI guidelines, design tokens, and component patterns.

## How Sessions and Branches Work Together

### Claude Code Sessions

Claude Code maintains server-side conversation history through session IDs. When you resume a session, Claude remembers everything from previous turns—you don't need to re-explain your project.

Puffin leverages this by maintaining **separate sessions per branch**. Each branch has its own conversation thread with Claude:

```
Specifications Branch
└── Session: abc-123
    ├── Turn 1: "Let's define the user authentication requirements..."
    ├── Turn 2: "What about OAuth providers?"
    └── Turn 3: "Here are the acceptance criteria..."

UI Branch
└── Session: def-456
    ├── Turn 1: "I need a login form component..."
    ├── Turn 2: "Can we add validation feedback?"
    └── Turn 3: "Style it with our design tokens..."

Backend Branch
└── Session: ghi-789
    ├── Turn 1: "Implement the /auth/login endpoint..."
    └── Turn 2: "Add rate limiting..."
```

When you switch branches, Puffin resumes the appropriate session. Claude picks up exactly where you left off in that context.

### Threads Within Branches

Within each branch, you can create multiple threads—parallel conversation paths for exploring different approaches:

```
UI Branch
├── Thread 1: "Login form with modal design"
│   ├── Turn 1: Initial implementation
│   └── Turn 2: Added animations
└── Thread 2: "Login form with inline design"
    ├── Turn 1: Alternative approach
    └── Turn 2: Simplified layout
```

This lets you experiment without losing your main conversation. You can branch off, try something different, and either continue down that path or return to the original thread.

## Dynamic CLAUDE.md: Context That Adapts

Here's where Puffin's context management becomes truly powerful. Claude Code automatically reads a `.claude/CLAUDE.md` file in your project directory for context. Puffin generates this file **dynamically based on your active branch**.

### The File Structure

```
your-project/
└── .claude/
    ├── CLAUDE.md              ← Active context (auto-generated)
    ├── CLAUDE_base.md         ← Shared project context
    ├── CLAUDE_specifications.md
    ├── CLAUDE_architecture.md
    ├── CLAUDE_ui.md
    └── CLAUDE_backend.md
```

When you switch branches, Puffin combines `CLAUDE_base.md` with the branch-specific file to create the active `CLAUDE.md`.

### What Each Branch Sees

**Base Context** (always included):
- Project name and description
- Coding preferences (style, testing approach, naming conventions)
- Active user stories
- Key assumptions

**UI Branch** adds:
```markdown
## Branch Focus: UI/UX

You are working on the **UI/UX thread**. Focus on:
- User interface implementation
- Component design and structure
- Styling and visual consistency

### Color Tokens
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#6c63ff` | Main brand color |
| `--color-secondary` | `#16213e` | Secondary accent |

### Component Patterns
#### Primary Button
**Guidelines:** Use for primary actions like "Save", "Submit"...
**HTML Template:** ...
**CSS:** ...
```

**Backend Branch** adds:
```markdown
## Branch Focus: Backend

You are working on the **backend thread**. Focus on:
- API design and implementation
- Data persistence and database operations
- Error handling and validation
- Security and authentication

### Data Model
[Extracted from architecture documentation]
```

**Architecture Branch** adds:
```markdown
## Branch Focus: Architecture

You are working on the **architecture thread**. Focus on:
- System design and component boundaries
- Data flow and state management
- API contracts and interfaces

### Current Architecture
[Full architecture document content]
```

### Automatic Regeneration

The context files regenerate automatically when relevant state changes:

| Change | Regenerates |
|--------|-------------|
| Project config updated | Base + active branch |
| User story added/modified | Base + active branch |
| Architecture doc updated | Architecture + Backend branches |
| UI guidelines changed | UI branch |
| Design tokens modified | UI branch |
| Branch switched | Active CLAUDE.md |

This means Claude Code always has fresh, relevant context without you having to manage it manually.

## User Stories: The Bridge Between Branches

User stories in Puffin aren't just documentation—they're **implementation contracts** that flow across branches.

### Deriving Stories

When you describe a feature in the Specifications branch, Puffin can derive user stories:

```
Input: "I want users to be able to track their portfolio value in real-time"

Derived Stories:
1. Display Portfolio Value in Header
   - As a user, I want to see my portfolio value in the header
   - Acceptance Criteria:
     - Value displays in currency format
     - Updates every 15 seconds
     - Shows loading state during refresh

2. Portfolio Value API Endpoint
   - As a developer, I need an API endpoint for portfolio value
   - Acceptance Criteria:
     - Returns current portfolio value
     - Includes individual position values
     - Handles market closure gracefully
```

### Branch-Aware Implementation

Each story tracks:
- **Source branch**: Where it was derived (e.g., "specifications")
- **Implemented on**: Which branches have worked on it (e.g., ["ui", "backend"])

When you select stories for implementation, Puffin:

1. Uses your **current active branch** (not a hardcoded default)
2. Injects **branch-specific context** into the prompt
3. Tracks which branch implemented the story
4. Requires **explicit verification** of each acceptance criterion

### Acceptance Criteria Verification

Puffin uses numbered acceptance criteria with mandatory verification. When Claude implements a story, the prompt requires explicit sign-off on each criterion:

```
**Acceptance Criteria:**
1. Button appears in the prompt editor toolbar
2. Button is visually distinct from the existing Send button
3. Clicking the button creates a new thread
4. Current prompt content is preserved when sent

**Criteria Verification Requirements:**
After completing the implementation, you MUST verify each numbered
acceptance criterion and report its status using this format:

- ✅ Criterion N: [How the implementation satisfies this]
- ⚠️ Criterion N: [Partially done - what's missing]
- ❌ Criterion N: [Not implemented - why]
```

This ensures nothing is overlooked. Claude must explicitly confirm each criterion is met, partially met, or blocked—making it easy to track what's done and what needs follow-up.

This means the same user story can be implemented across multiple branches with appropriate context:

```
Story: "Display Portfolio Value in Header"

On UI Branch:
- Receives design tokens, component patterns
- Focuses on visual implementation

On Backend Branch:
- Receives data model, API conventions
- Focuses on endpoint implementation
```

## The Lifecycle in Practice

Here's how a typical feature flows through Puffin:

### 1. Specification (Specifications Branch)
```
You: "I want to add real-time portfolio tracking"
Claude: [Asks clarifying questions, defines requirements]
→ Derive 3 user stories
```

### 2. Architecture (Architecture Branch)
```
You: "How should we architect the real-time updates?"
Claude: [Proposes WebSocket vs polling, discusses trade-offs]
→ Updates architecture.md
→ CLAUDE_architecture.md regenerates
→ CLAUDE_backend.md gets updated data model
```

### 3. Backend Implementation (Backend Branch)
```
You: [Select story: "Portfolio Value API Endpoint"]
→ Claude sees: API conventions, data model, backend focus
→ Implements /api/portfolio/value endpoint
→ Story marked: implementedOn: ["backend"]
```

### 4. UI Implementation (UI Branch)
```
You: [Select story: "Display Portfolio Value in Header"]
→ Claude sees: Design tokens, component patterns, UI focus
→ Implements PortfolioValue component with proper styling
→ Story marked: implementedOn: ["backend", "ui"]
```

### 5. Completion
```
Story status: pending → in-progress → completed
After 2 weeks: completed → archived (automatic)
```

## Why This Matters

### Reduced Context Pollution
Claude Code only sees what's relevant. UI work doesn't trigger backend suggestions. Backend work doesn't include design tokens.

### Consistent Implementation
Design tokens defined once flow into every UI prompt. Architecture decisions inform backend implementation. You define patterns once, they apply everywhere.

### Traceable Progress
You can see which stories are pending, in-progress, or completed. You know which branches have touched each story. The history tree shows your conversation evolution.

### Recoverable State
Every prompt and response is stored. You can resume any session. If story derivation fails, your prompt is restored. Nothing is lost.

## Getting Started

1. **Open your project** in Puffin
2. **Define your coding preferences** in the Config view
3. **Set up UI guidelines** with your design tokens
4. **Start in Specifications** to define what you're building
5. **Derive user stories** from your requirements
6. **Switch branches** to implement with focused context

The dynamic CLAUDE.md file is created automatically in your project's `.claude/` directory. Claude Code will pick it up on every invocation.

## Conclusion

Context management is the hidden challenge of AI-assisted development. Too much context, and the AI loses focus. Too little, and it lacks the information to help effectively.

Puffin's approach—specialized branches, persistent sessions, and dynamic context injection—keeps Claude Code focused on exactly what matters for each task. The AI becomes a more effective collaborator because it's always working with the right context.

The result: faster implementation, fewer tangents, and code that actually follows your project's patterns and preferences.

---

*Puffin is an open-source Electron application that serves as a management layer for Claude Code CLI. It tracks conversations, manages context, and provides visual tools for AI-assisted development.*
