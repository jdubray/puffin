# Inspection Assertion Generation Analysis

## Executive Summary

**Problem:** Assertion validation rate has dropped from >50% to <5% after introducing RIS (Refined Implementation Specification).

**Root Cause Analysis:** The refactor to generate assertions FROM RIS (instead of before RIS) was implemented correctly, but the prompt and assertion generation strategy may not be extracting the right verifiable details from RIS content.

---

## Current Code Path (Post-RIS Refactor)

### 1. Entry Point: `app.js` — Sprint Plan Approval

**File:** `src/renderer/app.js`
**Method:** `handleCreApproval(planId)` (lines 4768-4913)

**Flow:**
```
User clicks "Approve Plan"
  ↓
Step 1: Approve plan (cre:approve-plan)
  ↓
Step 2: Generate RIS for each story (cre:generate-ris) ← NEW ORDER
  ↓
Step 3: Generate Assertions for each story (cre:generate-assertions) ← USES RIS NOW
  ↓
Step 4: Complete (risMap, crePlanningComplete)
```

**Key Code (Step 3):**
```javascript
// Line 4860-4880 approx
for (let i = 0; i < stories.length; i++) {
  const story = stories[i];

  const assertResult = await window.puffin.cre.generateAssertions({
    storyId: story.id,
    planId: plan.id,
    sprintId: this.state.activeSprint?.id
  });

  // Only passes storyId + planId now
  // CRE backend loads story AND RIS from DB
}
```

---

### 2. IPC Handler: `cre:generate-assertions`

**File:** `src/main/cre/index.js` (lines 314-374)

**Inputs:** `{ planId, storyId, [planItem, story, assertions] }`

**Flow:**
```javascript
1. Validate planId + storyId are present
2. Load story from DB (if not provided)
3. Call assertionGenerator.generate({
     story,
     planId,
     storyId,
     planItem: planItem || null,  // Usually null now
     assertions: providedAssertions || null
   })
4. Persist assertions to BOTH:
   - inspection_assertions table
   - user_stories.inspection_assertions JSON column
5. Return { success, data: { prompt, assertions } }
```

**Critical Note:** `planItem` is usually `null` in the new flow — assertions rely entirely on RIS content loaded inside `assertionGenerator.generate()`.

---

### 3. Assertion Generator: Load RIS and Generate

**File:** `src/main/cre/assertion-generator.js`
**Method:** `generate({ story, planId, storyId, risMarkdown, planItem, ... })` (lines 115-209)

**RIS Loading Logic (lines 125-140):**
```javascript
// Try to load RIS from DB if not provided directly
let ris = risMarkdown || '';
if (!ris) {
  try {
    const risRecord = this._db.prepare(
      'SELECT content FROM ris WHERE story_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(storyId, planId);
    if (risRecord && risRecord.content) {
      ris = risRecord.content;
      console.log(`[CRE-ASSERT] Loaded RIS from DB for story ${storyId} (${ris.length} chars)`);
    }
  } catch (err) {
    console.warn(`[CRE-ASSERT] Could not load RIS from DB: ${err.message}`);
  }
}
```

**Prompt Building (lines 144-150):**
```javascript
const prompt = this._promptBuilders.generateAssertions.buildPrompt({
  story,
  risMarkdown: ris,
  planItem: planItem || null,  // Legacy fallback
  codeModelContext,
  includeToolGuidance: false  // ← CRITICAL: Tools disabled
});
```

**AI Call (lines 157-166):**
```javascript
const aiResult = await sendCrePrompt(this._claudeService, prompt, {
  model: MODEL_EXTRACT,     // claude-sonnet-4.5 (from ai-client.js)
  timeout: TIMEOUT_EXTRACT,  // 120 seconds
  label: 'generate-assertions',
  disableTools: true,        // ← No file reading, no codebase exploration
  metricsComponent: 'cre-assertion',
  metricsOperation: 'generate-assertions',
  storyId,
  planId
});
```

