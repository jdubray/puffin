# Refactor: Generate Inspection Assertions FROM RIS

## Context

Currently, the Puffin sprint planning workflow generates inspection assertions BEFORE generating the RIS (Ready-to-Implement Specification). This creates a logical inconsistency:

**Current flow:** Plan Approval → Generate Assertions (from plan item) → Generate RIS (includes assertions)

**Problem:** Assertions are generated from high-level plan items and user stories, which lack detailed technical context. The RIS, generated afterward, contains comprehensive implementation details including:
- Specific file paths and function names
- Data structures and API contracts
- Integration points and error handling requirements
- Step-by-step implementation instructions
- Codebase navigation guidance

**User's insight:** It makes more sense to generate assertions FROM the RIS, since the RIS provides the detailed technical specifications that assertions should verify.

**Proposed flow:** Plan Approval → Generate RIS → Generate Assertions (from RIS content)

This refactor will produce more precise, testable assertions that directly verify the detailed requirements specified in the RIS, rather than trying to infer requirements from high-level plan items.

---

## Implementation Approach

### Overview

The refactor involves **reversing the generation order** while maintaining backward compatibility and data integrity. Key constraints:

1. **RIS currently includes assertions** in both the AI prompt (line 82 of generate-ris.js) and fallback markdown (line 122 of ris-generator.js)
2. **Database schema supports this change** - no schema migrations needed
3. **UI orchestration in app.js** controls the sequence (handleCreApproval method)
4. **Two assertion storage locations** must stay in sync (inspection_assertions table + user_stories JSON column)

### Strategy: Three-Phase Refactor

**Phase 1: Decouple RIS from assertions** (COMPLETED)
- Removed `assertions` parameter from `generateRisPrompt.buildPrompt()` in `generate-ris.js`
- Removed `_loadAssertions()` call and method from `ris-generator.js`
- Removed `formatAssertions()` function and its call from `ris-formatter.js`
- Removed assertion section from RIS markdown structure (prompt constraints)
- RIS generation now completes without any assertion dependencies

**Phase 2: Update assertion prompt to use RIS** (COMPLETED)
- Updated `generate-assertions.js` `buildPrompt()` to accept `risMarkdown` parameter (preferred) with `planItem` as legacy fallback
- RIS-based system prompt instructs AI to extract verifiable requirements from detailed RIS specifications
- Updated `assertion-generator.js` `generate()` to auto-load RIS from DB via `story_id + plan_id` query
- Updated `cre/index.js` IPC handler to only require `planId` + `storyId` (loads story from DB, assertions load RIS from DB)
- All existing assertion types, validation, and dual-persistence patterns preserved

**Phase 3: Reverse orchestration flow** (COMPLETED)
- Swapped step order in `app.js` `handleCreApproval()`: RIS generation (Step 2) now runs before assertions (Step 3)
- Progress modal steps reordered: RIS steps appear before assertion steps
- Assertion generation call simplified: only sends `{ planId, storyId }` — CRE backend loads story and RIS from DB
- DB refresh and sprint story sync logic preserved after assertion generation
- Toast message updated to reflect new order: "RIS generated, and assertions ready"

---

## Critical Files

### Main Process (Backend)

1. **`src/main/cre/lib/prompts/generate-ris.js`** (195 lines)
   - Remove `assertions` parameter from buildPrompt() signature
   - Remove assertionsBlock from task prompt (lines 81-83)
   - Update JSDoc to reflect assertions are no longer an input

2. **`src/main/cre/lib/prompts/generate-assertions.js`** (98 lines)
   - Add `ris` parameter to buildPrompt() signature
   - Replace plan-based context with RIS markdown excerpt
   - Update system prompt to extract requirements from RIS
   - Keep existing assertion types and JSON schema

3. **`src/main/cre/ris-generator.js`** (280 lines)
   - Remove `_loadAssertions()` call from generateRIS() (line 90)
   - Remove assertions parameter from buildPrompt() call (line 98)
   - Remove assertions from fallback formatRis() call (lines 122, 138-142)
   - Keep RIS database storage unchanged

