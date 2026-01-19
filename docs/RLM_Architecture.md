## RLM-Enhanced Puffin Architecture

### Core Concept Mapping

| RLM Concept | Puffin Application |
|-------------|-------------------|
| **Prompt as external variable** | Specifications, user stories, and codebase as queryable context |
| **REPL environment** | Persistent workspace with project state, history, and artifacts |
| **Recursive sub-calls** | Specialized Claude Code threads (UI, Backend, Plugin) with scoped context |
| **Programmatic decomposition** | Intelligent chunking of specs/code for targeted implementation |

---

## Proposed Architecture

### Layer 1: Context Management Layer

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CONTEXT VAULT                                         │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  specifications/          │  codebase-index/       │  traceability/                      │
│  ─────────────────────    │  ──────────────────    │  ─────────────────────              │
│  • user-stories.json      │  • file-manifest.json  │  • story-to-code.json               │
│  • acceptance-criteria    │  • symbol-table.json   │  • criterion-to-code.json           │
│  • domain-rules.json      │  • dependency-graph    │  • code-to-tests.json               │
│  • assumptions.json       │  • pattern-catalog     │  • constraint-to-code.json          │
│  • security-requirements  │                        │  • change-impact-analysis           │
│  • technical-standards    │                        │                                     │
│  • api-contracts.json     │                        │                                     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  quality-gates/           │  history/              │  active-context/                    │
│  ─────────────────────    │  ──────────────────    │  ─────────────────────              │
│  • inspection-assertions  │  • decisions.json      │  • current-sprint.json              │
│  • deliberation-triggers  │  • thread-summaries/   │  • current-story.json               │
│                           │  • implementation-log  │  • working-set.json                 │
│                           │  • incident-log.json   │  • verification-state.json          │
│                           │  • deployment-history  │  • risk-hotspots.json               │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key Innovation**: Context is never fed directly to Claude Code. Instead, Puffin maintains a **queryable vault** that the orchestrator can slice, filter, and compose into targeted prompts.

### Layer 2: Recursive Orchestrator

```
┌─────────────────────────────────────────────────────────────┐
│                 RECURSIVE ORCHESTRATOR│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                           │
│   │   PLANNER   │  Analyzes task, determines decomposition  │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│   │  SPEC AGENT │     │ CODE AGENT  │     │ TEST AGENT  │   │
│   │  (depth=1)  │───▶│  (depth=1)  │────▶│  (depth=1)  │   │
│   └──────┬──────┘     └──────┬──────┘     └─────────────┘   │
│          │                   │                              │
│          ▼                   ▼                              │
│   ┌─────────────┐     ┌─────────────┐                       │
│   │ SUB-SPEC    │     │ SUB-CODE    │   Recursive depth     │
│   │ (depth=2)   │     │ (depth=2)   │   controlled          │ 
│   └─────────────┘     └─────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Layer 3: Context Slicing Engine

This is where the RLM insight becomes powerful:

```
┌─────────────────────────────────────────────────────────────┐
│                  CONTEXT SLICER                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input: "Implement drag-and-drop for calendar notes"        │
│                                                             │
│  Slice Strategy:                                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Extract relevant user stories (not all 50+)       │   │
│  │ 2. Index only calendar plugin files                  │   │
│  │ 3. Pull only drag-drop patterns from codebase        │   │
│  │ 4. Include only related completed stories            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Output: Focused context packet (~20K tokens vs ~500K)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Specifications

### 1. Context Vault Schema


