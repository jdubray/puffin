# Claude-Puppeteer Visual Feedback Loop — Website Edition

**Version:** 1.0
**Branch:** fullstack
**Status:** Planning

---

## Overview

This plan adds an automated visual feedback loop to Puffin's Website Edition. When enabled, Claude uses a Puppeteer MCP server to screenshot the running local preview server (`localhost:5000`), analyze the output with its vision capability, and self-correct the code until the rendered result matches the stated intent — without manual browser refreshes or screenshot pasting.

The loop sits on top of the existing Website Edition infrastructure:
- `website-server.js` — already serves `dist/` on a configurable port
- `website-url-panel` — already shows live page navigation
- `claude-service.js` — already spawns the Claude CLI for each prompt

---

## Goals

1. Allow Claude to **see its own output** after every code change in Website Edition mode
2. Close the render-feedback loop without requiring the user to manually paste screenshots
3. Keep the feature **opt-in per session** (toggle button in the UI)
4. Reuse Puffin's existing MCP configuration pattern — no new external infrastructure

---

## Architecture

```
User types prompt
       │
       ▼
  Puffin app.js
  (submit intent)
       │  if puppeteerLoop === true
       │  ┌──────────────────────────────────────┐
       │  │ 1. Append visual-loop suffix to prompt │
       │  │ 2. Pass --mcp-config pointing to       │
       │  │    .puffin/mcp-puppeteer.json          │
       │  └──────────────────────────────────────┘
       │
       ▼
  Claude CLI
  (with Puppeteer MCP tools available)
       │
       ├── Writes/edits code files
       ├── puppeteer_navigate(localhost:5000/page)
       ├── puppeteer_screenshot() → base64 PNG
       ├── Vision: compare PNG to stated goal
       └── Fix code → repeat if needed
```

The Puppeteer MCP server runs as a **stdio subprocess** managed by the Claude CLI process. Puffin only needs to:
1. Write the MCP config JSON file once (on first enable)
2. Pass `--mcp-config <path>` when spawning Claude

---

## Components

### 1. `PuppeteerMcpService` (new — `src/main/puppeteer-mcp-service.js`)

Responsible for:
- Generating and writing `.puffin/mcp-puppeteer.json`
- Checking whether `npx @modelcontextprotocol/server-puppeteer` is resolvable
- Exposing `setup(projectPath)` and `getConfigPath(projectPath)`

MCP config format written to disk:

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
      "env": {}
    }
  }
}
```

### 2. IPC Handlers (updated — `src/main/ipc-handlers.js`)

New channels added to `setupIpcHandlers()`:

| Channel | Args | Returns |
|---|---|---|
| `puppeteer:setup` | `{ projectPath }` | `{ success, configPath, error }` |
| `puppeteer:check` | — | `{ success, available }` — dry-runs npx to verify package is reachable |

### 3. Preload Bridge (updated — `src/main/preload.js`)

```javascript
puppeteer: {
  setup: (projectPath) => ipcRenderer.invoke('puppeteer:setup', { projectPath }),
  check: () => ipcRenderer.invoke('puppeteer:check')
}
```

Accessed in renderer as `window.puffin.puppeteer.*`

### 4. Model State (updated — `src/renderer/sam/model.js`)

Add to `initialModel`:

```javascript
puppeteerLoop: false   // toggled per-session, not persisted
```

Add acceptor `setPuppeteerLoopAcceptor` that sets `model.puppeteerLoop`.

### 5. Visual Loop Toggle Button (updated — `src/renderer/index.html`)

Add inside `#website-url-panel` header, next to the refresh button:

```html
<button id="puppeteer-loop-btn" class="puppeteer-loop-btn" title="Enable Visual Feedback Loop">
  &#128247; <!-- camera emoji -->
</button>
```

Active state toggled via `.puppeteer-loop-btn.active` CSS class (green tint when on).

### 6. App Logic (updated — `src/renderer/app.js`)

**New method: `_setupPuppeteerLoop()`**
Called once when the toggle button is clicked for the first time. Calls `puppeteer:setup`, shows a toast confirming the MCP config was written.

**Modified method: `submit()` / `_buildClaudeArgs()`**
When `this.state.puppeteerLoop === true` AND `this.state.websiteEdition === true`:
- Append `--mcp-config <configPath>` to the Claude CLI args
- Append the visual loop suffix to the prompt text (see §Prompt Template below)

**Toggle handler** bound to `#puppeteer-loop-btn`:
- On first click: run `_setupPuppeteerLoop()`
- Toggle `model.puppeteerLoop` via SAM action
- Update button CSS active class