**Response Parsing (lines 168-180):**
```javascript
if (aiResult.success && aiResult.data && Array.isArray(aiResult.data.assertions)) {
  toStore = aiResult.data.assertions;
  console.log(`[CRE-ASSERT] AI generated ${toStore.length} assertions for story ${storyId}`);
} else {
  console.warn(`[CRE-ASSERT] AI assertion generation failed for story ${storyId}`);
  if (aiResult.error) {
    console.warn('[CRE-ASSERT] Error:', aiResult.error);
  }
  if (aiResult.raw) {
    console.warn('[CRE-ASSERT] Raw response (first 300 chars):', aiResult.raw.substring(0, 300));
  }
  toStore = [];
}
```

**Validation & Storage (lines 184-208):**
```javascript
for (const a of toStore) {
  try {
    const validated = this._validateAssertion(a);  // Normalizes types, generates UUID
    const record = this._storeAssertion(planId, storyId, validated);
    stored.push(record);
  } catch (err) {
    validationFailures++;
    console.warn(`[CRE-ASSERT] Skipping invalid assertion: ${err.message}`);
  }
}
```

---

### 4. Prompt Builder: Generate Assertions from RIS

**File:** `src/main/cre/lib/prompts/generate-assertions.js`
**Method:** `buildPrompt({ story, risMarkdown, planItem, ... })` (lines 37-179)

#### System Prompt (RIS-based, lines 40-52)

```
You are generating inspection assertions for a user story implementation. You
operate using the DERIVE principle: generate new verifiable knowledge from the
RIS (Refined Implementation Specification) and acceptance criteria.

Assertions will be automatically evaluated against the codebase to verify
implementation completeness.

The RIS contains detailed technical specifications including:
- Exact file paths and function names to implement
- Data structures and API contracts
- Integration points and error handling requirements
- Step-by-step implementation instructions

Extract the most critical, verifiable requirements from the RIS to create
precise assertions.

[CODE_MODEL_TOOLS_BLOCK if includeToolGuidance=true]  ← But it's always false!
```

**ISSUE #1:** `includeToolGuidance` is always `false` (line 149 of assertion-generator.js), so the AI never sees guidance about using hdsl_* tools. But `disableTools: true` means tools wouldn't work anyway.

#### Task Prompt (RIS-based, lines 69-101)

```
Generate inspection assertions for the following user story based on its Refined
Implementation Specification (RIS).

[CODEBASE CONTEXT if provided]
[CODING STANDARDS if provided]

--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
  1. ${ac[0]}
  2. ${ac[1]}
  ...
--- END STORY ---

--- BEGIN RIS (Refined Implementation Specification) ---
${risMarkdown}  ← THIS IS THE KEY INPUT
--- END RIS ---

Generate 5-8 assertions that verify the most critical aspects of this implementation.

IMPORTANT: Extract concrete, verifiable assertions from the RIS content. For each
file, function, class, or integration point mentioned in the RIS:

1. Create a "file_exists" assertion for any new files/directories mentioned
2. Create "function_signature" assertions for key functions specified in the RIS
   (use function_name field)
3. Create "export_exists" assertions for modules that should export specific
   identifiers (use exports array with name and type fields)
4. Create "file_contains" or "import_exists" assertions for integration patterns
   (prefer these over pattern_match)
5. Only use "pattern_match" for truly regex-specific checks — keep patterns short
   and simple

Focus on:
- EVERY file/directory creation mentioned in RIS → file_exists
- EVERY key function name specified in RIS → function_signature
- EVERY export mentioned in RIS → export_exists
- Import statements and module dependencies → import_exists
- Specific text content that must appear → file_contains
- Critical acceptance criteria from the story

The RIS contains specific implementation details - use them to generate precise,
targeted assertions.
```

