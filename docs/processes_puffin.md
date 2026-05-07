Excellent inventory. Now thinking from first principles — software engineering processes first, Puffin capabilities second.

---

# Puffin Process Map

## Mental Model First: Software Engineering Lifecycle

Before mapping Puffin, the full SE lifecycle looks like this:

```
DISCOVER → SPECIFY → DESIGN → PLAN → BUILD → VERIFY → SHIP → ITERATE
```

Each phase has sub-processes. Here is the complete map.

---

## Process Map

### PHASE 0 — Project Bootstrap

*Before writing a single line of code or prompt.*

| Process | Puffin Capability |
|---|---|
| Open / configure a project | `Config` tab → set project path, model, preferences |
| Connect GitHub identity | `Config` → GitHub section → authenticate with PAT |
| Create a working branch | Header git pill → create branch (or via sprint) |
| Configure Claude context | `claude-config-plugin` → edit `CLAUDE_{branch}.md` |
| Install Claude agents/plugins | `Config` → Plugins/Agents section |
| Set UI guidelines & design tokens | `Config` → Design Guidelines section |
| Profile setup | Profile modal → developer profile |

**Recommended workflow entry:** Create a git branch before starting any work. This isolates changes and enables clean merge/commit later.

---

### PHASE 1 — Discovery & Specification

*Understanding the problem and producing a written spec.*

| Process | Puffin Capability |
|---|---|
| **Vibe exploration** — talk to Claude freely, explore ideas, ask questions | `Prompt` tab → type freely → Send |
| Ask side questions without modifying files | `? Ask` button (BTW panel) |
| Load existing spec/docs for context | `Include Docs` dropdown → attach a `.md` file |
| Produce a written specification | Prompt: *"Write a spec for [feature]"* → thread saves output |
| Save spec to `docs/` | `plan:saveToDocs` (via sprint plan review modal) |
| Load reference designs | `excalidraw-plugin` → attach diagram to prompt via `Include GUI` |
| Analyse large documents | `rlm-document-plugin` → recursive exploration of long docs |
| Generate CLAUDE.md context | `state:generateClaudeMd` — auto-generates project config files |

**Decision point:** Has a written spec emerged? → proceed to Phase 2. Still exploring? → stay in Phase 1.

---

### PHASE 2 — Architecture & Design

*Translating spec into structure.*

| Process | Puffin Capability |
|---|---|
| Sketch architecture diagrams | `excalidraw-plugin` → freehand or prompted diagrams |
| Design UI components | `excalidraw-plugin` → wireframes attached to prompts |
| Define UI guidelines | `Config` → Design Guidelines → tokens, component patterns |
| Ask Claude to critique an architecture | Prompt tab + Include Docs (attach spec) |
| Capture design decisions in thread | Prompt tab → thread persists all exchanges |
| Create handoff summary of design | `SHOW_HANDOFF_REVIEW` action → handoff modal |

---

### PHASE 3 — Decomposition (Spec → Stories)

*Breaking work into implementable units.*

| Process | Puffin Capability |
|---|---|
| **Derive stories automatically** from a conversation or spec | `Derive Stories` button → AI parses thread and produces user stories |
| **Manually add a story** | `Backlog` tab → Add Story modal |
| Edit / refine derived stories | Story derivation review flow → edit inline, request changes |
| Review and approve story batch | Story derivation → mark ready → Add to Backlog |
| Delete or archive a story | Backlog → delete / archive actions |
| Restore archived story | `state:getArchivedStories` → restore |
| Export story generations | `state:exportStoryGenerations` |

**Key insight:** Stories should be vertical slices (user-visible behaviour), not horizontal tasks (implementation steps). The AI derivation tends to produce this naturally.

---

### PHASE 4 — Sprint Planning

*Grouping stories into an implementable batch.*

| Process | Puffin Capability |
|---|---|
| Create a sprint | `Backlog` → Create Sprint → select stories |
| Standard plan generation | Sprint → Approve Plan → Claude produces implementation plan |
| **CRE plan generation** (Cognitive Review Engine) | Sprint → Approve with CRE → structured plan + RIS + assertions |
| Review and iterate the plan | Plan Review modal → iterate / approve |
| Answer CRE clarification questions | CRE question modal (auto-surfaced during planning) |
| Review Requirements Integration Summary | RIS View modal (per story) |
| Generate inspection assertions | CRE → per-story assertions auto-generated from RIS |
| Set implementation mode | Post-approval modal → Automated or Human-Controlled |
| Schedule a sprint | Sprint Schedule modal |

---

### PHASE 5 — Implementation

*Writing the code.*

#### 5A — Vibe Coding (unstructured, fast)

| Process | Puffin Capability |
|---|---|
| Type a prompt, Claude implements | `Prompt` tab → type → Send |
| Attach a GUI design to guide the implementation | `Include GUI` dropdown → select excalidraw design |
| Include reference docs | `Include Docs` dropdown |
| Set thinking budget for complex tasks | Thinking budget selector (none / think / think hard / think harder / superthink) |
| Visual feedback loop (Claude sees browser) | Puppeteer loop toggle → Claude screenshots after each change |
| Resume mid-conversation | Thread history → select existing thread |
| Start a new thread | `Create New Thread` button |

#### 5B — Sprint Execution (structured)

| Process | Puffin Capability |
|---|---|
| Start story implementation (human-controlled) | Sprint panel → story → Start Implementation |
| Automated orchestration | Post-plan modal → Automated → Claude runs all stories sequentially |
| Pause / resume orchestration | Orchestration controls → Pause / Resume |
| Stop orchestration | Orchestration → Stop |
| Track per-story progress | Sprint panel → per-story status badges |
| View completion summary per story | Completion Summary modal |
| Track outcomes (desired states) | `outcome-lifecycle-plugin` → outcome DAG lifecycle |
| View code model / h-DSL annotations | `hdsl-viewer-plugin` → schema + instance viewer |

