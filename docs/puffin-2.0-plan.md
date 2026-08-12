# Puffin 2.0 Re-scope Plan

Date: 2026-08-11. Full review (with survey evidence) published as the "Puffin 2.0 Re-scope" artifact.
This file is the working roadmap.

## Vision

**Puffin 2.0 is "VSCode for specs" (VSSpecs).** Everything centers on a sekkei. The sekkei tree is
the primary navigation surface — hierarchical structure like code: explorer = sekkei DAG, editor
tabs = sekkei nodes, problems panel = verifier gate findings, source control = SCRs, terminal =
spawned Claude Code sessions. 100% of documents become sekkei nodes; if a document has no natural
spec stratum, a "docs" area can be carved in GLM, but spec terms are preferred wherever possible.
The document-editor plugin surface becomes the sekkei node editor.

Agent governance (PolySec console / Cartograph designer embedding, the agent-designer product) is
**out of scope for now** — parked, not canceled. The analysis lives in the review artifact for when
it resumes.

## Thesis

Puffin 2.0 is a spec-oriented development manager over the Claude Code CLI:

1. **GLM replaces branches/threads.** Organizational primitives become workspace → sekkei DAG → SCR →
   release, served by the always-on GLM server (`localhost:3300`, REST + WS + `glm-mcp` + `/glm-*`).
2. **Every state machine is managed by the Polygraph toolset.** Each machine is an artifact dir
   (`contract.json` + SAM v2 strict-profile module + `invariants.mjs` + `intent-ledger.json`), checked
   locally with no API key; polyrun executes, polyvers gates evolution, polyviz renders, polynv elicits.
3. **The kanban board becomes a verified workflow** ("Workflows Not Loops"): cards are polyrun
   instances, columns are contract states, drag is a rejectable dispatch, doneness is mechanical
   (GLM DoRC gate at Ready, acceptance verifier exit 0 at Done), rework is bounded and event-driven.
4. **Agent governance is deferred.** The agent designer remains a separate commercial product built on
   the PolySec artifact family + Cartograph metamodel, but it is parked for now and out of Puffin 2.0
   scope entirely.

## Key facts from the review

- CLAUDE_<branch>.md generation is **already removed** (commit `bb7b190`) — nothing to do.
- Branch/thread removal cuts ~1,200–1,400 references across ~20 files; `git-panel` is unaffected
  (real git, not Workspaces). `history-tree.js` and `branch-name-utils.js` delete entirely;
  `claude-config-plugin` retires with the branch concept.
- The SAM core (`sam/model.js`, 1,915 LOC, ~70 acceptors + 2 FSMs) has **zero tests** — it becomes
  Polygraph's first customer.
- GLM anticipated this integration: solo-mode spec §3.3 is a written Puffin design, and the sekkei
  schema URL is `https://puffin.dev/glm/v1/sekkei.schema.json`.

## Phases

### Phase 0 — Sweep & stabilize (days)
- Delete: `h-dsl-engine/` (42.6k LOC, zero imports) + `hdsl-viewer-plugin` + `tests/h-dsl-engine/`;
  `src/main/schemas/`; `src/renderer/components/architecture/`; `scripts/fix-stuck-sprint.*`,
  `scripts/extract-stories.py`; stale docs (RIS-01..10, CRE, sprint plans); stale worktrees under
  `.claude/worktrees/` and `.claude/rlm_state/chunks/`.
- Squash migrations 002–009 to a clean baseline (drop `sprints`, `sprint_*`, `plans`, `ris`,
  `inspection_assertions`, `completion_summaries` — no readers remain).
- Fix: `npm test` glob for Node 24 (`node --test "tests/**/*.test.js"`); plugin loader does not filter
  `.disabled` dirs (memory-plugin may still load); de-dupe vendored `sam-pattern` vs npm dep.
- Decide plugin fates: calendar (8.4k), rlm-document (11.1k), outcome-lifecycle (3.1k).
  Keep: document-editor, document-viewer, excalidraw, stats (rename CRE labels), prompt-template,
  toast-history.