**OBSERVATION:** The prompt is VERY specific about extracting file paths, function names, and exports from RIS. But success depends entirely on:
1. **RIS quality** — does the RIS actually contain these details?
2. **AI interpretation** — does the AI extract the right details?
3. **AI adherence to JSON schema** — does the output match the schema?

#### Constraints Prompt (lines 134-176)

```
OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "assertions": [
    {
      "id": "<unique id, e.g. IA001>",
      "criterion": "<which acceptance criterion this verifies>",
      "type": "<one of the types below>",
      "target": "<file path relative to project root>",
      "message": "<human-readable description of what this verifies>",
      "assertion": { /* type-specific data — see below */ }
    }
  ]
}

ASSERTION TYPES and their "assertion" data shapes (MUST match exactly):

1. "file_exists" — Check a file or directory exists
   assertion: { "type": "file" }  OR  { "type": "directory" }

2. "function_signature" — Check a function is defined in a file
   assertion: { "function_name": "<name>" }

3. "export_exists" — Check that a module exports specific identifiers
   assertion: { "exports": [{ "name": "<identifier>", "type": "function"|"class"|"const" }] }

4. "pattern_match" — Check for a regex pattern in a file
   assertion: { "pattern": "<simple regex>", "operator": "present"|"absent" }

5. "import_exists" — Check that a file imports specific modules
   assertion: { "imports": [{ "module": "<module name or path>", "names": ["<imported name>"] }] }

6. "file_contains" — Check that a file contains specific text (literal match)
   assertion: { "match": "literal", "content": "<exact text to find>" }

RULES:
- Generate 5-8 assertions per story based on RIS content, or 2-5 if no RIS available
- Use relative paths from project root (e.g. "src/main/foo.js", NOT absolute paths)
- Each assertion ID must be unique
- The criterion field should reference the specific acceptance criterion number (or "general")
- Use the "message" field for human-readable description text
- Keep regex patterns SIMPLE — avoid complex regex
- Prefer "file_contains" or "function_signature" over "pattern_match"
- For function checks, ALWAYS use "function_signature" type (not "function_exists")
- Do NOT use markdown code blocks — output raw JSON only
```

**ISSUE #2:** The AI is instructed to generate IDs like "IA001", but these collide across stories. The code compensates by always generating UUIDs (line 240 of assertion-generator.js), so AI-provided IDs are ignored.

---

## What the AI Receives

### Full Prompt Structure

```
SYSTEM:
You are generating inspection assertions...
[RIS explanation]
Extract the most critical, verifiable requirements from the RIS to create precise assertions.

TASK:
--- BEGIN STORY ---
[Story details]
--- END STORY ---

--- BEGIN RIS ---
[RIS markdown content — THIS IS THE KEY]
--- END RIS ---

Generate 5-8 assertions...
[Detailed extraction instructions]

CONSTRAINTS:
OUTPUT FORMAT — respond with ONLY a valid JSON object:
{ "assertions": [...] }
[Schema details]
```

### What the AI Does NOT Have

1. **No code reading ability** — `disableTools: true` means the AI cannot:
   - Read actual files to verify what exists
   - Use `hdsl_*` tools to query the code model
   - Explore the codebase structure

2. **No codebase context** — unless explicitly passed (usually empty):
   - No file tree
   - No existing function signatures
   - No existing export patterns

3. **No examples** — the prompt doesn't include examples of good vs. bad assertions

### What the AI DOES Have

1. **Story context** — title, description, acceptance criteria
2. **RIS content** — the full markdown RIS document
3. **Schema** — exact JSON structure expected

---

## Assertion Validation (After Generation)

### Validation Logic (`_validateAssertion`, lines 221-246)

1. **Type normalization** — `function_exists` → `function_signature`
2. **Type check** — must be in VALID_TYPES set
3. **Target check** — must be non-empty string
4. **Data normalization** — `_normalizeAssertionData()` fixes common mismatches:
   - `file_exists`: `kind` → `type`
   - `function_signature`: `name` → `function_name`
   - `export_exists`: `exports[].kind` → `exports[].type`
   - `pattern_match`: default `operator` to `'present'`
   - `file_contains`: default `match` to `'literal'`
   - `import_exists`: wrap single import in array
