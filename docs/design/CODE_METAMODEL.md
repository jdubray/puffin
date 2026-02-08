
  Core Domains:
  1. Requirement Domain - Epic, UserStory, AcceptanceCriterion
  2. Code Artifact Domain - CodeFile, Module, Member, CodeRegion
  3. Functionality Domain - Feature, Behavior, StateChange, SideEffect

  Traceability Links:
  - ImplementsStory / SatisfiesCriterion - code to requirements
  - DependsOn / ModifiesState - code dependencies
  - BelongsToLayer / FollowsPattern - architectural context

  Annotation Syntax:
  /**
   * @story US-042 "User can merge feature branch"
   * @criterion US-042-AC-3 "Merge conflicts are detected"
   * @behavior Detects conflicting changes between branches
   * @modifies git.mergeState
   * @sideEffect io:filesystem
   * @pattern SAM:Action
   */

  Key Features:
  - Bidirectional traceability (requirements ↔ code)
  - Coverage reporting and gap analysis
  - Impact analysis for changes
  - Lifecycle states for annotation maintenance
  - Integration points with Puffin, Claude Code, and version control

  This metamodel would enable Claude to annotate generated code in a way that maintains clear links to the user stories driving the implementation, making it easier to verify completeness and understand the purpose of each code artifact.

┌─────────────────────────────────────────────────────────────┐
│  INTENT LAYER                                               │
│  (Why does this code exist?)                                │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐                  │
│  │ Story   │──│ Scenario │──│ Acceptance │                  │
│  │         │  │          │  │ Criterion  │                  │
│  └─────────┘  └──────────┘  └────────────┘                  │
└─────────────────────────────────────────────────────────────┘
           │ realizes
           ▼
┌────────────────────────────────────────────────────────────┐
│  BEHAVIOR LAYER                                            │
│  (What does the code do?)                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐                 │
│  │ Behavior │──│ State    │──│ Transition│                 │
│  │          │  │          │  │           │                 │
│  └──────────┘  └──────────┘  └───────────┘                 │
└────────────────────────────────────────────────────────────┘
           │ implemented-by
           ▼
┌────────────────────────────────────────────────────────────┐
│  STRUCTURE LAYER                                           │
│  (How is the code organized?)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐     │
│  │ Module   │──│ Type     │──│ Function │──│Statement│     │
│  │          │  │          │  │          │  │         │     │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘     │
└────────────────────────────────────────────────────────────┘
           │ depends-on / data-flows / control-flows
           ▼
┌─────────────────────────────────────────────────────────────┐
│  SEMANTIC LAYER                                             │
│  (What relationships exist?)                                │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐                 │
│  │ DataFlow │  │ Control   │  │ Call      │                 │
│  │ Edge     │  │ Flow Edge │  │ Edge      │                 │
│  └──────────┘  └───────────┘  └───────────┘                 │
└─────────────────────────────────────────────────────────────┘
           │ measured-by
           ▼
┌─────────────────────────────────────────────────────────────┐
│  QUALITY LAYER                                              │
│  (What is the health of the code?)                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Metric   │  │ Smell    │  │ Defect    │  │ Change    │   │
│  │          │  │          │  │           │  │ History   │   │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘   │
└─────────────────────────────────────────────────────────────┘


https://claude.ai/share/c9d317fe-449e-4bfb-a0df-1ce80f895152

Layer 1: Inventory
Provides Claude Code with the file system map without needing ls or find.

interface Inventory {
  root: string;                    // "/home/user/project"
  files: FileEntry[];
  generatedAt: DateTime;
  gitCommit: string;               // For staleness detection
}

interface FileEntry {
  path: string;                    // "src/orders/validation.py"
  language: Language;
  size: number;                    // bytes
  lastModified: DateTime;
  
  // Pre-computed for quick filtering
  isTest: boolean;
  isGenerated: boolean;
  isConfig: boolean;
  isEntryPoint: boolean;
  
  // Quick content hints (avoid reading file)
  exports: string[];               // ["validateOrder", "OrderValidator"]
  imports: ImportRef[];            // What this file depends on
}

interface ImportRef {
  module: string;                  // "orders.models" or "react"
  isExternal: boolean;
  symbols: string[];               // ["Order", "LineItem"]
}


Claude Code benefit: Before exploring, Claude knows which files exist, what they export, and their dependencies—without reading them.

Layer 2: Structure
Language-independent code structure. Aligned with KDM Code Package but flattened for quick lookup.


interface Structure {
  entities: Map<EntityId, CodeEntity>;
  byFile: Map<FilePath, EntityId[]>;       // Fast file→entities lookup
  byName: Map<QualifiedName, EntityId>;    // Fast name→entity lookup
}

