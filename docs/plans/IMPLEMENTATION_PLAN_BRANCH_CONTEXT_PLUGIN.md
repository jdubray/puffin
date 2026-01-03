# Implementation Plan: Branch Context Plugin Migration

**Sprint Stories:**
1. Migrate Branch Contexts to Claude Config Plugin
2. Upload Branch Context to Model on Initialization
3. Sync Branch Context Updates to Model

**Created:** January 2026
**Status:** Ready for Review

---

## Executive Summary

This plan outlines the migration of hardcoded branch context definitions from `claude-service.js` to the Claude Config Plugin system. The migration will establish a unified, plugin-based approach to branch context management with real-time sync capabilities.

---

## 1. Architecture Analysis

### Current State

The system currently has **two parallel mechanisms** for branch contexts:

1. **Hardcoded Contexts** (`claude-service.js:623-671`)
   - Static string definitions in `getBranchContext()` method
   - Prepended to prompts during `buildPrompt()`
   - Cannot be modified at runtime without code changes

2. **Generated CLAUDE.md Files** (`claude-md-generator.js`)
   - Three-layer hierarchy: `CLAUDE_base.md` + `CLAUDE_{branch}.md` → `CLAUDE.md`
   - Managed by `activateBranch()` which concatenates files
   - Plugin provides runtime editing via `ClaudeConfigView`

### Architectural Gap

The hardcoded branch contexts in `claude-service.js` are **not synced** with the `CLAUDE_{branch}.md` files managed by the plugin. This creates:

- **Duplication**: Branch focus defined in two places
- **Inconsistency**: Edits in plugin UI don't affect prompt building
- **Rigidity**: Cannot add new branch types without code changes

### Target State

After implementation:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Config Plugin                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  CLAUDE_{branch}.md files                                │    │
│  │  - Contains "Branch Focus" section                       │    │
│  │  - Editable via ClaudeConfigView UI                      │    │
│  │  - Single source of truth for branch context             │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    claude-service.js                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  getBranchContext() - REMOVED                            │    │
│  │  ↓                                                       │    │
│  │  Replaced with plugin API call to retrieve               │    │
│  │  "Branch Focus" section from CLAUDE_{branch}.md          │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Claude CLI Session                            │
│  - Branch Focus included in system context on init              │
│  - Updates pushed via session continuation                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Order

### Recommended Sequence

| Order | Story | Rationale |
|-------|-------|-----------|
| **1** | Story 1: Migrate Branch Contexts | Foundation - must exist before retrieval or sync |
| **2** | Story 2: Upload on Initialization | Uses migrated data - depends on Story 1 |
| **3** | Story 3: Sync Updates to Model | Enhancement layer - depends on Stories 1 & 2 |

### Dependency Graph

```
Story 1: Migrate Branch Contexts
    │
    ├──► Story 2: Upload on Initialization
    │        │
    │        └──► Story 3: Sync Updates to Model
    │
    └──► (All stories complete)
```

**Critical Path:** Story 1 → Story 2 → Story 3

---

## 3. Technical Approach by Story

### Story 1: Migrate Branch Contexts to Claude Config Plugin

#### Objective
Move the hardcoded branch context strings from `claude-service.js` into `CLAUDE_{branch}.md` files as a standardized "Branch Focus" section.

#### Key Technical Decisions

1. **Section Name Standardization**
   - Use `## Branch Focus: {BranchName}` as the section header
   - Example: `## Branch Focus: Specifications`
   - This allows the section parser to identify and extract it

