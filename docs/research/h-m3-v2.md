# h-M3 v2: Meta-Meta-Model for Hybrid DSLs

## Design Principles

1. **Compact**: Fits on an index card
2. **Complete**: Can derive any h-DSL for behavior, workflow, instructions, artifacts
3. **Dual-register**: Formal and generative are first-class, not afterthoughts
4. **Temporal**: State and change are primitive, not derived
5. **Teleological**: Purpose is primitive, not annotation
6. **Reasoned**: Inference connects structure to behavior to purpose

---

## The Four Strata

```
┌─────────────────────────────────────────────┐
│  TELOS      │  OUTCOME    │  ALIGNMENT      │  what for
├─────────────────────────────────────────────┤
│  DYNAMICS   │  STATE      │  TRANSITION     │  what changes
├─────────────────────────────────────────────┤
│  STRUCTURE  │  SLOT       │  RELATION       │  what holds
├─────────────────────────────────────────────┤
│  SUBSTANCE  │  TERM       │  PROSE          │  what fills
└─────────────────────────────────────────────┘
```

---

## Primitives

### SUBSTANCE (what fills slots)

**TERM**  
Formal, symbolic, typed. Validated syntactically. Machine-checkable.
```
Operations: parse, type-check, substitute, compare
```

**PROSE**  
Natural language, contextual, interpreted. Validated semantically by AI.
```
Operations: ground, follow, judge, accept, derive
```

### STRUCTURE (what holds substance)

**SLOT**  
A position that accepts fills. Typed by what it accepts.
```
slot : Type → Position
```

**RELATION**  
Connection between slots. Gives structure its shape.
```
relation : Slot × Slot → Link
```

### DYNAMICS (what changes)

**STATE**  
Configuration of fills in slots at a moment.
```
state : Slot* → Fill*
```

**TRANSITION**  
Movement from one state to another. The primitive of behavior.
```
transition : State → State
```

### TELOS (what for)

**OUTCOME**  
A desired state. What transitions aim toward.
```
outcome : State  (distinguished as goal)
```

**ALIGNMENT**  
Values that guide choice among transitions. Why this path, not another.
```
alignment : Transition* → Transition  (selection function)
```

---

## The Prose Correspondence

PROSE has five **modes** corresponding to the primitives that require interpretation:

```
┌──────────────┬─────────────┬──────────────────────────┐
│ Prose Mode   │ Connects    │ Interpreter Operation    │
├──────────────┼─────────────┼──────────────────────────┤
│ DESCRIPTIVE  │ STATE       │ GROUND   (what is)       │
│ DIRECTIVE    │ TRANSITION  │ FOLLOW   (what to do)    │
│ EVALUATIVE   │ OUTCOME     │ JUDGE    (if achieved)   │
│ RATIONALE    │ ALIGNMENT   │ ACCEPT   (why right)     │
│ INFERENTIAL  │ RELATION    │ DERIVE   (how follows)   │
└──────────────┴─────────────┴──────────────────────────┘
```

**The crucial insight**: 

TERM handles STRUCTURE (static, closed, formal).  
PROSE handles DYNAMICS, TELOS, and the *reasoned connections* between them.

The first four operations work **within** a stratum.  
DERIVE works **across** strata—it's the vertical connector.

---

## The Fifth Operation: DERIVE

### Why DERIVE is Necessary

Consider: How do you get from STATE to valid TRANSITION? From TRANSITION to OUTCOME? The framework had:

- GROUND: Understand what IS
- FOLLOW: Determine what to DO  
- JUDGE: Validate if DONE
- ACCEPT: Justify why RIGHT

But it lacked: **How does this FOLLOW from that?**

DERIVE is the reasoning operation—the process of inference that connects premises to conclusions across all strata.

### DERIVE Defined

```
DERIVE: Inferential prose → Entailment

Input:  Prose expressing logical, causal, or evidential connection
Output: Established inference that can be applied in reasoning
```

### The Forms of DERIVE

DERIVE handles all three classical inference patterns:

**Deductive** (general → specific)
```
Input:  "Documents over 100 lines require iterative construction"
        + "This document is 250 lines"
Derive: Therefore, iterative construction is required
```

**Inductive** (specific → general)
```
Input:  "Previous attempts at single-pass generation produced errors"
        + "This pattern occurred across multiple document types"
Derive: Single-pass generation is unreliable for complex documents
```

**Abductive** (observation → best explanation)
```
Input:  "The user asked for a 'deck' with 'slides'"
        + "They mentioned a 'board meeting'"
Derive: This is likely a business presentation context
```