interface CodeEntity {
  id: EntityId;                    // Stable identifier
  kind: EntityKind;
  name: string;
  qualifiedName: string;           // "orders.validation.validateOrder"
  location: SourceLocation;
  
  // Structural relationships (parent/child)
  parent: EntityId | null;
  children: EntityId[];
  
  // Type information (for reliability)
  signature?: Signature;           // For functions
  typeInfo?: TypeInfo;             // For typed languages
  
  // Documentation (reduces need to read source)
  docstring?: string;
  annotations: Annotation[];
}

type EntityKind = 
  | "module"
  | "class" 
  | "interface"
  | "function"
  | "method"
  | "property"
  | "variable"
  | "constant"
  | "type_alias"
  | "enum";

interface SourceLocation {
  file: FilePath;
  startLine: number;
  endLine: number;
  // Character offsets for precise edits
  startOffset: number;
  endOffset: number;
}

interface Signature {
  parameters: Parameter[];
  returnType: TypeRef;
  throws?: TypeRef[];              // For languages with checked exceptions
  isAsync: boolean;
  isGenerator: boolean;
}

interface Parameter {
  name: string;
  type: TypeRef;
  optional: boolean;
  defaultValue?: string;           // As source text
}

Claude Code benefit: Given a function name, immediately get its signature, location, and documentation without reading the file.

Layer 3: Dependencies
The critical layer for impact analysis. Combines KDM Action Package concepts with graph structure optimized for queries.


interface Dependencies {
  edges: DependencyEdge[];
  
  // Pre-computed indexes for fast lookup
  outgoing: Map<EntityId, DependencyEdge[]>;  // "what does X depend on?"
  incoming: Map<EntityId, DependencyEdge[]>;  // "what depends on X?"
  
  // Transitive closures (expensive to compute, cheap to query)
  affectedBy: Map<EntityId, Set<EntityId>>;   // All entities affected if X changes
  affects: Map<EntityId, Set<EntityId>>;      // All entities X could affect
}

interface DependencyEdge {
  source: EntityId;
  target: EntityId;
  kind: DependencyKind;
  location: SourceLocation;        // Where the dependency occurs
  
  // Strength hints for impact analysis
  isRequired: boolean;             // vs optional/conditional
  isDynamic: boolean;              // Reflection, eval, dynamic import
  confidence: number;              // For inferred dependencies
}

type DependencyKind =
  // Control flow (KDM Action: Calls, EntryFlow, ExitFlow)
  | "calls"                        // Function invocation
  | "instantiates"                 // Constructor call
  | "overrides"                    // Method override
  | "implements"                   // Interface implementation
  
  // Data flow (KDM Action: Reads, Writes, Addresses)
  | "reads"                        // Field/variable read
  | "writes"                       // Field/variable write
  | "parameter"                    // Data passed as argument
  | "returns"                      // Data returned
  
  // Type relationships
  | "extends"                      // Inheritance
  | "uses_type"                    // Type reference in signature
  | "generic_param"                // Type parameter usage
  
  // Module relationships
  | "imports"                      // Module import
  | "re_exports"                   // Re-export from module
  
  // Runtime
  | "dispatches_event"             // Event emission
  | "handles_event";               // Event handler


Claude Code benefit: "What breaks if I change validateOrder?" becomes a direct lookup instead of grep + analysis.

Layer 4: Resources
External resources the code touches. Derived from KDM Data, UI, and Platform packages but focused on what matters for changes.


interface Resources {
  dataStores: DataStore[];
  uiComponents: UIComponent[];
  externalServices: ExternalService[];
  configurations: ConfigEntry[];
}

interface DataStore {
  id: ResourceId;
  kind: "database" | "file" | "cache" | "queue";
  name: string;                    // "orders_db", "redis_cache"
  
  // Schema information
  structures: DataStructure[];
  
  // Which code accesses this?
  accessedBy: EntityAccess[];
}

interface DataStructure {
  name: string;                    // "orders" (table name)
  kind: "table" | "collection" | "file_format";
  fields: DataField[];
  
  // ORM mapping if applicable
  mappedToType?: EntityId;         // Links to class in Structure
}

interface DataField {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef?: string;          // "customers.id"
}

interface EntityAccess {
  entity: EntityId;
  operations: ("read" | "write" | "delete" | "schema_modify")[];
  location: SourceLocation;
}

interface UIComponent {
  id: ResourceId;
  kind: "page" | "screen" | "form" | "component";
  name: string;
  route?: string;                  // "/orders/:id"
  
  // Connections
  renderedBy: EntityId[];          // Functions/components that render this
  handlesEvents: EventHandler[];
  displaysData: DataBinding[];
}

interface ExternalService {
  id: ResourceId;
  name: string;                    // "stripe_api", "ubereats_webhook"
  kind: "rest_api" | "graphql" | "grpc" | "webhook" | "message_queue";
  
