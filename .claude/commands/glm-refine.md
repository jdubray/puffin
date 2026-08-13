---
description: Refine a sekkei node by patching its body with a JSON-Patch
argument-hint: <glm_id>
---

The user wants to edit a sekkei node's body. Drive the refine loop:

1. **Identify the target.** If `$ARGUMENTS` is non-empty, use it as the `glm_id`. Otherwise ask the user via AskUserQuestion, optionally pre-listing components via `glm_list_components`.

2. **Read the current state.** Call `glm_get_node` with the `glm_id`. Show the user the relevant body fields, then ask them what to change (if they haven't already told you).

3. **Compute the JSON-Patch.** Build the minimal set of RFC-6902 ops to express the change. Supported ops: `add`, `remove`, `replace`, `move`. Each op needs a JSON Pointer `path` (e.g. `/outputs/0/path`, `/prompt_template`). Prefer surgical ops over wholesale replacement — smaller patches are easier for the user to review in the change log.

4. **Apply.** Call `glm_apply_patch` with the `glm_id` and the `ops` array. The MCP server handles fetching, patching, locking, PUTing, and unlocking. It returns the new contentHash + revision.

5. **Confirm.** Tell the user what changed (revision A.N → A.N+1) and offer to `/glm-verify` to confirm the sekkei still passes gates.

Notes:
- Body shape is stratum-specific. Validate your ops against the schema in `docs/sekkei-authoring.md` before sending.
- If the user describes a change that affects multiple nodes (e.g. "add a verifier command to every component"), suggest scripting it instead of using `/glm-refine` per-node.
- For full-body replacement, the user is better served by a direct PUT — `/glm-refine` is for incremental edits.