5. **UUID generation** — always `uuidv4()`, ignoring AI-provided IDs

### Verification Logic (Used at Code Review Time)

**File:** `src/main/cre/assertion-generator.js`
**Method:** `verify(assertions)` (lines 361-374)

Calls `_verifyOne()` for each assertion, which dispatches to type-specific verifiers:

1. **`_verifyFileExists`** (lines 430-440) — `fs.stat()` and check `isFile()` or `isDirectory()`
2. **`_verifyFunctionExists`** (lines 448-464) — regex match for function declarations
3. **`_verifyExportExists`** (lines 472-490) — regex match for export patterns
4. **`_verifyPatternMatch`** (lines 498-516) — regex test on file content
5. **`_verifyFileContains`** (lines 524-543) — literal or regex search
6. **`_verifyImportExists`** (lines 551-568) — regex match for import/require

**All verifiers:**
- Read actual file content
- Use regex patterns to detect code structures
- Return `'pass'`, `'fail'`, or `'pending'`

---

## Critical Gaps and Potential Issues

### 1. RIS Quality Hypothesis

**Question:** Does the RIS actually contain the specific details the prompt asks for?

**What to check:**
- Are file paths explicitly mentioned in RIS?
- Are function names explicitly listed?
- Are export lists provided?
- Or is the RIS more conceptual/high-level?

**Example RIS (ideal):**
```markdown
## Instructions

1. Create file: `src/main/foo-service.js`
2. Export class `FooService` with methods:
   - `initialize(config)`
   - `processRequest(data)`
3. Import dependencies:
   - `require('fs').promises` for file I/O
   - `const { validate } = require('./validators')`
4. Register IPC handler `foo:process` in `src/main/ipc-handlers.js`
```

**Example RIS (problematic):**
```markdown
## Instructions

1. Implement a service to handle foo processing
2. The service should validate input and store results
3. Integrate with the existing IPC layer
4. Follow existing patterns in the codebase
```

**Hypothesis:** If RIS is too conceptual, the AI cannot generate specific assertions.

---

### 2. AI Extraction Accuracy

**Question:** Even if RIS contains details, does the AI extract them correctly into JSON?

**What to check:**
- Does the AI follow the schema exactly?
- Does it generate valid paths (relative to project root)?
- Does it pick the RIGHT functions/exports to assert?
- Does it over-generate (too many trivial assertions)?
- Does it under-generate (missing critical assertions)?

**Example failure modes:**
- AI generates `target: "foo.js"` when RIS says `"src/main/foo.js"`
- AI generates `file_exists` for every file mentioned, including helper scripts
- AI misses critical exports because they're buried in implementation details
- AI generates assertions that pass trivially (e.g., file_exists for files that always exist)

---

### 3. Schema Compliance

**Question:** Does the AI output always match the JSON schema?

**Schema:** `src/main/schemas/cre-assertions.schema.json`

**Required fields:**
- `assertions` (array)
- Each assertion: `id`, `type`, `target`

**Optional fields:**
- `criterion`, `message`, `description`, `assertion`

**Observed issues in code:**
- AI may use `description` instead of `message` (handled by normalization)
- AI may use `kind` instead of `type` in file_exists (handled by normalization)
- AI may use `name` instead of `function_name` in function_signature (handled)

**What normalization DOESN'T handle:**
- Invalid `type` values (rejected by validation)
- Missing `target` (rejected)
- Malformed `assertion` data that doesn't match expected shape

---

### 4. Verification Regex Patterns

**Question:** Are the regex patterns in verification too strict or too loose?

