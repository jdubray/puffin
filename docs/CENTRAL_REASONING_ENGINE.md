# Central Reasoning Engine (CRE) — Specification

**Version:** 0.1 (First Pass)  
**Status:** Draft  
**Scope:** Specification only — design and implementation are separate activities

---

## 1. Overview

The Central Reasoning Engine (CRE) is a core component of Puffin responsible for transforming user stories and sprint context into actionable, deterministic implementation instructions. It operates between planning and implementation, producing two primary deliverables: **Implementation Plans** and **Ready-to-Implement Specifications (RIS)**. A RIS is a markdown file.

The CRE maintains an internal **Code Model** expressed as a hybrid DSL (h-DSL) instance, which it updates as a feedback loop after each implementation cycle.

The CRE is **not** a plugin. It is part of Puffin's core architecture.

---

## 2. Assumptions

### 2.1 Process Assumptions

- A1: The existing Puffin workflow remains intact: user prompt → user stories → sprint assembly → planning → implementation → code review → bug fixing.
- A2: The CRE replaces and extends the current planning phase. What was previously a single planning activity becomes a two-stage process: Plan generation followed by RIS generation.
- A3: Users continue to have final approval authority over plans before implementation begins.
- A4: Implementation is carried out by Claude Code CLI (3CLI), which receives RIS as its primary input for each task.
- A5: The Memory Plugin and Outcome Lifecycle Plugin (introduced in Puffin V3) remain operational and are consumed by, but not managed by, the CRE.

### 2.2 Technical Assumptions

- A6: The h-DSL schema and instance data are too structurally complex for relational storage. JSON files are the appropriate storage medium.
- A7: Plans and RIS metadata (identifiers, relationships, status) are stored in the existing SQLite database. The content of RIS may reference or embed h-DSL fragments.
- A8: The h-DSL schema is not fixed at design time. It evolves as the CRE encounters new concepts in the codebase.
- A9: Every element in the h-DSL schema maps to exactly one h-M3 primitive (TERM, PROSE, SLOT, RELATION, STATE, TRANSITION, OUTCOME, ALIGNMENT).
- A10: The Outcome Lifecycle is managed separately by its plugin and is not modeled within the h-DSL, despite being conceptually part of it.
- A11: The CRE has read access to the full project codebase and Puffin's database at all times.

### 2.3 Quality Assumptions

- A12: RIS should be sufficiently precise that two independent implementations from the same RIS would produce functionally equivalent results (deterministic implementation).
- A13: The h-DSL Code Model does not need to be complete at all times — it is progressively refined. Gaps are acceptable as long as the areas relevant to current work are modeled.

---

## 3. Roles and Responsibilities

### 3.1 Plan Generation

| Responsibility | Description |
|---|---|
| **Initiate planning** | Accept a sprint (with its user stories) as input and begin the planning process. |
| **Ask clarifying questions** | Identify ambiguities or missing information in user stories and surface questions to the user. |
| **Produce implementation plan** | Generate an ordered plan specifying how user stories will be implemented, including sequencing, branch strategy, and dependencies. |
| **Support plan iteration** | Allow the user to review, question, and request changes to the plan before approval. |
| **Store the plan** | Persist the approved plan in the database, linked to the sprint. |
| **Generate inspection assertions** | Once the plan is approved, for each user story, produce testable assertions that define what artifact are expected to exist (new file, new function...) that can be tested. |

### 3.2 RIS Generation

| Responsibility | Description |
|---|---|
| **Produce RIS per user story** | Before implementation begins for a user story, generate one or more RIS — at minimum one per branch, avoid cross branch RISes, prefer individual RISes per branch. |
| **Consult the Code Model** | Use the h-DSL instance to understand the current state of the codebase when formulating RIS. |
| **Consult the plan** | Ensure each RIS is consistent with the approved plan and respects sequencing and dependencies. |
| **Keep RIS concise** | RIS are short, directive, and specific. They tell Claude exactly what to do — files to create/modify, functions to implement, patterns to follow. |
| **Store RIS** | Persist each RIS in the database, linked to its user story, plan, and sprint. |

### 3.3 Code Model Maintenance

| Responsibility | Description |
|---|---|
| **Introspect after implementation** | After each implementation cycle (post bug-fixing), examine code changes and additions. |
| **Update the h-DSL instance** | Reflect new or modified artifacts, dependencies, flows, and intent in the Code Model. |
| **Evolve the h-DSL schema** | When a new concept is encountered that cannot be expressed by the current schema, extend the schema with new element types. |
| **Annotate with h-M3** | Every new schema element must be annotated with the h-M3 primitive it maps to. |
| **Store schema and instance** | Persist both the h-DSL schema and the h-DSL instance as JSON files. |

### 3.4 Boundary — What the CRE Does NOT Do

| Exclusion | Rationale |
|---|---|
| **Execute implementations** | 3CLI executes code. The CRE produces specifications, not code. |
| **Manage the outcome lifecycle** | Handled by the Outcome Lifecycle Plugin. |
| **Manage memory/context** | Handled by the Memory Plugin. The CRE consumes memory artifacts but does not manage them. |
| **Create user stories** | User stories are created upstream in the Puffin workflow. |
| **Conduct code review or bug fixing** | These are separate workflow phases that occur after implementation. |

