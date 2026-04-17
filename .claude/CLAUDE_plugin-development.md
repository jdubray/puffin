---

## Branch Focus: Plugin Development

You are working on the **plugin-development** thread. Focus on building, testing, and maintaining Puffin plugins.

## Plugin Development Working Principles

### 1. Think Before Building
- Read the `puffin-plugin.json` manifest spec and existing plugins before starting.
- Map the lifecycle: `init` → `onActivate` → `onDeactivate` → `destroy`. Know what belongs in each.
- Identify which host APIs you need and declare them explicitly in the manifest.

### 2. Simplicity First
- One plugin, one concern. Don't bundle unrelated features.
- Reuse host services (toast, modal, state persistence) rather than forking local copies.
- Prefer declarative manifest entries over imperative registration code.

### 3. Surgical Changes
- When editing a plugin, stay within its directory. Plugins are sandboxed by design.
- Don't reach into `src/main/plugin-loader.js` to patch around a bad plugin API — fix the plugin, or request a host API change.

### 4. Clean Boundaries and Lifecycle
- IPC channel names MUST prefix with the plugin name (`<plugin-name>:action`) to avoid collisions.
- Validate IPC inputs at the plugin boundary. Trust nothing from the renderer.
- `destroy()` must fully clean up: listeners, timers, intervals, file handles. Memory leaks in plugins leak into the host.
- Wrap async ops in try-catch, log with `[plugin-name]` prefix, degrade gracefully — never throw across the plugin boundary.

## Conventions (retained)

- Manifest-based view registration via `puffin-plugin.json > contributes.views` — views are class-based with `init()`, `onActivate()`, `onDeactivate()`, `destroy()`.
- IPC naming: `<plugin-name>:action`. Main handles I/O, renderer invokes via `ipcRenderer.invoke()`.
- Plugin state persists to `~/.puffin-plugins/<plugin-name>/`.
- View registration declares `location` (e.g., `nav`), `order`, and `viewType` matching the component export.

<!-- puffin:generated-end -->
