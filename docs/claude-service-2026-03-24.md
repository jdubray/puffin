# Claude Service Integration Review — 2026-03-24

Automated nightly audit of process kill behavior, one-shot CLI tool restrictions,
metrics instrumentation, batch flush on shutdown, and completion summary response
field handling across `src/main/claude-service.js`, `src/main/cre/`,
`src/main/metrics-service.js`, `src/main/main.js`, and `src/renderer/app.js`.

---

## Summary

| Criterion | Result |
|---|---|
| Process tree kill uses `/T /F` on Windows | COMPLIANT |
| One-shot CLI calls disable tools (no MCP servers) | **VIOLATION — `ris-generator.js` missing `disableTools: true`** |
| metricsComponent/metricsOperation passed through CRE callers | COMPLIANT |
| MetricsService batch writes flushed on shutdown | COMPLIANT |
| Completion summary checks `result.response` before `result.content` | COMPLIANT (fix in place) |

---

## Finding 1 — Process Tree Kill on Windows (AC1)

**Confidence: 97** | **Result: COMPLIANT**

`src/main/claude-service.js:125–137` — `_killProcess()` helper used by all five
CLI-spawning methods:

```javascript
_killProcess(proc) {
  if (!proc) return
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
        if (err) proc.kill('SIGTERM')   // fallback if taskkill fails
      })
    } else {
      proc.kill('SIGTERM')
    }
  } catch (e) { /* ignore */ }
}
```

`/T` terminates the entire process tree rooted at `proc.pid`; `/F` forces immediate
termination without waiting. This correctly handles the Windows `shell: true` scenario
where `spawn('cmd', {shell: true})` creates a wrapper `cmd.exe` parent — killing only
the parent would leave the `claude` child process orphaned and running.

`proc.pid` is an integer from a Node.js `ChildProcess` object, not user-supplied input.
Integer PIDs cannot be used for shell injection in `exec()`.

All five CLI callers use `_killProcess`:

| Method | Call site |
|---|---|
| `submit()` | `claude-service.js:190` |
| `sendPrompt()` | `claude-service.js:2093` |
| `deriveStories()` | `claude-service.js:2226` |
| `generateTitle()` | `claude-service.js:2310` |
| One-shot CRE calls via `sendCrePrompt()` | delegates to `sendPrompt()` |

---

## Finding 2 — One-Shot CLI Calls Without MCP Servers (AC2)

**Confidence: 91** | **Result: VIOLATION**

One-shot CRE CLI calls use `--print` and `maxTurns: 1` — the Claude CLI exits after
producing one response. No MCP servers are connected. If the model responds with a
tool-use block (because it believes `hdsl_*` or built-in tools are available), the
CLI exits without executing tools, and the caller receives either a tool-use response
object or empty output instead of the expected structured JSON.

Two protection layers exist:

1. **`disableTools: true`** — adds `--mcp-config <empty-file> --strict-mcp-config` to
   CLI args, preventing the model from receiving any tool definitions.

2. **`includeToolGuidance: false`** — omits the `CODE_MODEL_TOOLS_BLOCK` from the
   system prompt, so the prompt text does not instruct the model to use tools.

### 2a. `ris-generator.js` uses `includeToolGuidance: false` but NOT `disableTools: true`

**`src/main/cre/ris-generator.js:~190`** (generateRis call):

```javascript
await sendCrePrompt(ctx, prompt, {
  includeToolGuidance: false,
  metricsComponent: 'cre',
  metricsOperation: 'ris-generation',
  storyId,
  planId
  // ← disableTools: true is absent
})
```

Compare with `assertion-generator.js` (compliant):
```javascript
await sendCrePrompt(ctx, prompt, {
  includeToolGuidance: false,
  disableTools: true,           // ← present
  metricsComponent: 'cre',
  metricsOperation: 'assertion-generation',
  // ...
})
```

And `plan-generator.js` (compliant, three call sites, all include `disableTools: true`).

**Impact:** Without `disableTools: true`, the Claude CLI is spawned with its full default
tool set (Read, Grep, Bash, etc.). If the model decides to explore the codebase to
validate a RIS item against the implementation, it will spend turns on tool calls rather
than producing the expected structured JSON output. The one-shot session then returns
a tool-use response object instead of parseable RIS JSON, causing RIS generation to
fail silently (zero RIS items stored, or a parse error).

The `includeToolGuidance: false` reduces the *probability* of tool use by not mentioning
tools in the prompt text, but it does not prevent the model from using them when it
independently decides to. The model's system prompt (injected by the CLI) still lists
available built-in tools regardless of `includeToolGuidance`.

**Fix:**

```javascript
// src/main/cre/ris-generator.js — add disableTools: true to all sendCrePrompt calls
await sendCrePrompt(ctx, prompt, {
  includeToolGuidance: false,
  disableTools: true,           // ← add this
  metricsComponent: 'cre',
  metricsOperation: 'ris-generation',
  storyId,
  planId
})
```

### 2b. All other CRE callers are compliant

