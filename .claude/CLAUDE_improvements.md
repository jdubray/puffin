---

## Branch Focus: Improvements

You are working on the **improvements thread**. Focus on:
- Performance optimizations
- Code refactoring
- Developer experience enhancements
- Technical debt reduction

## Improvement Guidelines

- **Measure first** - Profile before and after performance changes
- **Stay focused** - Keep refactors targeted, don't change unrelated code
- **Maintain compatibility** - Avoid breaking existing functionality
- **Update tests** - Ensure tests reflect improved code

## Common Improvement Areas

| Area | Focus |
|------|-------|
| Performance | Reduce re-renders, optimize loops, lazy loading |
| Readability | Clear naming, consistent patterns, better docs |
| Maintainability | DRY principles, modular design, clear interfaces |
| Developer UX | Better errors, logging, debugging tools |

## Branch Memory (auto-extracted)

### Conventions

- Protected default branches that cannot be deleted: 'improvements' and 'tmp' (in addition to standard main/develop). These are project-wide reserved branch names.
- User story acceptance criteria state is stored on the story object itself and preserved across sprint reassignment. Story status is reset to 'pending' on sprint close if incomplete, while 'completed' status is retained.
- IPC handlers pass coding standards from config to code generation functions. Coding standards are included in CLAUDE_base.md to avoid duplication across branch files. Existing configs automatically receive empty codingStandard object on load.
- State properties set on model (like _sprintToArchive, _completedStoryIdsToSync) must be exposed in computeState() to be visible in renderer state. Properties hidden in model are inaccessible to state-persistence and other consumers.

### Architectural Decisions

- Marker syntax changed from /@puffin: ... // to /@puffin: ... @/ for symmetry and to avoid JavaScript comment conflicts. This affects document parsing across the codebase.
- Document modification uses structured <<<CHANGE>>> block format with FIND/REPLACE operations applied programmatically rather than requesting complete document returns (which get truncated). Includes 5 fuzzy matching strategies for whitespace handling.
- Agents are stored in `.puffin/agents/` (NOT `.claude/agents/`) to prevent Claude Code auto-discovery. Puffin manages agents explicitly with per-branch assignment, providing predictable control and acting as a whitelist/permission system.
- Sprint history stores story IDs as references (not copies), allowing live status resolution. Implementation plans are strictly sprint-scoped, not inherited across sprint reassignments. When viewing historical sprints, story status reflects current data.
- RICE FACT framework (Role, Instruction, Context, Example, Format, Aim, Constraints, Tone) used for branch implementation prompts. Each branch type (UI, backend, fullstack) has tailored guidance across all 8 dimensions.
- Agent content inclusion in CLAUDE.md is callback-driven (getAgentContent parameter). Agents are appended per-branch after branch-specific content, with UI components for agent management still pending.

### Bug Patterns

- Loose equality (==) should be used when comparing for root-level prompt identification (parentId == null) to match both null and undefined values from different data sources. Strict equality (===) causes CLI-synced prompts without parentId fields to be excluded from trees.
- Database schema constraints: title fields should default to empty string ('') not NULL to match NOT NULL constraints. Migration rollbacks must include all columns added in forward migrations.
- Sprint repository must not unconditionally set closed_at to NULL during syncStoryStatus() as this clears archive timestamps on every story status update. Sprint cleanup in story deletion must be unconditional to prevent orphaned junction table entries.
