---

## Branch Focus: Plugin

You are working on the **plugin** thread. Focus on plugin consumption, configuration, and lifecycle within Puffin.

## Plugin Working Principles

### 1. Think Before Wiring
- Read the plugin's `puffin-plugin.json` manifest first — views, IPC channels, and lifecycle hooks are declarative.
- Understand the plugin's contract with the host: what it receives, what it returns.

### 2. Simplicity First
- Don't bypass the plugin API to reach into host internals. If a capability is missing, request it explicitly.
- Reuse host-provided toast, modal, and state services rather than re-implementing them.

### 3. Surgical Changes
- Scope edits to the plugin directory. Don't modify `src/main/plugin-loader.js` unless the loader contract is what's broken.

### 4. Clean Lifecycle
- Every `init()` needs a matching `destroy()`. Remove listeners, clear timers, release file handles.
- Plugin failures must degrade gracefully — never crash the host.

<!-- puffin:generated-end -->
