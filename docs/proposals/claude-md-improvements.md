# Proposal: CLAUDE.md Files Improvement

## Executive Summary

This proposal analyzes the current `.claude/CLAUDE_*.md` files and recommends improvements to make them more effective based on Anthropic's guidelines for CLAUDE.md files.

---

## Current State Analysis

### Files Reviewed

| File | Lines | Status | Quality |
|------|-------|--------|---------|
| `CLAUDE_base.md` | 94 | Content-rich | ⚠️ Bloated |
| `CLAUDE_ui.md` | 162 | Comprehensive | ✅ Good |
| `CLAUDE_backend.md` | 11 | Minimal | ❌ Too sparse |
| `CLAUDE_fullstack.md` | 1 | Empty | ❌ Needs content |
| `CLAUDE_bug-fixes.md` | 1 | Empty | ❌ Needs content |
| `CLAUDE_code-reviews.md` | 1 | Empty | ❌ Needs content |
| `CLAUDE_improvements.md` | 1 | Empty | ❌ Needs content |
| `CLAUDE_plugin-development.md` | 391 | Very detailed | ✅ Excellent |
| `CLAUDE_architecture.md` | 466 | Very detailed | ✅ Good |
| `CLAUDE_specifications.md` | 222 | Detailed | ✅ Good |
| `CLAUDE_deployment.md` | 11 | Minimal | ❌ Too sparse |
| `CLAUDE_tmp.md` | 1 | Empty | ❓ Should delete |
| `CLAUDE_claudemd-plugin.md` | 18 | Template only | ❌ Not customized |

---

## Key Issues Identified

### 1. **Base file is bloated with completed stories**

`CLAUDE_base.md` contains 50+ completed user story titles (lines 39-93). This is **not actionable context** - it doesn't help Claude write better code. It consumes tokens without benefit.

**Recommendation:** Remove completed stories list. If history is needed, reference a separate file.

### 2. **Empty branch files provide no value**

Five files are empty or near-empty:
- `CLAUDE_bug-fixes.md`
- `CLAUDE_fullstack.md`
- `CLAUDE_code-reviews.md`
- `CLAUDE_improvements.md`
- `CLAUDE_tmp.md`

**Recommendation:** Either populate with useful content or remove. Empty files waste context window.

### 3. **Missing practical commands and workflows**

Per Anthropic's guidelines, CLAUDE.md should include:
- Common bash commands
- Testing instructions
- Repository etiquette
- Developer environment setup

None of the current files include these essential elements.

### 4. **Inconsistent structure across files**

Some files are extremely detailed (architecture: 466 lines, plugin-development: 391 lines) while others are empty. This creates an uneven experience.

### 5. **Skills embedded in branch files**

`CLAUDE_ui.md`, `CLAUDE_architecture.md`, and `CLAUDE_specifications.md` have "Assigned Skills" sections with embedded skill definitions. These are lengthy and may be redundant if skills are loaded separately.

---

## Proposed Structure

### New Base File Template

