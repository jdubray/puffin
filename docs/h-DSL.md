# h-DSL: Context Vault for Code Navigation (v3)

## Purpose

An h-DSL derived from h-M3 for modeling project structure and semantics, incorporating RLM principles for handling codebases that exceed context windows. The vault serves as an **external environment** that the AI interacts with programmatically—peeking, decomposing, and recursing rather than loading wholesale.

**Every element in this h-DSL is typed by exactly one h-M3 primitive.**

---

## Core Principle: Codebase as External Environment

Following RLM's key insight: **treat the codebase as a variable in an external environment**, not as content to feed directly into the model.

```
┌─────────────────────────────────────────────────────────────────┐
│                         VAULT (V)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Artifacts, Dependencies, Flows, Intent                 │   │
│  │  (Too large for context window)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                     PEEK   │   DECOMPOSE                        │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Working Context (C)                                    │   │
│  │  (Fits in context window)                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

The AI never loads the full vault. It:
1. Gets metadata about V (size, structure, summaries)
2. PEEKs into specific parts
3. DECOMPOSEs complex parts into sub-problems
4. RECURSEs over sub-parts with fresh context
5. JOINs results back

---

## h-M3 Type Mapping

Every element in this h-DSL maps to exactly one h-M3 primitive:

```
┌─────────────────────────────────────────────────────────────────┐
│  STRATUM    │  FORMAL (TERM)     │  GENERATIVE (PROSE)          │
├─────────────────────────────────────────────────────────────────┤
│  TELOS      │  Understanding     │  Relevance                   │
│             │  (OUTCOME)         │  (ALIGNMENT)                 │
├─────────────────────────────────────────────────────────────────┤
│  DYNAMICS   │  Context           │  Navigation                  │
│             │  (STATE)           │  (TRANSITION)                │
├─────────────────────────────────────────────────────────────────┤
│  STRUCTURE  │  Artifact          │  Dependency                  │
│             │  (SLOT)            │  (RELATION)                  │
├─────────────────────────────────────────────────────────────────┤
│  SUBSTANCE  │  Symbol            │  Intent                      │
│             │  (TERM)            │  (PROSE)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## SUBSTANCE: What Fills

### Symbol : TERM

Formal, symbolic, typed identifiers. Machine-checkable.

```yaml
Symbol:
  type: TERM
  variants:
    - Path      # "src/main/plugins/index.js"
    - Name      # "PluginManager"
    - Signature # "async activate(context: PluginContext) → void"
    - Type      # "Function | Class | Module"
    - Tag       # "core", "persistence", "lifecycle"

  operations:
    - parse     # Extract symbol from source
    - resolve   # Find what symbol refers to
    - match     # Pattern matching against symbols
    - compare   # Equality and ordering
```

### Intent : PROSE

Natural language, contextual, interpreted. Validated semantically by AI.

```yaml
Intent:
  type: PROSE
  variants:
    - Description  # "Manages plugin lifecycle and activation"
    - Rationale    # "Uses registry pattern for extensibility"
    - Constraint   # "Must not block main thread"
    - Pattern      # "Observer pattern with event emission"

  modes:
    - descriptive   # What this code is/does
    - inferential   # What follows from this code

  operations:
    - GROUND  # Interpret to understand what IS
    - DERIVE  # Infer what FOLLOWS
```

---

## STRUCTURE: What Holds

### Artifact : SLOT

A position that holds code. Typed by what it contains.

```yaml
Artifact:
  type: SLOT

  # What fills this slot
  accepts:
    kind     : Symbol    # module | file | class | function | type | config | flow
    path     : Symbol    # File system location
    symbols  : Symbol[]  # Exported/internal symbols
    intent   : Intent    # Purpose description (PROSE)
    summary  : Intent    # One-line for PEEK (PROSE)
    size     : Symbol    # lines | complexity metric
    tags     : Symbol[]  # Classification tags

  operations:
    - create    # New artifact slot
    - fill      # Add content to slot
    - extract   # Get content from slot
    - validate  # Check slot constraints
```

### Dependency : RELATION

Connection between artifact slots. Gives structure its shape.

```yaml
Dependency:
  type: RELATION

  # Connects two slots
  shape: Artifact × Artifact → Link

  attributes:
    kind   : Symbol   # imports | calls | extends | implements | configures | tests
    from   : Artifact # Source slot
    to     : Artifact # Target slot
    weight : Symbol   # critical | normal | weak
    intent : Intent   # Why this dependency exists (PROSE)

  operations:
    - link      # Create dependency between artifacts
    - traverse  # Follow dependency chain
    - invert    # Get reverse dependencies
    - filter    # Select by kind/weight
```