### DERIVE as Vertical Connector

```
         TELOS
           ↑
         DERIVE (outcome reasoning)
           │
           │   "This transition achieves the outcome because..."
           │
        DYNAMICS
           ↑
         DERIVE (state reasoning)  
           │
           │   "This state implies these valid transitions because..."
           │
        STRUCTURE
           ↑
         DERIVE (structural reasoning)
           │
           │   "These slots relate this way because..."
           │
        SUBSTANCE
```

DERIVE is what makes the strata cohere into a reasoning system, not just a descriptive taxonomy.

---

## The Complete Interpreter Contract

The generative AI interpreter performs five operations on PROSE:

### GROUND (descriptive → state)
```
Mode:    Descriptive
Question: "What is the current situation?"
Input:   "The spreadsheet contains quarterly sales data with missing Q3 figures"
Output:  Structured state: {artifact: spreadsheet, content: sales_data, 
                           completeness: partial, gap: Q3}
```

### FOLLOW (directive → transition)
```
Mode:    Directive
Question: "What should I do?"
Input:   "Validate the data types, then fill missing values using 
          adjacent quarter interpolation, finally format for presentation"
Output:  Transition sequence: [validate, interpolate, format]
```

### JUDGE (evaluative → validation)
```
Mode:    Evaluative
Question: "Have I succeeded?"
Input:   "The spreadsheet should be complete, accurate, and ready for 
          executive review without requiring explanation"
Output:  Boolean + explanation: {success: true, confidence: 0.9,
          reasoning: "All cells filled, formats consistent, labels clear"}
```

### ACCEPT (rationale → alignment)
```
Mode:    Rationale
Question: "Why is this the right choice?"
Input:   "We prioritize data accuracy over visual polish because 
          executives will make decisions based on these numbers"
Output:  Alignment principle: accuracy > aesthetics when stakes are high
```

### DERIVE (inferential → entailment)
```
Mode:    Inferential
Question: "How does this follow from that?"
Input:   "Complex documents fail in single-pass because context accumulates
          and early decisions constrain later options incorrectly"
Output:  Inference: complexity(doc) ∧ single_pass → likely_failure
         Applicable: When assessing whether to iterate
```

---

## Reasoning Chains

DERIVE enables **chains of reasoning** that span the framework:

```yaml
reasoning_chain:
  name: "Document Strategy Selection"
  
  steps:
    - derive:
        from: "User requested 'comprehensive report on Q3 performance'"
        infer: "This is a complex analytical document"
        type: abductive  # observation → interpretation
        
    - derive:
        from: "Complex analytical documents have multiple interdependent sections"
        infer: "Section order and content affect coherence"
        type: deductive  # general rule → specific case
        
    - derive:
        from: "Coherence-sensitive documents benefit from outline-first approach"
        infer: "Outline before drafting is the appropriate transition"
        type: deductive
        
    - derive:
        from: "Previous outline-first approaches for this user succeeded"
        infer: "This strategy aligns with demonstrated preferences"
        type: inductive  # past success → likely future success
        
  conclusion:
    transition: outline → draft → revise
    justified_by: chain of derive operations
    aligned_with: user_preference, document_quality
```

---

## DERIVE and the Other Operations

DERIVE doesn't replace the other four—it connects them:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   GROUND          DERIVE           JUDGE                    │
│   (what is) ────→ (therefore) ────→ (achieved?)             │
│                                                             │
│       ↑               ↑                ↑                    │
│       │               │                │                    │
│    DERIVE          DERIVE           DERIVE                  │
│       │               │                │                    │
│       ↓               ↓                ↓                    │
│                                                             │
│   FOLLOW          ACCEPT                                    │
│   (what to do)    (why right)                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- GROUND + DERIVE → What transitions are valid from here?
- FOLLOW + DERIVE → Why will this transition sequence work?
- DERIVE + JUDGE → Has the outcome been achieved?
- DERIVE + ACCEPT → Is this choice aligned with values?

---

## Reason: Noun and Verb

The framework now captures both senses of "reason":

**Reason (noun)**: RATIONALE → ACCEPT
```
"The reason we chose X is..."
Handled by: alignment, justification, the WHY
```

**Reason (verb)**: INFERENTIAL → DERIVE
```
"We reasoned that X implies Y..."
Handled by: inference, derivation, the THEREFORE
```

ACCEPT tells you the destination (why this is right).
DERIVE shows you the path (how we got there).

---

## Updated h-M3 Summary (Index Card Version)