```
ContextVault/
├── specifications/
│   │   # --- Core Requirements ---
│   ├── assumptions.json               # Explicit assumptions about environment, users, and constraints;
│   │                                  #   includes assumption ID, description, rationale, risk if wrong,
│   │                                  #   validation status, and dependent stories
│   ├── specifications.json            # High-level system specifications with metadata; defines scope,
│   │                                  #   objectives, success metrics, and links to detailed requirements
│   ├── user-stories.json              # Structured story data: ID, title, description, actor, priority,
│   │                                  #   story points, status, sprint assignment, dependencies, and tags
│   ├── acceptance-criteria.json       # Testable conditions per story: criterion ID, parent story,
│   │                                  #   given/when/then format, verification method, automation status
│   ├── glossary.json                  # Domain terminology definitions; ensures consistent language
│   │                                  #   across specs, code, and documentation; includes synonyms and
│   │                                  #   relationships between terms
│   │
│   │   # --- Business Rules & Constraints ---
│   ├── domain-rules.json              # Business logic constraints: rule ID, description, applicability
│   │                                  #   conditions, enforcement mechanism, exceptions, and examples
│   ├── data-constraints.json          # Data integrity rules: field validations, uniqueness constraints,
│   │                                  #   referential integrity, cardinality limits, format specifications
│   ├── criticality-matrix.json        # Impact assessment per feature/component: safety implications,
│   │                                  #   compliance requirements, financial impact, operational risk,
│   │                                  #   recovery priority
│   │
│   │   # --- Actors & Security ---
│   ├── actor-types.json               # User personas and system actors: role definitions, permissions,
│   │                                  #   access levels, usage patterns, and authorization boundaries
│   ├── security-requirements.json     # Security specifications: authentication mechanisms, authorization
│   │                                  #   rules, data classification (PII/PHI), encryption requirements,
│   │                                  #   audit logging, session management, OWASP compliance checklist
│   │
│   │   # --- Technical Specifications ---
│   ├── technical-requirements.json    # Non-functional requirements: performance targets (latency, throughput),
│   │                                  #   scalability limits, availability SLAs, architecture constraints,
│   │                                  #   browser/platform support, accessibility (WCAG) level
│   ├── technical-standards.json       # Development standards: coding conventions, testing requirements
│   │                                  #   (coverage thresholds, test types), documentation standards,
│   │                                  #   review criteria, linting rules, commit message format
│   ├── resource-requirements.json     # External dependencies: databases (type, version, schema),
│   │                                  #   third-party APIs (endpoints, auth, rate limits), message queues,
│   │                                  #   webhooks, file storage, caching layers
│   └── api-contracts.json             # API specifications: endpoint definitions, request/response schemas,
│                                      #   versioning strategy, deprecation policy, error codes, rate limits
│   # These enable slicing specifications by relevance to a task.
│
├── codebase-index/
│   ├── file-manifest.json             # Complete file inventory: path, type, size, creation date,
│   │                                  #   last modified, author, module membership, public/internal flag
│   ├── symbol-table.json              # Code symbol index: functions, classes, interfaces, exports,
│   │                                  #   entities, actions, acceptors, renderers, state machines;
│   │                                  #   includes signature, visibility, documentation status, complexity
│   ├── dependency-graph.json          # Import/export relationships: inbound/outbound dependencies,
│   │                                  #   circular dependency detection, external package usage,
│   │                                  #   coupling metrics
│   └── pattern-catalog.json           # Detected architectural patterns: pattern type, implementing files,
│                                      #   conformance level, variations, anti-patterns flagged
│
├── traceability/
│   ├── story-to-code.json             # Forward traceability: maps user stories to implementing files,
│   │                                  #   functions, and components; tracks implementation completeness
│   ├── criterion-to-code.json         # Acceptance criteria to code: maps each criterion to enforcement
│   │                                  #   code and validation tests; tracks verification status
│   ├── code-to-tests.json             # Test coverage mapping: links code entities to unit, integration,
│   │                                  #   and e2e tests; tracks coverage percentage and gap analysis
│   ├── constraint-to-code.json        # Domain rule enforcement: maps business rules and invariants to
│   │                                  #   validation code, error handlers, and guard clauses
│   ├── resource-usage.json            # External resource access: maps code paths to databases, APIs,
│   │                                  #   file systems; identifies access patterns and bottlenecks
│   └── change-impact-analysis.json    # Dependency impact tracking: given a changed file/symbol,
│                                      #   identifies affected stories, tests, and downstream code
│
├── quality-gates/
│   ├── inspection-assertions.json     # Verification checkpoints: per acceptance criterion, defines
│   │                                  #   inspection method, required evidence, pass/fail criteria,
│   │                                  #   automation capability, reviewer role
│   └── deliberation-triggers.json     # Human review triggers: conditions requiring manual decision
│                                      #   (cross-boundary changes, high-risk modifications, ambiguous
│                                      #   requirements, security-sensitive code, compliance checkpoints)
│
├── history/
│   ├── decisions.json                 # Architectural Decision Records (ADRs): decision ID, context,
│   │                                  #   options considered, rationale, consequences, status, supersedes
│   ├── deliberation-resolutions.json  # Paused decision outcomes: trigger condition, options presented,
│   │                                  #   human choice made, reasoning provided, timestamp, reviewer
│   ├── thread-summaries/              # Condensed conversation logs: per-session summaries, key decisions,
│   │                                  #   action items, unresolved questions, context for future sessions
│   ├── implementation-log.json        # Build history: what was implemented, which story/criterion,
│   │                                  #   files changed, author (human or agent), timestamp, verification
│   ├── migration-history.json         # Schema and data migrations: version, description, up/down scripts,
│   │                                  #   execution status, rollback capability
│   ├── deployment-history.json        # Release tracking: version, environment, timestamp, deployer,
│   │                                  #   configuration snapshot, rollback reference
│   └── incident-log.json              # Production issues: incident ID, severity, root cause, affected
│                                      #   components, resolution, prevention measures, related commits
│
└── active-context/
    ├── current-sprint.json            # Active sprint metadata: sprint ID, goal, start/end dates,
    │                                  #   committed stories, velocity target, blockers, burndown data
    ├── current-story.json             # Story in progress: full story details, implementation status,
    │                                  #   files touched, remaining criteria, blocking issues
    ├── current-debugging-session.json # Active debug context: symptom, hypothesis, investigated files,
    │                                  #   findings, reproduction steps, candidate fixes
    ├── working-set.json               # Currently relevant files: paths actively being modified or
    │                                  #   referenced, recent access timestamps, edit frequency
    ├── feature-flags.json             # Toggle states: flag name, current value per environment,
    │                                  #   rollout percentage, owner, expiration, cleanup status
    ├── environments.json              # Deployment targets: environment name, URL, configuration,
    │                                  #   deployed version, health status, access credentials reference
    ├── verification-state.json        # Test execution status: last run timestamp, pass/fail counts,
    │                                  #   coverage delta, flaky test tracking, blocking failures
    ├── risk-hotspots.json             # Flagged areas requiring review: file paths, risk type (complexity,
    │                                  #   churn, security, coverage gap), severity, recommended action
    └── rollback-points.json           # Safe restore markers: checkpoint ID, timestamp, git ref,
                                       #   configuration snapshot, verification state, restoration steps
```