---

## DYNAMICS: What Changes

### Context : STATE

Configuration of the working context at a moment. What's currently in view.

```yaml
Context:
  type: STATE

  # Current configuration of slots
  configuration:
    task     : Intent        # What we're trying to understand (PROSE)
    focus    : Artifact[]    # Currently examining (in window)
    loaded   : Artifact[]    # Fully loaded with details
    peeked   : Artifact[]    # Summary only (metadata)
    frontier : Artifact[]    # Candidates to explore
    excluded : Artifact[]    # Ruled out
    stack    : Context[]     # Parent contexts (for recursion)
    memo     : Map<Intent, Understanding>  # Cached sub-results

  invariants:
    - "|focus| ≤ window_limit"
    - "loaded ⊆ focus"
    - "peeked ∩ loaded = ∅"
    - "excluded ∩ frontier = ∅"
```

### Navigation : TRANSITION

Movement from one context state to another. The primitive of exploration behavior.

```yaml
Navigation:
  type: TRANSITION

  # State change
  shape: Context → Context

  attributes:
    kind   : Symbol   # peek | focus | expand | trace | filter | decompose | recurse | join | verify | backtrack
    from   : Context  # Starting state
    to     : Context  # Resulting state
    reason : Intent   # Why this transition (PROSE)

  operations:
    - apply     # Execute transition
    - compose   # Chain transitions
    - validate  # Check transition is valid from state
```

---

## TELOS: What For

### Understanding : OUTCOME

A desired state—what navigation aims toward.

```yaml
Understanding:
  type: OUTCOME

  # Goal state
  shape: Context (distinguished as goal)

  attributes:
    task       : Intent      # Original question/story (PROSE)
    required   : Artifact[]  # Must understand these
    confidence : Symbol      # 0.0..1.0
    gaps       : Intent[]    # What's still unclear (PROSE)
    verified   : Symbol      # true | false

  evaluation:
    - JUDGE   # Has outcome been achieved?
    - DERIVE  # What evidence supports this understanding?
```

### Relevance : ALIGNMENT

Values that guide choice among transitions. Why this path, not another.

```yaml
Relevance:
  type: ALIGNMENT

  # Selection function
  shape: Navigation* → Navigation

  attributes:
    strategy : Symbol   # depth_first | breadth_first | guided | parallel
    weights:
      task_match  : Symbol  # How well artifact matches task
      centrality  : Symbol  # How connected in dependency graph
      recency     : Symbol  # How recently modified
      change_freq : Symbol  # How often modified
      complexity  : Symbol  # How complex the artifact
    filter   : Intent   # What to exclude (PROSE)

  justification:
    - ACCEPT  # Why is this selection right?
```

---

## Navigation Transitions

Each navigation is a TRANSITION from one Context STATE to another.

### PEEK : TRANSITION
Quick scan of artifact summary without full load.

```yaml
peek:
  type: TRANSITION
  from: Context where artifact ∉ (loaded ∪ peeked)
  to:   Context where artifact ∈ peeked

  input:
    target  : Symbol | Artifact

  output:
    path, kind, summary, size, tags, dep_count

  cost: O(1)
  reason: Intent  # "Need to assess relevance before loading"
```

### FOCUS : TRANSITION
Load full artifact details into working context.

```yaml
focus:
  type: TRANSITION
  from: Context where artifact ∈ (frontier ∪ peeked)
  to:   Context where artifact ∈ loaded

  input:
    target : Artifact
    load   : [symbols, intent, behavior, dependencies]

  side_effect:
    prune: oldest from focus if |focus| > limit

  reason: Intent  # "This artifact is relevant to task"
```

### EXPAND : TRANSITION
Add related artifacts to frontier based on dependencies.

```yaml
expand:
  type: TRANSITION
  from: Context
  to:   Context where frontier' = frontier ∪ related

  input:
    from   : Artifact
    by     : Dependency.kind[]
    filter : Relevance.filter
    limit  : N

  output:
    add_to: frontier

  reason: Intent  # "Need to explore dependencies"
```

### TRACE : TRANSITION
Follow dependency chain in specific direction.

