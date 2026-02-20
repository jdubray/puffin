# Inspection Assertion Generation Improvements

## Problem Statement

Assertion validation rate dropped from >50% to <5% after refactoring to generate assertions FROM RIS (Refined Implementation Specification) instead of before RIS generation.

**Root Cause Analysis:**
1. The prompt didn't emphasize that code doesn't exist yet — assertions must PREDICT what will be implemented
2. Including the full user story was distracting — assertions should focus on concrete RIS implementation details
3. No examples of good assertions — the AI needed clear guidance on extraction patterns
4. Verification regex patterns were too strict — missed valid code styles (class methods, default exports, etc.)

## Changes Implemented

### 1. System Prompt Rewrite (`generate-assertions.js`)

**Before:**
```
You are generating inspection assertions for a user story implementation.
Extract the most critical, verifiable requirements from the RIS to create precise assertions.
```

**After:**
```
You are generating inspection assertions to PREDICT what artifacts will be created
when Claude implements a feature following a Refined Implementation Specification (RIS).

CRITICAL CONTEXT:
- The code does NOT exist yet
- Claude will implement the feature following the RIS instructions
- Your job is to PREDICT what files, functions, and integrations Claude will most likely create
- These assertions will be evaluated AFTER implementation to verify completeness

Think of this as: "Given this RIS, what files/functions/exports will Claude DEFINITELY create?"
```

**Impact:** Makes it crystal clear that this is a predictive task, not a verification task.

---

### 2. Task Prompt Restructure

**Before:**
- Included full user story (title, description, acceptance criteria)
- RIS came after story context
- Generic extraction instructions

**After:**
- **Removed user story from main task** (moved to brief reference at end)
- **RIS is the primary and only input**
- Story context provided only as "Title: X, AC count: Y"
- Added concrete EXAMPLE showing extraction from RIS excerpt to assertions

**Example Added:**
```
Given RIS excerpt:
"Create file src/main/user-service.js with class UserService that exports methods
getUserById(id) and createUser(data). Import the database module:
const db = require('./database')."

Generate these assertions:
1. file_exists: src/main/user-service.js
2. export_exists: UserService (class)
3. function_signature: getUserById
4. function_signature: createUser
5. import_exists: ./database (db)
6. file_contains: ipcMain.handle('user:get'
```

**Impact:** AI now sees a clear template for extraction. The example demonstrates:
- Literal path extraction
- Multiple assertion types
- Granularity (one assertion per function, not one per file)

---

### 3. Strengthened Constraints and Quality Checklist

**Added:**
```
RULES FOR HIGH-QUALITY ASSERTIONS:
- Generate EXACTLY 5-8 assertions per story (never fewer than 5)
- Extract paths/names LITERALLY from the RIS text
- Focus on HIGH-CONFIDENCE predictions (artifacts Claude will DEFINITELY create)
- Prioritize core implementation files over helper/utility code
- Be specific in messages (e.g., "FooService class must be exported" NOT "Service must exist")

QUALITY CHECKLIST (before submitting your response):
✓ Did I extract file paths directly from RIS text?
✓ Did I generate assertions for ALL key functions mentioned in RIS?
✓ Did I generate assertions for ALL exports mentioned in RIS?
✓ Did I generate 5-8 assertions (not fewer)?
✓ Are all paths relative to project root?
✓ Are all assertion types valid and data shapes correct?
```

**Impact:**
- Ensures minimum 5 assertions per story (prevents under-generation)
- Enforces literal extraction (reduces AI hallucination)
- Quality checklist acts as internal validation step for the AI

---

### 4. Enhanced Verification Regex Patterns (`assertion-generator.js`)

#### Function Signature Verification