---

### PHASE 6 — Verification & Testing

*Checking the work is correct.*

| Process | Puffin Capability |
|---|---|
| Auto-generate inspection assertions (CRE path) | CRE → assertion generation from RIS |
| Manually generate assertions | `state:generateSprintAssertions` |
| Evaluate assertions against codebase | `state:evaluateStoryAssertions` → pass/fail per assertion |
| View assertion failures | Assertion Failures modal |
| View per-assertion details | Assertion Details modal |
| Validate acceptance criteria | Criteria Validation flow → per-story criteria checks |
| Visual regression (via Puppeteer) | Puppeteer loop → screenshot comparison (implicit) |
| Run automated code review | Sprint Close → Code Review phase |

---

### PHASE 7 — Code Review & Bug Fix

*Structured quality gate before shipping.*

| Process | Puffin Capability |
|---|---|
| Trigger code review | Sprint Close modal → code review initiates |
| View review findings | Code Review findings panel |
| Track finding status | `UPDATE_FINDING_STATUS` → per-finding resolution |
| Automated bug fix phase | Post-review → Bug Fix Phase → Claude fixes findings |
| Track per-finding fix progress | `START_FIXING_FINDING` / `COMPLETE_FIXING_FINDING` |
| Complete bug fix phase | `COMPLETE_BUG_FIX_PHASE` → proceed to commit |

---

### PHASE 8 — Documentation & Handoff

*Capturing what was built.*

| Process | Puffin Capability |
|---|---|
| Generate thread handoff summary | Handoff modal → AI summarises thread |
| Save plan to docs | Sprint Plan Review → Save to Docs |
| Write/edit documentation files | `document-editor-plugin` → markdown/code editor |
| Browse existing docs | `document-viewer-plugin` → tree navigation + preview |
| Manage prompt templates | `prompt-template-plugin` → save/reuse prompt patterns |
| Export UI guidelines | `state:exportUiGuidelines` |

---

### PHASE 9 — Commit & Ship

*Getting code into version control and deployed.*

| Process | Puffin Capability |
|---|---|
| Stage files | `git:stageFiles` |
| Commit with AI-generated message | Sprint Close → auto-generates commit message from session |
| Create feature branch | `git:createBranch` (done pre-sprint ideally) |
| Merge branch | `git:merge` |
| Delete branch post-merge | `git:deleteBranch` |
| Start local dev server | `webserver:start` → serves project locally |
| Open preview URL | `webserver:openUrl` |
| Stop server | `webserver:stop` |
| Push to GitHub | (via git:commit + external PR workflow) |

---

### PHASE 10 — Iteration & Monitoring

*After shipping, learning and improving.*

| Process | Puffin Capability |
|---|---|
| View sprint history | `Backlog` → Sprint History tab |
| Rerun a previous sprint | Sprint History → Rerun Sprint |
| View usage statistics | `stats-plugin` → usage across branches/components |
| View calendar of activity | `calendar-plugin` → monthly activity grid |
| View metrics per story | `metrics:storyMetrics` → token cost, duration, turns |
| Review component performance | `metrics:componentStats` |
| Archive completed stories | Auto-archive after N weeks |
| Browse notification history | `toast-history-plugin` |

---

## Workflow Decision Tree

```
START
│
├── "I have an idea but no code yet"
│     └── Phase 0 (bootstrap) → Phase 1 (vibe exploration) → Phase 3 (derive stories) → Phase 4 (sprint)
│
├── "I have a spec, ready to build"
│     └── Phase 3 (paste spec → derive stories) → Phase 4 (sprint plan) → Phase 5B (sprint exec)
│
├── "I want to quickly try something"
│     └── Phase 5A (vibe coding) — skip planning entirely
│
├── "I need to fix a bug"
│     └── Phase 1 (describe bug in prompt) → Phase 5A (prompt: fix this bug) → Phase 6 (verify)
│
├── "I want structured, verified delivery"
│     └── Phase 3 → Phase 4 (CRE plan) → Phase 5B (automated) → Phase 6 (assertions) → Phase 7 (review) → Phase 9 (commit)
│
├── "I want to refactor"
│     └── Phase 1 (document goals) → Phase 4 (sprint with refactor stories) → Phase 5B → Phase 6
│
└── "I want to deploy what I built"
      └── Phase 8 (docs/handoff) → Phase 9 (commit/merge/server)
```

---

## Process Priority for "What's next?" Recommendations

This ordering should drive the NBA (Next Best Action) logic — suggestions ranked by phase readiness:

| Priority | Trigger condition | Recommendation |
|---|---|---|
| 1 | No project path set | Configure project path in Config |
| 2 | No git branch (on main) | Create a working branch |
| 3 | No threads, no stories | Start with a vibe prompt or paste your spec |
| 4 | Has threads, no stories | Derive user stories from your conversation |
| 5 | Has stories, no sprint | Create a sprint from your backlog stories |
| 6 | Has sprint, no plan | Generate an implementation plan (standard or CRE) |
| 7 | Has plan, not approved | Review and approve the sprint plan |
| 8 | Has approved sprint, stories pending | Start implementing — run the sprint |
| 9 | Sprint in progress | Continue implementation or check story progress |
| 10 | All stories completed, no review | Run code review before committing |
| 11 | Review done, no commit | Commit and optionally merge |
| 12 | Post-commit, no new stories | Plan the next sprint or explore new features |

---

This process map is the source of truth for what the "What's next?" guidance engine should know. Every leaf node in the decision tree maps to a concrete Puffin action, keeping recommendations grounded in what the tool can actually do.