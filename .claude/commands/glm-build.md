---
description: Auto-pilot — generate code for every component in the sekkei, in dependency order, until the whole tree is green
argument-hint: "[workspace]"
---

The user wants to **build the whole sekkei on auto-pilot**: generate code for
every component, run each component's acceptance verifier, and record provenance
— hands-off — until the tree is green. This is Phase 2 of
`docs/glm-cli-process.md`. Failure policy is **stop-on-first-failure**.

Pass `$ARGUMENTS` as `workspace` on every tool call when non-empty; otherwise let
the tools default to `~/.glm/config.json`.

## 0. Gate — refuse to start unless ready

Call `glm_verify`. **If the overall result is not PASS, STOP immediately.** Tell
the user the sekkei is not ready and to run `/glm-ready` to see the blockers,
then `/glm-refine` to fix them. Do not generate anything against an unverified
sekkei. (This is the same gate `/glm-ready` checks; `glm_verify` PASS implies
gates 5 + 6 are green, i.e. every component is machine-runnable.)

## 1. Enumerate + order

1. Call `glm_list_components` to get every component.
2. Determine a **generation order** so each component is built only after the
   components it depends on:
   - For each component, call `glm_get_node` and read its `relationships` for
     `depends-on` edges whose target is another component in this workspace; also
     consider the `context_bundle` from `glm_get_component_spec` (component ids it
     references). Build a dependency graph and topologically sort it — leaf /
     utility components first, routes / entrypoints last.
   - If you detect a cycle, break it arbitrarily, generate in listed order for
     the cycle members, and warn the user in the final report.
3. Print the planned order before you start so the run is auditable.

## 2. Build loop (per component, in order)

For each component `C`:

1. **Resolve.** `glm_get_component_spec` for `C` — gives `prompt_template`,
   `hard_constraints`, `context_bundle`, `outputs[]`, `source_dir`, and
   `binding_hash`. If `source_dir` is null, STOP and tell the user to set it.
2. **Generate.** Following `prompt_template` + `hard_constraints` and reading the
   `context_bundle` carefully, use the `Write` tool to produce **exactly** the
   files in `outputs[]` (no extras, no omissions), all under `source_dir`. Never
   write outside `source_dir`.
3. **Verify.** Call `glm_run_acceptance_verifier` for `C`. On non-zero exit,
   read stderr, fix the offending file(s), and verify again — **up to 3
   attempts**.
4. **On pass — record.** Compute each file's `sha256` + byte count
   (`Bun.file(path).text()` + `Bun.sha256()`, or `crypto.subtle.digest`). Call
   `glm_record_generation` with `C`'s id, `files: [{path, sha256, bytes}]`,
   `verifier_exit_code: 0`, and `binding_hash` from step 1. Note the returned
   provenance id for the report.
5. **On failure after 3 attempts — STOP (stop-on-first-failure).** Do not
   continue to later components (they may depend on `C`). Report: which component
   failed, the final verifier stderr, and the concrete next step — almost always
   `/glm-refine <C.spec.technical>` or `/glm-refine <C.spec.acceptance>`, then
   re-run `/glm-build` to resume. Components already completed stay done
   (provenance is recorded), so the resumed run only re-does the unbuilt tail.

## 3. Final acceptance

After every component is built:

1. Re-run `glm_verify` and confirm it still passes.
2. If the System root declares an `acceptance_gate`, run the full project test
   suite / boot check it describes (use the System node's body via
   `glm_get_node` on the root) and report the result.

## 4. Report

Print a build report:
- Planned vs. completed order.
- Per component: PASS/FAIL, files written (count), provenance id.
- Final `glm_verify` result and acceptance-gate result.
- If stopped early: the blocked component and the exact resume instructions.

## Guardrails (do not violate)

- Never write outside `source_dir`.
- Never skip a component's acceptance verifier — provenance requires the real
  exit code.
- Never generate against a sekkei where `glm_verify` did not pass.
- Stop-on-first-failure: do not push past a component that won't go green.
