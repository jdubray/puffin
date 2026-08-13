---
description: Generate a component's implementation using its sekkei spec and record provenance
argument-hint: <component_id>
---

The user wants to generate code for a GLM component. Drive the full loop:

1. **Resolve the spec.** Call `glm_get_component_spec` with `component_id="$ARGUMENTS"` (or, if `$ARGUMENTS` is empty, ask the user which component first via the AskUserQuestion tool, optionally pre-listing options via `glm_list_components`).

2. **Generate the files locally.** Follow the returned `prompt_template` + `hard_constraints`. Produce *exactly* the files in `outputs[]` — no extras, no omissions. Use the `Write` tool with paths *under* the workspace's `source_dir`. The `context_bundle` field is authoritative input — read it carefully before writing anything.

3. **Verify.** Call `glm_run_acceptance_verifier` with the same `component_id`. If exit code is non-zero, examine the stderr, fix the failing file(s), and call the verifier again. Up to **3** attempts before giving up and reporting the failure to the user.

4. **Record provenance.** Once the verifier passes:
   - Compute each file's `sha256` and byte count (use `Bun.file(path).text()` + `Bun.sha256()`, or `crypto.subtle.digest` / a Bash one-liner).
   - Call `glm_record_generation` with the `component_id`, `files: [{path, sha256, bytes}]`, `verifier_exit_code: 0`, and `binding_hash` (from step 1's response).
   - Report the returned provenance id to the user.

Constraints:
- Do **not** touch files outside `source_dir`.
- Do **not** skip the verifier even if the generation looks correct — provenance requires the exit code.
- If `source_dir` is null in the spec response, refuse and tell the user to set it (`glm init --source-dir <path>` or PATCH the workspace).
