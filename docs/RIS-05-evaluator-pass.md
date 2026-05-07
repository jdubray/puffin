# RIS-05: Evaluator Pass (Generator–Evaluator Separation)

**Target**: Puffin 4.0
**Dependencies**: CRE (already in Puffin), migration 012
**Delivery**: CRE extension + `evaluator-plugin`
**Estimated effort**: 2.5 sprints

---

## 1. Motivation

The Dive-into-Claude-Code paper's Section 12.1 identifies the observability–evaluation gap as the single most consequential open problem in agent systems: industry observability adoption is ~89%, offline evaluation ~52%. Rajasekaran's harness-design essay (cited in the paper) names the architectural fix explicitly: generator–evaluator separation, sprint contracts, post-hoc checks. Puffin's CRE pipeline (Sprint → Plan → RIS → Implementation → Code Review) is already halfway there — the "Code Review" phase exists in the automated sprint orchestration loop. What is missing is that Puffin's current review pass runs in the *same* agent configuration that produced the code. The paper's Section 4.1 is explicit on the failure mode: "agents tend to respond by confidently praising the work." This spec makes the evaluator a **separately configured Claude invocation** with a different system prompt, a read-only tool subset, and no knowledge of the generator's reasoning — and writes its findings as first-class artifacts that CRE can queue as bug fixes. Integration point: the RIS/assertion pipeline Puffin already owns, plus a second Claude subprocess.

## 2. User-facing behavior

- After a story's implementation completes (automated or manual), a new "Evaluation" phase fires before the story is marked completed.
- The evaluator runs as a distinct Claude invocation: read-only tool set (`Read`, `Grep`, `Glob` only), a critical-reviewer system prompt, and an input package containing the RIS, the diff of files changed, the failed/passed assertion results, and the completion summary.
- The evaluator returns findings in a structured JSON format compatible with Puffin's `inspection_assertions` schema.
- Findings render in a new "Evaluation" tab within the sprint view: each finding shows severity (critical / major / minor / nit), affected file(s), a clear description, and a "queue as bug fix" action that creates a user story.
- A severity threshold (configurable per-project, default "major") determines whether the story auto-advances to completed or is held in review.
- The existing inspection assertions and the evaluator findings are rendered side-by-side: "things the deterministic checks caught" vs. "things the evaluator caught that the checks missed." Over time, good evaluator findings can be promoted to permanent assertion patterns.
- Cost and duration of the evaluator pass are tracked separately from the generator and displayed in the completion summary.

## 3. Architectural decisions

1. **Evaluator is a separate Claude invocation.** Not a second turn in the same session; a fresh `--print` call with `--max-turns 10`, its own system prompt, and `--disallowedTools Write Edit Bash MultiEdit WebFetch WebSearch Task`. This enforces the separation structurally — the evaluator cannot accidentally fix things, only report.
2. **Input package is explicit.** The evaluator receives: (a) the RIS markdown, (b) a file-level diff (via `git diff` run in main process), (c) assertion results from `state:evaluateStoryAssertions`, (d) the completion summary. Not the generator's full conversation. Keeping the evaluator blind to generator reasoning is the point.
3. **Findings schema reuses `inspection_assertions` types.** Every finding is an assertion-shaped object (`FILE_CONTAINS`, `FUNCTION_SIGNATURE`, `CLASS_STRUCTURE`, etc.) with an added `severity` and `explanation` field. This means CRE's existing assertion evaluator can re-run any finding deterministically later.
4. **Prompt template is versioned.** The evaluator system prompt lives in `src/main/evaluators/prompts/evaluator-v1.md` and is versioned. Migrations do not alter old findings; future prompt changes use `evaluator-v2.md` and tag new runs with the version.
5. **Model choice is configurable, defaults to cost-conscious.** Default model: `claude-haiku-4-5` for cost reasons (evaluator runs are frequent and involve pure reading). Power users can configure Sonnet/Opus. The generator's model is never forced onto the evaluator.
6. **Findings can be dismissed or escalated.** A dismiss action marks a finding "won't fix"; an escalate action promotes it to a `user_stories` row with `source_prompt_id` linking back to the evaluation run.

## 4. Data model

### Migration 012: `012_evaluations.js`

