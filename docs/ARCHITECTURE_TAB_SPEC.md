# Architecture Tab — Functional and Technical Specification

**Status:** Implemented in 4.1.0 (Phase 1) — 2026-09-14. Deviations from this spec are listed in §10.
**Target:** Puffin 4.1 (first feature after the 4.0.0 restart)
**Depends on:** [arch-lens](https://github.com/cognitive-fab/arch-lens) (the `archlens` Claude Code plugin/skill, v0.5.x) and its renderer, [archify](https://github.com/tt-a1i/archify)

---

## 1. Purpose

Puffin 4.0 is a documentation manager for teams building with Claude Code. Documentation has two halves: the prose (served today by the **Docs** tab) and the architecture — what the parts are, what moves between them, and what is guaranteed. The second half rots fastest, because every generated change can move a boundary without anyone drawing it.

The **Architecture** tab gives a project a living architecture that:

1. is **analysis-first** — the artifact is `<name>.analysis.json`, an evidence-carrying model (components, relations, boundaries, facts, glossary, questions); every diagram and every paragraph is compiled from it, so they cannot disagree;
2. is **question-driven** — a diagram exists because a question was asked, and the tab is organised by question, not by file;
3. **answers new questions** — in prose from what the analysis already says, or with a new diagram when the question deserves one;
4. **knows when it is stale** — the analysis pins a git revision and cites files; the tab shows drift and offers a refresh.

Phase 1 (this spec) delivers the tab. Phase 2 (sketched in §9) connects Kanban tasks to an architecture refresh, so finishing a task that touched a boundary re-checks the analysis.

### 1.1 What arch-lens provides (and what Puffin adds)

| Capability | Provided by | Puffin's role |
|---|---|---|
| Writing the analysis from code/docs | Claude Code + the `archlens` skill (`/archlens`, "map this architecture") | Launch it, in the project, from the tab |
| Validating, rendering diagrams + markdown | `archlens validate` / `render` / `doc` (CLI, no model) | Invoke, show results, surface `dropped` lines |
| Slicing the analysis near a question | `archlens ask --json` (CLI, no model, exit 3 when uncovered) | Invoke, render the slice, decide whether a model is needed |
| Drift and constraint checks | `archlens check --json` / `enforce --json` | Invoke on open/refresh, show the freshness badge |
| Reading a change against the analysis | `archlens review --json` | Phase 2: run per task/commit |
| Interactive HTML diagrams | archify (self-contained HTML per question) | Embed in the tab, navigate between them |

Puffin does **not** re-implement any analysis, layout or rendering. It is the workbench around the CLI.

### 1.2 Reference data set

`../cosa/docs/architecture/` (analysed 2026-09-14) is the fixture for development: `cosa.analysis.json` (38 components, 54 relations, 4 boundaries, 25 facts, 24 glossary terms, 9 questions), one `q_<id>.architecture.html` + `.json` per question, and the generated `README.md`. The tab must open this directory with no configuration beyond the project path.

---

## 2. Scope

### In scope (Phase 1)

- A new **Architecture** nav tab, sibling of **Docs**, implemented as a bundled Puffin plugin.
- Discovery and loading of the project's analysis and rendered diagram set.
- Question navigator, diagram viewer, and per-question reading pane (answer, context, narrative, components, omissions, terms).
- Model browser: components, relations, boundaries, facts; and a glossary panel.
- Freshness: `check` on open, drift badge, re-render / re-check actions.
- **Ask**: type a question → instant slice from `archlens ask` → optional prose answer from a model → optional "answer with a diagram" that extends the analysis via Claude Code and re-renders.
- First-run path when a project has no analysis ("Map this architecture").
- Settings: archlens location, analysis file, diagrams directory, model for prose answers.

### Out of scope (Phase 1)

- Editing the analysis JSON by hand inside Puffin (use the Editor tab; the tab reloads on change).
- Task ↔ architecture linkage, `review` on commit, CI hooks (Phase 2).
- Comparing two analyses (`compare`) in the UI. The CLI supports it; a later phase may expose it.
- Non-code subjects (`system.domain: document`) get no special UI; they render through the same path.

---

## 3. Users and scenarios

**Developer joining a project.** Opens the Architecture tab, reads the questions in order, opens a diagram, reads the narrative and the terms. Never opens the JSON.

**Developer about to change something.** Asks "does the replica ever write to the database?". Gets the components, relations and facts that bear on it, with evidence paths, in under a second and with no model call. Clicks a component's evidence to open the file in the Editor tab.

**Developer who needs a picture.** Asks "what happens when an approval token expires?". The slice shows partial coverage. They choose *Answer with a diagram*; Puffin runs the archlens skill in Claude Code for the project; a new question and diagram appear in the navigator when the render finishes.

**Tech lead after a week of generated changes.** The tab shows *3 cited files changed since `bab9ff3`, 1 planned component now has evidence*. They click *Refresh analysis*, review what Claude changed in the analysis (the JSON is under git), and re-render.

**Writer maintaining the glossary.** Opens the Glossary panel, sees every term with its definition and which questions use it, and spots terms the narratives use but the glossary lacks (reported by `validate`).

---

## 4. Functional specification

### 4.1 Tab placement and states

- Nav button **Architecture** (icon `🏛`, order 56 — directly after **Docs**, before **Editor**).
- The tab has four top-level states:

| State | When | What is shown |
|---|---|---|
| **No archlens** | `archlens doctor` fails / CLI not found | Explanation, install instructions (`/plugin install archlens@arch-lens`, `npx skills add tt-a1i/archify -g`), a path field, *Re-check* |
| **No analysis** | no `*.analysis.json` in the project | "This project has no architecture analysis yet." Buttons: *Map this architecture* (runs Claude Code), *Seed from package.json / docker-compose.yml* (runs `archlens seed`, then opens the result), *Choose an existing analysis…* |
| **Analysis, no diagrams** | analysis found, `docs/architecture/` has no rendered HTML for its questions | Navigator shows questions greyed with *not rendered*; *Render all* button |
| **Ready** | analysis + diagrams | The layout in §4.2 |

### 4.2 Layout (Ready state)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ COSA · analysed at bab9ff3 · ● in sync   [Ask a question…            ] [Ask] │  header
│ [Refresh analysis] [Render all] [Check]                          [⚙ Settings]│
├──────────────┬─────────────────────────────────────────────┬─────────────────┤
│ QUESTIONS    │                                             │ READ            │
│ ▸ How an     │                                             │ Answer          │
│   email…     │                                             │ Context         │
│ ▸ Inside one │           diagram (archify HTML)            │ The long read   │
│   session    │           in a sandboxed iframe             │ Components (7)  │
│ ▸ …          │                                             │ Not shown       │
│──────────────│                                             │ Terms used here │
│ MODEL        │                                             │                 │
│ Components 38│                                             │                 │
│ Relations 54 ├─────────────────────────────────────────────┤                 │
│ Boundaries 4 │ light/dark · fit · open in browser · source │                 │
│ Facts 25     │                                             │                 │
│ Glossary 24  │                                             │                 │
└──────────────┴─────────────────────────────────────────────┴─────────────────┘
```

- Left rail (240 px, collapsible): **Questions** list, then **Model** sections. The right pane (360 px, collapsible) is the reading pane for whatever is selected.
- The centre is the diagram when a question is selected, or a table/list when a model section is selected.
- Layout state (selected item, pane widths, collapsed rails) is remembered per project in plugin storage.

### 4.3 Question navigator

- One row per entry in `analysis.questions`, in file order: `title`, a shape glyph (architecture ▦ / sequence ⇄), component count, and a status dot:
  - green — rendered and the HTML is newer than the analysis file;
  - amber — rendered but stale (analysis modified after the HTML);
  - grey — not rendered.
- Selecting a row loads its diagram (§4.4) and reading pane (§4.5).
- Row context menu: *Re-render this question* (`render --question <id>`), *Open HTML in browser*, *Copy question id*.
- A search box filters rows by title / ask / involved component names.

### 4.4 Diagram viewer

- The diagram is the archify page `docs/architecture/<qid>.<shape>.html` embedded in an `<iframe>` (§6.5). archify's own interactivity (guided views, source links, theme, hover cards) works unchanged.
- Toolbar: theme (light/dark, follows Puffin's theme by default), *Fit*, *Open in browser* (`shell.openExternal` on the file URL), *Open the sequence/architecture JSON* (Editor tab).
- Source links inside the diagram point at repository files. Clicks are intercepted (`postMessage` from the iframe, see §6.5) and routed to the Editor tab at the cited path and line, so navigation stays inside Puffin.
- `dropped` lines from the last render for this question (components left out, boundaries partially drawn, shortened details) are shown in a collapsible strip under the toolbar. A diagram that lost something says so.

### 4.5 Reading pane (question selected)

Rendered from the analysis (not from the generated README) so it is available even when a question is not yet rendered:

1. **Ask** — `question.ask` as the heading.
2. **Answer** — `question.answer`.
3. **Context** — `question.context`.
4. **The long read** — `question.narrative` (markdown → HTML via `window.puffin.marked`).
5. **Components** — table of `involves`: name, responsibility, status (`built`/`planned` badge), evidence links. `highlight` entries are marked.
6. **Facts** — the facts listed on the question (`kind` badge: doctrine / constraint / tradeoff / guarantee…, `claim`, `because`).
7. **Deliberately not shown** — `question.omits`.
8. **Terms used here** — glossary entries whose term (or `also` aliases) occurs in this question's prose or component names — the same rule archlens uses for its markdown.

Every component, fact and term is a link that selects it in the Model browser.

### 4.6 Model browser

Selecting a Model section replaces the diagram with a browser view; selecting an item fills the reading pane.

- **Components** — table: name, kind, status, detail, responsibility, boundary, #relations. Reading pane: full record, evidence links (open in Editor), `doc_refs`, relations in/out (each with `what_crosses`), questions it appears in (click → diagram).
- **Relations** — table: from → to, mechanism, summary, crosses. Reading pane: `what_crosses`, evidence, the questions that draw this edge.
- **Boundaries** — cards: label, kind, **claim**, members. Reading pane: claim, evidence, members, relations that cross it.
- **Facts** — grouped by kind. Reading pane: claim, because, evidence, `rule` (if any) with the latest `enforce` verdict.
- **Glossary** — alphabetical: term, aliases, definition, *used in* (questions). Search across term/alias/definition. A *Terms without definition* group lists words `validate` flagged (when available).

### 4.7 Freshness and maintenance

On tab open (and on every analysis change) Puffin runs `archlens check --json --repo-root <project>` and shows a badge in the header:

| Badge | Condition |
|---|---|
| ● **in sync** | `code.ok && documents.ok && code.ahead === 0` |
| ● **N commits ahead, M cited files changed** | `code.ok` but `ahead > 0` or `moved.length > 0` |
| ● **K built** | `code.built.length > 0` — planned components whose evidence now resolves |
| ● **stale: N citations gone** | `!code.ok` or `!documents.ok` |
| ○ **not a git repo** | `pinAvailable === false` and no revision |

Clicking the badge opens the check report: gone / moved / built lists, each path clickable.

Header actions:

- **Refresh analysis** — runs Claude Code in the project with the prompt in §6.6.3 (`check` findings are included so the model knows what moved). On completion, validates, re-renders, reloads.
- **Render all** — `archlens render <analysis> <diagrams-dir> --repo-root <project> --no-check` (the browser check is off by default, see §4.10; *Render with browser check* runs it); progress per question; the summary (diagrams delivered, links verified, dropped lines) is shown in a toast + the render log panel.
- **Check** — re-runs `check` and `enforce`; `enforce` violations are listed with the rule and the offending import edge.
- **Validate** — `archlens validate`; errors block rendering, warnings (TODOs, thin questions, missing glossary) are listed.

### 4.8 Ask — answering a question

The header's **Ask** box is the tab's main interaction. Submitting a question runs a three-stage flow; each stage is optional and the user decides whether to go further.

#### Stage 1 — the slice (instant, no model)

`archlens ask <analysis> "<question>" --json` returns the slice: `terms`, scored `components`, `relations`, `facts`, `questions`, `boundaries`, `glossary`, `unmatched`, `coverage`, `empty`.

The centre pane becomes the **Answer view**:

- **Coverage bar**: `coverage` (0–1) with the words matched and — prominently — `unmatched` words ("the analysis never mentions: *token*, *expires*").
- **Already answered?** — matched `questions` with score ≥ threshold, each with its answer and a *Open diagram* link. If one scores highly, it is offered first: most questions are already a question.
- **Components** (with responsibility, status, evidence), **Relations** (`what_crosses`), **Facts**, **Boundary claims**, **Terms** — all from the slice, ordered by score, each linking into the Model browser.
- If `empty` or `coverage` below the configured floor (default 0.4), the view says so plainly and offers only Stage 3 ("extend the analysis") — no model is asked to guess.

#### Stage 2 — a prose answer (one model call, no tools)

Button **Answer in prose**. Puffin builds a prompt from the slice (§6.6.1) and sends it through the configured prompt provider (`document-edit-service` routing: `api` with the configured Anthropic model, or the CLI one-shot `sendPrompt` with `disableTools: true, allowConcurrent: true`). The model is instructed to answer **only** from the slice, cite components by name and relations as `A -> B`, and say what the slice does not cover.

The answer is rendered under the slice with its citations linked. Actions: *Copy*, *Save as note* (appends to `docs/architecture/questions.md` — see §6.3), *Turn into a diagram* (→ Stage 3).

#### Stage 3 — a diagram (extend the analysis)

Button **Answer with a diagram** / **Extend the analysis**. Puffin submits `/archlens <question>` to Claude Code in the project (the interactive path, §6.6.2). The skill decides shape (architecture vs sequence), adds the question to the analysis with answer/context/narrative, validates, renders one diagram, and replies.

- The tab shows the session status (streaming output is available in the CLI Output tab as usual); the Architecture tab itself shows a compact progress card: *reading sources → writing analysis → validating → rendering → done*, driven by the file watcher (analysis changed → diagram HTML appeared) rather than by parsing the model's text.
- On completion the navigator refreshes and selects the new question. The model's reply (its plain-words answer) is shown in the reading pane above the analysis-derived sections until the user navigates away.
- If the session ends without a new question in the analysis, the reply is shown as-is with a warning.

Ask history (question, timestamp, stage reached, resulting question id) is kept per project in plugin storage and listed under the Ask box.

### 4.9 First run — "Map this architecture"

When there is no analysis, the primary button submits a prompt to Claude Code:

> Map this project's architecture with archlens. Write `docs/architecture/<name>.analysis.json`, validate it, and render into `docs/architecture` with `--repo-root .`. Start with the questions a newcomer would ask first.

`<name>` is derived from the project directory name (kebab-case). Optional inputs on the dialog: a focus ("start with the request pipeline"), a documents-only source ("analyse only docs/DESIGN.md"), and the seed option.

### 4.10 Settings (plugin configuration)

| Key | Default | Meaning |
|---|---|---|
| `architecture.archlensPath` | auto | Path to `archlens.mjs`; auto-probe order in §6.4 |
| `architecture.analysisFile` | auto | Project-relative path to the analysis; auto = first `*.analysis.json` under `docs/architecture/`, then anywhere (excluding `node_modules`) |
| `architecture.diagramsDir` | `docs/architecture` | Where renders go |
| `architecture.answerModel` | inherits `promptProvider` / `anthropic.model` | Model for Stage 2 prose answers |
| `architecture.coverageFloor` | `0.4` | Below this, Stage 2 is not offered |
| `architecture.checkOnOpen` | `true` | Run `check` when the tab opens |
| `architecture.renderBrowserCheck` | `false` | Pass archify's headless-Chrome visual check on render (slow); off by default, available as *Render with browser check* |
| `architecture.followTheme` | `true` | Diagram theme follows Puffin |

Settings live in the plugin's `contributes.configuration` and are surfaced in the existing plugin settings UI; `archlensPath` is also editable from the *No archlens* state.

### 4.11 Non-functional

- Opening the tab on the COSA fixture (9 questions, 700 KB HTML each) must show the first diagram in < 1.5 s on a warm cache; slices (`ask`) in < 1 s.
- No model call happens without an explicit click (Stage 2/3, Refresh, Map). Everything else is deterministic CLI.
- All CLI invocations are project-scoped: `cwd` = project root, paths validated to stay inside the project.
- Works offline except for Google Fonts in archify pages (falls back to system monospace) and the model stages.
- Help-mode tooltips (`data-help`) on every control, consistent with the rest of 4.0.

---

## 5. Technical overview

```
renderer                                   main
┌──────────────────────────────┐          ┌───────────────────────────────────┐
│ ArchitectureView (plugin UI) │          │ architecture-plugin/index.js      │
│  ├ QuestionNavigator         │  IPC     │  ├ analysis-store.js  (load/watch)│
│  ├ DiagramFrame (iframe)     │◄────────►│  ├ archlens-runner.js (spawn CLI) │
│  ├ ReadingPane               │ plugins: │  ├ ask-service.js     (slice→ans) │
│  ├ ModelBrowser              │ invoke   │  └ diagram-server.js  (html read) │
│  ├ AskPanel                  │          │        │            │             │
│  └ StatusBar / Settings      │          │        ▼            ▼             │
└──────────────────────────────┘          │  archlens.mjs   claudeService     │
                                          │  (child proc)   submit/sendPrompt │
                                          └───────────────────────────────────┘
                                                     │
                                                     ▼
                                   <project>/docs/architecture/*.analysis.json
                                   <project>/docs/architecture/q_*.html/.json
```

Implemented as a bundled plugin `plugins/architecture-plugin/`, following the `document-viewer-plugin` shape: `puffin-plugin.json` contributes a nav view; `index.js` registers IPC handlers via `context.registerIpcHandler`; renderer components are vanilla ES modules loaded by `plugin-component-loader.js`; styles injected by `style-injector.js`. No changes to `index.html` nav markup are needed — `sidebar-view-manager.js` places the view from the manifest.

---

## 6. Technical specification

### 6.1 Plugin manifest (`plugins/architecture-plugin/puffin-plugin.json`)

```json
{
  "name": "architecture-plugin",
  "version": "1.0.0",
  "displayName": "Architecture",
  "description": "Question-driven architecture diagrams and answers, compiled from an arch-lens analysis",
  "main": "index.js",
  "extensionPoints": {
    "ipcHandlers": [
      "architecture:status", "architecture:load", "architecture:listQuestions",
      "architecture:getQuestion", "architecture:getDiagram", "architecture:ask",
      "architecture:answer", "architecture:extend", "architecture:map",
      "architecture:render", "architecture:check", "architecture:validate",
      "architecture:enforce", "architecture:seed", "architecture:openEvidence",
      "architecture:getAskHistory", "architecture:saveNote", "architecture:doctor"
    ],
    "components": ["architecture-view"]
  },
  "contributes": {
    "views": [{ "id": "architecture-view", "name": "Architecture", "location": "nav",
                "icon": "🏛", "order": 56, "component": "ArchitectureView" }],
    "commands": [
      { "id": "architecture.ask", "title": "Ask an architecture question", "category": "Architecture" },
      { "id": "architecture.refresh", "title": "Refresh architecture analysis", "category": "Architecture" },
      { "id": "architecture.render", "title": "Render architecture diagrams", "category": "Architecture" }
    ],
    "configuration": { "title": "Architecture", "properties": { "...": "see §4.10" } }
  },
  "activationEvents": ["onStartup"],
  "renderer": {
    "entry": "renderer/components/index.js",
    "components": [{ "name": "ArchitectureView", "export": "ArchitectureView", "type": "class" }],
    "styles": ["renderer/styles/architecture.css"]
  }
}
```

### 6.2 Main-process modules

#### `analysis-store.js`

- `discover(projectPath, configuredPath?) → { analysisPath, diagramsDir } | null`. Search order: configured; `docs/architecture/*.analysis.json`; `**/*.analysis.json` excluding `node_modules`, `.git`, `dist`. If several, prefer the one under `docs/architecture`, else the most recently modified; the choice is reported so the UI can offer a picker.
- `load() → AnalysisModel` — parses JSON, builds indexes: `componentsById`, `relationsByComponent`, `boundaryOfComponent`, `questionsByComponent`, `factsById`, `glossaryIndex` (term + aliases → entry). Never throws on a semantically thin analysis — `validate` is the authority; the store only needs valid JSON.
- `renderState() → { [questionId]: { htmlPath, jsonPath, rendered, stale, dropped[] } }` — compares mtimes of `q_<id>.<shape>.html` vs the analysis; reads `dropped` from the render log (§6.2 `archlens-runner`) when present.
- `termsForQuestion(question) → GlossaryEntry[]` — the archlens rule: an entry is used when its `term` or any `also` alias occurs (case-insensitive, word-bounded) in `ask + answer + context + narrative + omits` or in an involved component's `name/detail/responsibility`.
- **Watching**: `fs.watch` on the diagrams directory and the analysis file (debounced 300 ms). Emits `architecture:changed { kind: 'analysis' | 'diagram', questionId? }` to the renderer via `context.sendToRenderer` (the same mechanism `sync-watcher.js` uses). The renderer reloads what changed; a new `q_*.html` during an *extend* run is what advances the progress card.

#### `archlens-runner.js`

- `resolveArchlens(configuredPath?) → { binPath, source }`, probe order:
  1. `architecture.archlensPath` (config);
  2. `ARCHLENS_BIN` env;
  3. `~/.claude/plugins/cache/arch-lens/archlens/<highest semver>/skills/archlens/bin/archlens.mjs` (the plugin install; read `~/.claude/plugins/installed_plugins.json` first for the exact `installPath`);
  4. `~/.claude/skills/archlens/bin/archlens.mjs` (the `install-skill.mjs` location);
  5. `<project>/../archlens/skills/archlens/bin/archlens.mjs` (sibling checkout, dev convenience).
  Cached; re-probed on *Re-check*.
- `run(args, { cwd, timeoutMs, onLine }) → { code, stdout, stderr, json? }` — `spawn(process.execPath, [binPath, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })`. Electron 43 bundles Node ≥ 22, which archlens requires, so no `node` on PATH is assumed; `doctor` reports the Node version that ran. Windows: no `shell: true` (args carry quoted questions and long paths — the same lesson as the CLI `--json-schema` bug). `taskkill /T /F` for cancellation, reusing the `_killProcess` pattern.
- Typed wrappers: `doctor()`, `validate(a)`, `questions(a)`, `render(a, outDir, { question?, repoRoot })`, `doc(a, outMd)`, `ask(a, q)` (parses `--json`; exit 3 → `{ empty: true, ... }` not an error), `check(a, repoRoot)`, `enforce(a, repoRoot)`, `review(a, repoRoot, base?)`, `seed(source, out, name?)`.
- Render output is parsed line-by-line for the per-question progress (`delivered`, `dropped:` lines, `verified N links`) and persisted to `.puffin/architecture/last-render.json` so `dropped` lines survive a restart.
- All paths passed to the CLI are resolved and asserted to be inside the project (`path.relative` has no `..`), except `binPath`.

#### `ask-service.js`

- `slice(question) → AskSlice` — `archlens ask --json`, then hydrates ids into records from `analysis-store` (the CLI returns ids + scores only) and computes `alreadyAnswered` (matched questions with score ≥ `max(1.0, 0.6 × top score)`).
- `answer(question, slice, { provider, model }) → { success, response, citations[] }` — builds the prompt in §6.6.1, calls `documentEditService.editDocument({ prompt, provider, config, claudeService })` (the 4.0 provider router — it already handles `api` vs `cli`, `disableTools`, `allowConcurrent`). Post-processes the response: every `**Name**` matching a component name and every `A -> B` matching a relation becomes a citation link; unknown citations are flagged.
- `extend(question) → { sessionId }` — see §6.6.2; delegates to `claudeService.submit`.
- History: `context.storage` (plugin storage under `~/.puffin/plugin-data/architecture-plugin/<projectHash>/ask-history.json`), capped at 200 entries.

#### `diagram-server.js`

- `getDiagram(questionId) → { html, shape, mtime }` — reads the archify HTML from disk, validates the path is inside `diagramsDir`, injects the bridge script (§6.5) before `</body>`, and returns the string. Size guard: refuse > 8 MB with a clear error.
- `openEvidence({ path, line }) → { ok }` — validates the path against the project root and forwards to the document-editor plugin's `openFile` action via `context.getService('pluginActions')` (falls back to `shell.showItemInFolder`).

### 6.3 On-disk layout (project)

```
docs/architecture/
  <name>.analysis.json          the artifact (under git)
  README.md                     archlens doc output (regenerated by render)
  q_<id>.architecture.html      one per architecture question (archify)
  q_<id>.architecture.json      archify spec (generated, never edited)
  q_<id>.sequence.html/.json    sequence questions
  q_*.visual-check.*            archify browser-check output (ignored by the tab; may be gitignored)
  questions.md                  Puffin: saved prose answers (Stage 2 "Save as note"), appended, markdown
.puffin/architecture/
  last-render.json              per-question render summary + dropped lines
  last-check.json               last check/enforce result + timestamp
```

Nothing in `.puffin/architecture/` is required; the tab works from `docs/architecture/` alone.

### 6.4 IPC contract

All channels are plugin-qualified (`architecture:<name>`) and invoked from the renderer via `window.puffin.plugins.invoke('architecture-plugin', '<name>', args)`. Every handler returns `{ success, ...data }` or `{ success: false, error, code? }`; it never throws across IPC.

| Handler | Args | Returns |
|---|---|---|
| `status` | — | `{ state: 'no-archlens'\|'no-analysis'\|'no-diagrams'\|'ready', archlens: {binPath, source, version}, analysisPath, diagramsDir, candidates[] }` |
| `doctor` | `{ path? }` | `archlens doctor` result |
| `load` | `{ analysisPath? }` | `{ system, counts, questions: [{id,title,ask,shape,involvesCount,renderState}], glossary, boundaries }` (summary; full records fetched lazily) |
| `listQuestions` | — | the `questions` array above |
| `getQuestion` | `{ id }` | full question + hydrated involves/facts/terms + renderState + dropped |
| `getDiagram` | `{ id }` | `{ html, shape, mtime }` |
| `getComponent` / `getRelation` / `getBoundary` / `getFact` | `{ id }` | hydrated record with back-references |
| `ask` | `{ question }` | `AskSlice` |
| `answer` | `{ question, slice? }` | `{ response, citations, provider, model }` |
| `extend` | `{ question }` | `{ started: true }` — progress via `architecture:changed` events + the normal `claude:*` stream |
| `map` | `{ focus?, sourcesOnly?, name? }` | `{ started: true }` |
| `render` | `{ questionId? }` | `{ delivered[], dropped[], verifiedLinks, log }` |
| `check` | — | `check --json` + `enforce --json`, persisted |
| `validate` | — | `{ errors[], warnings[] }` |
| `seed` | `{ source }` | `{ analysisPath }` |
| `openEvidence` | `{ path, line? }` | `{ ok }` |
| `getAskHistory` / `saveNote` | — / `{ question, answer }` | history / `{ ok }` |
| `cancel` | — | kills a running archlens process (not the Claude session — that is the global Cancel) |

Events (main → renderer, via `context.sendToRenderer`): `architecture:changed { kind, questionId? }`, `architecture:progress { op: 'render'|'check'|'extend', step, detail }`.

### 6.5 Embedding archify HTML

archify pages are single self-contained HTML files (inline CSS/JS; only Google Fonts are external). They are shown in an `<iframe sandbox="allow-scripts allow-same-origin" srcdoc="…">`:

- `srcdoc` rather than `src="file://…"`: the content passes through `diagram-server`, which is where path validation and the bridge injection happen, and no `file://` navigation is exposed to the sandboxed renderer.
- `allow-same-origin` is required for archify's own `localStorage` (theme, guided-view state) and for `postMessage` to carry a stable origin; `allow-top-navigation` and `allow-popups` are **not** granted, so a link in the page cannot navigate Puffin.
- **Bridge script** (injected): intercepts clicks on `a[href]` — repository source links (matching the `system.repository.url` prefix or relative paths) become `parent.postMessage({ type: 'archlens:open', path, line })`; other `http(s)` links become `{ type: 'archlens:external', url }` (Puffin opens via `shell.openExternal`); in-page anchors are left alone. It also forwards `{ type: 'archlens:theme' }` requests from Puffin to archify's theme toggle when `followTheme` is on.
- The iframe's CSP inherits Puffin's; if Puffin's CSP blocks `fonts.googleapis.com`, archify's font stack falls back cleanly. No change to CSP is required.
- Memory: one iframe at a time; switching questions replaces `srcdoc`. Prefetching the next/previous question's HTML into memory is allowed (≤ 3 cached).

### 6.6 Model invocations

Puffin never asks a model to *invent* architecture. It asks in three narrowly defined ways.

#### 6.6.1 Prose answer (Stage 2) — one-shot, no tools

Provider: `document-edit-service.editDocument({ prompt })` → `api` (Anthropic Messages, default `claude-haiku-4-5-20251001`, `max_tokens` from config) or `cli` (`sendPrompt` with `model`, `disableTools: true`, `allowConcurrent: true`, `maxTurns: 1`). Prompt shape:

```
You answer questions about a software system strictly from an architecture analysis
slice. Do not use outside knowledge. If the slice does not support a claim, say the
analysis does not cover it.

Cite components as **Name**, relations as `from_id -> to_id`, facts by their claim.
Answer in at most 200 words, then a line "Not covered: ..." listing question words the
analysis never mentions (given below), or "Not covered: nothing".

## Question
<question>

## Slice (from `archlens ask`)
### Components        (id, name, status, responsibility, evidence paths)
### Relations         (from -> to, mechanism, summary, what_crosses)
### Boundary claims   (label, claim)
### Facts             (kind, claim, because)
### Questions already answered (title, answer)
### Terms             (term, definition)
### Unmatched words   <unmatched list>
```

The slice is capped (top 12 components, 20 relations, 10 facts, 5 questions, 12 terms) to keep the prompt under ~6 k tokens.

#### 6.6.2 Extend with a diagram (Stage 3) — interactive Claude Code session

Uses `claudeService.submit()` — the same path as the Prompt tab — so the run is visible in CLI Output, respects the single-process guard, is cancellable, and is recorded in history. Prompt:

```
/archlens <question>
```

with a short preamble when Puffin knows more than the skill would: the analysis path (if it is not the only one), the diagrams dir, and `--repo-root .`. The skill's own SKILL.md governs the rest (decide ask vs draw, add the question, validate, render, answer first). Puffin detects completion structurally: the analysis file changed *and* a new/updated question id exists, plus its HTML appeared. The model's final text is shown as the reply.

Because `submit()` holds the process lock, the button is disabled (with the reason) while another session runs — same rule as the Prompt tab.

#### 6.6.3 Refresh / Map — interactive session

- **Map**: the prompt in §4.9.
- **Refresh**: 
  ```
  Bring docs/architecture/<name>.analysis.json up to date with the code at HEAD using
  archlens. `archlens check` reports: <gone/moved/built summary>. Re-read the changed
  evidence, update responsibilities, relations and what_crosses where they moved, change
  status for components that are now built, move system.repository.revision to HEAD,
  validate, and render into docs/architecture with --repo-root . . Do not remove
  questions; if one no longer holds, say so in its answer.
  ```

### 6.7 Renderer components (`plugins/architecture-plugin/renderer/`)

```
components/
  index.js                     export { ArchitectureView }
  ArchitectureView.js          container: state machine over §4.1 states; owns IPC calls, event subscriptions
  QuestionNavigator.js         list + search + status dots + context menu
  DiagramFrame.js              iframe host, toolbar, bridge message handling, dropped strip
  ReadingPane.js               question / component / relation / boundary / fact / term renderers
  ModelBrowser.js              tables and cards for the five model sections
  AskPanel.js                  input, slice view, coverage bar, answer view, stage buttons, history
  StatusBar.js                 freshness badge + check report popover
  SettingsDialog.js            §4.10 fields (uses modal-manager)
  EmptyStates.js               no-archlens / no-analysis / no-diagrams
styles/architecture.css
```

- Vanilla ES modules, no framework, DOM built with template literals + `escapeHtml` (the document-viewer convention). Markdown through `window.puffin.marked.parse`.
- Local view state is a plain object; there is no SAM model for this plugin (it is read-mostly and file-backed). The one piece of app-wide state it touches — "a Claude session is running" — is read from the existing `claude:*` events so buttons disable correctly.
- Keyboard: `↑/↓` move between questions, `Enter` opens, `/` focuses Ask, `Esc` closes the answer view.

### 6.8 Error handling

- CLI not found → *No archlens* state, never a toast loop.
- `validate` errors → rendering blocked, errors listed with the JSON pointer archlens reports; a *Open analysis in Editor* button.
- `ask` exit 3 → normal empty-slice UI, not an error.
- `check` exit 1 → stale badge; `enforce` exit 1 → violations list. Both are findings, not failures.
- Render timeouts: 60 s per question without the browser check, 180 s with it; on timeout the run is reported per question and can be resumed with `--question <id>`.
- Model provider errors surface exactly as the Editor tab surfaces them (same service).
- All exceptions in handlers are caught and returned as `{ success: false, error }` with `context.log.error`.

### 6.9 Security

- Every file path from the renderer is resolved against the project root and rejected if it escapes it; the archlens binary path is the only exception and is set only through config/env/probe, never from the renderer.
- Diagram HTML is rendered in a sandboxed iframe without top-navigation or popup rights; the injected bridge is the only channel out, and the host validates every message's `path` again.
- No `shell: true` spawns. Questions are passed as a single argv element.
- Stage 2 prompts include analysis prose, which may contain untrusted text (e.g. a README quoted in a `doc_ref`). The prompt delimits the slice and instructs the model to treat it as data; tools are disabled, so injection can at worst produce a wrong sentence, never an action.

### 6.10 Tests (BDD, Jest, under `tests/plugins/architecture/`)

- `analysis-store.test.js` — given the COSA fixture (copied to `tests/fixtures/architecture/cosa/`), discovery finds the analysis; indexes are built; `termsForQuestion(q_email)` returns exactly the ten terms archlens's README lists for that question; render state flags stale HTML by mtime.
- `archlens-runner.test.js` — probe order with a fake home dir; argv construction (no shell, question as one arg); `ask` exit 3 → empty slice; `check` JSON parsed; kill on cancel (Windows path uses taskkill).
- `ask-service.test.js` — slice hydration; `alreadyAnswered` threshold; prompt caps; citation extraction from a canned answer; provider routing mocked via `document-edit-service`.
- `diagram-server.test.js` — path escape rejected; bridge injected once before `</body>`; size guard.
- Renderer: `ArchitectureView.test.js` (jsdom) — state machine transitions from `status` results; navigator selection loads a diagram; a bridge `archlens:open` message calls `openEvidence` with the validated path; Ask flow disables Stage 2 below the coverage floor.
- An integration smoke (skipped when archlens is not installed): `archlens questions` on the fixture lists 9 questions; `ask` on "does the watcher sandbox ever write to session.db?" returns coverage 1 with `watcher_sandbox` first.

### 6.11 Delivery plan

| Step | Deliverable | Notes |
|---|---|---|
| 1 | Plugin skeleton, `status`/`load`/`listQuestions`, navigator + reading pane, empty states | Works on COSA with no rendering yet |
| 2 | `diagram-server` + `DiagramFrame` + bridge → open evidence in Editor | First visible value |
| 3 | Model browser + glossary | |
| 4 | `archlens-runner` (`doctor`, `validate`, `render --no-check`, `check`, `enforce`) + freshness badge + Render/Check actions + watcher | Verify `ELECTRON_RUN_AS_NODE` spawn on Windows first |
| 5 | Ask Stage 1 (`ask` slice UI) | No model |
| 6 | Ask Stage 2 (prose via provider) + notes + history | |
| 7 | Ask Stage 3 / Map / Refresh via `submit()`; progress card | |
| 8 | Settings, keyboard, help-mode text, docs (`docs/USER_MANUAL.md` section), CHANGELOG 4.1.0 | |

Each step ships behind the tab and is usable on its own; steps 1–4 need no model access at all.

---

## 7. Data model reference (arch-lens `analysis.schema.json`, as consumed)

| Entity | Fields the tab uses |
|---|---|
| `system` | `name`, `purpose`, `domain`, `repository.{url,revision}`, `sources[].{kind,ref,note}` |
| `components[]` | `id`, `name`, `kind`, `detail`, `responsibility`, `status` (`built`/`planned`), `evidence[].{path,line?,label?}`, `doc_refs[]` |
| `relations[]` | `id`, `from`, `to`, `mechanism`, `summary`, `what_crosses`, `crosses`, `evidence[]` |
| `boundaries[]` | `id`, `kind`, `label`, `claim`, `contains[]`, `evidence[]` |
| `facts[]` | `id`, `kind`, `claim`, `because`, `evidence[]`, `rule?` |
| `glossary[]` | `term`, `also[]`, `definition` |
| `questions[]` | `id`, `title`, `ask`, `answer`, `context`, `narrative`, `involves[]`, `highlight[]`, `facts[]`, `omits`, `shape?` (`architecture` default / `sequence`), `steps[]` (sequence) |

Rendered file naming: `q_<id>.<shape>.html` / `.json` in the diagrams dir (ids in the COSA set are already `q_*`; the tab uses `question.id` verbatim and does not assume a prefix).

`archlens ask --json` shape (v0.5.2): `{ question, terms[], components[{id,score,matched[]}], relations[{from,to,score,matched[]}], facts[{id,…}], questions[{id,…}], boundaries[{id,…}], glossary[string], unmatched[string], coverage: number, empty: boolean }`.

`archlens check --json` shape: `{ code: { pinned, head, pinAvailable, ahead, total, gone[], moved[], built[], fine, ok }, documents: { gone[], unverified[], missing[], mispaged[], fine, total, ok } }`.

The runner pins the archlens version it was written against (`0.5.x`) and warns when `doctor` reports a different major.

---

## 8. Open questions

1. ~~Electron's Node version~~ — **resolved 2026-09-14.** The installed Electron (43.4.0) bundles Node ≥ 22, so `archlens.mjs` runs under `process.execPath` with no external `node`. The runner still records which Node ran in the `doctor` report.
2. ~~archify's browser check~~ — **resolved 2026-09-14.** Renders default to `--no-check` (setting `architecture.renderBrowserCheck`, default `false`); the header *Render all* menu offers *Render with browser check* for a full archify verification pass.
3. **Multiple analyses per project** (e.g. one per subsystem). Phase 1 supports one active analysis with a picker; a merged navigator is a later concern.
4. **Where prose answers live.** `docs/architecture/questions.md` keeps them next to the diagrams and under git; alternatively they could become `facts` in the analysis (which would make them checkable). Start with the note file.

---

## 9. Phase 2 preview — tasks and architecture refresh

Not specified here, but the design leaves the hooks:

- **Task → review.** When a Kanban task moves to *Done*, run `archlens review --json --base <task start ref>`; attach the result to the task card: components touched, boundary claims to re-check, files with no component. A red mark on the card means "this change moved the architecture and nobody drew it".
- **Review → refresh.** From the card, *Refresh analysis* runs the §6.6.3 prompt scoped to the components the review named.
- **Ask → task.** From an Ask answer, *Create task* seeds a Kanban card with the question and the components involved, so architecture questions become work.
- **CI.** `check` + `enforce` are already exit-code driven; the Git panel can show their status per branch.

---

## 10. Implementation notes (4.1.0)

Deviations from the sections above, as built in `plugins/architecture-plugin/`:

- **archlens version.** The published plugin (0.1.x) lacks `ask`/`check`/`enforce`; the runner picks the highest-versioned install it can find (settings/env path first, then the Claude plugin cache, `~/.claude/skills/archlens`, then a sibling `../archlens` or `../arch-lens` checkout) and requires ≥ 0.5.0.
- **Dropped lines** come from `archlens questions` at load time (no render needed), so the strip works for diagrams rendered elsewhere. The last render's per-question summary is kept in memory only.
- **Settings** are stored per project in the plugin's storage (`~/.puffin/plugin-data/architecture-plugin/settings.json`), edited from the tab's own ⚙ panel; `contributes.configuration` in the manifest is descriptive.
- **Stage 3 / Map / Refresh** submit through `PromptEditor.submitExternal()` so the prompt is recorded in history and resumes the session; completion is detected from `claude:complete` plus a reload of the analysis, and the reading pane does not show the model's reply (it is in the Prompt tab).
- **Open in browser** uses `shell.openPath` on the rendered HTML (file inside the project); http(s) links from a diagram go through `shell.openExternal`.
- **Layout.** Side panes hide automatically on narrow windows (container queries at 860 px / 620 px) and can be pinned open with the ☰ / 📖 header buttons; the last selection is remembered in `localStorage`.
- Renderer events arrive on the new generic `plugin:event` channel (`window.puffin.plugins.onEvent`), added to core for this plugin.
