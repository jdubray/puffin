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
- Document marker syntax uses `/@puffin: ... @/` delimiters (changed from `/@puffin: ... //`) for symmetry and to avoid JavaScript comment conflicts.
- Structured change format for document modifications uses `<<<CHANGE>>>` blocks with FIND/REPLACE operations applied programmatically via fuzzy matching (5 different strategies) to handle whitespace differences.
- User story state is always live data when viewing historical sprints—if a story's status changes in a future sprint, it shows the updated status when viewing past sprints.
- Coding standards configuration is stored per-project in `.claude/skills/coding-standard-{language}/SKILL.md` and included in CLAUDE_base.md to avoid duplication across branch files.
- Coding standards feature: language dropdown populates editable textarea with defaults from SKILL.md templates. Actual content (not just language selection) is stored in config.codingStandard.content and injected into CLAUDE_base.md.
- Document editor uses fuzzy matching with 5 different strategies to handle whitespace differences when applying structured FIND/REPLACE change blocks.
- Calendar week view: display up to 2 full post-it notes per day (vs dots in month view) with explicit activity labels ('1 sprint', '3 stories') instead of ambiguous colored indicators.

### Architectural Decisions
- Agents are stored in `.puffin/agents/` (NOT `.claude/agents/`) to prevent Claude Code auto-discovery. Puffin manages agents explicitly with per-branch assignment, providing predictable control and acting as a whitelist/permission system.
- Marker syntax changed from /@puffin: ... // to /@puffin: ... @/ for symmetry and to avoid JavaScript comment conflicts. This affects document parsing across the codebase.
- Document modification uses structured <<<CHANGE>>> block format with FIND/REPLACE operations applied programmatically rather than requesting complete document returns (which get truncated). Includes 5 fuzzy matching strategies for whitespace handling.
- Sprint history stores story IDs as references (not copies), allowing live status resolution. Implementation plans are strictly sprint-scoped, not inherited across sprint reassignments. When viewing historical sprints, story status reflects current data.
- RICE FACT framework (Role, Instruction, Context, Example, Format, Aim, Constraints, Tone) used for branch implementation prompts. Each branch type (UI, backend, fullstack) has tailored guidance across all 8 dimensions.
- Agent content inclusion in CLAUDE.md is callback-driven (getAgentContent parameter). Agents are appended per-branch after branch-specific content, with UI components for agent management still pending.
- Sprint history persists separately from active sprints in `.puffin/sprint-history.json`, storing sprint metadata (title, description, status, timestamp) and story IDs as references (not copies) to maintain live status resolution across historical views.
