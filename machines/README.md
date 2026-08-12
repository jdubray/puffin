# Managed State Machines

Every state machine in Puffin is managed by the Polygraph toolset
(see `docs/polygraph-inventory.md` for the inventory and migration order).

Each subdirectory is one machine's artifact directory:

| file | role |
|---|---|
| `contract.json` | Observable state keys, action alphabet, data domains, reject-reason vocabulary (`specialRules`) |
| `next.cjs` | SAM v2 strict-profile module — `{ instance, init, actions, getState, setState }` |
| `invariants.mjs` | State + transition predicates, model-checked exhaustively |

Verify all machines (local, deterministic, no API key):

```
npm run verify:machines
```

The checker is Polygraph's (`scripts/check.mjs`), resolved from a sibling checkout at
`../polygraph` or `POLYGRAPH_DIR`. The same gate runs inside the test suite
(`tests/machines/`) and skips gracefully when no checkout is present.

Rules of the house:

- Rejections are observable no-ops (`reject(reason)`, post == pre) — never a throw,
  never a silent return. Reject-reason names are public API.
- No effects awaited inside a transition; no ambient `Date.now()`/`uuid` — inject via
  action data.
- Shape or vocabulary changes go through `polyvers classify` / `polyvers check` against
  captured fleet snapshots before release.
