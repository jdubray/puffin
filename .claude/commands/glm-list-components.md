---
description: List every component in the GLM workspace with status
argument-hint: "[workspace]"
---

Call the `glm_list_components` MCP tool to enumerate components.

If the user supplied an argument (`$ARGUMENTS`), pass it as `workspace`. Otherwise default to the workspace from `~/.glm/config.json`.

Render the tool's text output verbatim. It's already one-line-per-component with `glm_id — title (status)`.