```yaml
trace:
  type: TRANSITION
  from: Context
  to:   Context where frontier' ⊇ traced_artifacts

  input:
    from      : Artifact
    direction : Symbol  # forward | backward | both
    kind      : Symbol  # calls | imports | extends | all
    depth     : Symbol  # N levels

  output:
    Artifact[] ordered by distance

  reason: Intent  # "Following call chain to understand flow"
```

### FILTER : TRANSITION
Narrow search space before exploration.

```yaml
filter:
  type: TRANSITION
  from: Context where |frontier| = N
  to:   Context where |frontier| < N

  input:
    scope   : Artifact[]
    by      : Symbol | Intent  # Tag | Pattern | Intent
    exclude : Symbol  # true | false

  output:
    Artifact[] (reduced)

  reason: Intent  # "Eliminating test files from search"
```

### DECOMPOSE : TRANSITION
Break complex artifact into sub-parts for separate processing.

```yaml
decompose:
  type: TRANSITION
  from: Context where complex(artifact)
  to:   Context where subtasks created

  input:
    target : Artifact
    by     : Symbol  # functions | classes | sections | concerns

  output:
    SubTask[]:
      part     : Artifact  # Sub-part (SLOT)
      question : Intent    # What to understand (PROSE)

  reason: Intent  # "Artifact too large to understand atomically"
```

### RECURSE : TRANSITION
Spawn sub-context for sub-task. Fresh context window, inherits memo.

```yaml
recurse:
  type: TRANSITION
  from: Context (parent)
  to:   Context (child) where child.stack = [parent, ...]

  input:
    subtask : SubTask

  inherit:
    memo, excluded

  operation:
    push: current context to stack

  output:
    Understanding (of sub-part)

  reason: Intent  # "Processing sub-part in fresh context"
```

### JOIN : TRANSITION
Merge sub-context results back into parent context.

```yaml
join:
  type: TRANSITION
  from: Context (child) with results
  to:   Context (parent) with merged understanding

  input:
    results  : Understanding[]
    strategy : Symbol  # merge | intersect | union

  operation:
    pop: restore parent from stack

  update:
    parent.understanding, parent.memo

  reason: Intent  # "Synthesizing sub-part understandings"
```

### VERIFY : TRANSITION
Check understanding is correct with focused re-examination.

```yaml
verify:
  type: TRANSITION
  from: Context with tentative understanding
  to:   Context with verified understanding

  input:
    claim : Understanding
    by    : Symbol  # re-trace | cross-check | counter-example

  output:
    confidence : Symbol  # 0.0..1.0

  update:
    understanding.verified

  reason: Intent  # "Confirming understanding before committing"
```

### BACKTRACK : TRANSITION
Remove artifact from focus, optionally exclude from future consideration.

```yaml
backtrack:
  type: TRANSITION
  from: Context where artifact ∈ focus
  to:   Context where artifact ∉ focus, artifact ∈? excluded

  input:
    remove  : Artifact
    exclude : Symbol  # true | false

  operation:
    restore: previous context state

  reason: Intent  # "Artifact not relevant, trying different path"
```

---

## Interpreter Operations on PROSE

The AI interpreter performs five operations on Intent (PROSE) elements:

```
┌──────────────┬─────────────────┬──────────────────────────────────┐
│ Prose Mode   │ Vault Concept   │ Operation                        │
├──────────────┼─────────────────┼──────────────────────────────────┤
│ DESCRIPTIVE  │ artifact.intent │ GROUND  (what is this code?)     │
│ DIRECTIVE    │ navigation      │ FOLLOW  (which transition?)      │
│ EVALUATIVE   │ understanding   │ JUDGE   (enough context?)        │
│ RATIONALE    │ relevance       │ ACCEPT  (why this path?)         │
│ INFERENTIAL  │ dependency      │ DERIVE  (what follows?)          │
└──────────────┴─────────────────┴──────────────────────────────────┘
```

### GROUND: Interpret artifact intent
```yaml
GROUND:
  input:  artifact.intent (PROSE)
  output: structured understanding of what code does

  example:
    intent: "Manages plugin lifecycle and activation"
    ground: { domain: plugins, responsibility: lifecycle,
              actions: [activate, deactivate] }
```

### FOLLOW: Determine which transition to take
```yaml
FOLLOW:
  input:  navigation directives, current context
  output: selected transition to execute

  example:
    context: { focus: [PluginManager], frontier: [PluginLoader, PluginContext] }
    follow:  focus(PluginLoader) because it's called by PluginManager
```