### Phase 1 — Puffin under Polygraph management (1–2 weeks)
- Run `docs/polygraph-inventory-prompt.md` over Puffin; first target: `promptFsm`.
- Contracts + polynv-elicited invariants; reshape to strict profile (reject-not-silent CR-3, effects
  declared not awaited CR-6, injected time/ids CR-5, finite domains, `reactors: []`).
- `withSamTracing` capture (self-capturing app) + in-process `check()` + CI gate.
- Split `model.js` into small machines: session, prompt lifecycle, board, config.

### Phase 2 — GLM spine, branches/threads retired (2–4 weeks)
- `src/main/glm-client.js`: REST + WS (`replay since:` reconnect) against `:3300`, token from
  `~/.glm/config.json`. No server-side LLM calls (GLM ADR-0006 — client-side credential, matches
  Puffin spawning Claude Code).
- UI: sekkei tree replaces workspace sidebar; `GET /workspaces/:id/summary` dashboard; SCR panel
  replaces threads; node edit locks + heartbeat for human/agent concurrency.
- Register `glm-mcp` + `/glm-*` commands into spawned sessions; wrap `/glm-build` with Puffin's
  streaming output/progress/cancel (GLM's known weak spot on Windows: 8–21 min silent generations).
- Remove the branch system; one-time import of `history.json` into an archive viewer or GLM provenance.
- Retire the `specifications` workspace with the rest; port its spec-authoring prompt into the
  sekkei node editor's AI assistance (see Decisions). Change the sekkei `$schema` identifier in GLM.

### Phase 3 — The verified kanban board (2–3 weeks)
- Author the board machine with `/polygraph:workflow`; cards = polyrun instances (embedded runtime,
  SQLite store, or child process over HTTP — decide); renderer subscribes to `rt.events`.
- Gates: DoRC (GLM verifier gates 5+6) at Ready; `acceptance.verifier.command` exit 0 at Done;
  bounded rework bends carrying their concrete signal, then human escalation — all checked invariants.
- Card history/replay from the polyrun journal (`GET /instances/:id/traces`).
- polyviz "show me this machine" panel; polyvers release gate over collected user-state snapshots.

### Track B — Agent designer (DEFERRED — parked, not canceled)
- Base: PolySec artifact family + gates G0–G3 + importers; Cartograph 14-symbol metamodel (redline
  half maps 1:1 to `security.json`); sketch-vs-proved provenance discipline.
- Ship runner shape (a) export-and-hand-off first; hosted proof service is the commercial boundary
  (no engine code ever ships in the designer).
- Constraints binding now: product rename (polysec.ai collision) before any public surface; no public
  mechanism descriptions until Disclosure A is filed.
- Puffin coupling stays thin: host the PreToolUse gate for spawned sessions (`canUseTool` is the
  known-wrong attach point), render journals/receipts; reuse `console/derive.mjs` derivations rather
  than re-deriving.

## Decisions taken (2026-08-11)

- **polyrun: embedded** in the Electron main process (SQLite store). It is a private process and
  Puffin manages it entirely — lifecycle, workers, journal, and store all in-app.
- **Sekkei IS the node editor.** The document-editor plugin surface is repurposed as the sekkei node
  editor; documents are sekkei nodes (prefer spec strata; a GLM "docs" area only as fallback).
- **Agent governance deferred**: no PolySec/Cartograph embedding, no Track B work in this cycle.
  (When it resumes, the prior decision stands: embed panels over published artifact formats only,
  never engine code.)
- **The `specifications` workspace goes away, its functionality is recycled**: the spec-authoring
  capability (today a branch-focus prompt in `claude-config-plugin/branch-defaults.js` guiding
  Claude to write specifications) becomes sekkei-node authoring assistance — the node editor's
  AI path, aligned with GLM's authoring rules (`glm/docs/sekkei-authoring.md`) and `glm refine`,
  producing nodes that pass the 7 verifier gates instead of free-form markdown.
- **Sekkei `$schema` URL must change in GLM**: nodes currently carry
  `https://puffin.dev/glm/v1/sekkei.schema.json`, but the domain is not owned. It is an identifier
  (never fetched); replace it with an owned domain or a URN (e.g. `urn:kizo:glm:v1:sekkei`) before
  more sekkeis accumulate.

## Open decisions

- Product/version naming: "Puffin 2.0" identity vs the 4.x branch line.