```
╔═══════════════════════════════════════════════════════════╗
║                        h-M3 v2                            ║
╠═══════════════════════════════════════════════════════════╣
║  SUBSTANCE   TERM (formal)       PROSE (generative)       ║
║  STRUCTURE   SLOT (position)     RELATION (connection)    ║
║  DYNAMICS    STATE (moment)      TRANSITION (change)      ║
║  TELOS       OUTCOME (goal)      ALIGNMENT (values)       ║
╠═══════════════════════════════════════════════════════════╣
║  PROSE MODES          INTERPRETER OPERATIONS              ║
║    descriptive    →   GROUND   (what is)                  ║
║    directive      →   FOLLOW   (what to do)               ║
║    evaluative     →   JUDGE    (if achieved)              ║
║    rationale      →   ACCEPT   (why right)                ║
║    inferential    →   DERIVE   (how follows)              ║
╠═══════════════════════════════════════════════════════════╣
║  COMPOSITION                                              ║
║    T₁ ; T₂    sequence                                    ║
║    T₁ | T₂    choice (alignment selects)                  ║
║    T*         iterate (until outcome)                     ║
║    T₁ ‖ T₂    parallel (merge states)                     ║
╠═══════════════════════════════════════════════════════════╣
║  DERIVE CONNECTS STRATA                                   ║
║    STRUCTURE ──derive──→ DYNAMICS ──derive──→ TELOS       ║
╚═══════════════════════════════════════════════════════════╝
```

---

## Completeness Argument

The five operations are now **complete** in that they cover all epistemic needs:

| Need | Operation | Question Answered |
|------|-----------|-------------------|
| Perception | GROUND | What is? |
| Action | FOLLOW | What to do? |
| Evaluation | JUDGE | Did it work? |
| Justification | ACCEPT | Why is this right? |
| Inference | DERIVE | How does this follow? |

This maps to the classical epistemic categories:
- GROUND → Observation/Understanding
- FOLLOW → Practical reasoning (means)
- JUDGE → Assessment/Verification
- ACCEPT → Normative reasoning (ends)
- DERIVE → Theoretical reasoning (connections)

Any reasoning an agent must perform falls into one of these five categories.

---

## DERIVE in h-DSL Derivation

When deriving an h-DSL from h-M3, DERIVE appears in:

### Skill h-DSL
```yaml
Procedure:
  steps:
    - phase: analyze
      derive:
        from: "user request characteristics"
        infer: "complexity level and appropriate strategy"
        
    - phase: select
      derive:
        from: "complexity level + available approaches"
        infer: "optimal procedure variant"
```

### User Story h-DSL
```yaml
AcceptanceCriteria:
  derive:
    from: "user goal + context constraints"
    infer: "specific testable conditions for done"
```

### Plan h-DSL
```yaml
Sequencing:
  derive:
    from: "action dependencies + resource constraints"
    infer: "valid orderings of steps"
```

### Test h-DSL
```yaml
Assertion:
  derive:
    from: "precondition + action"
    infer: "expected postcondition"
```

---

## Why DERIVE Completes the Framework

Without DERIVE, the framework describes but doesn't reason.

You could specify:
- What states exist (GROUND)
- What transitions to take (FOLLOW)
- What outcomes to achieve (JUDGE)
- What values to honor (ACCEPT)

But you couldn't express:
- Why this state implies that transition
- How this transition achieves that outcome
- What follows from these observations
- The chain of logic connecting evidence to conclusion

DERIVE is the **therefore**—the connective tissue of thought.

With DERIVE, the framework becomes a complete reasoning system, not just a descriptive vocabulary. It can represent not only WHAT an agent knows and does, but HOW the agent reasons about what it knows to decide what to do.

---

## The Dual Nature of Reason

```
         ACCEPT                    DERIVE
            │                         │
            │                         │
      ┌─────┴─────┐             ┌─────┴─────┐
      │  REASON   │             │  REASON   │
      │  (noun)   │             │  (verb)   │
      │           │             │           │
      │  "the     │             │  "to      │
      │  reason"  │             │  reason"  │
      │           │             │           │
      │  WHY this │             │  HOW this │
      │  is right │             │  follows  │
      └───────────┘             └───────────┘
            │                         │
            └────────┬────────────────┘
                     │
                     ▼
              COMPLETE REASONING
              (justified inference)
```

An agent that can ACCEPT but not DERIVE has values without logic.
An agent that can DERIVE but not ACCEPT has logic without values.
An agent with both can reason toward justified conclusions.

This is the complete foundation for hybrid DSLs that guide intelligent behavior.