4. **`src/main/cre/assertion-generator.js`** (437 lines)
   - Update generate() signature to accept `risMarkdown` instead of `planItem`
   - Load RIS from database using story_id
   - Pass RIS content to prompt builder
   - Keep existing validation and storage logic

5. **`src/main/cre/lib/ris-formatter.js`** (118 lines)
   - Remove formatAssertions() call from formatRis() (line 38)
   - Keep formatAssertions() function for future use
   - Update RIS structure documentation (lines 7-12)

### Renderer Process (Frontend)

6. **`src/renderer/app.js`** (5000+ lines)
   - **handleCreApproval() method** (lines 4768-4913) - THE CRITICAL ORCHESTRATOR
   - Swap Step 2 (assertions) and Step 3 (RIS)
   - Update assertion generation loop to load RIS first
   - Maintain DB refresh and sync logic

### IPC Layer

7. **`src/main/cre/index.js`** (355+ lines)
   - **`cre:generate-assertions` handler** (lines 314-355)
   - Update to expect `risId` or load RIS by `storyId`
   - Keep existing DB persistence logic
   - Maintain dual-write pattern (inspection_assertions + user_stories column)

---

## Detailed Implementation Steps

### Step 1: Update RIS Generation to Remove Assertions

**File: `src/main/cre/lib/prompts/generate-ris.js`**

Change buildPrompt signature:
```javascript
// FROM:
function buildPrompt({ planItem, story, assertions = [], codeModelContext = '', ... })

// TO:
function buildPrompt({ planItem, story, codeModelContext = '', ... })
```

Remove assertionsBlock:
```javascript
// DELETE lines 81-83:
const assertionsBlock = assertions.length > 0
  ? `\nINSPECTION ASSERTIONS (must be satisfied):\n${assertions.map(a => `- [${a.type}] ${a.message} (target: ${a.target})`).join('\n')}\n`
  : '';

// DELETE from task string (line 109):
${assertionsBlock}
```

Update RIS markdown structure documentation (line 177-179):
```javascript
// REMOVE assertion rendering instructions:
## Inspection Assertions
Render each assertion as a markdown checkbox:
- [ ] assertion description (type: X, target: path/to/file)
```

**File: `src/main/cre/ris-generator.js`**

Remove assertion loading:
```javascript
// DELETE line 90:
const assertions = this._loadAssertions(userStoryId);

// UPDATE line 98 - remove assertions parameter:
const prompt = generateRisPrompt.buildPrompt({
  planItem,
  story: parsedStory,
  // assertions,  // DELETE THIS LINE
  codeModelContext: formatted,
  projectConfig: { branch, codingStyle: 'camelCase/JSDoc' },
  includeToolGuidance: true
});

// UPDATE fallback formatRis calls (lines 122, 142):
// Remove assertions from risData object
```

**File: `src/main/cre/lib/ris-formatter.js`**

Update formatRis to not include assertions:
```javascript
function formatRis(risData) {
  const sections = [
    formatContext(risData.context || {}),
    formatObjective(risData.objective || ''),
    formatInstructions(risData.instructions || []),
    formatConventions(risData.conventions || [])
    // formatAssertions(risData.assertions || [])  // REMOVE THIS
  ];
  return sections.join('\n\n');
}
```

Update module documentation (lines 7-12):
```javascript
/**
 * A RIS document has four sections:  // CHANGE from "five sections"
 *   1. Context
 *   2. Objective
 *   3. Instructions
 *   4. Conventions
 *   // 5. Assertions — REMOVED, assertions now generated separately
 */
```

---

### Step 2: Update Assertion Generation to Use RIS

**File: `src/main/cre/lib/prompts/generate-assertions.js`**

Update buildPrompt signature and logic:
```javascript
/**
 * @param {Object} params
 * @param {Object} params.story - The user story with acceptance criteria.
 * @param {string} params.risMarkdown - The RIS markdown content (detailed spec).
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {string} [params.codingStandard] - Coding standard text.
 * @param {boolean} [params.includeToolGuidance] - Whether to include Code Model tool guidance (default: true).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ story, risMarkdown, codeModelContext = '', codingStandard = '', includeToolGuidance = true }) {
  const toolsBlock = includeToolGuidance ? CODE_MODEL_TOOLS_BLOCK : '';

  const system = `You are generating inspection assertions for a user story implementation. You operate using the DERIVE principle: generate new verifiable knowledge from the RIS (Refined Implementation Specification) and acceptance criteria.

