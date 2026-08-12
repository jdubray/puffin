# Polygraph Inventory — Puffin's Stateful Units

Date: 2026-08-11. Phase 1 of the VSSpecs re-scope (`docs/puffin-2.0-plan.md`): every state
machine managed by the Polygraph toolset. This inventory ranks Puffin's stateful units by
invariant at stake, blast radius, and capture cost, and orders the migration.

Managed machines live in `machines/<name>/` as artifact directories
(`contract.json` + `next.cjs` SAM v2 strict-profile module + `invariants.mjs`), verified by
`npm run verify:machines` (Polygraph checker from a sibling checkout, `POLYGRAPH_DIR`
overridable, no API key).

## Ranked units

### M1 — Prompt lifecycle ✅ MANAGED (2026-08-11)
`machines/prompt-lifecycle/`. Replaces the legacy `promptFsm` skeleton
(`src/renderer/sam/instance.js`). idle → composing → submitted → awaiting → completed/failed,
with cancel bends and late-event absorption. 8 states, 6 reject reasons, 12 invariants —
exhaustively checked, gated in the test suite. Invariants at stake: no zero-chunk completion,
no double submit (double CLI spawn), late chunks/errors after cancel absorbed as observable
no-ops, settlement recorded truthfully (`endedVia`).
**Next step**: swap the renderer to execute this module (replacing `promptFsm`) and emit
`{pre, action, data, post}` windows via a step listener (CR-4) so live sessions produce the
verification corpus.

### M2 — App lifecycle (appFsm)
`src/renderer/sam/instance.js` — INITIALIZING → LOADING → READY → PROMPTING → PROCESSING →
ERROR → RECOVER. Small alphabet, low data, easy contract. Invariant at stake: no prompt
processing before state load; ERROR always recoverable to READY. Capture cost: low.
**Order: next.**

### M3 — Kanban story status
`user_stories.status` (pending → in-progress → completed → archived) mutated via SAM
acceptors + `state-persistence.js` + repository. Today the columns are just a status field —
this becomes the Phase 3 verified board machine (cards as polyrun instances, GLM DoRC/
acceptance gates). Invariants at stake: no un-archival, no completion without its gate,
bounded rework bends. **Order: Phase 3, designed fresh with `/polygraph:workflow` rather
than retrofitted.**

### M4 — Claude CLI process lifecycle (main process)
`claude-service.js` — spawn → streaming → settled/cancelled/killed, `_processLock`,
`_cancelRequested`, Windows taskkill tree semantics. Highest blast radius in the app
(runaway/zombie CLI processes, double spawns, cancel races — see the memory of past bugs).
CR killers: effects awaited mid-transition (CR-6), ambient time/uuid (CR-5), throws instead
of rejects (CR-3). **Order: after M2; needs the effects-declared reshape, worth it.**

### M5 — Session/config state (model.js remainder)
The ~70-acceptor monolith (branches/threads, handoffs, activity, stuck detection). Much of it
is deleted in Phase 2 (GLM replaces branches/threads), so bringing it under management now
would verify code scheduled to die. **Order: after Phase 2, over whatever remains.**

### Not machines
`git-service.js` (thin wrapper over git, git owns the state), `metrics-service.js` (append
buffer), plugin loader (one-shot discovery), `document-edit-service.js` (stateless router).

## Conventions

- One artifact dir per machine; reject-reason names come from `contract.json specialRules`
  and are public API.
- `hasAsyncActions: false`, `reactors: []` — effects are declared, never awaited inside a
  transition; time/ids are injected as action data.
- Every machine change from now on: re-run `npm run verify:machines`; shape changes go
  through `polyvers classify`/`check` against captured snapshots before release.
