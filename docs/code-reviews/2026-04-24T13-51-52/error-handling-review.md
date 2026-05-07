# Code Review: Error Handling Review

**Date:** 2026-04-24

## Summary
Scanned `src/main/**` and `src/renderer/**` for async/promise anti-patterns. Found 31 high-confidence violations (no `await` inside `.forEach(async …)` anti-patterns). The dominant pattern is comment-only `catch` blocks in stream-parsing paths in `claude-service.js` and cleanup paths in `main.js` — they silently swallow errors. The most structurally concerning finding is an unguarded `app.whenReady().then(async …)` bootstrap chain in `main.js:550` whose internal `await initializeProject()` has no try/catch and no `.catch()` on the outer promise, meaning a rejected bootstrap becomes an unhandled rejection. A cluster of renderer plugin lifecycle destroy paths (`plugin-view-container.js`, `plugin-lifecycle-manager.js`, `plugin-manager.js`) combine `async` bodies with `Promise.all` but no error handling. Most `src/main/ipc-handlers.js` handlers and all `src/main/cre/index.js` handlers are properly wrapped.

## Findings

- **[CRITICAL]** THEN_NO_CATCH src/main/main.js:550 — `app.whenReady().then(async () => { … await initializeProject(argPath) })` has no `.catch()` on the chain and the async body has no top-level try/catch; a bootstrap rejection becomes an unhandled promise rejection.
- **[CRITICAL]** EMPTY_CATCH_BLOCK src/renderer/app.js:4878 — `.catch(() => {})` on `_stopWebserverIfRunning` is fully empty; any webserver stop failure is completely swallowed.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/claude-service.js:1810 — `catch (e) { /* Expected: Remaining buffer may not be valid JSON */ }` swallows stream parse errors with no logging.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/claude-service.js:2266 — `catch (e) { /* Not JSON */ }` comment-only; silently drops JSON parse failures.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/claude-service.js:2614 — `catch (e) { /* Ignore parse errors for non-JSON lines */ }` comment-only; hides malformed CLI output.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/claude-service.js:2651 — `catch (e) { /* Buffer may not be valid JSON */ }` comment-only in residual-buffer flush path.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/website-server.js:298 — `catch (_) { /* file not found */ }` comment-only; conflates "not found" with any other fs error.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/claude-md-generator.js:320 — `catch (err) { /* File doesn't exist or can't be read */ }` comment-only; also swallows permission/read errors.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/database/repositories/sprint-repository.js:105 — `catch (e) { /* Fall through to null title */ }` silently hides SQLite/decode errors under a null return.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/ipc-handlers.js:60 — `catch (e) { /* Ignore errors - file might be locked or not exist */ }` in `cleanupWindowsReservedFiles`; swallows all fs errors.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/ipc-handlers.js:179 — `catch { /* state not yet loaded */ }` inline empty catch in `setIpcProjectPath`.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/ipc-handlers.js:3444 — `catch { /* File may not exist yet — that's fine */ }` in `updateSnipHook`; comment-only.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/main/puffin-state.js:3313 — `catch (e) { /* Ignore debug write errors */ }` comment-only.
- **[IMPORTANT]** EMPTY_CATCH_BLOCK src/renderer/lib/activity-tracker.js:49 — `catch (e) { /* Not valid JSON, ignore */ }` comment-only.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/renderer/components/plugin-manager/plugin-manager.js:13 — `async show()` awaits Promise.all and then renders; no top-level try/catch.
- **[IMPORTANT]** PROMISE_ALL_NO_CATCH src/renderer/components/plugin-manager/plugin-manager.js:15 — `await Promise.all([plugins.list(), plugins.listActive()])` not wrapped in try/catch; no `.catch()`.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/renderer/plugins/plugin-view-container.js:253 — `async destroyPluginComponents(pluginName)` body has no try/catch.
- **[IMPORTANT]** PROMISE_ALL_NO_CATCH src/renderer/plugins/plugin-view-container.js:264 — `await Promise.all(toDestroy.map(viewId => this.destroyView(viewId)))` unguarded.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/renderer/plugins/plugin-view-container.js:314 — `async destroy()` body has no try/catch.
- **[IMPORTANT]** PROMISE_ALL_NO_CATCH src/renderer/plugins/plugin-view-container.js:317 — `await Promise.all(viewIds.map(viewId => this.destroyView(viewId)))` unguarded.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/renderer/plugins/plugin-lifecycle-manager.js:303 — `async destroyPluginViews(...)` body has no try/catch.
- **[IMPORTANT]** PROMISE_ALL_NO_CATCH src/renderer/plugins/plugin-lifecycle-manager.js:314 — `await Promise.all(promises)` with no try/catch and no `.catch()`.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/main/cre/lib/cre-storage.js:89 — `async function initializeDefaults(projectRoot)` body awaits Promise.all without try/catch.
- **[IMPORTANT]** PROMISE_ALL_NO_CATCH src/main/cre/lib/cre-storage.js:91 — `await Promise.all([writeIfMissing…])` not wrapped and no `.catch()`.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/main/metrics-service.js:634 — `async function shutdownMetricsService()` awaits `.shutdown()` with no try/catch.
- **[IMPORTANT]** ASYNC_NO_TRY_CATCH src/main/ipc-handlers.js:989 — `async function regenerateUiBranchContext()` helper awaits `claudeMdGenerator.updateBranch(...)` with no try/catch.
- **[INFO]** EMPTY_CATCH_BLOCK src/main/main.js:70 — `catch (_) { /* Window not available — already logged above */ }`; acceptable because error was logged earlier, but still a bare catch.
- **[INFO]** EMPTY_CATCH_BLOCK src/main/main.js:638 — `catch (_) { /* ignore */ }` in `before-quit` website server stop; shutdown path.
- **[INFO]** EMPTY_CATCH_BLOCK src/main/main.js:643 — `catch (_) { /* ignore — non-critical */ }` metrics shutdown.
- **[INFO]** EMPTY_CATCH_BLOCK src/main/main.js:649 — `catch (_) { /* ignore — non-critical */ }` CRE shutdown.
- **[INFO]** EMPTY_CATCH_BLOCK src/main/main.js:681 — `catch { /* Continue */ }` in second-instance handler.