### 2. Recursive Task Decomposition

**Task Analysis Protocol:**

```
Given: User request + Context Vault access

Step 1: CLASSIFY task type
  - Specification (planning only)
  - Implementation (code changes)
  - Investigation (read-only analysis)
  - Hybrid (needs decomposition)

Step 2: DETERMINE information needs
  - Which user stories are relevant?
  - Which files need to be read?
  - What patterns exist in codebase?
  - What decisions were made before?

Step 3: SLICE context
  - Query vault for relevant slices
  - Compose minimal sufficient context
  - Estimate token budget

Step 4: DECOMPOSE if needed
  - Split into sub-tasks
  - Assign to specialized agents
  - Define information flow between agents

Step 5: EXECUTE with focused context
  - Each agent receives only its slice
  - Results aggregated by orchestrator
```

### 3. Agent Specialization

| Agent Type | Context Slice | Output |
|------------|---------------|--------|
| **Spec Agent** | User stories, domain rules, constraints | Refined specs, acceptance criteria |
| **Architecture Agent** | Codebase patterns, dependency graph, decisions | Implementation plan, file targets |
| **Implementation Agent** | Target files, related patterns, specific story | Code changes |
| **Review Agent** | Changed files, acceptance criteria, patterns | Validation results |
| **Test Agent** | Implementation, acceptance criteria | Test cases |