Assertions will be automatically evaluated against the codebase to verify implementation completeness.

The RIS contains detailed technical specifications including:
- Exact file paths and function names to implement
- Data structures and API contracts
- Integration points and error handling requirements
- Step-by-step implementation instructions

Extract the most critical, verifiable requirements from the RIS to create precise assertions.
${toolsBlock}`;

  const ac = (story.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');

  const task = `Generate inspection assertions for the following user story based on its Refined Implementation Specification (RIS).
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}
--- END STORY ---

--- BEGIN RIS (Refined Implementation Specification) ---
${risMarkdown}
--- END RIS ---

Generate 3-6 assertions that verify the most critical aspects of this implementation.
Focus on:
- File/directory existence mentioned in RIS
- Key functions and exports specified in RIS
- Integration patterns described in RIS
- Critical acceptance criteria from the story`;

  // Keep existing constraints section unchanged
}
```

**File: `src/main/cre/assertion-generator.js`**

Update generate() method to load RIS:
```javascript
/**
 * Generate assertions for a story using its RIS.
 *
 * @param {Object} params
 * @param {string} params.storyId - User story ID.
 * @param {string} params.planId - Plan ID.
 * @param {string} [params.codeModelContext] - Code model context.
 * @param {Array<Object>} [params.assertions] - Existing assertions to verify (optional).
 * @returns {Promise<Array<Object>>} Array of stored assertion records.
 */
async generate({ storyId, planId, codeModelContext = '', assertions = [] }) {
  // If assertions provided, skip generation and just verify/store them
  if (assertions && assertions.length > 0) {
    return this._verifyAndStoreAssertions(assertions, planId, storyId);
  }

  // Load RIS for this story
  const risRecord = this._db.prepare(
    'SELECT markdown FROM ris WHERE story_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(storyId, planId);

  if (!risRecord || !risRecord.markdown) {
    throw new Error(`No RIS found for story ${storyId} in plan ${planId}. RIS must be generated before assertions.`);
  }

  const risMarkdown = risRecord.markdown;

  // Load story
  const story = this._db.prepare('SELECT * FROM user_stories WHERE id = ?').get(storyId);
  if (!story) {
    throw new Error(`Story ${storyId} not found`);
  }

  // Build prompt with RIS content
  const prompt = generateAssertionsPrompt.buildPrompt({
    story: {
      id: story.id,
      title: story.title,
      description: story.description,
      acceptanceCriteria: JSON.parse(story.acceptance_criteria || '[]')
    },
    risMarkdown,
    codeModelContext,
    codingStandard: '',
    includeToolGuidance: false  // Keep tools disabled for assertion generation
  });

  // Rest of generate() method unchanged (AI call, parsing, validation, storage)
}
```

---

### Step 3: Reverse Orchestration Flow

**File: `src/renderer/app.js`**

Update handleCreApproval() method (lines 4768-4913):