  endpoints: Endpoint[];
  calledBy: EntityId[];
}

interface ConfigEntry {
  key: string;                     // "DATABASE_URL", "FEATURE_FLAG_X"
  source: string;                  // ".env", "config/settings.py"
  usedBy: EntityId[];
  isSensitive: boolean;
}



Claude Code benefit: When modifying code that writes to orders table, immediately see: schema, other code that reads it, UI components displaying it.

Layer 5: Intent
Traces code back to requirements. This is the layer that answers "why."


interface Intent {
  stories: Story[];
  behaviors: Behavior[];
  
  // The key indexes
  storyToCode: Map<StoryId, EntityId[]>;
  codeToStory: Map<EntityId, StoryId[]>;
  behaviorToCode: Map<BehaviorId, EntityId[]>;
  codeToBehavior: Map<EntityId, BehaviorId[]>;
}

interface Story {
  id: StoryId;
  externalId?: string;             // "JIRA-1234", "GH-567"
  title: string;
  description: string;
  
  // Acceptance criteria in structured form
  acceptanceCriteria: AcceptanceCriterion[];
  
  // Status
  status: "planned" | "in_progress" | "done";
  
  // Computed coverage
  implementationCoverage: number;  // 0-1, based on code links
  testCoverage: number;            // 0-1, based on test links
}

interface AcceptanceCriterion {
  id: string;
  description: string;
  
  // BDD structure if available
  given?: string[];
  when?: string[];
  then?: string[];
  
  // Links
  implementedBy: EntityId[];
  testedBy: EntityId[];            // Test functions
}

interface Behavior {
  id: BehaviorId;
  name: string;                    // "order_validation"
  description: string;
  
  // State machine (optional, for complex behaviors)
  states?: State[];
  transitions?: Transition[];
  
  // The contract
  preconditions: Condition[];
  postconditions: Condition[];
  invariants: Condition[];
  
  // Links
  primaryImplementation: EntityId;
  supportingEntities: EntityId[];
  tests: EntityId[];
  
  // Derived from stories
  realizesStories: StoryId[];
}

interface Condition {
  description: string;
  expression?: string;             // Formal if available
  checkLocation?: SourceLocation;  // Where it's enforced in code
}

Claude Code benefit: Before changing order validation, Claude sees: which user stories depend on it, what the acceptance criteria are, what behaviors/invariants must be preserved.

Layer 6: Signals
Risk and quality signals that inform change strategy.

interface Signals {
  entitySignals: Map<EntityId, EntitySignals>;
  fileSignals: Map<FilePath, FileSignals>;
  hotspots: Hotspot[];             // Pre-computed high-risk areas
}

interface EntitySignals {
  // Complexity (static analysis)
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  parameterCount: number;
  lineCount: number;
  
  // Coupling
  afferentCoupling: number;        // Things that depend on this
  efferentCoupling: number;        // Things this depends on
  instability: number;             // efferent / (afferent + efferent)
  
  // History (from git)
  changeFrequency: number;         // Changes per month
  lastModified: DateTime;
  authorCount: number;
  
  // Defect correlation
  defectCount: number;             // Historical bugs
  lastDefect?: DateTime;
  
  // Test coverage
  testCoverage: number;            // 0-1
  testCount: number;
  
  // Computed risk score
  riskScore: number;               // 0-1, weighted combination
  riskFactors: string[];           // ["high_complexity", "no_tests", "frequent_changes"]
}

interface FileSignals {
  // Aggregate of entity signals
  maxComplexity: number;
  avgComplexity: number;
  totalLines: number;
  testCoverage: number;
  
  // File-level patterns
  hasSmells: CodeSmell[];
  technicalDebt: number;           // Estimated hours to address
}