### JUDGE: Evaluate if outcome achieved
```yaml
JUDGE:
  input:  understanding (OUTCOME), context (STATE)
  output: boolean + confidence + gaps

  example:
    understanding: { task: "How do plugins activate?" }
    judge: { achieved: true, confidence: 0.85,
             gaps: ["cleanup on deactivate unclear"] }
```

### ACCEPT: Justify relevance selection
```yaml
ACCEPT:
  input:  relevance criteria, selected transition
  output: justification for why this choice aligns with goals

  example:
    selection: focus(PluginLoader) over PluginContext
    accept: "PluginLoader is upstream in call graph,
             understanding it first reveals activation flow"
```

### DERIVE: Infer connections and implications
```yaml
DERIVE:
  input:  known facts, dependencies, observations
  output: inferred conclusions

  forms:
    deductive:  "All plugins call activate() → this plugin calls activate()"
    inductive:  "These 5 plugins use registry pattern → plugins typically use registry"
    abductive:  "Error in plugin-context.js cleanup → likely resource leak bug"
```

---

## Composition Operators

Transitions compose using h-M3 operators:

### Sequence (;)
```
focus(A) ; expand(A) ; trace(A→calls)
```
Execute in order. Each sees result of previous. Next STATE depends on current.

### Choice (|)
```
search(query) | trace(known→deps)
```
Select based on ALIGNMENT. Use search if query clear, trace if starting point known.

### Iterate (*)
```
(peek ; filter ; focus)*
```
Repeat TRANSITION until JUDGE returns sufficient OUTCOME.

### Parallel (‖)
```
trace(A→calls) ‖ trace(A→imports)
```
Execute concurrently, merge results. Useful for independent explorations.

### Composed Patterns
```yaml
# Depth-first exploration
pattern: (focus ; expand ; filter)*

# Recursive decomposition
pattern: decompose ; (recurse)* ; join

# Verified understanding
pattern: (focus ; expand)* ; verify ; JUDGE

# Parallel trace with merge
pattern: (trace→calls ‖ trace→imports) ; join
```

---

## Context Building Protocol

### Phase 1: ORIENT
```yaml
orient:
  input  : task (Intent/PROSE - user story, question, bug)

  GROUND : Extract keywords, entities, actions from task
  DERIVE : Infer likely artifact types and locations (abductive)

  output : hypothesis[] (ranked by confidence)

  # Creates initial ALIGNMENT for exploration
```

### Phase 2: FILTER
```yaml
filter_phase:
  input  : vault, hypothesis[]

  transitions:
    - peek   : top N artifacts matching hypothesis
    - filter : exclude obviously irrelevant (wrong domain, test-only, deprecated)

  output : candidates[] (narrowed frontier)

  # Reduces STATE.frontier before expensive exploration
```

### Phase 3: EXPLORE
```yaml
explore:
  loop:
    - select  : highest relevance from candidates (ALIGNMENT)
    - focus   : load artifact details (TRANSITION)
    - GROUND  : understand what this artifact does
    - DERIVE  : infer connections to task
    - expand  : add dependencies to candidates (TRANSITION)
    - JUDGE   : sufficient understanding? (evaluate OUTCOME)

  branch:
    - if complex(artifact):
        decompose ; recurse* ; join
    - if gaps remain:
        DERIVE next artifacts ; continue loop
    - if confident:
        exit to VERIFY
```

### Phase 4: VERIFY
```yaml
verify_phase:
  input  : understanding (tentative OUTCOME)

  check  : re-examine critical artifacts with fresh eyes
  cross  : verify dependencies are correctly traced (DERIVE)

  output : understanding.verified = true | gaps[]

  if gaps:
    return to EXPLORE with gaps as new hypotheses
```

### Phase 5: ACCEPT
```yaml
accept:
  input    : verified understanding (OUTCOME)

  ACCEPT   : justify why this context is sufficient (ALIGNMENT)

  output   : final context { focus, loaded, confidence }
  cache    : memo[task] = understanding
```

### Protocol Summary
```
ORIENT → FILTER → (EXPLORE ; VERIFY)* → ACCEPT

Where EXPLORE = (focus ; GROUND ; DERIVE ; expand ; JUDGE)*
      with decompose ; recurse* ; join for complex artifacts
```

---

## Artifact Catalog Templates

