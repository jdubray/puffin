# Code Review: Claude Service Integration Review

**Date:** 2026-04-24

## Summary
Reviewed Claude CLI integration across `claude-service.js`, `vibe-service.js`, IPC handlers, and renderer callers. Found two process-kill sites that bypass the Windows-aware `_killProcess` helper and will leave orphaned child processes when `shell:true` is active, six `sendPrompt()` call sites that omit metrics context (making those spawn operations invisible in `MetricComponent` dashboards), and one dead-code fallback accessing `result.content` on a `sendPrompt()` return. `--allowedTools` is never used, and `MetricsService` shutdown is correctly wired into `before-quit`.

## Findings

- **[IMPORTANT]** TASKKILL_MISSING src/main/claude-service.js:1272 — `this.currentProcess.kill('SIGKILL')` in the 3-second force-kill fallback bypasses `_killProcess`; on Windows with `shell:true` (fallback when `_claudeIsExe` is false) SIGKILL terminates only `cmd.exe`, leaving the child `claude` process orphaned. Replace with `this._killProcess(this.currentProcess)` or invoke `taskkill /pid <pid> /T /F` directly.
- **[IMPORTANT]** TASKKILL_MISSING src/main/claude-service.js:1557 — `check.kill()` inside `isAvailable()`'s 5-second timeout kills a process spawned via `this.getSpawnOptions()`, which sets `shell:true` on Windows when the native exe is not resolved. The shell wrapper is killed but the `claude --version` child may survive. Route through `_killProcess(check)`.
- **[IMPORTANT]** MISSING_METRICS_CONTEXT src/renderer/app.js:5415 — handoff-summary `sendPrompt()` call passes only `{ model, maxTurns }`; omits `metricsComponent`/`metricsOperation`, so one-shot attribution falls back to generic `CLAUDE_SERVICE`/`one-shot-prompt`.
- **[IMPORTANT]** MISSING_METRICS_CONTEXT src/renderer/app.js:7081 — `generateCompletionSummary` `sendPrompt()` call omits `metricsComponent`/`metricsOperation`; completion-summary cost/turns cannot be isolated in metrics queries.
- **[IMPORTANT]** MISSING_METRICS_CONTEXT src/renderer/lib/modal-manager.js:4629 — Puffin Guide narrative `sendPrompt()` call omits metrics context.
- **[IMPORTANT]** MISSING_METRICS_CONTEXT src/renderer/lib/modal-manager.js:4691 — Puffin Guide follow-up `sendPrompt()` call omits metrics context.
- **[IMPORTANT]** MISSING_METRICS_CONTEXT src/renderer/components/git-panel/git-panel.js:534 — commit-message generation `sendPrompt()` call passes only `{ model, maxTokens }`; no `metricsComponent`/`metricsOperation`.
- **[IMPORTANT]** MISSING_METRICS_CONTEXT src/main/ipc-handlers.js:1782 — `claude:btw-ask` handler calls `claudeService.sendPrompt()` with `{ projectPath, sessionId, disableTools, maxTurns, model, allowConcurrent }` but no `metricsComponent`/`metricsOperation`; `/btw` side-query costs are not distinguishable from generic one-shot prompts.
- **[INFO]** RESULT_CONTENT_MISUSE src/renderer/app.js:7088 — `const responseText = result.response || result.content || ''` keeps a dead `result.content` fallback on a `sendPrompt()` return; the inline comment on line 7087 even notes `sendPrompt()` returns `{ success, response }`, so `result.content` should be removed to prevent resurrecting the old "Completed normally" bug if `result.response` is ever accidentally shadowed.