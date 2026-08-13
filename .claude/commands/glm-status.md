---
description: Show the current GLM workspace summary (node counts, last verifier run)
argument-hint: "[workspace]"
---

Call the `glm_status` MCP tool to retrieve the workspace summary.

If the user supplied an argument (`$ARGUMENTS`), pass it as `workspace`. Otherwise let the tool default to the workspace from `~/.glm/config.json`.

Render the tool's text output verbatim — it's already formatted for human reading.