```javascript
async handleCreApproval(planId) {
  try {
    console.log('[App] Starting CRE plan approval flow:', planId);

    // Step 1: Approve the plan (unchanged)
    const approvalResult = await window.puffin.cre.approvePlan(planId);
    if (!approvalResult.success) {
      throw new Error(approvalResult.error || 'Failed to approve plan');
    }

    const { plan, stories } = approvalResult;

    // ============================================================
    // STEP 2: GENERATE RIS FOR EACH STORY (MOVED FROM STEP 3)
    // ============================================================
    console.log('[App] Step 2: Generating RIS for', stories.length, 'stories');

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];

      // Show progress
      this.intents.setCreGenerationProgress({
        phase: 'ris',
        current: i + 1,
        total: stories.length,
        storyTitle: story.title
      });

      const risResult = await window.puffin.cre.generateRis({
        userStoryId: story.id,
        planId: plan.id,
        sprintId: this.state.activeSprint?.id,
        branch: this.state.currentBranch
      });

      if (!risResult.success) {
        console.error('[App] RIS generation failed for story', story.id, risResult.error);
        // Continue with other stories even if one fails
      } else {
        console.log('[App] RIS generated for story', story.id);
      }
    }

    // ============================================================
    // STEP 3: GENERATE ASSERTIONS FOR EACH STORY (MOVED FROM STEP 2)
    // ============================================================
    console.log('[App] Step 3: Generating inspection assertions for', stories.length, 'stories');

    // Refresh stories from DB to get latest data with RIS
    const freshStories = await window.puffin.state.loadUserStories();

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      const freshStory = freshStories.find(s => s.id === story.id);

      // Show progress
      this.intents.setCreGenerationProgress({
        phase: 'assertions',
        current: i + 1,
        total: stories.length,
        storyTitle: story.title
      });

      const assertResult = await window.puffin.cre.generateAssertions({
        storyId: story.id,
        planId: plan.id,
        sprintId: this.state.activeSprint?.id
      });

      if (!assertResult.success) {
        console.error('[App] Assertion generation failed for story', story.id, assertResult.error);
        // Don't throw - continue with other stories
      } else {
        const assertions = assertResult.assertions || [];
        console.log('[App] Generated', assertions.length, 'assertions for story', story.id);

        // Update sprint story state
        const sprintStory = this.state.activeSprint?.stories?.find(s => s.id === story.id);
        if (sprintStory) {
          this.intents.updateSprintStoryAssertions(story.id, assertions);
        }

        // Update user story in DB and state
        this.intents.updateUserStory(story.id, {
          inspectionAssertions: assertions
        });
      }
    }

    // Refresh stories again to ensure DB sync
    const finalStories = await window.puffin.state.loadUserStories();

    // ... rest of handleCreApproval unchanged (risMap, crePlanningComplete, etc.)
  }
}
```

**File: `src/main/cre/index.js`**

Update IPC handler for assertion generation (lines 314-355):

```javascript
ipcMain.handle('cre:generate-assertions', async (event, { storyId, planId, sprintId }) => {
  try {
    // Validate inputs
    if (!storyId || !planId) {
      throw new Error('storyId and planId are required');
    }

    console.log(`[CRE-Assertions] Generating assertions for story ${storyId} in plan ${planId}`);

    // Generate assertions using RIS
    const generated = await assertionGenerator.generate({
      storyId,
      planId,
      codeModelContext: '',  // Optional: could load from code model
      assertions: []  // Empty - let AI generate from RIS
    });

    console.log(`[CRE-Assertions] Generated ${generated.length} assertions for story ${storyId}`);

    // CRITICAL: Persist directly to user_stories.inspection_assertions column
    // (This is the dual-write pattern to keep both storage locations in sync)
    const now = new Date().toISOString();
    ctx.db.prepare(
      'UPDATE user_stories SET inspection_assertions = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(generated), now, storyId);

    return {
      success: true,
      assertions: generated,
      count: generated.length
    };
  } catch (err) {
    console.error('[CRE-Assertions] Generation failed:', err);
    return {
      success: false,
      error: err.message,
      assertions: []
    };
  }
});
```

---

## Database Changes

**None required.** All necessary tables and columns already exist:
- `ris` table stores RIS markdown
- `inspection_assertions` table stores individual assertions
- `user_stories.inspection_assertions` JSON column stores assertion arrays
- Foreign keys and indexes support the new query pattern

---

## Testing & Verification

### Manual Testing Flow

1. **Create a new sprint with stories**
   - Use existing stories or create new ones with clear acceptance criteria
   - Add stories to sprint

2. **Trigger CRE planning**
   - Click "Generate Plan" button
   - Review and approve the generated plan

3. **Verify RIS generation happens first**
   - Check console logs for "Step 2: Generating RIS"
   - Confirm RIS records created in database
   - Verify RIS markdown does NOT contain assertion sections

4. **Verify assertion generation uses RIS**
   - Check console logs for "Step 3: Generating inspection assertions"
   - Confirm assertions reference specific details from RIS (file paths, function names)
   - Verify assertions are more detailed than previous plan-based assertions