**Before (4 patterns):**
```javascript
const patterns = [
  new RegExp(`function\\s+${funcName}\\s*\\(`),          // function foo(
  new RegExp(`${funcName}\\s*\\(`),                      // foo(
  new RegExp(`${funcName}\\s*=\\s*(?:async\\s+)?(?:function|\\()`), // foo = function
  new RegExp(`async\\s+${funcName}\\s*\\(`)             // async foo(
];
```

**After (7 patterns):**
```javascript
const patterns = [
  new RegExp(`function\\s+${funcName}\\s*\\(`),                           // function foo(
  new RegExp(`${funcName}\\s*\\(`),                                       // foo( - loose match
  new RegExp(`${funcName}\\s*=\\s*(?:async\\s+)?(?:function|\\()`),      // foo = function / foo = async (
  new RegExp(`async\\s+${funcName}\\s*\\(`),                              // async foo(
  new RegExp(`${funcName}\\s*\\([^)]*\\)\\s*\\{`),                        // foo() { - class methods
  new RegExp(`${funcName}\\s*:\\s*(?:async\\s+)?(?:function|\\()`),      // foo: function / foo: async (
  new RegExp(`['"]${funcName}['"]\\s*:\\s*(?:async\\s+)?(?:function|\\()`) // 'foo': function - object methods
];
```

**New Coverage:**
- ✅ Class methods: `class Foo { bar() {} }`
- ✅ Object methods: `{ foo: function() {} }`
- ✅ String-keyed methods: `{ 'foo-bar': function() {} }`

---

#### Export Verification

**Before (4 patterns):**
```javascript
const patterns = [
  new RegExp(`exports\\.${name}\\b`),
  new RegExp(`module\\.exports\\b[^;]*${name}`),
  new RegExp(`export\\s+(const|let|var|function|class|default)\\s+${name}\\b`),
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`)
];
```

**After (6 patterns):**
```javascript
const patterns = [
  new RegExp(`exports\\.${name}\\b`),                                     // exports.Foo
  new RegExp(`module\\.exports\\b[^;]*${name}`),                          // module.exports = { Foo }
  new RegExp(`export\\s+(const|let|var|function|class|default)\\s+${name}\\b`), // export class Foo
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`),                          // export { Foo }
  new RegExp(`export\\s+default\\s+${name}\\b`),                          // export default Foo
  new RegExp(`module\\.exports\\s*=\\s*${name}\\b`)                       // module.exports = Foo
];
```

**New Coverage:**
- ✅ Default exports: `export default Foo`
- ✅ Direct assignment: `module.exports = Foo`

---

## Expected Impact

### Assertion Generation Quality
- **Before:** AI often generated vague assertions like "Implementation should exist"
- **After:** AI extracts concrete, testable assertions like "src/main/foo-service.js must exist", "FooService class must be exported", "processRequest method must be defined"

### Assertion Quantity
- **Before:** Often only 2-3 assertions per story (below target)
- **After:** Enforced minimum of 5 assertions, with explicit instruction to extract ALL key artifacts

### Verification Accuracy
- **Before:** Valid code failed verification due to strict regex patterns
- **After:** Expanded patterns catch class methods, object methods, and various export styles

### Overall Validation Rate
- **Target:** Increase from <5% to >80%
- **Mechanism:**
  1. Better extraction → more accurate file paths and function names
  2. More patterns → fewer false negatives during verification
  3. Examples → AI understands desired granularity
  4. Quality checklist → AI self-validates before responding

---

## Testing Recommendations

### Manual Test Sprint
1. Create a test sprint with 3-5 stories
2. Generate RIS for each story (ensure RIS includes specific file paths and function names)
3. Generate assertions using the new prompt
4. Implement the stories following the RIS
5. Run assertion verification
6. Measure pass rate

### Success Criteria
- ✅ At least 5 assertions generated per story
- ✅ Assertions reference specific file paths from RIS
- ✅ Assertions reference specific function names from RIS
- ✅ Validation pass rate >80% for correctly implemented stories

### Regression Test
Run the test suite:
```bash
node --test tests/
```
Expected: No new failures (146 pre-existing failures remain)

---

## Files Modified

1. **`src/main/cre/lib/prompts/generate-assertions.js`**
   - System prompt rewrite (prediction framing)
   - Task prompt restructure (RIS-only input)
   - Added concrete example
   - Strengthened constraints and quality checklist

2. **`src/main/cre/assertion-generator.js`**
   - Expanded `_verifyFunctionExists` patterns (7 patterns, up from 4)
   - Expanded `_verifyExportExists` patterns (6 patterns, up from 4)

---

## Future Improvements (Not Implemented)

### 1. Enable Tools for Assertion Generation
**Hypothesis E from analysis:** Allow the AI to read files during assertion generation to verify assumptions.

**Change:**
```javascript
// In assertion-generator.js, line 157-166
const aiResult = await sendCrePrompt(this._claudeService, prompt, {
  model: MODEL_EXTRACT,
  timeout: TIMEOUT_EXTRACT,
  label: 'generate-assertions',
  disableTools: false,  // ← ENABLE TOOLS
  maxTurns: 3,          // ← Allow exploration
  ...
});
```

**Tradeoff:** Higher token usage and latency, but potentially more accurate assertions.

**Recommendation:** Test this change only if pass rate doesn't reach >80% with current improvements.

---

### 2. Improve RIS Quality
If assertion pass rate is still low, the root cause may be vague RIS content.

**Update RIS generation prompt** (`src/main/cre/lib/prompts/generate-ris.js`):
```
IMPORTANT: Be EXPLICIT about implementation details:
- List EVERY file path to create (e.g., "src/main/foo.js")
- List EVERY function to implement (e.g., "function processRequest(data)")
- List EVERY export to add (e.g., "export class FooService")
- List EVERY import to add (e.g., "import { validate } from './validators'")

These details will be used to generate automatic verification assertions.
```

---

## Rollback Plan

If assertion pass rate does not improve or decreases:

1. Revert `src/main/cre/lib/prompts/generate-assertions.js` to commit before changes
2. Keep regex pattern improvements in `assertion-generator.js` (low-risk, high-value)
3. File issue with diagnostics:
   - Sample RIS content
   - Sample generated assertions
   - Verification results breakdown by type

---

## Summary

**Key Changes:**
1. ✅ Reframed prompt as predictive task (not verification)
2. ✅ Removed user story from main input (focus on RIS)
3. ✅ Added concrete example of extraction
4. ✅ Added quality checklist
5. ✅ Expanded verification regex patterns

**Expected Outcome:**
Assertion validation rate increases from <5% to >80% by improving both assertion generation (clearer prompt, examples) and verification (more permissive patterns).

**Risk:** Low — changes are prompt refinements and regex expansions, no breaking changes to data structures or flow.

**Next Steps:**
1. Run test sprint
2. Measure assertion pass rate
3. If <80%, investigate RIS quality or enable tools
4. If ≥80%, mark issue as resolved
