# Getting Started with Puffin

**Get your first AI-powered development project running in under 5 minutes.**

---

## What is Puffin?

Puffin transforms AI coding from ad-hoc prompting into **structured software engineering**. Instead of losing track of what Claude built across countless chat messages, Puffin gives you:

- **User Stories** extracted from your specifications
- **Implementation Plans** with dependencies and sequencing (CRE)
- **Code Model** tracking your codebase structure
- **Automated Sprints** where Claude implements entire features end-to-end

---

## Prerequisites

### 1. Install Node.js v20 LTS
Download from [nodejs.org](https://nodejs.org/) (required for SQLite native modules)

### 2. Install Claude Code CLI
```bash
npm install -g @anthropic-ai/claude-code
```

### 3. Authenticate Claude
```bash
claude auth
```
This opens your browser to log in. Once done, you're authenticated system-wide.

### 4. Verify Installation
```bash
claude --version
```
You should see the version number without errors.

---

## Install Puffin

### Option 1: Download Pre-Built (Recommended for Windows/Linux)

**Windows**: [Puffin-3.0.0-win-portable.zip](https://github.com/jdubray/puffin/releases/latest)
- Extract and run `Puffin.exe`

**Linux**: [Puffin-3.0.0.AppImage](https://github.com/jdubray/puffin/releases/latest)
```bash
chmod +x Puffin-3.0.0.AppImage
./Puffin-3.0.0.AppImage
```

**macOS**: Coming soon

### Option 2: Run from Source (All Platforms)

```bash
git clone https://github.com/jdubray/puffin.git
cd puffin
npm install
npm start
```

---

## Your First Project (5-Minute Quickstart)

### Step 1: Open a Project (30 seconds)

1. Launch Puffin
2. Click **"Open Project"** or drag a folder onto the window
3. Select your project directory (where your code lives)
4. Puffin creates a `.puffin/` folder to store project data

### Step 2: Configure Your Project (1 minute)

Click the **Config** tab and fill in:

- **Project Name**: "My Todo App"
- **Description**: "A simple task management application"
- **Programming Style**: Choose "Hybrid" (default)
- **Testing Approach**: Choose "Behavior-Driven Development"

Click **Save**. That's it! Basic configuration done.

### Step 3: Write Your Specifications (1 minute)

1. Click the **Prompt** tab
2. Make sure you're on the **Specifications** branch (default)
3. Write what you want to build:

```
I want to build a todo application with these features:

1. Users can add new tasks with a title and optional description
2. Users can mark tasks as complete or incomplete
3. Users can delete tasks
4. Tasks persist to local storage so they survive page refresh
5. Users can filter tasks by status (All, Active, Completed)
6. The UI should be clean and responsive
```

4. Check the **"Derive User Stories"** box
5. Click **Submit** (or press Ctrl+Enter)

### Step 4: Review & Add Stories to Backlog (1 minute)

Claude will analyze your specs and extract user stories. A modal appears showing proposed stories:

- ✅ **Accept** stories that look good (check the box)
- ✏️ **Edit** stories that need tweaking
- ❌ **Reject** stories that don't fit

Click **"Add to Backlog"** when ready. Stories appear in the **Backlog** view.

### Step 5: Create a Sprint with CRE (1 minute)

1. Go to **Backlog** view
2. Check boxes next to 2-3 stories you want to implement first
3. Click **"Create Sprint"**
4. Enter sprint name: "MVP Features"
5. Click **"Start Planning"**

**The Central Reasoning Engine (CRE) will:**
- Analyze your stories and codebase
- Generate an **Implementation Plan** with sequencing and dependencies
- Create **Inspection Assertions** to verify correctness

6. **Review the plan** when it appears
7. Click **"Approve Plan"** if satisfied (or iterate with questions)

### Step 6: Choose Implementation Mode (30 seconds)

After plan approval, choose how to implement:

- **🤖 Automated Mode**: Claude orchestrates the entire sprint (recommended for clear requirements)
- **👤 Human-Controlled Mode**: You control each story manually (better for exploration)

For your first sprint, try **Automated Mode**:
1. Click **"Automated Implementation"**
2. Review the orchestration plan
3. Click **"Start"**

**Claude will now:**
- Implement each story in sequence
- Validate acceptance criteria after each story
- Run automated code review
- Fix any issues found
- Provide a completion summary

You can **Pause** or **Stop** at any time.

### Step 7: Review Results (1 minute)

When the sprint completes:

1. Check the **Sprint Completion Summary**:
   - Stories completed
   - Cost and duration
   - Code review findings (if any)

2. View your code in your project directory

3. Test the implementation

4. Click **"Close Sprint"** to archive

---

## What Just Happened?

You experienced Puffin's core workflow:

```
Specifications → User Stories → Sprint Planning (CRE) →
Implementation Plan → Automated Execution → Code Review → Completion
```

**Unlike traditional AI coding:**
- ✅ Stories are **structured and traceable**
- ✅ Implementation is **planned with dependencies**
- ✅ Correctness is **verified with assertions**
- ✅ Context is **preserved in the Code Model**
- ✅ Progress is **tracked across sessions**

---

## Key Concepts to Understand

### Branches (Conversation Organization)

Puffin organizes conversations into branches:

| Branch | Purpose |
|--------|---------|
| **Specifications** 📋 | Requirements and user stories |
| **Architecture** 🏗️ | System design and technical decisions |
| **UI** 🎨 | Frontend development |
| **Backend** ⚙️ | API and business logic |
| **Deployment** 🚀 | Infrastructure and CI/CD |

Use branches to keep context focused. Switch branches with the dropdown at top.

### Central Reasoning Engine (CRE)

The CRE transforms user stories into deterministic implementations:

1. **Plan Generation**: Analyzes dependencies, determines sequence, assigns branches
2. **RIS Generation**: Creates Ready-to-Implement Specifications (detailed instructions)
3. **Code Model**: Tracks your codebase structure (h-DSL)
4. **Introspection**: Updates Code Model after each implementation

**Result**: Same RIS → equivalent implementations across runs (deterministic)

### Memory Plugin

Puffin **automatically extracts knowledge** from conversations:

- **Facts**: Technology stack, dependencies, schemas
- **Architectural Decisions**: Design choices and trade-offs
- **Conventions**: Coding standards, naming patterns
- **Bug Patterns**: Common issues and workarounds

This knowledge is **auto-injected** into future Claude sessions via `CLAUDE.md`, so you never repeat context.

### Sprint States

Sprints progress through states:

```
Created → Planning → Planned → Implementing →
Code Review → Bug Fixing → Completed
```

- **Planning**: CRE generates implementation plan
- **Implementing**: Stories being executed (automated or manual)
- **Code Review**: Automated review identifies issues
- **Bug Fixing**: Issues addressed in sequence
- **Completed**: Sprint closed with summary

---

## Essential Views

| Tab | What It Does |
|-----|-------------|
| **Config** ⚙️ | Project settings, coding preferences |
| **Prompt** 💬 | Main Claude interaction area |
| **Backlog** 📋 | User story management (Kanban) |
| **Sprint** 🏃 | Active sprint progress tracking |
| **Architecture** 🏗️ | System design documentation |
| **Excalidraw** 📐 | AI-powered diagram generation |
| **Editor** 📝 | Code editor with inline prompt markers |
| **CLI Output** 🖥️ | Raw Claude output (debugging) |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Submit prompt |
| `Ctrl+Shift+D` | Toggle SAM debugger |
| `Ctrl+M` | Insert Puffin marker (in Editor) |
| `Escape` | Close modal |

---

## Tips for Success

### 1. Start Small
Your first sprint should be **2-3 simple stories**. Learn the workflow before tackling complex features.

### 2. Write Clear Specs
The better your specifications, the better the derived stories. Be specific about:
- What users should be able to do
- What data needs to persist
- What the UI should show

### 3. Trust the CRE
Let the CRE plan your implementation. It analyzes dependencies better than humans and maintains architectural consistency.

### 4. Use Automated Mode
For well-defined requirements, automated sprint implementation is faster and more consistent than manual.

### 5. Review Memory
Check `.puffin/memory/branches/*.md` to see what Puffin has learned about your project. Edit if needed.

### 6. Leverage Excalidraw
Generate architecture diagrams from your docs: **Excalidraw** → **New from Doc** → select markdown → choose diagram type

### 7. Check Assertions
After implementation, view inspection assertions in story cards to see what was verified.

---

## Common Issues

### "Claude not found"
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### "Authentication required"
```bash
claude auth
```
Browser opens for login.

### App crashes on startup (Windows/WSL users)
**Problem**: Native modules compiled for wrong platform.

**Solution**: Run `npm install` from **Windows PowerShell/CMD**, not WSL:
```powershell
cd C:\Users\yourname\code\puffin
rm -r node_modules
npm install
```

### Stories not persisting
Check that `.puffin/puffin.db` exists in your project. If missing, database failed to initialize.

### CRE plan generation fails
Check **CLI Output** view → **Raw JSON** tab for detailed errors. Common causes:
- Claude API rate limit
- Invalid JSON schema
- Network timeout

---

## Next Steps

### Learn More Features

- **[User Manual](USER_MANUAL.md)** - Complete documentation of all features
- **[CRE Specification](CENTRAL_REASONING_ENGINE.md)** - How the reasoning engine works
- **[Memory Plugin](summaries/memory-summary.md)** - Knowledge extraction details

### Explore Plugins

- **Excalidraw**: Generate diagrams from docs (Architecture → Excalidraw tab)
- **Document Editor**: Edit code with inline Puffin markers (`/@puffin: ... @/`)
- **h-DSL Viewer**: Visualize your Code Model structure
- **RLM Documents**: Analyze large documents with Recursive Language Model

### Advanced Workflows

- **Manual Sprint Implementation**: Control each story execution
- **Branch Memory**: Edit `.puffin/memory/branches/*.md` for custom context
- **Custom Plugins**: Build your own plugins ([Plugin Architecture](plugin-architecture/))
- **Git Integration**: Use built-in Git panel for commits, branches, PRs

---

## Getting Help

- **Q&A Discussions**: [github.com/jdubray/puffin/discussions](https://github.com/jdubray/puffin/discussions/categories/q-a)
- **GitHub Issues**: [github.com/jdubray/puffin/issues](https://github.com/jdubray/puffin/issues)
- **Video Introduction**: [Watch on YouTube](https://youtu.be/RzgzaSNgs1w)
- **Changelog**: [CHANGELOG.md](../CHANGELOG.md) - Full version history

---

**Ready to build? Open Puffin and start your first project!** 🚀

*For deployment, CI/CD, and production concerns, see the [Deployment Guide](DEPLOYMENT.md) (coming soon).*