**Function detection patterns (lines 454-459):**
```javascript
const patterns = [
  new RegExp(`function\\s+${funcName}\\s*\\(`),          // function foo(
  new RegExp(`${funcName}\\s*\\(`),                      // foo(
  new RegExp(`${funcName}\\s*=\\s*(?:async\\s+)?(?:function|\\()`), // foo = function / foo = async (
  new RegExp(`async\\s+${funcName}\\s*\\(`)             // async foo(
];
return patterns.some(p => p.test(content));
```

**Potential issues:**
- Doesn't match class methods: `class Foo { bar() {} }`
- Doesn't match arrow functions without assignment: `const foo = () => {}`
- Doesn't match destructured function exports: `module.exports = { foo }`

**Export detection patterns (lines 478-484):**
```javascript
const patterns = [
  new RegExp(`exports\\.${name}\\b`),                     // exports.foo
  new RegExp(`module\\.exports\\b[^;]*${name}`),          // module.exports = { foo }
  new RegExp(`export\\s+(const|let|var|function|class|default)\\s+${name}\\b`), // export const foo
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`)           // export { foo }
];
```

**Potential issues:**
- May miss renamed exports: `export { foo as bar }`
- May miss re-exports: `export * from './foo'`
- May miss default exports: `export default foo`

---

### 5. Timing and Freshness

**Question:** Are assertions evaluated against stale code?

**When assertions are generated:**
- Plan approval → RIS generation → Assertion generation (before implementation)

**When assertions are evaluated:**
- Code review modal (after sprint completion)
- Manual evaluation via UI

**Potential issue:**
- Assertions generated based on RIS (what SHOULD be implemented)
- Evaluated against codebase (what WAS implemented)
- If implementation deviates from RIS, assertions fail

**Is this a bug or a feature?**
- **Feature:** Assertions verify RIS compliance (implementation fidelity)
- **Bug:** If RIS is vague, assertions can't predict actual implementation

---

## Diagnostic Checklist

To understand why assertion validation dropped from >50% to <5%, check:

### 1. **Inspect Recent RIS Content**

**Query:**
```sql
SELECT story_id, plan_id, LENGTH(content) as ris_length,
       substr(content, 1, 1000) as ris_sample
FROM ris
WHERE created_at > '2026-01-01'  -- Recent sprints
ORDER BY created_at DESC
LIMIT 10;
```

**Questions:**
- Are file paths explicitly listed?
- Are function names explicitly listed?
- Are exports explicitly listed?
- Or is the content high-level/conceptual?

---

### 2. **Inspect Recent Assertions**

**Query:**
```sql
SELECT ia.story_id, ia.type, ia.target, ia.message, ia.assertion_data, ia.result
FROM inspection_assertions ia
JOIN ris r ON ia.story_id = r.story_id AND ia.plan_id = r.plan_id
WHERE ia.created_at > '2026-01-01'
ORDER BY ia.created_at DESC
LIMIT 50;
```

**Questions:**
- What types are being generated? (file_exists, function_signature, export_exists, ...)
- Are targets valid paths?
- Are assertion_data structures correct?
- Do assertions look realistic (or generic/vague)?

---

### 3. **Check Validation Failures**

**Console logs to look for:**
```
[CRE-ASSERT] Skipping invalid assertion: <reason>
[CRE-ASSERT] AI assertion generation failed for story <id>
[CRE-ASSERT] Raw response (first 300 chars): <response>
```

**If validation failures are high:**
- AI is not following the schema
- Need to improve prompt or add examples

---

### 4. **Check Verification Results**

**Query:**
```sql
SELECT
  ia.type,
  ia.result,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY ia.type), 2) as pct
FROM inspection_assertions ia
WHERE ia.verified_at IS NOT NULL  -- Only evaluated assertions
  AND ia.created_at > '2026-01-01'
