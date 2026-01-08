# Abstract Code Model (ACM) Specification

**Version:** 0.1.0-draft  
**Authors:** JJ  
**Date:** January 2026

---

## Overview

The Abstract Code Model (ACM) is a metamodel designed to help AI coding agents (such as Claude Code) navigate, understand, and safely modify codebases. It provides structured knowledge about code organization, dependencies, requirements traceability, and risk signals—enabling AI to make informed decisions about what to read, what to change, and when to pause for human deliberation.

### Design Principles

1. **Layered Abstraction** — From inventory to intent, each layer adds semantic meaning
2. **Bidirectional Traceability** — Code traces to requirements; requirements trace to code
3. **Criticality-Aware** — Distinguishes mission-critical from routine code
4. **Deliberation Points** — Explicit markers for human review (System 2 activation)
5. **Incremental Generation** — Layers can be built and updated independently
6. **Language Agnostic** — Core model works across programming languages

---

## Table of Contents

1. [Layer Architecture](#layer-architecture)
2. [Layer 1: Inventory](#layer-1-inventory)
3. [Layer 2: Structure](#layer-2-structure)
4. [Layer 3: Dependencies](#layer-3-dependencies)
5. [Layer 4: Resources](#layer-4-resources)
6. [Layer 5: Intent](#layer-5-intent)
7. [Layer 6: Constraints](#layer-6-constraints)
8. [Layer 7: Signals](#layer-7-signals)
9. [Layer 8: Decisions](#layer-8-decisions)
10. [Code Annotation Syntax](#code-annotation-syntax)
11. [ACM File Format](#acm-file-format)
12. [Claude Code Integration](#claude-code-integration)

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 8: DECISIONS                                             │
│  Why was this code written this way?                            │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐            │
│  │ Design       │  │ Alternative │  │ Rationale    │            │
│  │ Decision     │  │             │  │              │            │
│  └──────────────┘  └─────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 7: SIGNALS                                               │
│  What is the health and risk of this code?                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐       │
│  │ Metric   │  │ Smell    │  │ Hotspot   │  │ History   │       │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6: CONSTRAINTS                                           │
│  What must always be true?                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │ Invariant    │  │ Domain Rule  │  │ Inspection       │       │
│  │              │  │              │  │ Assertion        │       │
│  └──────────────┘  └──────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5: INTENT                                                │
│  Why does this code exist?                                      │
│  ┌─────────┐  ┌────────────┐  ┌────────────────┐                │
│  │ Story   │  │ Acceptance │  │ Deliberation   │                │
│  │         │  │ Criterion  │  │ Point          │                │
│  └─────────┘  └────────────┘  └────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: RESOURCES                                             │
│  What external systems does the code interact with?             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐       │
│  │ Database │  │ API       │  │ File     │  │ Queue     │       │
│  │          │  │ Endpoint  │  │ System   │  │           │       │
│  └──────────┘  └───────────┘  └──────────┘  └───────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: DEPENDENCIES                                          │
│  How does code connect?                                         │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐      │
│  │ Calls    │  │ Reads     │  │ Writes    │  │ Extends   │      │
│  └──────────┘  └───────────┘  └───────────┘  └───────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: STRUCTURE                                             │
│  What are the code entities?                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐        │
│  │ Module   │  │ Class    │  │ Function │  │ Type      │        │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: INVENTORY                                             │
│  What files exist?                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐        │
│  │ File     │  │ Exports  │  │ Imports  │  │ Metadata  │        │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Inventory

The inventory provides Claude Code with a file system map, eliminating the need for exploratory `ls` or `find` commands.

### Schema

```typescript
interface Inventory {
  root: string;                    // Absolute path: "/home/user/project"
  files: FileEntry[];
  directories: DirectoryEntry[];
  generatedAt: DateTime;
  gitCommit?: string;              // For staleness detection
  gitBranch?: string;
}

interface FileEntry {
  path: string;                    // Relative: "src/orders/validation.py"
  language: Language;
  size: number;                    // Bytes
  lastModified: DateTime;
  checksum?: string;               // For change detection
  
  // Classification flags
  classification: FileClassification;
  
  // Quick content hints (avoid reading file)
  exports: ExportRef[];
  imports: ImportRef[];
}

interface FileClassification {
  isSource: boolean;               // Primary source code
  isTest: boolean;                 // Test file
  isGenerated: boolean;            // Machine-generated (migrations, etc.)
  isConfig: boolean;               // Configuration file
  isEntryPoint: boolean;           // Application entry point
  isPublicAPI: boolean;            // Exposed external interface
  layer?: ArchitecturalLayer;      // "presentation" | "business" | "data" | "infrastructure"
}

interface ExportRef {
  name: string;                    // "validateOrder"
  kind: EntityKind;                // "function" | "class" | etc.
  isDefault: boolean;              // ES6 default export
  isPublic: boolean;               // Part of public API
}

interface ImportRef {
  module: string;                  // "orders.models" or "react"
  isExternal: boolean;             // Third-party package
  isRelative: boolean;             // "./utils" vs "src/utils"
  symbols: string[];               // ["Order", "LineItem"]
  importKind: "named" | "default" | "namespace" | "side-effect";
}

type Language = 
  | "python" | "javascript" | "typescript" | "java" | "kotlin"
  | "go" | "rust" | "c" | "cpp" | "csharp" | "ruby" | "php"
  | "sql" | "html" | "css" | "json" | "yaml" | "markdown";

type ArchitecturalLayer =
  | "presentation"    // UI, views, controllers
  | "application"     // Use cases, orchestration
  | "domain"          // Business logic, entities
  | "infrastructure"  // Database, external services
  | "shared";         // Utilities, cross-cutting
```

---

## Layer 2: Structure

Language-independent code structure enabling entity lookup without file reads.

### Schema

```typescript
interface Structure {
  entities: Map<EntityId, CodeEntity>;
  byFile: Map<FilePath, EntityId[]>;       // File → entities
  byName: Map<QualifiedName, EntityId>;    // Name → entity
  byKind: Map<EntityKind, EntityId[]>;     // Kind → entities
}

interface CodeEntity {
  id: EntityId;                    // Stable identifier: "e_001"
  kind: EntityKind;
  name: string;                    // "validateOrder"
  qualifiedName: string;           // "orders.validation.validateOrder"
  location: SourceLocation;
  visibility: Visibility;
  
  // Structural relationships
  parent?: EntityId;               // Containing entity
  children: EntityId[];            // Contained entities
  
  // Type information
  signature?: Signature;           // For functions/methods
  typeInfo?: TypeInfo;             // For variables/properties
  
  // Documentation
  docstring?: string;              // Extracted doc comment
  annotations: SourceAnnotation[]; // ACM annotations in code
  
  // SAM Pattern (optional)
  samRole?: SAMRole;
}

type EntityId = string;            // "e_001", "e_002", etc.
type QualifiedName = string;

type EntityKind = 
  | "module"
  | "class" 
  | "interface"
  | "trait"
  | "function"
  | "method"
  | "property"
  | "field"
  | "variable"
  | "constant"
  | "type_alias"
  | "enum"
  | "enum_member";

type Visibility = "public" | "protected" | "private" | "internal" | "module";

type SAMRole = "state" | "action" | "model" | "view" | "container";

interface SourceLocation {
  file: FilePath;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  // Byte offsets for precise edits
  startOffset?: number;
  endOffset?: number;
}

interface Signature {
  parameters: Parameter[];
  returnType?: TypeRef;
  typeParameters?: TypeParameter[];  // Generics
  throws?: TypeRef[];                // Checked exceptions
  isAsync: boolean;
  isGenerator: boolean;
  isStatic: boolean;
  isAbstract: boolean;
}

interface Parameter {
  name: string;
  type?: TypeRef;
  optional: boolean;
  defaultValue?: string;             // As source text
  isVariadic: boolean;               // *args, ...rest
}

interface TypeRef {
  name: string;
  qualifiedName?: string;
  typeArguments?: TypeRef[];         // Generic parameters
  isNullable: boolean;
  isArray: boolean;
}
```

---

## Layer 3: Dependencies

The critical layer for impact analysis, representing how code connects.

### Schema

```typescript
interface Dependencies {
  edges: DependencyEdge[];
  
  // Pre-computed indexes
  outgoing: Map<EntityId, DependencyEdge[]>;  // X depends on...
  incoming: Map<EntityId, DependencyEdge[]>;  // ...depends on X
  
  // Transitive closures (computed on demand or cached)
  affectedBy?: Map<EntityId, Set<EntityId>>;
  affects?: Map<EntityId, Set<EntityId>>;
}

interface DependencyEdge {
  id: EdgeId;
  source: EntityId;
  target: EntityId;
  kind: DependencyKind;
  location: SourceLocation;          // Where dependency occurs
  
  // Impact analysis hints
  strength: DependencyStrength;
  isRequired: boolean;               // vs optional/conditional
  isDynamic: boolean;                // Reflection, eval, dynamic import
  confidence: Confidence;            // For inferred dependencies
}

type DependencyKind =
  // Control flow
  | "calls"                          // Function invocation
  | "instantiates"                   // Constructor call
  | "overrides"                      // Method override
  | "implements"                     // Interface implementation
  
  // Data flow
  | "reads"                          // Field/variable read
  | "writes"                         // Field/variable write
  | "mutates"                        // In-place modification
  | "parameter_in"                   // Data passed as argument
  | "parameter_out"                  // Output parameter
  | "returns"                        // Return value
  
  // Type relationships
  | "extends"                        // Inheritance
  | "uses_type"                      // Type in signature
  | "casts_to"                       // Type cast
  
  // Module relationships
  | "imports"                        // Module import
  | "re_exports"                     // Re-export from module
  
  // Resource access
  | "accesses_resource";             // Database, file, API

type DependencyStrength = "strong" | "weak" | "optional";
type Confidence = "certain" | "high" | "medium" | "low" | "inferred";
```

---

## Layer 4: Resources

External systems the code interacts with.

### Schema

```typescript
interface Resources {
  databases: DatabaseResource[];
  apis: APIResource[];
  fileStores: FileStoreResource[];
  queues: QueueResource[];
  caches: CacheResource[];
}

interface DatabaseResource {
  id: ResourceId;
  name: string;                      // "orders_db"
  kind: "relational" | "document" | "key_value" | "graph" | "time_series";
  connectionConfig?: string;         // Reference to config location
  
  structures: DataStructure[];
  accessedBy: ResourceAccess[];
}

interface DataStructure {
  name: string;                      // "orders" (table name)
  kind: "table" | "collection" | "index" | "view";
  fields: DataField[];
  mappedToType?: EntityId;           // ORM entity mapping
}

interface DataField {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef?: string;            // "customers.id"
  isNullable: boolean;
  isIndexed: boolean;
}

interface ResourceAccess {
  entity: EntityId;
  operations: ("create" | "read" | "update" | "delete")[];
  accessPattern?: string;            // "by_customer_id", "full_scan"
}

interface APIResource {
  id: ResourceId;
  name: string;
  baseUrl?: string;
  kind: "rest" | "graphql" | "grpc" | "websocket";
  
  endpoints: APIEndpoint[];
  calledBy: EntityId[];
}

interface APIEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  requestType?: TypeRef;
  responseType?: TypeRef;
  calledBy: EntityId[];
}
```

---

## Layer 5: Intent

The semantic layer connecting code to business requirements.

### Schema

```typescript
interface Intent {
  stories: UserStory[];
  acceptanceCriteria: AcceptanceCriterion[];
  deliberationPoints: DeliberationPoint[];
  
  // Indexes
  storyToCode: Map<StoryId, EntityId[]>;
  codeToStory: Map<EntityId, StoryId[]>;
  criterionToCode: Map<CriterionId, EntityId[]>;
  codeToTests: Map<EntityId, EntityId[]>;
}

interface UserStory {
  id: StoryId;                       // "US-042"
  externalId?: string;               // "GH-123", "JIRA-456"
  externalUrl?: string;              // Link to issue tracker
  
  title: string;
  description?: string;
  
  // User story format
  asA?: string;                      // "restaurant manager"
  iWant?: string;                    // "to merge feature branches"
  soThat?: string;                   // "I can integrate team work"
  
  // Criticality assessment
  criticality: CriticalityLevel;
  impactScope: ImpactScope;
  
  // Traceability
  acceptanceCriteria: CriterionId[];
  implementedBy: EntityId[];
  
  // Coverage metrics
  implementationCoverage: number;    // 0.0 - 1.0
  testCoverage: number;              // 0.0 - 1.0
  
  // Lifecycle
  status: StoryStatus;
  createdAt: DateTime;
  updatedAt: DateTime;
}

type StoryId = string;               // "US-042"
type CriterionId = string;           // "US-042-AC-01"

type CriticalityLevel = 
  | "safety"                         // Human harm possible
  | "compliance"                     // Legal/regulatory requirement
  | "security"                       // Attack surface, data protection
  | "financial"                      // Money at stake
  | "operational"                    // Business continuity
  | "standard";                      // Normal feature

type StoryStatus = 
  | "draft"
  | "ready"
  | "in_progress"
  | "implemented"
  | "verified"
  | "deprecated";

interface ImpactScope {
  directUsers: string[];             // ["customers", "staff"]
  indirectStakeholders: string[];    // ["suppliers", "auditors"]
  affectedSystems: string[];         // ["payment_gateway", "inventory"]
  delayedEffects?: string;           // Downstream consequences
}

interface AcceptanceCriterion {
  id: CriterionId;                   // "US-042-AC-01"
  storyId: StoryId;
  
  title: string;
  
  // Gherkin format
  given: string[];                   // Preconditions
  when: string[];                    // Actions
  then: string[];                    // Expected outcomes
  
  // Criticality (inherits from story, can override)
  criticality?: CriticalityLevel;
  
  // Traceability
  implementedBy: EntityId[];
  testedBy: EntityId[];
  inspectionAssertions: AssertionId[];
  
  // Verification status
  verificationStatus: VerificationStatus;
  lastVerified?: DateTime;
}

type VerificationStatus = 
  | "unverified"
  | "passing"
  | "failing"
  | "blocked"
  | "manual_required";

interface DeliberationPoint {
  id: string;
  trigger: DeliberationTrigger;
  question: string;                  // What human must decide
  context: string;                   // Background information
  
  relevantEntities: EntityId[];
  relevantStories: StoryId[];
  relevantConstraints: ConstraintId[];
  
  suggestedOptions?: string[];
  recommendation?: string;
  
  // When triggered
  conditions: TriggerCondition[];
}

type DeliberationTrigger =
  | "cross_boundary"                 // Change spans modules/layers
  | "high_risk_hotspot"              // Touching flagged code
  | "missing_test_coverage"          // No test covers path
  | "ambiguous_requirement"          // AC unclear or missing
  | "architectural_decision"         // System-wide impact
  | "external_contract_change"       // API/schema modification
  | "security_sensitive"             // Auth, crypto, PII
  | "financial_impact"               // Payment, billing logic
  | "rollback_difficult"             // Hard to undo
  | "multiple_stakeholders";         // Affects many parties

interface TriggerCondition {
  kind: "entity_touched" | "file_modified" | "dependency_added" | "metric_exceeded";
  target: string;                    // Entity ID, file path, or metric name
  threshold?: number;
}
```

---

## Layer 6: Constraints

Invariants and rules that must always hold.

### Schema

```typescript
interface Constraints {
  invariants: Invariant[];
  domainRules: DomainRule[];
  inspectionAssertions: InspectionAssertion[];
  
  // Indexes
  byEntity: Map<EntityId, ConstraintId[]>;
  byCriticality: Map<CriticalityLevel, ConstraintId[]>;
}

type ConstraintId = string;
type AssertionId = string;

interface Invariant {
  id: ConstraintId;
  name: string;
  description: string;
  
  // Formal expression (optional, language-specific)
  expression?: string;
  expressionLanguage?: "python" | "typescript" | "sql" | "predicate";
  
  // Scope
  appliesTo: EntityId[];
  scope: "entity" | "module" | "system";
  
  // Verification
  verificationMethod: VerificationMethod;
  enforcedBy: EntityId[];            // Code that enforces this
  testedBy: EntityId[];              // Tests that verify this
  
  // Criticality
  criticality: CriticalityLevel;
  violationSeverity: "error" | "warning" | "info";
  violationMessage: string;
}

type VerificationMethod = 
  | "static_analysis"                // Compile-time check
  | "runtime_assertion"              // Assert at runtime
  | "unit_test"                      // Test coverage
  | "integration_test"               // Cross-component test
  | "manual_review"                  // Human verification
  | "formal_proof";                  // Mathematical proof

interface DomainRule {
  id: ConstraintId;
  name: string;
  description: string;
  
  kind: DomainRuleKind;
  
  // Natural language + optional formal
  rule: string;                      // "Order total must equal sum of line items"
  formalExpression?: string;
  
  // Traceability
  sourceDocument?: string;           // Business requirements doc
  relatedStories: StoryId[];
  enforcedBy: EntityId[];
  testedBy: EntityId[];
  
  criticality: CriticalityLevel;
}

type DomainRuleKind = 
  | "calculation"                    // Mathematical relationship
  | "validation"                     // Input validation
  | "state_transition"               // Valid state changes
  | "authorization"                  // Who can do what
  | "temporal"                       // Time-based rules
  | "cardinality"                    // Relationship limits
  | "uniqueness"                     // Uniqueness constraints
  | "referential_integrity";         // Foreign key rules

interface InspectionAssertion {
  id: AssertionId;                   // "IA-042-01"
  criterionId: CriterionId;          // Links to acceptance criterion
  
  name: string;
  description: string;
  
  // What to check
  assertionKind: AssertionKind;
  target: AssertionTarget;
  
  // Expected outcome
  expectation: string;               // Human-readable
  formalExpectation?: string;        // Machine-checkable
  
  // Verification
  verificationMethod: VerificationMethod;
  automatable: boolean;
  
  // For code review / AI inspection
  inspectionPrompt?: string;         // Prompt for AI reviewer
  checklistItems?: string[];         // Manual review checklist
  
  // Status
  status: AssertionStatus;
  lastInspected?: DateTime;
  inspectedBy?: "human" | "ai" | "automated";
  evidence?: string;                 // Link to test, screenshot, etc.
}

type AssertionKind = 
  | "behavior"                       // Code does X
  | "state_change"                   // State transitions correctly
  | "side_effect"                    // External effect occurs
  | "error_handling"                 // Errors handled properly
  | "performance"                    // Meets performance criteria
  | "security"                       // Security requirement met
  | "accessibility"                  // A11y requirement met
  | "data_integrity"                 // Data remains consistent
  | "boundary"                       // Edge cases handled
  | "integration";                   // External system interaction

interface AssertionTarget {
  entities: EntityId[];              // Code being inspected
  inputConditions?: string[];        // Preconditions for test
  outputConditions?: string[];       // Expected postconditions
}

type AssertionStatus = 
  | "pending"                        // Not yet inspected
  | "passed"                         // Assertion verified
  | "failed"                         // Assertion violated
  | "blocked"                        // Cannot verify
  | "not_applicable"                 // Doesn't apply to current impl
  | "deferred";                      // Postponed verification
```

---

## Layer 7: Signals

Code health metrics and risk indicators.

### Schema

```typescript
interface Signals {
  entityMetrics: Map<EntityId, EntityMetrics>;
  fileMetrics: Map<FilePath, FileMetrics>;
  moduleMetrics: Map<string, ModuleMetrics>;
  
  smells: CodeSmell[];
  hotspots: Hotspot[];
  
  // Computed at generation time
  generatedAt: DateTime;
  analysisVersion: string;
}

interface EntityMetrics {
  // Size
  lineCount: number;
  statementCount: number;
  
  // Complexity
  cyclomaticComplexity: number;
  cognitiveComplexity?: number;
  nestingDepth: number;
  parameterCount?: number;
  
  // Coupling
  afferentCoupling: number;          // Incoming dependencies
  efferentCoupling: number;          // Outgoing dependencies
  instability: number;               // Ce / (Ca + Ce)
  
  // Cohesion
  lackOfCohesion?: number;           // LCOM metric
  
  // History (from git)
  changeFrequency: number;           // Changes per month
  lastChanged: DateTime;
  authorCount: number;
  defectCount: number;               // Linked bug fixes
  
  // Testing
  testCoverage: number;              // 0.0 - 1.0
  assertionDensity?: number;         // Assertions per line
  
  // Computed risk
  riskScore: number;                 // 0.0 - 1.0
  riskFactors: RiskFactor[];
}

type RiskFactor = 
  | "high_complexity"
  | "low_test_coverage"
  | "frequently_changed"
  | "many_authors"
  | "recent_defects"
  | "high_coupling"
  | "deep_nesting"
  | "large_size"
  | "stale_documentation";

interface CodeSmell {
  id: string;
  kind: SmellKind;
  location: SourceLocation;
  affectedEntities: EntityId[];
  severity: "info" | "warning" | "error";
  message: string;
  suggestedFix?: string;
  effortToFix?: "trivial" | "easy" | "moderate" | "hard";
}

type SmellKind =
  | "long_method"
  | "large_class"
  | "feature_envy"
  | "data_clump"
  | "primitive_obsession"
  | "duplicate_code"
  | "dead_code"
  | "circular_dependency"
  | "god_class"
  | "shotgun_surgery"
  | "divergent_change"
  | "inappropriate_intimacy"
  | "lazy_class"
  | "speculative_generality"
  | "temporary_field"
  | "message_chains"
  | "middle_man";

interface Hotspot {
  id: string;
  entities: EntityId[];
  reason: string;                    // Human-readable explanation
  riskScore: number;
  riskFactors: RiskFactor[];
  suggestedAction: string;
  
  // For deliberation
  requiresReviewBefore: "modification" | "deletion" | "any_change";
}
```

---

## Layer 8: Decisions

Design decisions and their rationale for knowledge preservation.

### Schema

```typescript
interface Decisions {
  decisions: DesignDecision[];
  byEntity: Map<EntityId, DecisionId[]>;
  byCategory: Map<DecisionCategory, DecisionId[]>;
}

type DecisionId = string;

interface DesignDecision {
  id: DecisionId;
  
  // The decision
  title: string;
  question: string;                  // "How should we handle concurrent orders?"
  decision: string;                  // "Use optimistic locking with retry"
  rationale: string;                 // Why this choice
  
  // Alternatives considered
  alternatives: Alternative[];
  
  // Context
  category: DecisionCategory;
  status: DecisionStatus;
  
  // Attribution
  decidedBy: DecisionMaker;
  decidedAt: DateTime;
  reviewedBy?: string[];
  
  // Scope
  affectedEntities: EntityId[];
  relatedStories: StoryId[];
  relatedConstraints: ConstraintId[];
  
  // Evolution
  supersedes?: DecisionId;           // Previous decision this replaces
  supersededBy?: DecisionId;         // Decision that replaced this
  
  // Documentation
  documentationLink?: string;
  adrs?: string[];                   // Architecture Decision Records
}

interface Alternative {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  rejectionReason: string;
}

type DecisionCategory = 
  | "architecture"
  | "technology"
  | "pattern"
  | "api_design"
  | "data_model"
  | "security"
  | "performance"
  | "ux"
  | "integration"
  | "deployment";

type DecisionStatus = 
  | "proposed"
  | "accepted"
  | "deprecated"
  | "superseded";

type DecisionMaker = 
  | { kind: "human"; name: string }
  | { kind: "ai_suggested"; model: string; humanApproved: boolean }
  | { kind: "ai_autonomous"; model: string; context: string };
```

---

## Code Annotation Syntax

ACM annotations are embedded in source code comments using a structured format that can be parsed during ACM generation.

### General Syntax

```
/**
 * @acm:<category> <value>
 */
```

### Annotation Categories

#### Story Annotations

```python
# Python example

"""
@acm:story US-042 "User can merge feature branch"
@acm:story-link https://github.com/org/repo/issues/123
@acm:criticality operational
"""
def merge_feature_branch(source: str, target: str) -> MergeResult:
    ...
```

```typescript
// TypeScript example

/**
 * @acm:story US-042 "User can merge feature branch"
 * @acm:as-a "developer"
 * @acm:i-want "to merge feature branches"
 * @acm:so-that "I can integrate completed work"
 */
export async function mergeFeatureBranch(source: string, target: string): Promise<MergeResult> {
    ...
}
```

#### Acceptance Criterion Annotations

```python
"""
@acm:criterion US-042-AC-01 "Merge succeeds when no conflicts"
@acm:given "source branch has commits not in target"
@acm:given "no conflicting changes exist"
@acm:when "merge is requested"
@acm:then "commits are applied to target"
@acm:then "merge commit is created"
@acm:tested-by test_merge_no_conflicts
"""
def perform_merge(source: Branch, target: Branch) -> MergeCommit:
    ...
```

```typescript
/**
 * @acm:criterion US-042-AC-02 "Conflicts are detected and reported"
 * @acm:given "source and target have conflicting changes to same file"
 * @acm:when "merge is attempted"
 * @acm:then "MergeConflictError is raised"
 * @acm:then "conflicting files are listed"
 * @acm:criticality operational
 */
export function detectConflicts(source: Branch, target: Branch): ConflictReport {
    ...
}
```

#### Inspection Assertion Annotations

```python
"""
@acm:inspection IA-042-01 "Conflict detection covers all file types"
@acm:asserts "All modified files are checked for conflicts"
@acm:asserts "Binary files are flagged as unmergeable"
@acm:verify-by unit_test
@acm:checklist "Review that text diff is used for text files"
@acm:checklist "Review that binary files raise BinaryConflictError"
"""
def check_file_conflicts(file_path: str, source_content: bytes, target_content: bytes) -> ConflictStatus:
    ...
```

```typescript
/**
 * @acm:inspection IA-042-02 "Error messages are user-friendly"
 * @acm:asserts "Error includes list of conflicting files"
 * @acm:asserts "Error suggests resolution steps"
 * @acm:verify-by manual_review
 * @acm:prompt "Check that error message includes actionable guidance"
 */
export class MergeConflictError extends Error {
    constructor(public conflicts: ConflictReport) {
        super(formatConflictMessage(conflicts));
    }
}
```

#### Behavior and State Annotations (SAM Pattern)

```python
"""
@acm:behavior "Detects conflicting changes between branches"
@acm:sam-role action
@acm:proposes merge_state
@acm:modifies git.merge_state
@acm:side-effect io:filesystem
"""
def propose_merge(source: Branch, target: Branch) -> MergeProposal:
    ...
```

```typescript
/**
 * @acm:sam-role model
 * @acm:accepts propose_merge
 * @acm:accepts abort_merge
 * @acm:validates "source branch exists"
 * @acm:validates "user has merge permission"
 * @acm:state-transition "pending -> in_progress -> completed | failed"
 */
export function acceptMergeProposal(proposal: MergeProposal, state: MergeState): MergeState {
    ...
}
```

#### Constraint and Invariant Annotations

```python
"""
@acm:invariant INV-001 "Merge preserves commit history"
@acm:ensures "All source commits appear in target after merge"
@acm:ensures "Commit timestamps are preserved"
@acm:enforced-by verify_commit_history
"""
def create_merge_commit(source: Branch, target: Branch, message: str) -> Commit:
    ...
```

```typescript
/**
 * @acm:domain-rule DR-001 "Only authorized users can merge to protected branches"
 * @acm:rule-kind authorization
 * @acm:criticality security
 * @acm:enforced-by check_branch_protection
 * @acm:tested-by test_protected_branch_merge
 */
export async function validateMergePermission(user: User, target: Branch): Promise<boolean> {
    ...
}
```

#### Dependency and Impact Annotations

```python
"""
@acm:depends-on BranchRepository.get_branch
@acm:depends-on ConflictDetector.detect
@acm:impacts MergeHistoryView
@acm:impacts NotificationService
@acm:external-call github_api.create_merge
"""
def execute_merge(request: MergeRequest) -> MergeResult:
    ...
```

#### Decision Annotations

```typescript
/**
 * @acm:decision DEC-007 "Use three-way merge algorithm"
 * @acm:question "How should we merge divergent branches?"
 * @acm:rationale "Three-way merge handles most cases automatically and is git-compatible"
 * @acm:alternative "Two-way merge - rejected: loses context of common ancestor"
 * @acm:alternative "Rebase only - rejected: rewrites history, not suitable for shared branches"
 */
export function threeWayMerge(base: Tree, source: Tree, target: Tree): MergeResult {
    ...
}
```

#### Deliberation Point Annotations

```python
"""
@acm:deliberation DP-003 "Force merge decision"
@acm:trigger manual_override
@acm:question "Should force merge be allowed for this protected branch?"
@acm:context "Force merge bypasses conflict detection and review requirements"
@acm:stakeholders ["security_team", "release_manager"]
@acm:options ["Allow with audit log", "Require secondary approval", "Deny"]
"""
def force_merge(source: Branch, target: Branch, override_token: str) -> MergeResult:
    ...
```

#### Risk and Signal Annotations

```python
"""
@acm:hotspot "Complex merge logic with history of bugs"
@acm:risk-note "This function was refactored after CVE-2024-1234"
@acm:review-before modification
@acm:warn "Changes require security review"
"""
def recursive_merge(base: Tree, ours: Tree, theirs: Tree) -> MergeResult:
    ...
```

### Full Annotated Example

```python
# src/git/merge.py

"""
Git Merge Module

@acm:module git.merge
@acm:layer domain
@acm:description "Core merge functionality for combining branches"
"""

from typing import List, Optional
from dataclasses import dataclass

from .models import Branch, Commit, Tree, MergeResult, ConflictReport
from .repository import BranchRepository
from .conflicts import ConflictDetector


@dataclass
class MergeRequest:
    """
    @acm:entity MergeRequest
    @acm:sam-role state
    @acm:story US-042
    """
    source_branch: str
    target_branch: str
    message: Optional[str] = None
    force: bool = False


class MergeService:
    """
    @acm:entity MergeService
    @acm:story US-042
    @acm:story US-043
    @acm:criticality operational
    @acm:decision DEC-007 "Three-way merge"
    """
    
    def __init__(self, repo: BranchRepository, detector: ConflictDetector):
        """
        @acm:depends-on BranchRepository
        @acm:depends-on ConflictDetector
        """
        self.repo = repo
        self.detector = detector
    
    def merge(self, request: MergeRequest) -> MergeResult:
        """
        Perform a merge operation.
        
        @acm:story US-042 "User can merge feature branch"
        @acm:criterion US-042-AC-01 "Merge succeeds when no conflicts"
        @acm:criterion US-042-AC-02 "Conflicts are detected and reported"
        
        @acm:behavior "Merges source branch into target branch"
        @acm:sam-role action
        @acm:proposes merge_state
        
        @acm:given "source and target branches exist"
        @acm:when "merge is requested"
        @acm:then "branches are merged or conflicts reported"
        
        @acm:inspection IA-042-01 "All code paths handle errors"
        @acm:asserts "BranchNotFoundError raised for missing branch"
        @acm:asserts "MergeConflictError raised with conflict details"
        @acm:verify-by unit_test
        
        @acm:inspection IA-042-02 "Merge is atomic"
        @acm:asserts "Partial merge does not persist on failure"
        @acm:verify-by integration_test
        
        @acm:modifies git.branch_state
        @acm:side-effect io:git_repository
        @acm:external-call git.create_commit
        
        @acm:invariant INV-001 "Commit history preserved"
        @acm:invariant INV-002 "No data loss on conflict"
        
        @acm:depends-on BranchRepository.get_branch
        @acm:depends-on ConflictDetector.detect
        @acm:depends-on self._execute_merge
        
        @acm:tested-by test_merge_no_conflicts
        @acm:tested-by test_merge_with_conflicts
        @acm:tested-by test_merge_missing_branch
        """
        # Validate branches exist
        source = self.repo.get_branch(request.source_branch)
        target = self.repo.get_branch(request.target_branch)
        
        if source is None:
            raise BranchNotFoundError(request.source_branch)
        if target is None:
            raise BranchNotFoundError(request.target_branch)
        
        # Check for conflicts
        conflicts = self.detector.detect(source, target)
        
        if conflicts.has_conflicts and not request.force:
            raise MergeConflictError(conflicts)
        
        # Execute merge
        return self._execute_merge(source, target, request.message)
    
    def _execute_merge(
        self, 
        source: Branch, 
        target: Branch, 
        message: Optional[str]
    ) -> MergeResult:
        """
        @acm:criterion US-042-AC-03 "Merge commit has correct metadata"
        @acm:given "no conflicts exist"
        @acm:when "merge is executed"
        @acm:then "merge commit created with both parents"
        @acm:then "commit message includes source branch name"
        
        @acm:inspection IA-042-03 "Commit message format"
        @acm:asserts "Default message follows convention: 'Merge {source} into {target}'"
        @acm:asserts "Custom message is preserved if provided"
        @acm:verify-by unit_test
        
        @acm:hotspot "Core merge execution - modify with care"
        @acm:risk-note "Ensure atomic operation"
        """
        if message is None:
            message = f"Merge {source.name} into {target.name}"
        
        # ... merge implementation
        pass


class ConflictResolver:
    """
    @acm:entity ConflictResolver
    @acm:story US-043 "User can resolve merge conflicts"
    @acm:criticality operational
    
    @acm:deliberation DP-004 "Conflict resolution strategy"
    @acm:trigger automatic_resolution_available
    @acm:question "Should automatic resolution be applied?"
    @acm:options ["Apply automatic", "Manual resolution", "Abort merge"]
    """
    
    def resolve(self, conflicts: ConflictReport, strategy: str) -> MergeResult:
        """
        @acm:criterion US-043-AC-01 "Manual resolution preserves user changes"
        @acm:criterion US-043-AC-02 "Automatic resolution uses safe defaults"
        
        @acm:inspection IA-043-01 "Resolution completeness"
        @acm:asserts "All conflicts are addressed before completion"
        @acm:asserts "Unresolved conflicts block merge"
        @acm:verify-by integration_test
        @acm:checklist "Verify that partial resolution is not committed"
        
        @acm:domain-rule DR-002 "Resolution must not lose data"
        @acm:rule-kind data_integrity
        @acm:criticality operational
        """
        pass
```

---

## ACM File Format

The ACM is stored as JSON (with optional YAML alternative) in the project repository.

### File Structure

```
project/
├── .acm/
│   ├── acm.json              # Main ACM file (or acm.yaml)
│   ├── acm.schema.json       # JSON Schema for validation
│   ├── inventory.json        # Layer 1 (can be separate for large projects)
│   ├── structure.json        # Layer 2
│   ├── dependencies.json     # Layer 3
│   ├── intent.json           # Layer 5 (stories, criteria)
│   ├── constraints.json      # Layer 6 (invariants, assertions)
│   └── signals.json          # Layer 7 (generated, not version controlled)
├── src/
│   └── ...
└── tests/
    └── ...
```

### Main ACM File Structure

```json
{
  "$schema": "./acm.schema.json",
  "version": "0.1.0",
  "generatedAt": "2026-01-07T10:30:00Z",
  "generator": {
    "tool": "acm-generator",
    "version": "1.0.0",
    "config": {}
  },
  
  "project": {
    "name": "hanuman-pos",
    "root": "/home/jj/projects/hanuman-pos",
    "repository": "https://github.com/jj/hanuman-pos",
    "defaultBranch": "main"
  },
  
  "git": {
    "commit": "abc123def456",
    "branch": "feature/merge-improvements",
    "dirty": false
  },
  
  "inventory": { ... },
  "structure": { ... },
  "dependencies": { ... },
  "resources": { ... },
  "intent": { ... },
  "constraints": { ... },
  "signals": { ... },
  "decisions": { ... }
}
```

### Complete Example

```json
{
  "$schema": "./acm.schema.json",
  "version": "0.1.0",
  "generatedAt": "2026-01-07T10:30:00Z",
  
  "project": {
    "name": "hanuman-pos",
    "root": "/home/jj/projects/hanuman-pos"
  },
  
  "git": {
    "commit": "abc123",
    "branch": "main",
    "dirty": false
  },
  
  "inventory": {
    "files": [
      {
        "path": "src/orders/validation.py",
        "language": "python",
        "size": 2340,
        "lastModified": "2026-01-05T14:20:00Z",
        "classification": {
          "isSource": true,
          "isTest": false,
          "isGenerated": false,
          "layer": "domain"
        },
        "exports": [
          {"name": "validate_order", "kind": "function", "isPublic": true},
          {"name": "OrderValidator", "kind": "class", "isPublic": true}
        ],
        "imports": [
          {"module": "orders.models", "symbols": ["Order", "LineItem"], "isExternal": false},
          {"module": "typing", "symbols": ["Optional", "List"], "isExternal": true}
        ]
      }
    ]
  },
  
  "structure": {
    "entities": {
      "e001": {
        "id": "e001",
        "kind": "function",
        "name": "validate_order",
        "qualifiedName": "orders.validation.validate_order",
        "location": {
          "file": "src/orders/validation.py",
          "startLine": 15,
          "endLine": 45
        },
        "visibility": "public",
        "signature": {
          "parameters": [
            {"name": "order", "type": {"name": "Order"}, "optional": false, "isVariadic": false},
            {"name": "strict", "type": {"name": "bool"}, "optional": true, "defaultValue": "True", "isVariadic": false}
          ],
          "returnType": {"name": "ValidationResult", "isNullable": false, "isArray": false},
          "isAsync": false,
          "isGenerator": false,
          "isStatic": false,
          "isAbstract": false
        },
        "docstring": "Validates an order against business rules.",
        "annotations": [
          {"category": "story", "value": "US-100"},
          {"category": "criterion", "value": "US-100-AC-01"},
          {"category": "criticality", "value": "financial"}
        ],
        "samRole": "action",
        "parent": null,
        "children": []
      }
    }
  },
  
  "dependencies": {
    "edges": [
      {
        "id": "dep001",
        "source": "e001",
        "target": "e002",
        "kind": "calls",
        "location": {"file": "src/orders/validation.py", "startLine": 23, "endLine": 23},
        "strength": "strong",
        "isRequired": true,
        "isDynamic": false,
        "confidence": "certain"
      }
    ]
  },
  
  "resources": {
    "databases": [
      {
        "id": "db001",
        "name": "orders_db",
        "kind": "relational",
        "structures": [
          {
            "name": "orders",
            "kind": "table",
            "fields": [
              {"name": "id", "type": "uuid", "isPrimaryKey": true, "isForeignKey": false, "isNullable": false, "isIndexed": true},
              {"name": "customer_id", "type": "uuid", "isPrimaryKey": false, "isForeignKey": true, "foreignKeyRef": "customers.id", "isNullable": false, "isIndexed": true},
              {"name": "total", "type": "decimal(10,2)", "isPrimaryKey": false, "isForeignKey": false, "isNullable": false, "isIndexed": false}
            ],
            "mappedToType": "e010"
          }
        ],
        "accessedBy": [
          {"entity": "e001", "operations": ["read"]},
          {"entity": "e020", "operations": ["read", "update"]}
        ]
      }
    ],
    "apis": [],
    "fileStores": [],
    "queues": [],
    "caches": []
  },
  
  "intent": {
    "stories": [
      {
        "id": "US-100",
        "externalId": "GH-100",
        "externalUrl": "https://github.com/jj/hanuman-pos/issues/100",
        "title": "Validate orders before submission",
        "asA": "restaurant cashier",
        "iWant": "orders to be validated before submission",
        "soThat": "invalid orders don't reach the kitchen",
        "criticality": "financial",
        "impactScope": {
          "directUsers": ["cashiers", "customers"],
          "indirectStakeholders": ["kitchen_staff", "accountant"],
          "affectedSystems": ["kitchen_display", "payment_gateway"]
        },
        "acceptanceCriteria": ["US-100-AC-01", "US-100-AC-02", "US-100-AC-03"],
        "implementedBy": ["e001", "e002"],
        "implementationCoverage": 0.85,
        "testCoverage": 0.70,
        "status": "implemented",
        "createdAt": "2025-11-01T10:00:00Z",
        "updatedAt": "2026-01-05T14:20:00Z"
      }
    ],
    "acceptanceCriteria": [
      {
        "id": "US-100-AC-01",
        "storyId": "US-100",
        "title": "Order items must have positive quantities",
        "given": ["an order with line items"],
        "when": ["the order is validated"],
        "then": ["items with zero or negative quantities are rejected", "error message specifies invalid items"],
        "criticality": "financial",
        "implementedBy": ["e001"],
        "testedBy": ["e050"],
        "inspectionAssertions": ["IA-100-01", "IA-100-02"],
        "verificationStatus": "passing",
        "lastVerified": "2026-01-06T09:00:00Z"
      }
    ],
    "deliberationPoints": [
      {
        "id": "DP-001",
        "trigger": "high_risk_hotspot",
        "question": "Should this validation logic be modified without additional review?",
        "context": "This code handles financial calculations and has had past defects.",
        "relevantEntities": ["e001"],
        "relevantStories": ["US-100"],
        "relevantConstraints": ["INV-001", "DR-001"],
        "suggestedOptions": ["Proceed with extra test coverage", "Request peer review", "Defer to next sprint"],
        "conditions": [
          {"kind": "entity_touched", "target": "e001"}
        ]
      }
    ],
    "storyToCode": {"US-100": ["e001", "e002"]},
    "codeToStory": {"e001": ["US-100"], "e002": ["US-100"]},
    "criterionToCode": {"US-100-AC-01": ["e001"]},
    "codeToTests": {"e001": ["e050", "e051"]}
  },
  
  "constraints": {
    "invariants": [
      {
        "id": "INV-001",
        "name": "Order total equals line item sum",
        "description": "The order total must always equal the sum of (quantity × price) for all line items",
        "expression": "order.total == sum(item.quantity * item.price for item in order.items)",
        "expressionLanguage": "python",
        "appliesTo": ["e001", "e020"],
        "scope": "module",
        "verificationMethod": "unit_test",
        "enforcedBy": ["e001"],
        "testedBy": ["e050"],
        "criticality": "financial",
        "violationSeverity": "error",
        "violationMessage": "Order total does not match line item sum"
      }
    ],
    "domainRules": [
      {
        "id": "DR-001",
        "name": "Minimum order amount",
        "description": "Orders must meet minimum amount for delivery",
        "kind": "validation",
        "rule": "Delivery orders must have a total of at least $15.00",
        "formalExpression": "order.delivery_type == 'delivery' implies order.total >= 15.00",
        "relatedStories": ["US-100", "US-105"],
        "enforcedBy": ["e001"],
        "testedBy": ["e052"],
        "criticality": "operational"
      }
    ],
    "inspectionAssertions": [
      {
        "id": "IA-100-01",
        "criterionId": "US-100-AC-01",
        "name": "Quantity validation completeness",
        "description": "All line items are checked for valid quantities",
        "assertionKind": "behavior",
        "target": {
          "entities": ["e001"],
          "inputConditions": ["order has multiple line items"],
          "outputConditions": ["all items validated", "first invalid item reported"]
        },
        "expectation": "Every line item's quantity is validated, not just the first",
        "verificationMethod": "unit_test",
        "automatable": true,
        "inspectionPrompt": "Verify that the validation loop processes ALL items, not just returns on first valid/invalid",
        "checklistItems": [
          "Loop iterates through all order.items",
          "Invalid items are collected, not just first one",
          "Error message includes all invalid item IDs"
        ],
        "status": "passed",
        "lastInspected": "2026-01-06T09:00:00Z",
        "inspectedBy": "automated",
        "evidence": "test_validation.py::test_multiple_invalid_items"
      },
      {
        "id": "IA-100-02",
        "criterionId": "US-100-AC-01",
        "name": "Error message clarity",
        "description": "Validation errors are clear and actionable",
        "assertionKind": "behavior",
        "target": {
          "entities": ["e001"]
        },
        "expectation": "Error messages specify which items are invalid and why",
        "verificationMethod": "manual_review",
        "automatable": false,
        "inspectionPrompt": "Review error message format: Does it clearly identify the problematic item(s) and explain what's wrong?",
        "checklistItems": [
          "Error includes item name or ID",
          "Error explains the validation rule violated",
          "Error suggests corrective action"
        ],
        "status": "passed",
        "lastInspected": "2026-01-05T16:00:00Z",
        "inspectedBy": "human"
      }
    ],
    "byEntity": {"e001": ["INV-001", "DR-001", "IA-100-01", "IA-100-02"]},
    "byCriticality": {"financial": ["INV-001"], "operational": ["DR-001"]}
  },
  
  "signals": {
    "entityMetrics": {
      "e001": {
        "lineCount": 30,
        "statementCount": 22,
        "cyclomaticComplexity": 8,
        "cognitiveComplexity": 12,
        "nestingDepth": 3,
        "parameterCount": 2,
        "afferentCoupling": 5,
        "efferentCoupling": 3,
        "instability": 0.375,
        "changeFrequency": 1.5,
        "lastChanged": "2026-01-05T14:20:00Z",
        "authorCount": 2,
        "defectCount": 1,
        "testCoverage": 0.70,
        "riskScore": 0.45,
        "riskFactors": ["moderate_complexity", "recent_defects"]
      }
    },
    "smells": [],
    "hotspots": [
      {
        "id": "hs001",
        "entities": ["e001"],
        "reason": "Moderate complexity combined with recent defect history and financial criticality",
        "riskScore": 0.45,
        "riskFactors": ["moderate_complexity", "recent_defects"],
        "suggestedAction": "Ensure comprehensive test coverage before modifications",
        "requiresReviewBefore": "modification"
      }
    ],
    "generatedAt": "2026-01-07T10:30:00Z",
    "analysisVersion": "1.0.0"
  },
  
  "decisions": {
    "decisions": [
      {
        "id": "DEC-001",
        "title": "Validation architecture",
        "question": "How should order validation be structured?",
        "decision": "Single validation function with configurable strictness",
        "rationale": "Simpler to understand and test than a chain of validators; strictness flag allows reuse for draft vs final validation",
        "alternatives": [
          {
            "name": "Validator chain pattern",
            "description": "Chain of responsibility with separate validators",
            "pros": ["More extensible", "Each rule isolated"],
            "cons": ["More complex", "Harder to debug order-dependent rules"],
            "rejectionReason": "Over-engineering for current requirements"
          }
        ],
        "category": "architecture",
        "status": "accepted",
        "decidedBy": {"kind": "human", "name": "JJ"},
        "decidedAt": "2025-11-15T10:00:00Z",
        "affectedEntities": ["e001", "e002"],
        "relatedStories": ["US-100"]
      }
    ],
    "byEntity": {"e001": ["DEC-001"], "e002": ["DEC-001"]},
    "byCategory": {"architecture": ["DEC-001"]}
  }
}
```

---

## Claude Code Integration

### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE + ACM WORKFLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LOAD ACM                                                    │
│     Claude reads .acm/acm.json at session start                 │
│     Checks git commit matches (staleness detection)             │
│                                                                 │
│  2. UNDERSTAND REQUEST                                          │
│     User: "Fix the order validation bug - totals are wrong"     │
│     Claude: [queries ACM by keywords: "order", "validation",    │
│              "total"]                                           │
│                                                                 │
│  3. TARGETED DISCOVERY                                          │
│     ACM provides:                                                │
│       → Entity: validate_order at validation.py:15-45           │
│       → Story: US-100 "Validate orders before submission"       │
│       → Invariant: INV-001 "total equals line item sum"         │
│       → Depends on: Order model, calc_line_total                │
│       → Depended on by: submit_order, OrderAPI                  │
│       → Risk: 0.45 (moderate) - has past defect                 │
│       → Tests: test_validation.py (70% coverage)                │
│       → Deliberation: DP-001 triggered (high-risk hotspot)      │
│                                                                 │
│  4. DELIBERATION PAUSE (System 2 Activation)                    │
│     Claude surfaces deliberation point to human:                │
│     "This code handles financial calculations and has had       │
│      past defects. Suggested options:                           │
│      1. Proceed with extra test coverage                        │
│      2. Request peer review                                     │
│      3. Defer to next sprint"                                   │
│     Human: "Proceed with option 1"                              │
│                                                                 │
│  5. TARGETED FILE READ                                          │
│     Claude reads only validation.py:15-45                       │
│     (not the whole file, not grepping)                          │
│                                                                 │
│  6. CONSTRAINT-AWARE MODIFICATION                               │
│     Claude knows:                                                │
│       - INV-001 must be preserved (total = sum of items)        │
│       - AC criteria that must still pass                        │
│       - Inspection assertions to satisfy                        │
│                                                                 │
│  7. IMPACT-AWARE TESTING                                        │
│     Claude runs: test_validation.py                             │
│     Claude checks: affected code (submit_order, OrderAPI)       │
│                                                                 │
│  8. ANNOTATION UPDATE                                           │
│     Claude adds/updates annotations in modified code:           │
│       @acm:inspection IA-100-03 "Total calculation fix"         │
│       @acm:tested-by test_total_calculation_edge_cases          │
│                                                                 │
│  9. ACM REGENERATION                                            │
│     Trigger incremental ACM update for changed files            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Query Examples

Claude Code can query the ACM for:

| Query | ACM Response |
|-------|--------------|
| "Where is order validation?" | Entity e001, file path, line range |
| "What tests cover this?" | Test entity IDs, file paths |
| "What depends on this function?" | Incoming dependency edges |
| "What are the acceptance criteria?" | AC objects with given/when/then |
| "Is this high risk?" | Risk score, factors, hotspot info |
| "What invariants apply?" | Constraint objects with expressions |
| "Should I pause for review?" | Deliberation points triggered |

### Benefits Summary

| Without ACM | With ACM |
|-------------|----------|
| `find . -name "*.py" \| xargs grep "validate"` | Direct lookup by qualified name |
| Read entire file to find function | Read exact line range |
| Guess at dependencies | Explicit dependency graph |
| Unknown test coverage | Test mapping per entity |
| No risk awareness | Risk scores and hotspots |
| No requirement traceability | Story → Code → Test links |
| No deliberation triggers | Explicit pause points |

---

## Appendix A: Annotation Quick Reference

| Annotation | Description | Example |
|------------|-------------|---------|
| `@acm:story` | Links to user story | `@acm:story US-042 "Merge branches"` |
| `@acm:criterion` | Links to acceptance criterion | `@acm:criterion US-042-AC-01` |
| `@acm:given` | Precondition (Gherkin) | `@acm:given "branches exist"` |
| `@acm:when` | Action (Gherkin) | `@acm:when "merge requested"` |
| `@acm:then` | Expected outcome (Gherkin) | `@acm:then "commits merged"` |
| `@acm:inspection` | Inspection assertion | `@acm:inspection IA-042-01` |
| `@acm:asserts` | What inspection checks | `@acm:asserts "all items validated"` |
| `@acm:verify-by` | Verification method | `@acm:verify-by unit_test` |
| `@acm:checklist` | Manual review item | `@acm:checklist "Check error format"` |
| `@acm:prompt` | AI inspection prompt | `@acm:prompt "Verify atomicity"` |
| `@acm:criticality` | Criticality level | `@acm:criticality financial` |
| `@acm:behavior` | What code does | `@acm:behavior "Validates order"` |
| `@acm:sam-role` | SAM pattern role | `@acm:sam-role action` |
| `@acm:modifies` | State modified | `@acm:modifies order.status` |
| `@acm:side-effect` | External effect | `@acm:side-effect io:database` |
| `@acm:depends-on` | Dependency | `@acm:depends-on OrderModel` |
| `@acm:invariant` | Invariant reference | `@acm:invariant INV-001` |
| `@acm:domain-rule` | Domain rule reference | `@acm:domain-rule DR-001` |
| `@acm:decision` | Design decision | `@acm:decision DEC-007` |
| `@acm:deliberation` | Deliberation point | `@acm:deliberation DP-001` |
| `@acm:hotspot` | Risk warning | `@acm:hotspot "Complex logic"` |
| `@acm:tested-by` | Test reference | `@acm:tested-by test_validation` |

---

## Appendix B: Generation Strategy

| Layer | Generation Method | Update Trigger |
|-------|-------------------|----------------|
| Inventory | File system scan + AST parse | File changes |
| Structure | Language-specific parser (tree-sitter) | File changes |
| Dependencies | Static analysis (call graph) | File changes |
| Resources | Config parsing + ORM introspection | Config/schema changes |
| Intent | Annotation extraction + issue tracker sync | Manual + annotation changes |
| Constraints | Annotation extraction | Annotation changes |
| Signals | Git log analysis + static metrics | Git push, periodic |
| Decisions | Manual entry + annotation extraction | Manual |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0-draft | 2026-01-07 | Initial draft specification |