### 4. Context Slicing Strategies

**Strategy A: Story-Centric Slicing**
```
Input: Single user story to implement
Slice:
  - The story + acceptance criteria
  - Files mentioned in previous similar stories
  - Patterns from related completed implementations
  - Relevant domain rules only
```

**Strategy B: Investigation Slicing**
```
Input: "How does X work in the codebase?"
Slice:
  - Symbol table entries matching X
  - Files containing X references
  - Related decision history
  - NO implementation context (read-only)
```

**Strategy C: Sprint Slicing**
```
Input: Sprint with multiple stories
Slice per story:
  - Individual story context
  - Shared sprint constraints
  - Cross-story dependencies only
Orchestrate:
  - Dependency-ordered execution
  - Shared context for related stories
```

---

## Implementation Phases

### Phase 1: Context Vault Foundation
- Structured storage for specifications
- Codebase indexing (files, symbols, patterns)
- History tracking for decisions

### Phase 2: Basic Slicing Engine
- Query interface for vault
- Token budget estimation
- Simple relevance filtering

### Phase 3: Recursive Orchestrator
- Task classification
- Agent spawning with sliced context
- Result aggregation

### Phase 4: Intelligent Decomposition
- Automatic task breakdown
- Dependency detection
- Parallel execution where possible

### Phase 5: Learning & Optimization
- Track which slices led to success
- Refine slicing heuristics
- Pattern recognition for task types

---

## User Stories for RLM Architecture

### Story 1: Context Vault Storage
**Title:** Structured Specification Storage

**Description:** As a developer, I want specifications stored in a queryable format so that the orchestrator can retrieve relevant context without loading everything.

**Acceptance Criteria:**
1. User stories stored as structured JSON with searchable fields
2. Acceptance criteria linked to parent stories
3. Domain rules stored with applicability conditions
4. Full-text search across all specification types
5. Retrieval by story ID, keyword, or related file

---

### Story 2: Codebase Indexing
**Title:** Codebase Symbol and Pattern Index

**Description:** As the orchestrator, I want an index of the codebase so that I can identify relevant files without reading everything.

**Acceptance Criteria:**
1. File manifest with path, type, size, last modified
2. Symbol table with functions, classes, exports per file
3. Import/dependency graph between files
4. Pattern catalog identifying common patterns (e.g., "plugin structure", "IPC handler")
5. Index updates on file changes

---

### Story 3: Context Slicing
**Title:** Intelligent Context Slicing

**Description:** As a developer, I want the orchestrator to select only relevant context so that Claude Code receives focused, manageable prompts.

**Acceptance Criteria:**
1. Given a task, identify relevant user stories (not all)
2. Given a task, identify relevant files (not entire codebase)
3. Estimate token count before sending to Claude Code
4. Configurable token budget per agent type
5. Fallback to broader context if initial slice insufficient

---

### Story 4: Recursive Task Decomposition
**Title:** Automatic Task Decomposition

**Description:** As a developer, I want complex tasks automatically broken into sub-tasks so that each can be handled with focused context.

**Acceptance Criteria:**
1. Tasks classified by type (spec, implementation, investigation, hybrid)
2. Hybrid tasks decomposed into typed sub-tasks
3. Dependencies between sub-tasks identified
4. Sub-tasks executed in dependency order
5. Results aggregated into coherent response

---

### Story 5: Specialized Agent Routing
**Title:** Route Sub-tasks to Specialized Agents

**Description:** As the orchestrator, I want sub-tasks routed to specialized agents so that each agent has optimized context for its role.

**Acceptance Criteria:**
1. Spec agent receives only specification-related context
2. Implementation agent receives target files and patterns
3. Test agent receives implementation and acceptance criteria
4. Each agent's context fits within token budget
5. Agent outputs feed back to orchestrator for aggregation

---