```markdown
# Puffin Project

Electron-based GUI management layer for Claude Code CLI.

## Quick Commands

- `npm start` - Run the application in development
- `npm run build` - Build for production
- `npm test` - Run test suite
- `npm run lint` - Check code style

## Code Style

- ES Modules (import/export), not CommonJS
- camelCase for variables and functions
- JSDoc comments for public APIs
- Hybrid OOP + FP style

## Workflow

- Typecheck after making code changes
- Run single tests for faster feedback: `npm test -- --grep "test name"`
- Prefer editing existing files over creating new ones

## Key Files

| Purpose | Location |
|---------|----------|
| Main process entry | `src/main/main.js` |
| Renderer entry | `src/renderer/app.js` |
| SAM model | `src/renderer/sam/model.js` |
| IPC handlers | `src/main/ipc-handlers.js` |
| Plugin loader | `src/main/plugin-loader.js` |

## Architecture Notes

- SAM pattern for state management (State-Action-Model)
- IPC bridge via preload.js for security
- State persisted to `.puffin/` directory
- Plugins in `plugins/*-plugin/` directories

## Known Issues

- [Add any current gotchas or warnings here]
```

### Branch File Templates

#### Bug Fixes (`CLAUDE_bug-fixes.md`)

```markdown
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
3. **Fix** - Make minimal changes to resolve the issue
4. **Test** - Verify fix works and doesn't break other functionality
5. **Document** - Add comments explaining the fix if non-obvious

## Common Debugging Commands

- `console.log('[COMPONENT] Debug:', value)` - Use component prefix
- Check DevTools Console for renderer issues
- Check terminal for main process issues

## Testing Fixes

- Run related tests: `npm test -- --grep "component name"`
- Manual testing in development mode
```

#### Code Reviews (`CLAUDE_code-reviews.md`)

```markdown
## Branch Focus: Code Reviews

You are working on the **code review thread**. Focus on:
- Code quality and maintainability
- Security vulnerabilities
- Performance issues
- Adherence to project conventions
- Test coverage gaps

## Review Checklist

- [ ] No security vulnerabilities (XSS, injection, path traversal)
- [ ] Error handling for edge cases
- [ ] Event listeners properly cleaned up
- [ ] No memory leaks (timers, subscriptions)
- [ ] Consistent with existing code patterns
- [ ] Adequate test coverage
```

#### Fullstack (`CLAUDE_fullstack.md`)

```markdown
## Branch Focus: Fullstack

You are working on the **fullstack thread**. Focus on:
- End-to-end feature implementation
- Main process + renderer coordination
- IPC communication patterns
- State management across processes

## IPC Patterns

### Request-Response (invoke/handle)
```javascript
// Main process
ipcMain.handle('channel:action', async (event, args) => {
  return result
})

// Renderer
const result = await window.puffin.channel.action(args)
```

### Events (send/on)
```javascript
// Main process
mainWindow.webContents.send('channel:event', data)

// Renderer
window.puffin.channel.onEvent(callback)
```

## Key Integration Points

- IPC handlers: `src/main/ipc-handlers.js`
- Preload bridge: `src/main/preload.js`
- SAM actions: `src/renderer/sam/actions.js`
```

#### Improvements (`CLAUDE_improvements.md`)

```markdown
## Branch Focus: Improvements

You are working on the **improvements thread**. Focus on:
- Performance optimizations
- Code refactoring
- Developer experience enhancements
- Technical debt reduction

## Improvement Guidelines

- Measure before and after for performance changes
- Keep refactors focused - don't change unrelated code
- Maintain backwards compatibility where possible
- Update tests to match improved code
```

---

## Recommendations Summary

### Immediate Actions

1. **Remove completed stories from `CLAUDE_base.md`** - They don't help Claude write code
2. **Delete `CLAUDE_tmp.md`** - Serves no purpose
3. **Populate empty branch files** - Use templates above
4. **Add bash commands section** - Essential for Anthropic's recommended format

### Structural Changes

1. **Trim base file to essentials** - Commands, style, key files, workflow
2. **Keep branch files focused** - 20-50 lines of actionable content
3. **Move detailed documentation elsewhere** - Architecture details belong in docs/, not CLAUDE.md
4. **Consider skill loading separately** - Remove embedded skills if they're loaded via another mechanism

### Content Guidelines

Following Anthropic's recommendations:

| Section | Include | Avoid |
|---------|---------|-------|
| Commands | Build, test, lint commands | Long explanations |
| Style | Concrete rules with examples | Vague preferences |
| Workflow | Specific instructions | General advice |
| Files | Key entry points | Exhaustive file lists |
| Notes | Current gotchas/warnings | Historical information |

---

## File Size Targets

| File | Current | Target | Notes |
|------|---------|--------|-------|
| `CLAUDE_base.md` | 94 lines | 40-50 lines | Remove story list |
| Branch files | 1-466 lines | 30-80 lines | Concise and actionable |
| Skill-heavy files | 200+ lines | Consider splitting | Skills may load separately |

---

## Implementation Priority

1. **High**: Populate empty branch files (bug-fixes, fullstack, code-reviews, improvements)
2. **High**: Trim `CLAUDE_base.md` to essentials
3. **Medium**: Add common commands section to base file
4. **Medium**: Standardize branch file structure
5. **Low**: Review skill embedding approach
6. **Low**: Delete `CLAUDE_tmp.md`

---

*This proposal aims to make CLAUDE.md files more effective by following Anthropic's guidelines: concise, actionable, and human-readable.*