interface CodeSmell {
  kind: SmellKind;
  location: SourceLocation;
  severity: "info" | "warning" | "error";
  message: string;
  suggestedFix?: string;
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
  | "shotgun_surgery";            // Changes require many file edits

interface Hotspot {
  entities: EntityId[];
  reason: string;                  // "High complexity + frequent changes + low test coverage"
  riskScore: number;
  suggestedAction: string;         // "Consider refactoring before modifying"
}

Claude Code benefit: Before touching high-risk code, Claude is warned and can either proceed carefully or suggest refactoring first.

Complete ACM Schema (JSON)
Here's how a project's ACM would serialize:

{
  "version": "1.0",
  "generatedAt": "2025-01-15T10:30:00Z",
  "gitCommit": "abc123",
  "project": {
    "name": "hanuman-thai-cafe",
    "root": "/home/jj/projects/hanuman"
  },
  
  "inventory": {
    "files": [
      {
        "path": "src/orders/validation.py",
        "language": "python",
        "size": 2340,
        "isTest": false,
        "exports": ["validate_order", "OrderValidator"],
        "imports": [
          {"module": "orders.models", "symbols": ["Order", "LineItem"]},
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
        "location": {"file": "src/orders/validation.py", "startLine": 15, "endLine": 45},
        "signature": {
          "parameters": [
            {"name": "order", "type": "Order", "optional": false},
            {"name": "strict", "type": "bool", "optional": true, "defaultValue": "True"}
          ],
          "returnType": "ValidationResult",
          "isAsync": false
        },
        "docstring": "Validates an order against business rules..."
      }
    }
  },
  
  "dependencies": {
    "edges": [
      {
        "source": "e001",
        "target": "e002",
        "kind": "calls",
        "location": {"file": "src/orders/validation.py", "startLine": 23},
        "isRequired": true
      },
      {
        "source": "e001",
        "target": "e003",
        "kind": "reads",
        "location": {"file": "src/orders/validation.py", "startLine": 18}
      }
    ],
    "affectedBy": {
      "e001": ["e010", "e011", "e012"]
    }
  },
  
  "resources": {
    "dataStores": [
      {
        "id": "ds001",
        "kind": "database",
        "name": "orders_db",
        "structures": [
          {
            "name": "orders",
            "kind": "table",
            "fields": [
              {"name": "id", "type": "uuid", "isPrimaryKey": true},
              {"name": "customer_id", "type": "uuid", "isForeignKey": true, "foreignKeyRef": "customers.id"},
              {"name": "total", "type": "decimal"}
            ],
            "mappedToType": "e005"
          }
        ],
        "accessedBy": [
          {"entity": "e001", "operations": ["read"]},
          {"entity": "e020", "operations": ["read", "write"]}
        ]
      }
    ]
  },
  
  "intent": {
    "stories": [
      {
        "id": "s001",
        "externalId": "GH-123",
        "title": "Validate orders before submission",
        "acceptanceCriteria": [
          {
            "id": "ac001",
            "given": ["an order with items"],
            "when": ["the order is submitted"],
            "then": ["items must have positive quantities", "total must match line items"],
            "implementedBy": ["e001"],
            "testedBy": ["e050", "e051"]
          }
        ],
        "implementationCoverage": 0.85,
        "testCoverage": 0.70
      }
    ],
    "codeToStory": {
      "e001": ["s001", "s002"]
    }
  },
  
  "signals": {
    "entitySignals": {
      "e001": {
        "cyclomaticComplexity": 12,
        "lineCount": 30,
        "afferentCoupling": 8,
        "efferentCoupling": 3,
        "changeFrequency": 2.5,
        "authorCount": 2,
        "defectCount": 1,
        "testCoverage": 0.70,
        "riskScore": 0.45,
        "riskFactors": ["moderate_complexity", "frequently_changed"]
      }
    },
    "hotspots": [
      {
        "entities": ["e001", "e002"],
        "reason": "Validation logic has moderate complexity, changes frequently, and has had a past defect",
        "riskScore": 0.45,
        "suggestedAction": "Ensure tests pass before and after modification"
      }
    ]
  }
}
```

---

## Claude Code Integration Pattern
```
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE WORKFLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. LOAD ACM                                                │
│     claude reads .acm/model.json (or queries ACM server)    │
│                                                             │
│  2. QUERY BEFORE EXPLORING                                  │
│     User: "Fix the order validation bug"                    │
│     Claude: [queries ACM]                                   │
│       → validate_order at validation.py:15-45               │
│       → Depends on: Order model, calc_total                 │
│       → Depended on by: submit_order, OrderAPI              │
│       → Implements story: GH-123 "Validate orders"          │
│       → Risk: moderate (0.45) - has past defect             │
│       → Tests: test_validation.py (70% coverage)            │
│                                                             │
│  3. TARGETED FILE READ                                      │
│     Claude reads only validation.py:15-45                   │
│     (not the whole file, not grepping for usages)           │
│                                                             │
│  4. IMPACT-AWARE MODIFICATION                               │
│     Claude knows submit_order and OrderAPI need checking    │
│     Claude knows acceptance criteria that must still pass   │
│                                                             │
│  5. VERIFICATION                                            │
│     Claude runs specific tests: test_validation.py          │
│     Claude checks affected code still works                 │
│                                                             │
│  6. UPDATE ACM                                              │
│     If structure changed, regenerate affected portions      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Generation Strategy
The ACM can be built incrementally:
LayerGeneration MethodUpdate Trigger
Inventory
File system scan + AST parse for exports/importsFile changesStructureLanguage-specific parser (tree-sitter, etc.)File changes
Dependencies
Static analysis (call graph, data flow)File changes
Resources Config parsing + ORM introspection + API client analysisFile changes + schema changes
Intent Manual + AI-assisted linking from issue trackerStory changes, manual annotation
Signals
Git log analysis + static metricsGit push, periodic