2. **Default Template Strategy**
   - When `CLAUDE_{branch}.md` is created (or doesn't have Branch Focus section):
     - Check if hardcoded default exists for that branch
     - If yes, use that as initial content
     - If no, use generic placeholder template
   - Store defaults in a separate file: `plugins/claude-config-plugin/branch-defaults.js`

3. **Migration Approach**
   - Create `branch-defaults.js` containing the current hardcoded strings
   - Modify `claude-config.js` `ensureContextFilesExist()` to populate Branch Focus section
   - Update `getBranchContext()` in `claude-service.js` to call plugin API
   - Eventually deprecate and remove hardcoded strings

4. **Backwards Compatibility**
   - Keep `getBranchContext()` method signature unchanged
   - Internal implementation switches from hardcoded → plugin retrieval
   - Fallback to hardcoded if plugin unavailable (graceful degradation)

#### Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `plugins/claude-config-plugin/branch-defaults.js` | **CREATE** | Default branch context templates |
| `plugins/claude-config-plugin/claude-config.js` | MODIFY | Add `getBranchFocus()` method, update file creation |
| `plugins/claude-config-plugin/index.js` | MODIFY | Register new `getBranchFocus` IPC handler |
| `src/main/claude-service.js` | MODIFY | Replace `getBranchContext()` implementation |
| `src/main/ipc-handlers.js` | MODIFY | Wire up new plugin call in submit handler |

#### Implementation Steps

1. **Extract defaults to separate file**
   ```javascript
   // branch-defaults.js
   const BRANCH_DEFAULTS = {
     specifications: {
       title: 'Specifications',
       focus: `[SPECIFICATIONS THREAD - PLANNING & DOCUMENTATION, NO CODE CHANGES]
   Focus on: Requirements gathering, feature definitions, user stories...`,
       codeModificationAllowed: false
     },
     // ... other branches
   };
   ```

2. **Add method to retrieve Branch Focus from file**
   ```javascript
   // claude-config.js
   async getBranchFocus(branch) {
     const content = await this.readConfig(branch);
     const section = this.sectionParser.getSection(content, 'Branch Focus');
     if (section) return section.content;
     return BRANCH_DEFAULTS[branch]?.focus || null;
   }
   ```

3. **Register IPC handler**
   ```javascript
   // index.js
   context.registerIpcHandler('getBranchFocus', async ({ branch }) => {
     return await claudeConfig.getBranchFocus(branch);
   });
   ```

4. **Update claude-service.js**
   ```javascript
   // claude-service.js
   async getBranchContext(branch) {
     try {
       const result = await ipcMain.invoke('plugin:claude-config-plugin:getBranchFocus', { branch });
       if (result.success && result.data) {
         return result.data;
       }
     } catch (err) {
       console.warn('Plugin unavailable, using fallback');
     }
     return this.getFallbackBranchContext(branch); // Legacy hardcoded
   }
   ```

---

### Story 2: Upload Branch Context to Model on Initialization

#### Objective
Ensure Claude receives the branch context when a conversation starts, before any user messages are processed.

#### Key Technical Decisions

1. **Context Injection Point**
   - Currently: `buildPrompt()` prepends branch context to user message
   - Target: Move to `--system-prompt` CLI argument for cleaner separation
   - Alternative: Keep in prompt but ensure it's first

2. **Session Detection**
   - New session: Include full branch context
   - Resumed session: Skip (already in conversation history)
   - Detection: `data.sessionId` presence check (already exists)

3. **Default Handling**
   - If no branch context file exists: Use defaults from `branch-defaults.js`
   - If branch is unknown: Use minimal generic context

4. **Timing**
   - Branch context must be retrieved **before** spawn
   - Async retrieval happens in `submit()` method
   - No blocking UI - context loading is fast (file read)

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/claude-service.js` | MODIFY | Update `buildPrompt()` to use async context retrieval |
| `src/main/ipc-handlers.js` | MODIFY | Ensure context is loaded before submit |

#### Implementation Steps

1. **Make `buildPrompt()` async**
   ```javascript
   async buildPrompt(data) {
     const parts = [];

     // Get branch context from plugin
     const branchContext = await this.getBranchContext(data.branch);
     if (branchContext) {
       parts.push(branchContext);
     }

     // ... rest of prompt building
   }
   ```

2. **Update `submit()` to await prompt**
   ```javascript
   async submit(data) {
     // ...
     const prompt = await this.buildPrompt(data);
     // ...
   }
   ```

3. **Validate context presence**
   ```javascript
   // Add logging/telemetry
   if (!branchContext) {
     console.warn(`No branch context for: ${data.branch}`);
   }
   ```

---

### Story 3: Sync Branch Context Updates to Model

#### Objective
When a user edits the Branch Focus section via the plugin UI, push those changes to the active Claude session immediately.

#### Key Technical Decisions

1. **Update Detection Mechanism**
   - Plugin already emits events when files change
   - Add specific event for Branch Focus section changes
   - `claude-config:branch-focus-updated` event with branch name and new content

2. **Session Communication Challenge**
   - Claude CLI sessions are **streaming processes**, not persistent connections
   - Cannot "inject" new context into running session
   - **Solution A**: Queue context for next message (lightweight)
   - **Solution B**: Send system message with updated context (intrusive)

3. **Recommended Approach: Queued Context Update**
   - Store pending context updates in service state
   - On next user message, prepend update notification:
     ```
     [CONTEXT UPDATE: Branch focus has been updated]
     {new branch focus content}
     ---
     {user message}
     ```
   - Clear pending update after delivery

4. **Persistence Flow**
   - User edits Branch Focus in UI
   - Plugin saves to `CLAUDE_{branch}.md`
   - Plugin calls `activateBranch()` to update `CLAUDE.md`
   - Event emitted to notify claude-service
   - Next prompt includes updated context

5. **No Manual Refresh Required**
   - File watcher already exists in plugin
   - Event-driven update ensures immediate effect
   - User sees acknowledgment in next Claude response

#### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `plugins/claude-config-plugin/claude-config.js` | MODIFY | Emit event on Branch Focus update |
| `plugins/claude-config-plugin/index.js` | MODIFY | Forward event to main process |
| `src/main/claude-service.js` | MODIFY | Listen for updates, queue for next message |
| `src/main/ipc-handlers.js` | MODIFY | Wire up event forwarding |

#### Implementation Steps

1. **Detect Branch Focus changes**
   ```javascript
   // claude-config.js
   async updateSection(context, sectionName, content) {
     const result = await this._updateSection(context, sectionName, content);

     if (sectionName.startsWith('Branch Focus')) {
       this.emit('branch-focus-updated', { branch: context, content });
     }

     return result;
   }
   ```

2. **Queue pending updates in service**
   ```javascript
   // claude-service.js
   constructor() {
     this.pendingContextUpdate = null;

     // Listen for updates
     ipcMain.on('plugin:branch-focus-updated', (event, data) => {
       if (data.branch === this.currentBranch) {
         this.pendingContextUpdate = data.content;
       }
     });
   }
   ```

3. **Include in next prompt**
   ```javascript
   async buildPrompt(data) {
     const parts = [];

     // Check for pending context update
     if (this.pendingContextUpdate) {
       parts.push(`[CONTEXT UPDATE: Branch focus has been updated]\n${this.pendingContextUpdate}\n---`);
       this.pendingContextUpdate = null;
     }

     // ... rest of prompt
   }
   ```

4. **Update CLAUDE.md on Branch Focus change**
   ```javascript
   // After saving Branch Focus section
   await claudeMdGenerator.activateBranch(context);
   ```

---

## 4. File Changes Summary

### Files to Create

| File | Purpose |
|------|---------|
| `plugins/claude-config-plugin/branch-defaults.js` | Default branch context templates extracted from hardcoded values |

### Files to Modify

| File | Changes |
|------|---------|
| `plugins/claude-config-plugin/claude-config.js` | Add `getBranchFocus()`, emit update events, ensure Branch Focus section on file creation |
| `plugins/claude-config-plugin/index.js` | Register `getBranchFocus` IPC handler, forward events |
| `plugins/claude-config-plugin/section-parser.js` | Possibly add helper for Branch Focus extraction (optional) |
| `src/main/claude-service.js` | Replace `getBranchContext()` implementation, add pending update queue, make `buildPrompt()` async |
| `src/main/ipc-handlers.js` | Ensure proper async handling for context retrieval |

### Files to Eventually Deprecate (Not in this sprint)

| File | Reason |
|------|--------|
| Lines 623-671 of `claude-service.js` | Hardcoded branch strings will become fallback only, then removed |

---

## 5. Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Plugin unavailable during prompt build | Claude receives no branch context | Implement fallback to hardcoded defaults |
| Async changes break existing flow | Prompt submission fails | Thorough testing of all branch types |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context sync too slow | User edits not reflected immediately | Add loading indicator, ensure file I/O is efficient |
| Branch Focus section naming inconsistency | Parser fails to extract | Standardize format, add validation |
| Existing CLAUDE_{branch}.md files lack Branch Focus section | No context loaded | Auto-populate from defaults on first read |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Event listener memory leaks | Resource exhaustion over time | Proper cleanup in service lifecycle |
| User edits malformed markdown | Section parser errors | Input validation, error boundaries |

---

## 6. Complexity Assessment

| Story | Complexity | Rationale |
|-------|------------|-----------|
| **Story 1: Migrate Branch Contexts** | **Medium** | Involves multiple files, new module creation, maintaining backwards compatibility |
| **Story 2: Upload on Initialization** | **Low** | Relatively straightforward - modify existing flow to use async retrieval |
| **Story 3: Sync Updates to Model** | **Medium-High** | Event-driven architecture, state management, edge cases around timing |

### Overall Sprint Complexity: **Medium**

---

## 7. Testing Strategy

### Unit Tests

- `branch-defaults.js`: Validate all expected branches have defaults
- `claude-config.js`: Test `getBranchFocus()` with various scenarios
- `section-parser.js`: Test Branch Focus extraction

### Integration Tests

- Plugin IPC handler responds correctly
- `claude-service.js` retrieves context from plugin
- Fallback works when plugin unavailable

### End-to-End Tests

- Create new conversation, verify branch context in prompt
- Edit Branch Focus in UI, verify update in next message
- Switch branches, verify correct context loaded

---

## 8. Rollback Plan

If issues arise after deployment:

1. **Immediate**: Uncomment hardcoded `getBranchContext()` implementation
2. **Short-term**: Revert to previous file versions via git
3. **Plugin isolation**: Disable claude-config-plugin, system falls back to hardcoded

The fallback mechanism ensures the system remains functional even if plugin-based retrieval fails.

---

## 9. Open Questions

1. **Should Branch Focus be a reserved/protected section?**
   - Currently users can delete any section
   - Consider preventing deletion of Branch Focus

2. **What happens when user creates a custom branch not in defaults?**
   - Use generic template or require manual setup?

3. **Should context updates be batched or immediate?**
   - Rapid edits could cause many updates
   - Consider debouncing (e.g., 500ms delay)

---

## Appendix A: Current Hardcoded Branch Contexts

Location: `src/main/claude-service.js:623-671`

| Branch | Code Modification | Focus |
|--------|-------------------|-------|
| specifications | ❌ No | Planning & documentation, user stories, acceptance criteria |
| architecture | ✅ Yes | System design, component structure, modularity patterns |
| ui | ✅ Yes | UI/UX design, frontend implementation, styling |
| backend | ✅ Yes | Server-side logic, APIs, database operations |
| deployment | ✅ Yes | CI/CD, infrastructure, DevOps |
| tmp | ✅ Yes | Temporary scratch space for experiments |
| improvements | ✅ Yes | CLI sync log for /puffin-sync tracking |

---

## Appendix B: Existing CLAUDE.md Section Structure

Example from `CLAUDE_specifications.md`:

```markdown
# Branch Focus: Specifications

[SPECIFICATIONS THREAD - PLANNING & DOCUMENTATION, NO CODE CHANGES]
Focus on: Requirements gathering, feature definitions, user stories...

**IMPORTANT: NO CODE CHANGES ALLOWED**
...
```

The "Branch Focus" section will be extracted and used as the branch context.

---

## Approval Checklist

- [ ] Architecture approach reviewed
- [ ] File change scope acceptable
- [ ] Risk mitigations adequate
- [ ] Testing strategy complete
- [ ] Rollback plan viable

**Ready for Implementation:** Pending Review
