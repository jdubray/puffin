---
description: Check the "Definition of Ready to Code" gate — is the sekkei complete enough to build on auto-pilot?
argument-hint: "[workspace]"
---

The user wants to know whether a GLM workspace is **ready to code on auto-pilot**
(the gate between the vibe/spec phase and `/glm-build`). See
`docs/glm-cli-process.md` for the full process. Run these checks and print a
single **READY** / **NOT READY** verdict with the exact blockers.

Pass `$ARGUMENTS` as `workspace` to every tool call when non-empty; otherwise let
the tools default to `~/.glm/config.json`.

Run the checks in this order and collect blockers as you go — do **not** stop at
the first failure; report them all so the user can fix in one pass.

1. **Verifier gates (authoritative).** Call `glm_verify`. The sekkei is not ready
   unless the overall result is **PASS**. Pay special attention to:
   - **Gate 5 (spec_coverage)** — every component must have `functional`,
     `technical`, `acceptance`, and `prompt`. List any components still missing
     spec kinds (these are the most common blockers).
   - **Gate 6 (spec_quality)** — every `acceptance` must have `deliverables` +
     `verifier`; every `prompt` must have `context_bundle` + `outputs` +
     verifier. List any offenders.
   Any other failing gate (envelope, hierarchy, closure, etc.) is also a blocker.

2. **source_dir is set.** Call `glm_get_component_spec` on the first component
   from `glm_list_components`. If the response's `source_dir` is null, that is a
   blocker — the user must run `glm init --source-dir <abs-path>` (or PATCH the
   workspace). If there are no components at all, that is itself a NOT READY.

3. **Outputs are disjoint.** For each component, call `glm_get_component_spec`
   and collect every `outputs[].path`. If any path is claimed by two different
   components, that is a blocker (auto-pilot would have two components fighting
   over one file). Report each collision as `path  <-  componentA, componentB`.
   - This iterates one `glm_get_component_spec` per component. For large sekkeis
     tell the user you are doing a full pass before you start. Do **not** sample
     or truncate — checking every component is the whole point of the gate.

**Verdict format:**

- If everything passes:
  > ✅ **READY** — N components, all gates green, source_dir set, outputs
  > disjoint. You can run `/glm-build`.
- Otherwise:
  > 🚫 **NOT READY** — followed by a grouped, numbered blocker list. For each
  > blocker give the concrete next action (usually a `/glm-refine <glm_id>` on a
  > specific spec node, or `glm init --source-dir`). Do **not** offer to run
  > `/glm-build`.

Do not attempt to auto-fix anything. This command is read-only — it only reports.
