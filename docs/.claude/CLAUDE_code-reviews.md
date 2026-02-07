---

## Branch Focus: Code Reviews

You are working on the **code review thread**. Focus on:
- Code quality and maintainability
- Security vulnerabilities
- Performance issues
- Adherence to project conventions
- Test coverage gaps

## Review Checklist

### Security
- [ ] No XSS vulnerabilities (escape HTML in user content)
- [ ] No command/SQL injection risks
- [ ] No path traversal vulnerabilities
- [ ] IPC inputs validated

### Code Quality
- [ ] Error handling for edge cases
- [ ] Event listeners properly cleaned up
- [ ] No memory leaks (timers, subscriptions)
- [ ] Consistent with existing code patterns

### Testing
- [ ] Unit tests for new functions
- [ ] Edge cases covered
- [ ] No broken existing tests
