# User Story: Editable Branch Context Header

## Story

**Title:** Editable Branch Context in Context Plugin

**Description:** As a user, I want to edit the branch focus/context header directly in the Context plugin so that I can customize the instructions Claude receives for each branch without manually editing files.

## Background

Currently, branch focus instructions are hardcoded in `claude-md-generator.js` and generated once when branch files are created. Users cannot easily modify branch-specific instructions like:

```markdown
## Branch Focus: Specifications

You are working on the **specifications thread**. Focus on:
- Requirements gathering and clarification
- Feature definitions and scope
...
```

The Context plugin already allows editing the full CLAUDE_{branch}.md content, but there's no dedicated UI for the branch header/focus section.

## Acceptance Criteria

1. **Branch header is displayed prominently** - The "Branch Focus" section appears as a distinct, editable header at the top of the Context plugin view
2. **Inline editing** - User can click to edit the branch focus text directly
3. **Changes persist to file** - Edits update the `CLAUDE_{branch}.md` file and sync to active `CLAUDE.md`
4. **Visual distinction** - The branch header is visually separated from the rest of the file content
5. **Works for all branches** - Header editing works regardless of which context branch is selected
6. **Preserves markdown formatting** - User can use markdown in the branch focus section
7. **Shows current branch name** - Header clearly indicates which branch context is being edited

## Technical Analysis

### Current Architecture

```
CLAUDE.md = CLAUDE_base.md + CLAUDE_{branch}.md
                              ↑
                              Contains "## Branch Focus: {Name}" section
```

**Key Files:**
- `plugins/claude-config-plugin/renderer/components/ClaudeConfigView.js` - Main UI component
- `plugins/claude-config-plugin/section-parser.js` - Already parses sections including "Branch Focus"
- `plugins/claude-config-plugin/claude-config.js` - Reads/writes context files
- `src/main/claude-md-generator.js` - Generates initial branch files (hardcoded content)

### Existing Infrastructure

The `section-parser.js` already identifies "Branch Focus" as a standard section:
```javascript
const STANDARD_SECTIONS = [
  'Project Context',
  'Project Overview',
  'File Access Restrictions',
  'Coding Preferences',
  'Completed User Stories',
  'Branch Focus'  // Already recognized!
]
```

The plugin already has:
- `getSection(sectionName)` - Get specific section content
- `updateSection(sectionName, newContent)` - Update a section
- IPC handlers for all section operations

### Proposed Implementation

#### Option A: Dedicated Header Component (Recommended)

Add a collapsible header section above the main content area:

```
┌─────────────────────────────────────────────────────┐
│ Context: specifications ▼                           │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📋 Branch Focus                          [Edit] │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ You are working on the **specifications         │ │
│ │ thread**. Focus on:                             │ │
│ │ - Requirements gathering and clarification      │ │
│ │ - Feature definitions and scope                 │ │
│ │ - User stories and acceptance criteria          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ File Content                                    │ │
│ │ [Rest of CLAUDE_{branch}.md content...]         │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Pros:**
- Clear visual separation
- Dedicated edit mode for header
- Users understand this controls Claude's behavior

**Cons:**
- Additional UI complexity
- Need to extract/inject section from file content

#### Option B: Enhanced Section Sidebar

Highlight "Branch Focus" in the existing section sidebar with quick-edit capability:

**Pros:**
- Uses existing UI patterns
- Minimal new code

**Cons:**
- Less discoverable
- Doesn't emphasize importance of branch context

### Recommended Approach: Option A

The dedicated header component better communicates that branch focus is special and directly impacts Claude's behavior.

## Implementation Steps

### Phase 1: Extract Branch Focus Section

1. When loading a context file, use `section-parser.js` to extract the "Branch Focus" section
2. Store it separately from the main content
3. Display in dedicated header UI

### Phase 2: Header UI Component

1. Add new `.branch-focus-header` component to `ClaudeConfigView.js`
2. Display section title and content
3. Add "Edit" button that enables inline editing
4. Style to visually distinguish from file content

### Phase 3: Save Flow

1. On save, use `updateSection()` to update the Branch Focus section
2. Call `syncToActiveCLAUDEmd()` to regenerate active CLAUDE.md
3. Show success toast

### Phase 4: Edge Cases

1. Handle missing "Branch Focus" section (create default)
2. Handle malformed section content
3. Preserve section when switching branches

## File Changes

| File | Changes |
|------|---------|
| `plugins/claude-config-plugin/renderer/components/ClaudeConfigView.js` | Add branch focus header component |
| `plugins/claude-config-plugin/renderer/styles/claude-config-view.css` | Header styling |
| `plugins/claude-config-plugin/index.js` | Optional: Add dedicated IPC handler for branch focus |

## Complexity: **Low-Medium**

- Leverages existing section parser
- No new IPC handlers required (can use existing `updateSection`)
- Primarily UI work in the renderer component

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Section parser edge cases | Low | Already tested with existing section operations |
| Sync issues with CLAUDE.md | Low | Use existing `syncToActiveCLAUDEmd()` flow |
| User confusion about what's editable | Medium | Clear visual distinction and tooltips |

## Out of Scope

- Editing `CLAUDE_base.md` branch instructions (shared across all branches)
- Creating new custom branches (fixed list of 11 branches)
- Real-time preview of how Claude will interpret the focus

## Future Considerations

- **Templates**: Provide starter templates for common branch focus patterns
- **Validation**: Warn if branch focus is too long or potentially conflicting
- **History**: Track changes to branch focus over time

---

*Story ready for sprint planning. Implementation can proceed once approved.*