```sql
CREATE TABLE evaluations (
  id                    TEXT PRIMARY KEY,
  story_id              TEXT NOT NULL,
  sprint_id             TEXT,
  generator_session_id  TEXT,                      -- Claude session of the implementer
  evaluator_session_id  TEXT,                      -- Claude session of the evaluator
  evaluator_model       TEXT NOT NULL,
  prompt_version        TEXT NOT NULL,             -- e.g., 'evaluator-v1'
  findings              TEXT NOT NULL DEFAULT '[]',-- JSON array
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending|complete|failed
  cost_usd              REAL DEFAULT 0,
  duration_ms           INTEGER DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at          TEXT,
  FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
);
CREATE INDEX idx_evaluations_story ON evaluations(story_id);
CREATE INDEX idx_evaluations_sprint ON evaluations(sprint_id);
CREATE INDEX idx_evaluations_status ON evaluations(status);

CREATE TABLE evaluation_findings (
  id               TEXT PRIMARY KEY,
  evaluation_id    TEXT NOT NULL,
  severity         TEXT NOT NULL,                  -- 'critical' | 'major' | 'minor' | 'nit'
  type             TEXT NOT NULL,                  -- assertion type (FILE_CONTAINS, etc.)
  target           TEXT,
  message          TEXT NOT NULL,
  explanation      TEXT,
  assertion_data   TEXT,                           -- JSON
  status           TEXT DEFAULT 'open',            -- 'open' | 'queued' | 'dismissed' | 'fixed'
  queued_story_id  TEXT,                           -- if promoted to a bug-fix story
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
);
CREATE INDEX idx_findings_evaluation ON evaluation_findings(evaluation_id);
CREATE INDEX idx_findings_severity ON evaluation_findings(severity);
CREATE INDEX idx_findings_status ON evaluation_findings(status);
```

## 5. Main-process work

### Files created

- `src/main/evaluators/evaluator-runner.js` — `runEvaluation(storyId, context)`. Assembles input package, spawns Claude, parses findings, writes to DB.
- `src/main/evaluators/prompts/evaluator-v1.md` — system prompt establishing the reviewer persona (critical, specific, no praise).
- `src/main/evaluators/findings-parser.js` — validates and normalizes evaluator output. Rejects malformed findings; logs and retries once.
- `src/main/evaluators/input-packager.js` — produces the diff, assertion results, and RIS bundle.
- `src/main/database/migrations/012_evaluations.js`.
- `src/main/database/repositories/evaluations-repository.js`.

### Files modified

- `src/main/cre/` (wherever the sprint orchestrator lives): after story implementation completes, if `evaluatorEnabled` (project config, default `true`), dispatch `evaluatorRunner.runEvaluation(storyId)` before marking the story completed.
- `src/main/ipc-handlers.js`: new `setupEvaluatorHandlers(ipcMain)`:
  - `evaluator:run` (invoke) — manual trigger
  - `evaluator:getForStory` (invoke)
  - `evaluator:dismissFinding` (invoke)
  - `evaluator:queueFinding` (invoke) — creates a bug-fix user story
  - `evaluator:getConfig` / `evaluator:setConfig`
- `src/main/claude-service.js`: factor out `spawnReadOnlyPass(prompt, opts)` helper if not already generic. The existing `submit()` can be used with `disallowedTools` set appropriately; no new spawn path needed.
- `src/main/preload.js`: expose `puffin.evaluator.*`.

### New IPC channels

As listed.

## 6. Renderer work

### Plugin manifest — `plugins/evaluator-plugin/puffin-plugin.json`

```json
{
  "name": "evaluator",
  "version": "1.0.0",
  "displayName": "Evaluator",
  "description": "Post-implementation evaluation pass with dedicated reviewer configuration",
  "main": "index.js",
  "extensionPoints": {
    "components": ["evaluation-panel", "finding-detail", "evaluator-config"]
  },
  "contributions": {
    "menus": {
      "sprintTabs": [{ "id": "evaluation", "label": "Evaluation", "icon": "🔍", "component": "evaluation-panel" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/evaluator-plugin/index.js`.
- `plugins/evaluator-plugin/renderer/evaluation-panel.js` — top-level view inside the sprint tab: findings list grouped by severity, side-by-side with assertion results.
- `plugins/evaluator-plugin/renderer/finding-detail.js` — modal: full explanation, target file(s) with inline code preview, "queue as bug fix" and "dismiss" buttons.
- `plugins/evaluator-plugin/renderer/evaluator-config.js` — settings UI for evaluator model and severity threshold.
- `plugins/evaluator-plugin/renderer/severity-badge.js` — small UI primitive.
- `plugins/evaluator-plugin/renderer/styles.css`.

### Files modified (renderer side)