---

## 4. Requirements

### 4.1 Functional Requirements

#### Plan Management

- **FR-01:** The CRE SHALL accept a sprint and its associated user stories as input to begin planning.
- **FR-02:** The CRE SHALL generate clarifying questions when user stories contain ambiguities, underspecified behavior, or conflicting requirements.
- **FR-03:** The CRE SHALL produce an implementation plan that specifies the order of user story implementation, branch strategy, and inter-story dependencies.
- **FR-04:** The CRE SHALL generate inspection assertions for each plan item that can be used to verify implementation correctness.
- **FR-05:** The CRE SHALL support iterative plan refinement — the user may request changes, ask questions, and re-approve.
- **FR-06:** The CRE SHALL persist the approved plan in the database with a 1:1 relationship to the sprint.

#### RIS Generation

- **FR-07:** The CRE SHALL generate at least one RIS per branch for each user story before implementation begins.
- **FR-08:** Each RIS SHALL contain sufficient detail for Claude to implement the user story without requiring further clarification (deterministic implementation).
- **FR-09:** RIS SHALL reference specific files, functions, patterns, and conventions from the Code Model where applicable.
- **FR-10:** The CRE SHALL persist each RIS in the database with relationships to its source user story, the plan, and the sprint.
- **FR-11:** RIS SHALL be concise — they are directive instructions, not exploratory documents.

#### Code Model (h-DSL)

- **FR-12:** The CRE SHALL maintain an h-DSL instance that models the project codebase (artifacts, dependencies, flows, intent).
- **FR-13:** The CRE SHALL introspect code changes after each implementation cycle (post bug-fixing) and update the h-DSL instance accordingly.
- **FR-14:** The CRE SHALL extend the h-DSL schema on-the-fly when new concepts are encountered that the current schema cannot express.
- **FR-15:** Every element in the h-DSL schema SHALL be annotated with exactly one h-M3 primitive.
- **FR-16:** The h-DSL schema SHALL be stored as a JSON file.
- **FR-17:** The h-DSL instance SHALL be stored as a JSON file.
- **FR-18:** The h-DSL SHALL use minimal structured DSL for well-known software artifacts (modules, files, classes, functions, dependencies) and prefer prose for details that would require complex DSL constructs.

### 4.2 Data Model Requirements

- **DR-01:** Sprint → Plan: 1:1 relationship.
- **DR-02:** Sprint → User Story: 1:* relationship.
- **DR-03:** User Story → RIS: 1:* relationship.
- **DR-04:** By transitivity, RIS → Plan: *:1 and RIS → Sprint: *:1.
- **DR-05:** Plan and RIS records SHALL be stored in the SQLite database (metadata, status, relationships).
- **DR-06:** h-DSL schema and instance SHALL be stored as JSON files on the filesystem, not in the database.

### 4.3 Non-Functional Requirements

- **NFR-01:** The CRE SHALL be implemented as a core Puffin module, not as a plugin.
- **NFR-02:** CRE failures during planning or RIS generation SHALL NOT crash Puffin. Errors must be caught, reported to the user, and allow for retry.
- **NFR-03:** The h-DSL instance SHALL support incremental updates — full regeneration of the Code Model should not be required after each implementation cycle.
- **NFR-04:** The h-DSL schema evolution SHALL be backward-compatible — existing instance data must remain valid when the schema is extended.
- **NFR-05:** RIS generation SHALL be idempotent — generating RIS for the same user story and plan state should produce equivalent output.

### 4.4 Integration Requirements

- **IR-01:** The CRE SHALL consume context from the Memory Plugin when generating plans and RIS.
- **IR-02:** The CRE SHALL read outcome lifecycle data from the Outcome Lifecycle Plugin to inform planning decisions.
- **IR-03:** The CRE SHALL expose IPC channels for Puffin's orchestration layer to trigger plan generation, RIS generation, and Code Model updates.
- **IR-04:** The CRE SHALL produce RIS in a format consumable by the 3CLI orchestration layer.

---

## 5. Glossary

| Term | Definition |
|---|---|
| **CRE** | Central Reasoning Engine — core Puffin component for planning and specification generation. |
| **RIS** | Ready-to-Implement Specification — a concise, deterministic set of instructions derived from a user story, plan, and Code Model. |
| **h-DSL** | Hybrid Domain Specific Language — a combination of structured DSL (for well-known artifacts) and prose (for nuanced descriptions). |
| **h-M3** | Meta-Meta-Model — the foundational type system (TERM, PROSE, SLOT, RELATION, STATE, TRANSITION, OUTCOME, ALIGNMENT) to which all h-DSL elements map. |
| **Code Model** | The h-DSL instance that describes the current state of the project codebase. |
| **3CLI** | Claude Code CLI — the AI coding assistant that executes implementations based on RIS. |
| **Inspection Assertions** | Testable conditions generated during planning that define what code artifact (new file, new function...) is expected to be found after the implementation of a user story. |