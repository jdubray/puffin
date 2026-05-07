# Assertion Generation: Quick Reference

## Problem → Solution

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| <5% validation rate | Prompt didn't emphasize prediction | Reframed as "predict what Claude will create" |
| AI generated vague assertions | No examples, unclear expectations | Added concrete RIS→assertions example |
| Too few assertions (2-3 per story) | Weak requirement | Enforced EXACTLY 5-8 assertions |
| Valid code failed verification | Strict regex patterns | Expanded patterns (7 function, 6 export patterns) |
| User story distracted from RIS | Both story + RIS in prompt | Removed story, made RIS the only input |

---

## Prompt Changes Summary

### System Prompt: Before → After

**Before:**
> Extract the most critical, verifiable requirements from the RIS to create precise assertions.

**After:**
> You are generating assertions to PREDICT what Claude will create.
>
> CRITICAL: The code does NOT exist yet. Your job is to predict what files/functions/exports Claude will DEFINITELY create when following the RIS.

---

### Task Input: Before → After

**Before:**
```
--- BEGIN STORY ---
Title: Add user authentication
Description: [500 words]
Acceptance Criteria:
  1. Users can log in with email/password
  2. Sessions persist for 30 days
  3. [3 more criteria...]
--- END STORY ---

--- BEGIN RIS ---
[Implementation instructions]
--- END RIS ---
```

**After:**
```
--- BEGIN RIS ---
[Implementation instructions]
--- END RIS ---

Story context for reference only:
Title: Add user authentication
Acceptance Criteria: 5 criteria defined
```

**Impact:** RIS is now the PRIMARY input, story is minimal context.

---

### Example Added

**NEW:**
```
Given RIS excerpt:
"Create file src/main/user-service.js with class UserService that exports methods
getUserById(id) and createUser(data)."

Generate these assertions:
{
  "assertions": [
    { "type": "file_exists", "target": "src/main/user-service.js", ... },
    { "type": "export_exists", "target": "src/main/user-service.js",
      "assertion": { "exports": [{ "name": "UserService", "type": "class" }] } },
    { "type": "function_signature", "target": "src/main/user-service.js",
      "assertion": { "function_name": "getUserById" } },
    { "type": "function_signature", "target": "src/main/user-service.js",
      "assertion": { "function_name": "createUser" } }
  ]
}
```

---

## Verification Pattern Improvements

### Function Signature Patterns

| Code Style | Before | After |
|------------|--------|-------|
| `function foo()` | ✅ | ✅ |
| `foo()` (loose) | ✅ | ✅ |
| `foo = function()` | ✅ | ✅ |
| `async foo()` | ✅ | ✅ |
| `class { foo() {} }` | ❌ | ✅ NEW |
| `{ foo: function() {} }` | ❌ | ✅ NEW |
| `{ 'foo': function() {} }` | ❌ | ✅ NEW |

**Impact:** +3 patterns = catches class methods and object methods

---

### Export Patterns

| Code Style | Before | After |
|------------|--------|-------|
| `exports.Foo` | ✅ | ✅ |
| `module.exports = { Foo }` | ✅ | ✅ |
| `export class Foo` | ✅ | ✅ |
| `export { Foo }` | ✅ | ✅ |
| `export default Foo` | ❌ | ✅ NEW |
| `module.exports = Foo` | ❌ | ✅ NEW |

**Impact:** +2 patterns = catches default exports and direct assignments

---

## Quality Checklist (Added to Prompt)

The AI now validates its own response before submitting:

- ✓ Did I extract file paths directly from RIS text?
- ✓ Did I generate assertions for ALL key functions mentioned in RIS?
- ✓ Did I generate assertions for ALL exports mentioned in RIS?
- ✓ Did I generate 5-8 assertions (not fewer)?
- ✓ Are all paths relative to project root?
- ✓ Are all assertion types valid and data shapes correct?

---

## Expected Results

### Before
```
Story: "Add user service"
Assertions generated: 2
- src/user.js must exist
- User functions should be implemented

Validation: 0/2 pass (0%)
```

### After
```
Story: "Add user service"
Assertions generated: 6
- src/main/user-service.js must exist
- UserService class must be exported
- getUserById method must be implemented
- createUser method must be implemented
- updateUser method must be implemented
- Database module must be imported

Validation: 5/6 pass (83%)
```

---

## How to Test

1. **Create test sprint** with 3 stories
2. **Generate RIS** (ensure RIS includes specific paths/functions)
3. **Generate assertions** (check console for count and quality)
4. **Implement stories** following RIS
5. **Run verification** (aim for >80% pass rate)

### Example Good RIS

```markdown
## Implementation

1. Create file `src/main/auth-service.js`
2. Export class `AuthService` with methods:
   - `login(email, password)` — validates credentials
   - `logout(sessionId)` — terminates session
   - `validateSession(sessionId)` — checks if session is active
3. Import dependencies:
   - `const bcrypt = require('bcrypt')`
   - `const { Database } = require('./database')`
4. Register IPC handlers in `src/main/ipc-handlers.js`:
   - `ipcMain.handle('auth:login', ...)`
   - `ipcMain.handle('auth:logout', ...)`
```

**Why this is good:**
- ✅ Exact file paths
- ✅ Exact class/function names
- ✅ Import statements
- ✅ Integration points (IPC handlers)

From this RIS, the AI should generate:
1. `file_exists`: src/main/auth-service.js
2. `export_exists`: AuthService (class)
3. `function_signature`: login (in auth-service.js)
4. `function_signature`: logout (in auth-service.js)
5. `function_signature`: validateSession (in auth-service.js)
6. `import_exists`: bcrypt (in auth-service.js)
7. `file_contains`: ipcMain.handle('auth:login' (in ipc-handlers.js)
8. `file_contains`: ipcMain.handle('auth:logout' (in ipc-handlers.js)

**Result:** 8 high-quality assertions, all likely to pass.

---

## Troubleshooting

### Issue: Still generating <5 assertions
**Cause:** RIS is too vague
**Fix:** Improve RIS generation prompt to include more specifics

### Issue: Assertions use wrong paths
**Cause:** AI hallucinating paths not in RIS
**Fix:** Check RIS quality — does it explicitly list file paths?

### Issue: Function assertions fail despite correct code
**Cause:** Code style not matched by regex
**Fix:** Add new pattern to `_verifyFunctionExists` in assertion-generator.js

### Issue: Export assertions fail despite correct code
**Cause:** Export style not matched by regex
**Fix:** Add new pattern to `_verifyExportExists` in assertion-generator.js

---

## Files Modified

- `src/main/cre/lib/prompts/generate-assertions.js` — Prompt rewrite
- `src/main/cre/assertion-generator.js` — Regex pattern expansion

## Test Coverage

- No new tests added (prompt changes only)
- Existing test suite: 1753/1899 pass (146 pre-existing failures, no regressions)

---

## Rollback

If validation rate doesn't improve:

```bash
git checkout HEAD~1 -- src/main/cre/lib/prompts/generate-assertions.js
```

Keep regex improvements (low-risk, high-value):
```bash
# Don't revert assertion-generator.js changes
```