5. **Check database consistency**
   - Query `ris` table: RIS exists for each story
   - Query `inspection_assertions` table: assertions exist with correct story_id
   - Query `user_stories` table: `inspection_assertions` JSON column populated
   - Verify all three stores are in sync

6. **Test UI displays**
   - Sprint view shows assertion counts correctly
   - User story detail shows assertions
   - Code review modal shows assertion stats (after sprint completion)

### Database Queries for Verification

```sql
-- Check RIS was generated for stories
SELECT story_id, LENGTH(markdown) as markdown_length, created_at
FROM ris
WHERE plan_id = '<plan_id>'
ORDER BY created_at DESC;

-- Check assertions were generated after RIS
SELECT ia.story_id, COUNT(*) as assertion_count, MIN(ia.created_at) as first_assertion
FROM inspection_assertions ia
JOIN ris r ON ia.story_id = r.story_id
WHERE ia.plan_id = '<plan_id>'
GROUP BY ia.story_id
HAVING first_assertion > (SELECT created_at FROM ris WHERE story_id = ia.story_id LIMIT 1);

-- Check user_stories column sync
SELECT id, title,
  JSON_ARRAY_LENGTH(inspection_assertions) as assertions_in_column,
  (SELECT COUNT(*) FROM inspection_assertions WHERE story_id = user_stories.id) as assertions_in_table
FROM user_stories
WHERE id IN (SELECT story_id FROM ris WHERE plan_id = '<plan_id>');
```

### Edge Cases to Test

1. **RIS generation fails** - assertion generation should fail gracefully with clear error
2. **Empty RIS** - should generate minimal/fallback assertions
3. **No acceptance criteria** - assertions should extract requirements from RIS alone
4. **Very long RIS** - prompt truncation handling
5. **Restart during generation** - state recovery, partial completion

---

## Backward Compatibility

### What Stays the Same

✅ Database schema unchanged
✅ IPC handler signatures unchanged (internal behavior changes only)
✅ Assertion types and validation unchanged
✅ Storage locations unchanged (dual-write pattern maintained)
✅ UI components unchanged (they read from same data sources)
✅ Code review and assertion evaluation unchanged

### What Changes

⚠️ **RIS content** - no longer includes assertion sections
⚠️ **Generation order** - RIS before assertions (internal only)
⚠️ **Assertion quality** - should improve due to better context
⚠️ **Error handling** - assertions now require RIS to exist first

### Migration Strategy

**No migration needed** - this is a forward-only change:
- Existing RIS/assertions from old flow remain valid
- New plans use new flow automatically
- No data corruption risk since schema is unchanged
- Old assertions don't need regeneration

---

## Benefits of This Refactor

1. **Better assertion quality**: Assertions based on detailed RIS specs are more precise
2. **Logical flow**: Verify what you specified, not guess before specifying
3. **Reduced redundancy**: Don't include assertions in RIS that don't exist yet
4. **Better error messages**: Can explicitly check "RIS must exist" before generating assertions
5. **Future extensibility**: Opens path for "regenerate assertions from updated RIS"

---

## Files Summary

### To Modify (7 files)
1. `src/main/cre/lib/prompts/generate-ris.js` - Remove assertions parameter
2. `src/main/cre/lib/prompts/generate-assertions.js` - Add RIS parameter, update prompt
3. `src/main/cre/ris-generator.js` - Remove assertion loading and inclusion
4. `src/main/cre/assertion-generator.js` - Load RIS, pass to prompt
5. `src/main/cre/lib/ris-formatter.js` - Remove assertion formatting from RIS
6. `src/renderer/app.js` - Swap step order in handleCreApproval
7. `src/main/cre/index.js` - Update IPC handler validation

### To Read (for context)
- `src/main/database/migrations/007_cre_tables.js` - Schema reference
- `src/main/cre/lib/inspection-assertions.js` - Assertion evaluator (unchanged)

---

## Implementation Order

1. **Phase 1** - Decouple RIS from assertions (files 1, 3, 5)
2. **Phase 2** - Update assertion generation (files 2, 4, 7)
3. **Phase 3** - Reverse orchestration (file 6)
4. **Testing** - Manual verification of complete flow
5. **Documentation** - Update MEMORY.md with new flow

Each phase can be tested independently before proceeding to the next.