| File | `disableTools` | `includeToolGuidance: false` |
|---|---|---|
| `plan-generator.js` (3 call sites) | `true` ✓ | `true` ✓ |
| `assertion-generator.js` (1 call site) | `true` ✓ | `true` ✓ |
| `introspector.js` (1 call site) | `true` ✓ | `true` ✓ |
| `ris-generator.js` (1 call site) | **absent ✗** | `true` ✓ |

---

## Finding 3 — Metrics Instrumentation in CRE Callers (AC3)

**Confidence: 95** | **Result: COMPLIANT**

All CRE prompt generation calls pass `metricsComponent` and `metricsOperation` to
`sendCrePrompt()`, which forwards them to `sendPrompt()` where they are consumed by
the MetricsService instrumentation at `claude-service.js:1981–1982`.

| File | metricsComponent | metricsOperation |
|---|---|---|
| `plan-generator.js` (generate) | `'cre'` | `'plan-generation'` |
| `plan-generator.js` (iterate) | `'cre'` | `'plan-iteration'` |
| `plan-generator.js` (answer) | `'cre'` | `'plan-answering'` |
| `assertion-generator.js` | `'cre'` | `'assertion-generation'` |
| `ris-generator.js` | `'cre'` | `'ris-generation'` |
| `introspector.js` | `'cre'` | `'introspection'` |

`sendPrompt()` at `claude-service.js:1981–1982`:
```javascript
const metricsComponent = options.metricsComponent || 'claude-service'
const metricsOperation = options.metricsOperation || 'send-prompt'
```

These values are passed to `getMetricsService()?.record(...)` after response parsing.
Both `storyId` and `planId` are also forwarded via `options` and included in the metrics
event for per-story cost and token attribution.

**Note on `sprintId`:** `sendCrePrompt()` does not extract or forward `sprintId` from
options to `sendPrompt()`. The sprint-level metric correlation is absent from CRE
events — a gap in traceability but not a correctness issue.

---

## Finding 4 — MetricsService Batch Flush on Shutdown (AC4)

**Confidence: 97** | **Result: COMPLIANT**

`src/main/main.js:528` calls `shutdownMetricsService()` inside the `before-quit`
event handler, before any other teardown:

```javascript
app.on('before-quit', async (event) => {
  event.preventDefault()
  await shutdownMetricsService()    // line 528 — flushes batch, clears timer
  await cre.shutdown()              // line 534
  // ...
  await pluginManager.shutdown()   // line 540
  app.exit(0)
})
```

`shutdownMetricsService()` at `metrics-service.js:616`:
1. Calls `this.flush()` to write any buffered events in the pending batch to SQLite.
2. Calls `clearInterval(this.flushTimer)` to stop the 5-minute auto-flush interval.
3. Sets the module-level singleton to `null`, preventing stale access after shutdown.

The flush is `await`ed, so `before-quit` does not proceed to `app.exit()` until all
buffered metrics are persisted. No events are lost on normal application close.

**One edge case:** An abnormal process termination (SIGKILL, power loss, crash) bypasses
`before-quit`. The 50-event batch threshold and 5-minute flush interval mean up to
49 events within the last 5 minutes could be lost. This is acceptable for telemetry
and matches the design intent of a batched async metrics system.

---

## Finding 5 — Completion Summary Response Field (AC5)

**Confidence: 96** | **Result: COMPLIANT (fix in place)**

`src/renderer/app.js:6546` — `generateCompletionSummary()`:

```javascript
const responseText = result.response || result.content || ''
```

`sendPrompt()` returns `{ success: boolean, response: string, ... }`. The `response`
field holds the raw text output from the Claude CLI. There is no `content` field on
the return object; `result.content` is always `undefined`.

**Historical bug:** An earlier version of this line read:
```javascript
const responseText = result.content || result.response || ''
```

With `result.content` checked first and always being `undefined`, the expression
always fell through to `result.response`. However, if `result.response` was also
falsy (empty string or undefined on error), the fallback produced an empty string,
leading to the "Completed normally" default summary being shown for every story
regardless of Claude's actual output.

**Current state:** `result.response` is now checked first. If `sendPrompt()` succeeds,
`result.response` contains the summary text. The `|| result.content || ''` chain
is a belt-and-suspenders fallback for future API shape changes. **No issue.**

---

## Prioritized Recommendations

### High Priority

1. **Add `disableTools: true` to `ris-generator.js` `sendCrePrompt()` call** (Finding 2a):
   One-line addition. Without it, the Claude CLI for RIS generation retains access to
   built-in tools (Read, Grep, Bash). If the model explores the codebase instead of
   producing structured JSON, RIS generation fails silently — the same bug that was fixed
   for assertion generation and plan generation.

### Low Priority

2. **Forward `sprintId` through `sendCrePrompt()` to `sendPrompt()`** (Finding 3 note):
   Enables sprint-level cost attribution in metrics. Currently `metricsComponent` and
   `metricsOperation` are forwarded but `sprintId` is not extracted at the
   `sendCrePrompt()` layer. Low urgency — affects traceability only, not correctness.