### Module Entry (SLOT template)
```yaml
module:
  # SLOT identification
  path    : Symbol  # src/main/plugins
  kind    : Symbol  # module

  # PROSE description
  summary : Intent  # "Plugin system for extending Puffin"
  intent  : Intent  # |
    # Provides isolated extension points for Puffin functionality.
    # Each plugin runs in its own context with controlled API surface.

  # Contained SLOTs
  exports:
    PluginLoader  : Intent  # "Discovers and validates plugins from directory"
    PluginManager : Intent  # "Lifecycle management, activation, shutdown"
    PluginContext : Intent  # "Sandboxed API for plugin code"

  # Patterns (PROSE for DERIVE)
  patterns:
    registry   : Intent  # "Central registration of handlers/components"
    lifecycle  : Intent  # "activate() / deactivate() hooks"
    isolation  : Intent  # "Each plugin gets own PluginContext instance"

  # RELATIONs
  deps:
    - { to: ipc-handlers, kind: configures, weight: normal }
    - { to: database, kind: calls, weight: weak }
    - { from: plugins/*, kind: implements, weight: critical }
    - { from: main.js, kind: calls, weight: critical }

  # Additional metadata
  size : Symbol  # 4 files, 1200 lines
  tags : Symbol[]  # [core, extensibility, ipc, lifecycle]

  hotspots:
    - path: plugin-manager.js:initialize
      intent: Intent  # "Complex async startup"
    - path: plugin-context.js:_cleanup
      intent: Intent  # "Resource cleanup on deactivate"
```

### Function Entry (SLOT template)
```yaml
function:
  # SLOT identification
  path      : Symbol  # src/main/puffin-state.js:loadUserStories
  kind      : Symbol  # function
  signature : Symbol  # async () → UserStory[]

  # PROSE description
  summary   : Intent  # "Load stories from SQLite, error if not initialized"
  intent    : Intent  # |
    # Single source of truth for user story retrieval.
    # Enforces database initialization—no silent fallback.

  # Behavior (for DERIVE)
  behavior:
    pre  : Intent  # "database.isInitialized() == true"
    post : Intent  # "returns UserStory[] from SQLite"
    err  : Intent  # "throws if database not initialized"

  # RELATIONs
  deps:
    - { to: database.userStories.findAll, kind: calls }
    - { to: _loadUserStoriesFromSqlite, kind: calls }
    - { from: open(), kind: calls }
    - { from: IPC:puffin:loadState, kind: calls }

  complexity : Symbol  # low
  tags       : Symbol[]  # [persistence, sqlite, user-stories, strict]
```

### Flow Entry (SLOT template for processes)
```yaml
flow:
  # SLOT identification
  name    : Symbol  # plugin-activation
  kind    : Symbol  # flow

  # PROSE description
  summary : Intent  # "Plugin discovery to running state"
  intent  : Intent  # |
    # Orchestrates the full plugin lifecycle from directory scan
    # through validation, context creation, and activation.

  # Steps (ordered TRANSITIONs)
  steps:
    - step: 1
      artifact: Symbol  # PluginLoader.loadPlugins
      intent: Intent    # "Scan plugins directory"
    - step: 2
      artifact: Symbol  # PluginLoader.validatePlugin
      intent: Intent    # "Check manifest, entry point"
    - step: 3
      artifact: Symbol  # PluginManager.initialize
      intent: Intent    # "Create PluginContext per plugin"
    - step: 4
      artifact: Symbol  # Plugin.activate(context)
      intent: Intent    # "Run plugin's activate hook"
    - step: 5
      artifact: Symbol  # ViewRegistry.register
      intent: Intent    # "Register UI views if any"

  # Branches (conditional TRANSITIONs)
  branches:
    validation_fail : Intent  # "skip → emit(plugin:validation-failed)"
    disabled        : Intent  # "skip → emit(plugin:skipped)"
    activate_error  : Intent  # "skip → emit(plugin:activation-failed), continue"

  # Invariants (for JUDGE)
  invariants:
    - Intent  # "Failed plugins don't block others"
    - Intent  # "All plugins get context even if activation fails"

  tags : Symbol[]  # [lifecycle, startup, plugins, async]
```

---

## Compact Notation

For inline vault references (all resolve to typed elements):

```
@slot(plugins)                  → Artifact (SLOT): src/main/plugins
@slot(puffin-state:loadStories) → Artifact (SLOT): function entry
@flow(plugin-activation)        → Artifact (SLOT): flow entry

@peek(database)                 → TRANSITION: quick summary
@trace(PluginLoader→calls:2)    → TRANSITION: 2-level call trace
@deps(PluginContext)            → RELATION[]: all dependencies
@tags(sqlite,persistence)       → SLOT[]: artifacts with tags
@filter(!test,!deprecated)      → TRANSITION: exclude patterns
```