### 7. CSS (updated — `src/renderer/styles/components.css`)

```css
.puppeteer-loop-btn {
  /* Same base style as .website-url-refresh-btn */
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}

.puppeteer-loop-btn.active {
  background: var(--success-bg, #1a3a1a);
  color: var(--success-color, #4caf50);
  border-color: var(--success-color, #4caf50);
}
```

---

## Prompt Template

When the visual loop is active, Puffin appends this suffix to every submitted prompt:

```
---
[VISUAL FEEDBACK LOOP ACTIVE]

After making any code changes:
1. Use the puppeteer_navigate tool to open http://localhost:<port>/<page> (use the current page if known, otherwise the root).
2. Use the puppeteer_screenshot tool to capture the rendered output.
3. Compare the screenshot against the stated goal above.
4. If there are visual discrepancies (layout, color, text, alignment), fix them and screenshot again.
5. Repeat until the rendered output matches the intent, or you have made 3 correction attempts.

Focus only on what is visible. Do not explore the codebase beyond what is needed to fix the visual issue.
```

The port is substituted from `model.websitePort` (default `5000`).

---

## Implementation Steps

### Step 1 — `PuppeteerMcpService`
- Create `src/main/puppeteer-mcp-service.js`
- Methods: `setup(projectPath)`, `getConfigPath(projectPath)`, `isAvailable()`
- `isAvailable()` runs `npx --yes @modelcontextprotocol/server-puppeteer --version` with a 10s timeout

### Step 2 — IPC Handlers
- Add `puppeteer:setup` and `puppeteer:check` handlers to `ipc-handlers.js`
- Import `PuppeteerMcpService` at top of file

### Step 3 — Preload Bridge
- Expose `window.puffin.puppeteer.setup` and `.check`

### Step 4 — Model & Actions
- Add `puppeteerLoop: false` to `initialModel` in `model.js`
- Add `setPuppeteerLoop(enabled)` action to `actions.js`
- Add `setPuppeteerLoopAcceptor` in `model.js`, registered in acceptors array

### Step 5 — UI (HTML + CSS)
- Add camera toggle button in `index.html` inside `#website-url-panel` header
- Add `.puppeteer-loop-btn` and `.puppeteer-loop-btn.active` in `components.css`

### Step 6 — App Logic
- Bind toggle button click in `_bindWebsiteUrlPanel()` in `app.js`
- Add `_setupPuppeteerLoop()` method
- Modify `_buildClaudeArgs()` (or equivalent submit path) to inject `--mcp-config` and prompt suffix when loop is active

### Step 7 — Test
- Open a Website Edition project
- Enable the Visual Loop toggle
- Prompt: "Make the hero heading red"
- Verify Claude: writes code → screenshots → sees the result → confirms or corrects

---

## File Change Summary

| File | Type | Change |
|---|---|---|
| `src/main/puppeteer-mcp-service.js` | **New** | Setup + config-write service |
| `src/main/ipc-handlers.js` | Modified | Add `puppeteer:setup`, `puppeteer:check` |
| `src/main/preload.js` | Modified | Expose `window.puffin.puppeteer.*` |
| `src/renderer/sam/model.js` | Modified | Add `puppeteerLoop` state + acceptor |
| `src/renderer/sam/actions.js` | Modified | Add `setPuppeteerLoop` action |
| `src/renderer/app.js` | Modified | Toggle binding, `_setupPuppeteerLoop()`, submit args |
| `src/renderer/index.html` | Modified | Camera toggle button in website-url-panel |
| `src/renderer/styles/components.css` | Modified | Button styles |

---

## Not In Scope (this plan)

- **DOM inspection** via Chrome DevTools MCP — useful for debugging specifics, but adds setup complexity. Can be a follow-up.
- **Screenshot tiling** — the standard Puppeteer MCP server produces full-page screenshots. The `mcp-screenshot-website-fast` tiling variant is an optimization for very tall pages and can be swapped in later via the config file.
- **Persisting the loop toggle** across sessions — intentionally ephemeral. The visual loop is a mode you turn on when actively iterating on UI, not a project setting.
- **Authentication flows** — pages requiring login need manual Puppeteer scripting; this plan covers only unauthenticated static-served pages.
- **Automatic dev-server startup** — Puffin's existing `website-server.js` already handles this. No change needed.

---

## Token Usage Note

Each Puppeteer screenshot round-trip consumes significant context. The prompt template caps correction attempts at 3 per prompt to prevent runaway loops. Users should be aware that the visual loop is best used for focused UI tasks (single component, single page) rather than full-site generation passes.
