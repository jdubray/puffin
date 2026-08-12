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

### M2 — App lifecycle ✅ MANAGED (2026-08-11)
`machines/app-lifecycle/`. Replaces the legacy `appFsm` skeleton. 7 states, 8 reject
reasons, 7 invariants — exhaustively checked. **The contract fixed a real legacy flaw**
(`recovery-cannot-skip-loading`): the old appFsm sent every RECOVER to READY, including
errors raised before project state ever loaded, yielding a "ready" app with nothing
loaded. The managed machine routes pre-load recovery back to `loading`, and the invariant
`active-states-imply-loaded` now holds over every reachable state.
**Next step**: swap the renderer to execute this module (with M1) and emit windows.

### M3 — Kanban task card ✅ MANAGED (2026-08-12)
`machines/task-card/`. Designed fresh for the verified board (workflows-not-loops): backlog →
ready (DoRC gate verdict decides — `ready-requires-gate-pass`) → implementing → validating →
done (terminal), with the ONLY backward bend validating→implementing taken by
VALIDATION_FAILED carrying its concrete reason, at most 2 laps, then needsHuman
(`budget-exhausted`); ESCALATE/RESUME are the human plane. 19 states, 8 reject reasons, 13
invariants — exhaustively checked. Executed durably by polyrun (a Puffin-managed child under
the system node — polyrun's store needs node:sqlite; see `src/main/board-runtime.js` and
`polyrun.config.mjs`); cards ARE instances, the journal is the card's history.

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
