---
description: Run the 7-gate sekkei verifier on the GLM workspace
argument-hint: "[workspace]"
---

Call the `glm_verify` MCP tool to run the workspace verifier.

If the user supplied an argument (`$ARGUMENTS`), pass it as `workspace`. Otherwise default to the workspace from `~/.glm/config.json`.

Render the tool's text output verbatim. It already summarizes overall PASS/FAIL plus per-gate detail (and full issue text for failing gates).

If any gate failed, suggest concrete remediation: usually a `/glm-refine` on the failing spec or component. Do not attempt to auto-fix unless the user asks.
