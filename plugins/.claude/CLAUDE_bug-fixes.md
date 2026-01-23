---

## Branch Focus: Bug Fixes

You are working on the **bug fixes thread**. Focus on:
- Identifying and diagnosing bugs
- Root cause analysis
- Implementing fixes with minimal side effects
- Adding regression tests
- Documenting the fix and its rationale

Be thorough in testing and consider edge cases.

## Bug Fix Workflow

1. **Reproduce** - Confirm the bug exists and understand the trigger
2. **Locate** - Find the root cause in the codebase
3. **Fix** - Make minimal, targeted changes to resolve the issue
4. **Test** - Verify fix works and doesn't break other functionality
5. **Document** - Add comments explaining non-obvious fixes

## Debugging Tips

- Use `console.log('[COMPONENT] message:', value)` with component prefixes
- Check DevTools Console (Ctrl+Shift+I) for renderer process issues
- Check terminal output for main process issues
- SAM state changes are logged - look for `[SAM]` prefixed messages

## Common Bug Categories

| Category | Key Files to Check |
|----------|-------------------|
| State bugs | `src/renderer/sam/model.js` (acceptors) |
| IPC issues | `src/main/ipc-handlers.js`, `src/main/preload.js` |
| UI glitches | `src/renderer/app.js`, `src/renderer/components/` |
| Plugin errors | `plugins/*-plugin/`, `src/main/plugin-loader.js` |
