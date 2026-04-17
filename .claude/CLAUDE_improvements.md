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

---

## Improvement Working Principles

### 1. Think Before Optimizing
- Measure first. Don't refactor for a performance problem that hasn't been observed.
- Identify the actual bottleneck — profilers beat hunches.
- Understand what the existing code guarantees before reshaping it.

### 2. Simplicity First
- The best refactor often removes code. If the diff only adds, question whether it's an improvement.
- Don't replace a working pattern with a "more elegant" one without concrete benefit.
- One improvement per commit. Mixed refactors are impossible to review or revert.

### 3. Surgical Changes
- Keep refactors scoped; don't change behavior and structure in the same commit.
- Preserve public contracts (IPC channels, exported functions, SAM action types) unless the task is a renaming.
- Don't touch tests unless the refactor genuinely breaks them — broken tests on a "pure refactor" mean behavior changed.

### 4. Verify Before and After
- Measure post-change. An "improvement" without numbers is an opinion.
- Full test suite must still pass. Manually smoke-test the paths you touched.

<!-- puffin:generated-end -->
