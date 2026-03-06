# Prompt Repetition for CRE AI Calls

**Based on:** [Prompt Repetition Improves Non-Reasoning LLMs](https://arxiv.org/abs/2512.14982)
Leviathan, Kalman & Matias — Google Research, December 2025

---

## What the Paper Says

The technique is disarmingly simple: send the prompt **twice** instead of once.

```
Before:  <QUERY>
After:   <QUERY><QUERY>
```

**Why it works:**
Causal LLMs (GPT, Claude, Gemini, Deepseek) process tokens strictly left-to-right. When processing token N, the model can only attend to tokens 1…N-1 — it has zero awareness of what comes after. For complex prompts with instructions at the top and constraints at the bottom, the early system instructions are "forgotten" by the time the model reaches the final output format spec.

Repeating the prompt forces bidirectional attention: every token in the second pass can attend to every token in the first, effectively giving the model the ability to re-read what came before.

**Results:**
- Wins 47 of 70 benchmark-model combinations, 0 losses
- Up to +76 percentage points on structured extraction tasks
- No latency cost (repetition happens in the parallelisable prefill stage)
- Neutral to slightly positive when reasoning is enabled
- Tested on Claude 3 Haiku and Claude 3.7 Sonnet — both benefit

---

## Why Puffin Is an Ideal Fit

The paper's gains are largest on tasks that are:

| Property | Paper says | Puffin CRE?         |
|----------|-----------|---------------------|
| Long, structured prompts | High benefit | ✅ All CRE prompts: system + task + constraints, often 2–5 KB |
| One-shot (single response) | High benefit | ✅ All `sendCrePrompt` calls use `maxTurns: 1` |
| Non-reasoning mode | Biggest gains | ✅ CRE uses Haiku for extraction, Sonnet without thinking |
| Structured JSON output | High benefit | ✅ Every CRE call expects a JSON response |
| Late constraint placement | High benefit | ✅ Output format rules appear at the **end** of every prompt |

Puffin's CRE pipeline is exactly the use case the paper was benchmarking: long structured prompts with output format constraints trailing the main task context, evaluated one-shot without reasoning.

The interactive path (`claudeService.submit()`) is different — it's multi-turn, reasoning-enabled when thinking budget is set, and conversational. The paper says this is neutral/slightly positive, so it's lower priority.

---

## Where to Apply

### High Impact (do first)

**1. Assertion Generation** — `assertion-generator.js` → `sendCrePrompt` with `MODEL_EXTRACT` (Haiku)
The assertion prompt is now ~200 lines of extraction strategy + example + type catalog. This is exactly the "long instructions, structured output" profile where prompt repetition has the largest measured effect. Haiku is a non-reasoning model, maximising the gain.

**2. RIS Generation** — `ris-generator.js` → `sendCrePrompt` with `MODEL_COMPLEX` (Sonnet)
The RIS prompt includes a long system persona, codebase context, story + plan item, and a detailed markdown structure spec. The model must recall the structure rules while writing ~10 KB of markdown. Repetition helps the output format section remain salient throughout generation.

**3. Plan Generation** — `plan-generator.js` → `sendCrePrompt` (3 call sites: generate, refine, clarify)
Plan generation has the longest prompts — codebase context can push the total well past 3 KB. The output schema (plan items with `filesCreated`, `filesModified`, `dependencies`, `approach`) must be adhered to precisely; the paper's gains on structured outputs are directly relevant.

### Medium Impact (do next)

**4. Introspector** — `introspector.js` → `sendCrePrompt` (2 call sites)
Shorter prompts than CRE generation, but still structured JSON extraction.

### Low / Skip

**5. Interactive prompts** (`claudeService.submit()`)
Conversational turns, often with thinking budget enabled. The paper shows neutral/slightly positive results here. Skipping keeps the interactive path lean — repeating a user's conversational message would feel strange and add unnecessary tokens.

---

## Implementation

The entire change is **one function in one file**: `src/main/cre/lib/ai-client.js`.

### Change 1: Add `promptRepetition` option to `sendCrePrompt`

```javascript
// src/main/cre/lib/ai-client.js

async function sendCrePrompt(claudeService, promptParts, options = {}) {
  const {
    model = MODEL_EXTRACT,
    timeout = TIMEOUT_EXTRACT,
    label = 'cre-prompt',
    jsonSchema = null,
    disableTools = false,
    maxTurns = null,
    promptRepetition = true,   // ← ADD THIS (default on for all CRE calls)
    // ... existing options ...
  } = options;

  // ...

  const assembled = assemblePrompt(promptParts);
  const prompt = promptRepetition
    ? `${assembled}\n\n---\n\n${assembled}`
    : assembled;

  // rest of function unchanged
}
```

### Change 2: Update `assemblePrompt` JSDoc

```javascript
/**
 * Assemble a CRE prompt from its parts into a single string.
 * Note: repetition is applied by sendCrePrompt, not here, so callers
 * building prompts manually get the un-repeated form.
 */
function assemblePrompt(parts) {
  const { system, task, constraints } = parts;
  return `${system}\n\n${task}\n\n${constraints}`;
}
```

That's the entire implementation. Because every CRE AI call goes through `sendCrePrompt` → `assemblePrompt`, a single flag in one function covers all 8 call sites across plan-generator, ris-generator, assertion-generator, and introspector.

### Separator between repetitions

The `---` markdown horizontal rule between the two copies:
- Acts as a natural boundary that the model can recognise as a re-statement
- Keeps the JSON parser from confusing the two copies (the model still outputs one response)
- Could be replaced with a more explicit label: `--- PROMPT REPEATED FOR CLARITY ---`

### Timeout adjustment

Doubling the prompt roughly doubles the prefill token count. This is processed on the server; latency impact is minimal (prefill is heavily parallelised). No timeout changes needed.

---

## Enabling / Disabling Per Call Site

If any call site should opt out (e.g. very short prompts where repetition is wasteful):

```javascript
// In assertion-generator.js — default: on
const aiResult = await sendCrePrompt(this._claudeService, prompt, {
  label: 'assertion-generation',
  model: MODEL_EXTRACT,
  disableTools: true,
  promptRepetition: true,  // explicit (or omit — default is true)
  // ...
});

// Hypothetical short prompt — opt out
const aiResult = await sendCrePrompt(this._claudeService, shortPrompt, {
  label: 'quick-extraction',
  promptRepetition: false,
  // ...
});
```

---

## Expected Gains in Puffin

| CRE Call | Prompt length | Model | Expected gain |
|----------|--------------|-------|---------------|
| `assertion-generation` | ~4 KB | Haiku | High — extraction, non-reasoning, structured output |
| `ris-generation` | ~3–8 KB | Sonnet | High — long context, late format spec |
| `plan-generation` | ~3–6 KB | Sonnet | Medium-high — structured schema adherence |
| `plan-refinement` | ~2–4 KB | Sonnet | Medium |
| `introspector` | ~1–2 KB | Haiku | Medium |

Concretely, this should reduce:
- Assertions that miss obvious files/functions mentioned in the RIS
- RIS sections that lose track of the required markdown structure
- Plans with malformed JSON or missing required fields

---

## Measurement

### Before/After Metrics to Watch

**Assertion generation:**
- Count of assertions generated per story (target: 5–8 per prompt spec)
- Percentage that fail `_validateAssertion()` (type unknown, missing target, etc.)
- Post-implementation pass rate in code review

**RIS generation:**
- Presence of all required sections (Context, Objective, Implementation Instructions, Conventions)
- Length distribution (very short RIS often means the model lost track of scope)

**Plan generation:**
- JSON parse success rate (currently caught by `parseJsonResponse` fallback)
- Plan completeness: `filesCreated`, `filesModified`, `dependencies` all populated

### Simple A/B Test

Run 5 stories with `promptRepetition: false` and 5 with `promptRepetition: true`, compare assertion counts and validation failures. Given the paper's 47/70 win rate, expect a meaningful improvement.

---

## Risks

**Token cost:**
Doubles input token count for CRE calls. At current usage levels this is acceptable — CRE calls are infrequent (one sprint planning session per feature cycle) and the improvement in output quality reduces re-runs.

**Haiku context limit:**
Haiku 4.5 context window is 200K tokens. Even with the largest CRE prompts (~8 KB × 2 = ~16 KB ≈ ~4K tokens), this is well within limits.

**Output interference:**
The model outputs one response, not two. The `---` separator is clear enough that no tested model generated repeated outputs. If this occurs in practice, use a more explicit separator or add an instruction: "NOTE: The above task specification has been repeated for clarity. Output exactly ONE response."

---

## Implementation Order

1. Add `promptRepetition = true` option to `sendCrePrompt` in `ai-client.js` (1 file, ~5 lines)
2. Test assertion generation with the new flag — verify assertion count increases toward 5–8
3. Test RIS generation — verify all sections present and output length normal
4. Test plan generation — verify JSON validity and field completeness
5. If any call site degrades, set `promptRepetition: false` explicitly for that caller
6. Update MEMORY.md with finding

---

## Future Ideas from the Paper

The paper suggests several extensions we could explore later:

- **Selective repetition**: Repeat only the `constraints` section (output format) rather than the full prompt. This targets the most impactful part (format spec at the end) while halving the extra tokens. Worth testing if token cost becomes a concern.

- **Reasoning models**: With Claude's extended thinking enabled, the paper shows neutral/slightly positive results. If Puffin moves CRE calls to thinking-enabled Sonnet/Opus, prompt repetition can stay on without harm.

- **Policy model**: A small model decides which section to repeat based on prompt structure. Overkill for now, but interesting if prompts become more varied.