GROUP BY ia.type, ia.result
ORDER BY ia.type, ia.result;
```

**Expected output:**
```
type                 result    count    pct
-------------------  --------  -------  ------
file_exists          pass      45       75.00%
file_exists          fail      15       25.00%
function_signature   pass      12       30.00%
function_signature   fail      28       70.00%
export_exists        pass      8        40.00%
export_exists        fail      12       60.00%
...
```

**Red flags:**
- `file_exists` pass rate < 50% → paths are wrong
- `function_signature` pass rate < 30% → function names are wrong OR regex is too strict
- `export_exists` pass rate < 30% → export names are wrong OR regex is too strict

---

### 5. **Compare Pre-RIS vs. Post-RIS Assertions**

**Pre-RIS approach:**
- Assertions generated from plan items
- Plan items: `{ approach, filesCreated[], filesModified[] }`
- Simpler, more direct mapping

**Post-RIS approach:**
- Assertions generated from RIS markdown
- RIS: prose document with implementation details
- Requires AI to parse unstructured text

**Hypothesis:** Pre-RIS assertions were more accurate because plan items were structured data (lists of files), making it easier to generate file_exists assertions. Post-RIS requires AI to extract file paths from prose.

**Test:** Compare old vs. new assertion generation logs:
```bash
# Find old assertion generation logs (before RIS refactor)
grep "AI generated.*assertions" <old-log-file>

# Find new assertion generation logs (after RIS refactor)
grep "AI generated.*assertions" <new-log-file>
```

**Questions:**
- Did assertion COUNT drop? (5-8 expected, but maybe only 2-3 generated?)
- Did assertion TYPES change? (more/less file_exists, function_signature, etc.?)

---

## Recommendations

### Immediate Diagnostics

1. **Enable verbose logging:**
   - Add logging in `assertion-generator.js` to dump full RIS content
   - Add logging to dump AI's raw JSON response before validation
   - Add logging to dump validation failures with full assertion object

2. **Inspect 3 recent sprints:**
   - Query RIS content
   - Query generated assertions
   - Query verification results
   - Look for patterns in failures

3. **Manual test:**
   - Pick a recent story with low assertion pass rate
   - Read the RIS manually
   - Write assertions manually
   - Compare to AI-generated assertions
   - Identify gaps

---

### Potential Fixes (Hypotheses to Test)

#### Hypothesis A: RIS Content is Too Vague

**Symptom:** RIS contains conceptual instructions, not specific file paths/function names.

**Fix:** Update RIS generation prompt to be more explicit about including:
- Exact file paths to create/modify
- Exact function names to implement
- Exact exports to define
- Exact imports to add

**File to modify:** `src/main/cre/lib/prompts/generate-ris.js`

**Change:** Add to task prompt:
```
IMPORTANT: Be EXPLICIT about implementation details:
- List EVERY file path to create (e.g., "src/main/foo.js")
- List EVERY function to implement (e.g., "function processRequest(data)")
- List EVERY export to add (e.g., "export class FooService")
- List EVERY import to add (e.g., "import { validate } from './validators'")

These details will be used to generate automatic verification assertions.
```

---

#### Hypothesis B: AI Extraction is Inaccurate

**Symptom:** RIS has details, but AI doesn't extract them correctly into assertions.

**Fix:** Add examples to assertion generation prompt.

**File to modify:** `src/main/cre/lib/prompts/generate-assertions.js`

**Change:** Add to task prompt (after "Focus on:" section):
```
EXAMPLE:

Given RIS excerpt:
"Create file src/main/user-service.js with class UserService that exports methods
getUserById(id) and createUser(data). Import the database module:
const db = require('./database')."