- `src/renderer/components/backlog-view/` — surface evaluation status on each completed story's card.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/evaluators/evaluator-runner.js", "assertion": { "type": "file" }, "message": "Evaluator runner exists" },
  { "id": "IA2", "criterion": "AC1", "type": "EXPORT_EXISTS", "target": "src/main/evaluators/evaluator-runner.js", "assertion": { "exports": [{ "name": "runEvaluation", "type": "function" }] }, "message": "runEvaluation is exported" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/evaluators/prompts/evaluator-v1.md", "assertion": { "type": "file" }, "message": "Evaluator prompt template exists" },
  { "id": "IA4", "criterion": "AC2", "type": "FILE_CONTAINS", "target": "src/main/evaluators/evaluator-runner.js", "assertion": { "pattern": "disallowedTools" }, "message": "Evaluator enforces read-only tool set" },
  { "id": "IA5", "criterion": "AC2", "type": "FILE_CONTAINS", "target": "src/main/evaluators/evaluator-runner.js", "assertion": { "pattern": "Write|Edit|Bash" }, "message": "Write/Edit/Bash are in the disallow list" },
  { "id": "IA6", "criterion": "AC3", "type": "FILE_EXISTS", "target": "src/main/database/migrations/012_evaluations.js", "assertion": { "type": "file" }, "message": "Migration 012 exists" },
  { "id": "IA7", "criterion": "AC3", "type": "FILE_CONTAINS", "target": "src/main/database/migrations/012_evaluations.js", "assertion": { "pattern": "CREATE TABLE evaluations" }, "message": "Migration creates evaluations table" },
  { "id": "IA8", "criterion": "AC3", "type": "FILE_CONTAINS", "target": "src/main/database/migrations/012_evaluations.js", "assertion": { "pattern": "CREATE TABLE evaluation_findings" }, "message": "Migration creates findings table" },
  { "id": "IA9", "criterion": "AC4", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.evaluator" }, "message": "Preload exposes evaluator API" },
  { "id": "IA10", "criterion": "AC5", "type": "JSON_PROPERTY", "target": "plugins/evaluator-plugin/puffin-plugin.json", "assertion": { "path": "contributions.menus.sprintTabs[0].id", "value": "evaluation" }, "message": "Plugin contributes Evaluation sprint tab" }
]
```

## 8. Manual verification steps

1. Enable evaluator in project config. Run an automated sprint with 2 stories.
2. After implementation completes, verify the Evaluation tab appears on each story with at least one finding (non-trivial stories almost always produce findings).
3. Click a finding. Verify the detail modal shows the target file, the explanation, and queue/dismiss actions.
4. Click "queue as bug fix" on a major finding. Verify a new user story appears in the backlog with `source_prompt_id` linking back to the evaluation.
5. Verify the evaluator's cost appears in the completion summary separately from the generator's cost.
6. Intentionally disable the evaluator (config toggle). Run a story. Verify no evaluation runs; story is marked completed directly.
7. Run the evaluator manually on an already-completed story via `evaluator:run` IPC. Verify a new evaluation row is written without re-running the implementation.
8. Verify that the evaluator, given a read-only tool set, cannot actually modify files even if its output suggests it wanted to (inspect the transcript for any rejected Write attempts).

## 9. Open questions

- Should the evaluator have access to test output (`npm test` results)? Current design says no — evaluator is purely static. If pragmatic testing value outweighs the purity argument, allow `Bash` but only for a whitelist of test commands defined in project config.
- Finding promotion to permanent assertions: how does the "promote this finding as an assertion" flow work? Sketch: a finding with severity ≥ major that appears in N different stories becomes a suggested `inspection_assertion` pattern. Defer mechanics to 4.1.
- Should dismissed findings be remembered across re-runs (so the evaluator does not re-report them)? For 4.0 yes — include dismissed-finding signatures in the evaluator input package.
- Evaluator's own context limit: if the diff is larger than the evaluator's window, chunk by file and run one evaluator call per file, then aggregate. Implementation detail, handled in `input-packager.js`.

## 10. Milestones

- **M1** (week 1): Migration + repositories + prompt template + `evaluator-runner` happy-path test.
- **M2** (week 2): Wire into CRE sprint orchestrator + basic findings rendering.
- **M3** (week 3): Finding detail UI + dismiss/queue actions + severity threshold config.
- **M4** (week 4): Side-by-side assertion-vs-finding view + cost tracking + docs.
- **M5** (week 5): Dogfood on Puffin's own development for a sprint; tune prompt template based on observed finding quality.