---

## Memoization

Avoid re-exploring previously understood areas:

```yaml
memo:
  # Maps PROSE task to OUTCOME
  key   : hash(task: Intent, artifacts: Artifact[])
  value : Understanding (OUTCOME)
  ttl   : until artifact.modified changes
  scope : Symbol  # session | persistent

lookup:
  before : any Navigation (TRANSITION)
  check  : memo[similar_task]?
  reuse  : if confidence > threshold

store:
  after : ACCEPT phase
  save  : memo[task] = understanding
```

---

## Index Card Summary

```
╔═══════════════════════════════════════════════════════════════════╗
║           h-DSL: Context Vault v3 (Proper M3 Typing)              ║
╠═══════════════════════════════════════════════════════════════════╣
║  PRINCIPLE: Vault as external environment, not context content    ║
╠═══════════════════════════════════════════════════════════════════╣
║  SUBSTANCE   Symbol (TERM)           Intent (PROSE)               ║
║              path, sig, tag          description, rationale       ║
╠═══════════════════════════════════════════════════════════════════╣
║  STRUCTURE   Artifact (SLOT)         Dependency (RELATION)        ║
║              module, file, function  imports, calls, extends      ║
╠═══════════════════════════════════════════════════════════════════╣
║  DYNAMICS    Context (STATE)         Navigation (TRANSITION)      ║
║              focus, frontier, memo   peek, focus, trace, recurse  ║
╠═══════════════════════════════════════════════════════════════════╣
║  TELOS       Understanding (OUTCOME) Relevance (ALIGNMENT)        ║
║              task, confidence, gaps  strategy, weights, filter    ║
╠═══════════════════════════════════════════════════════════════════╣
║  INTERPRETER OPERATIONS (on Intent/PROSE)                         ║
║    GROUND  : what is this code?                                   ║
║    FOLLOW  : which transition?                                    ║
║    JUDGE   : enough context?                                      ║
║    ACCEPT  : why this path?                                       ║
║    DERIVE  : what follows?                                        ║
╠═══════════════════════════════════════════════════════════════════╣
║  COMPOSITION (of TRANSITIONs)                                     ║
║    T₁ ; T₂   : sequence                                           ║
║    T₁ | T₂   : choice (ALIGNMENT selects)                         ║
║    T*        : iterate (until OUTCOME)                            ║
║    T₁ ‖ T₂   : parallel (merge STATEs)                            ║
╠═══════════════════════════════════════════════════════════════════╣
║  PROTOCOL                                                         ║
║    ORIENT → FILTER → (EXPLORE ; VERIFY)* → ACCEPT                 ║
║    with decompose ; recurse* ; join for complex SLOTs             ║
╠═══════════════════════════════════════════════════════════════════╣
║  MEMO: cache OUTCOME, reuse across similar tasks                  ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Design Rationale

### Why Strict M3 Typing?
Every element must map to exactly one h-M3 primitive. This ensures the h-DSL is a true derivation from the meta-meta-model, not an ad-hoc vocabulary. The typing discipline reveals which aspects are formal (machine-checkable via TERM) vs generative (AI-interpreted via PROSE).

### Why External Environment?
The codebase is too large for context windows. RLM shows that treating it as an external variable with programmatic access outperforms both truncation and retrieval. The vault is the variable; navigation TRANSITIONs are the programmatic access.

### Why Recursive Decomposition?
Complex artifacts (large modules, intricate flows) can't be understood atomically. DECOMPOSE + RECURSE + JOIN mirrors RLM's chunking pattern—break into manageable SLOTs, understand each via sub-STATE, synthesize via JOIN.

### Why Composition Operators?
Navigation is not a sequence of independent steps. TRANSITIONs combine: search THEN trace, filter OR expand, (peek ; focus)* until done. h-M3's operators give this compositionality over STATEs.

### Why Memoization?
The same sub-problems recur. Understanding "how plugins work" shouldn't require re-exploration every time. Memo caches OUTCOMEs keyed by task+artifacts.

### Why Verify?
Understanding can be wrong. VERIFY forces re-examination before committing. RLM's "answer verification" pattern—use sub-calls to check main-call conclusions against OUTCOME.

### DERIVE Connects Everything
- Task → likely artifacts (abductive)
- Artifact → relevant dependencies (deductive)
- Gaps → next exploration (abductive)
- Evidence → sufficient understanding (inductive)

DERIVE is the reasoning that turns navigation TRANSITIONs into verified OUTCOMEs.