Generate assertions:
{
  "assertions": [
    {
      "id": "IA001",
      "criterion": "general",
      "type": "file_exists",
      "target": "src/main/user-service.js",
      "message": "User service file must exist",
      "assertion": { "type": "file" }
    },
    {
      "id": "IA002",
      "criterion": "general",
      "type": "export_exists",
      "target": "src/main/user-service.js",
      "message": "UserService class must be exported",
      "assertion": { "exports": [{ "name": "UserService", "type": "class" }] }
    },
    {
      "id": "IA003",
      "criterion": "general",
      "type": "function_signature",
      "target": "src/main/user-service.js",
      "message": "getUserById method must be defined",
      "assertion": { "function_name": "getUserById" }
    },
    {
      "id": "IA004",
      "criterion": "general",
      "type": "function_signature",
      "target": "src/main/user-service.js",
      "message": "createUser method must be defined",
      "assertion": { "function_name": "createUser" }
    },
    {
      "id": "IA005",
      "criterion": "general",
      "type": "import_exists",
      "target": "src/main/user-service.js",
      "message": "Database module must be imported",
      "assertion": { "imports": [{ "module": "./database", "names": ["db"] }] }
    }
  ]
}
```

---

#### Hypothesis C: Verification Regex is Too Strict

**Symptom:** AI generates correct assertions, but regex verification fails on valid code.

**Fix:** Expand regex patterns to handle more code styles.

**File to modify:** `src/main/cre/assertion-generator.js`

**Changes:**

1. **Function signature** (lines 454-459) — add class method pattern:
```javascript
const patterns = [
  new RegExp(`function\\s+${funcName}\\s*\\(`),
  new RegExp(`${funcName}\\s*\\(`),
  new RegExp(`${funcName}\\s*=\\s*(?:async\\s+)?(?:function|\\()`),
  new RegExp(`async\\s+${funcName}\\s*\\(`),
  new RegExp(`${funcName}\\s*\\([^)]*\\)\\s*\\{`)  // NEW: class methods
];
```

2. **Export exists** (lines 478-484) — add default export pattern:
```javascript
const patterns = [
  new RegExp(`exports\\.${name}\\b`),
  new RegExp(`module\\.exports\\b[^;]*${name}`),
  new RegExp(`export\\s+(const|let|var|function|class|default)\\s+${name}\\b`),
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`),
  new RegExp(`export\\s+default\\s+${name}\\b`)  // NEW: export default Foo
];
```

---

#### Hypothesis D: Assertion Count is Too Low

**Symptom:** AI generates only 2-3 assertions per story instead of 5-8.

**Fix:** Strengthen the assertion count requirement in the prompt.

**File to modify:** `src/main/cre/lib/prompts/generate-assertions.js`

**Change:** Line 84, make it more forceful:
```javascript
// FROM:
Generate 5-8 assertions that verify the most critical aspects of this implementation.

// TO:
Generate EXACTLY 5-8 assertions that verify the most critical aspects of this
implementation. Do not generate fewer than 5 assertions — extract as many verifiable
details as possible from the RIS.
```

---

#### Hypothesis E: Tools Should Be Enabled

**Symptom:** AI can't verify if files/functions already exist, leading to duplicate or incorrect assertions.

**Fix:** Enable tools for assertion generation (allow code reading).

**File to modify:** `src/main/cre/assertion-generator.js`

**Change:** Lines 157-166:
```javascript
// FROM:
const aiResult = await sendCrePrompt(this._claudeService, prompt, {
  model: MODEL_EXTRACT,
  timeout: TIMEOUT_EXTRACT,
  label: 'generate-assertions',
  disableTools: true,  // ← REMOVE THIS
  metricsComponent: 'cre-assertion',
  metricsOperation: 'generate-assertions',
  storyId,
  planId
});

// TO:
const aiResult = await sendCrePrompt(this._claudeService, prompt, {
  model: MODEL_EXTRACT,
  timeout: TIMEOUT_EXTRACT,
  label: 'generate-assertions',
  disableTools: false,  // ← ENABLE TOOLS
  maxTurns: 3,  // ← Allow multi-turn exploration
  metricsComponent: 'cre-assertion',
  metricsOperation: 'generate-assertions',
  storyId,
  planId
});
```

**Also update:** `src/main/cre/lib/prompts/generate-assertions.js` line 149:
```javascript
// FROM:
includeToolGuidance: false

// TO:
includeToolGuidance: true  // ← Show tool guidance
```

**Risk:** This increases token usage and latency. But if AI can READ files, it can generate more accurate assertions.

---

## Next Steps

1. **Run diagnostics:**
   - Query RIS content (sample 10 recent)
   - Query generated assertions (sample 50 recent)
   - Query verification results (aggregate by type/result)
   - Check console logs for validation failures

2. **Identify pattern:**
   - Is RIS too vague? (Hypothesis A)
   - Is AI extraction wrong? (Hypothesis B)
   - Are regex patterns too strict? (Hypothesis C)
   - Are assertion counts low? (Hypothesis D)
   - Do we need tools? (Hypothesis E)

3. **Test fix:**
   - Implement 1 hypothesis fix at a time
   - Run a test sprint
   - Measure assertion pass rate
   - Compare to baseline (<5%)

4. **Iterate:**
   - If pass rate improves, keep the fix
   - If not, revert and try next hypothesis
   - May need to combine multiple fixes

---

## Summary of Files and Their Roles

| File | Role | Key Methods/Sections |
|------|------|---------------------|
| `src/renderer/app.js` | Orchestrates sprint flow | `handleCreApproval()` — calls RIS generation, then assertion generation |
| `src/main/cre/index.js` | IPC handlers for CRE | `cre:generate-assertions` (lines 314-374) — entry point |
| `src/main/cre/assertion-generator.js` | Core assertion logic | `generate()` (lines 115-209) — loads RIS, builds prompt, calls AI, validates, stores |
| `src/main/cre/lib/prompts/generate-assertions.js` | Prompt template | `buildPrompt()` (lines 37-179) — constructs system/task/constraints prompts |
| `src/main/schemas/cre-assertions.schema.json` | JSON schema | Defines expected AI output structure |
| `src/main/cre/lib/ai-client.js` | AI invocation | `sendCrePrompt()` — spawns Claude CLI with JSON schema |
| `src/main/evaluators/assertion-evaluator.js` | Assertion verification (LEGACY, not used by CRE) | Type-specific evaluators |
| `src/main/cre/assertion-generator.js` | Assertion verification (CRE) | `verify()`, `_verifyOne()`, `_verifyFileExists()`, etc. (lines 361-568) |

---

## Prompt Inputs Summary

### What Goes INTO the Assertion Generation Prompt

1. **Story** (from DB):
   - `id`, `title`, `description`, `acceptanceCriteria[]`

2. **RIS** (from DB):
   - Full markdown content (`ris.content`)
   - Loaded via `SELECT content FROM ris WHERE story_id = ? AND plan_id = ?`

3. **Optional (usually empty)**:
   - `codeModelContext` — structured code model data
   - `codingStandard` — coding style guidelines
   - `planItem` — legacy fallback (usually null now)

### What the AI Outputs

```json
{
  "assertions": [
    {
      "id": "IA001",
      "criterion": "1",
      "type": "file_exists",
      "target": "src/main/foo.js",
      "message": "Foo service file must exist",
      "assertion": { "type": "file" }
    },
    {
      "id": "IA002",
      "criterion": "2",
      "type": "function_signature",
      "target": "src/main/foo.js",
      "message": "processFoo function must be defined",
      "assertion": { "function_name": "processFoo" }
    }
  ]
}
```

### What Gets Stored in DB

**Table:** `inspection_assertions`

**Columns:**
- `id` — UUID (generated by code, not AI)
- `plan_id`, `story_id` — foreign keys
- `type` — assertion type (file_exists, function_signature, etc.)
- `target` — file path
- `message` — human-readable description
- `assertion_data` — JSON (the `assertion` field from AI output)
- `result` — 'pending', 'pass', 'fail'
- `created_at`, `verified_at` — timestamps

**Also stored:** `user_stories.inspection_assertions` JSON column (dual-write pattern for UI reads).

---

**End of Analysis**
