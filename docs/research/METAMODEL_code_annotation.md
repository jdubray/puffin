# Code Annotation Metamodel

## Overview

This metamodel defines a structured approach for annotating generated code to establish traceability between:
- **User Stories** (requirements and intent)
- **Code Artifacts** (implementation)
- **Functionality** (runtime behavior)

The goal is to enable bidirectional navigation: from requirements to code, and from code back to the originating requirements.

---

## 1. Core Entities

### 1.1 Requirement Domain

```
Epic
├── id: string (e.g., "EPIC-001")
├── title: string
├── description: string
└── stories: UserStory[]

UserStory
├── id: string (e.g., "US-042")
├── title: string
├── narrative: string ("As a... I want... So that...")
├── priority: enum [critical, high, medium, low]
├── status: enum [pending, in_progress, completed, archived]
├── acceptanceCriteria: AcceptanceCriterion[]
└── parentEpic: Epic?

AcceptanceCriterion
├── id: string (e.g., "US-042-AC-1")
├── description: string
├── verificationStatus: enum [untested, passing, failing, partial]
└── parentStory: UserStory
```

### 1.2 Code Artifact Domain

```
CodeFile
├── path: string
├── language: string
├── purpose: string
├── layer: enum [presentation, business, data, infrastructure]
├── modules: Module[]
└── annotations: Annotation[]

Module
├── name: string
├── type: enum [class, function, component, service, utility]
├── responsibility: string (single responsibility description)
├── visibility: enum [public, internal, private]
├── members: Member[]
└── annotations: Annotation[]

Member
├── name: string
├── type: enum [method, property, field, constructor]
├── signature: string?
├── purpose: string
├── purity: enum [pure, stateful, side_effecting]
└── annotations: Annotation[]

CodeRegion
├── file: CodeFile
├── startLine: number
├── endLine: number
├── purpose: string
└── annotations: Annotation[]
```

### 1.3 Functionality Domain

```
Feature
├── id: string
├── name: string
├── description: string
├── userFacing: boolean
└── behaviors: Behavior[]

Behavior
├── id: string
├── trigger: string (what initiates this behavior)
├── action: string (what happens)
├── outcome: string (result/effect)
├── stateChanges: StateChange[]
└── sideEffects: SideEffect[]

StateChange
├── target: string (what state is modified)
├── operation: enum [create, read, update, delete]
└── description: string

SideEffect
├── type: enum [io, network, storage, notification, logging]
├── target: string
└── description: string
```

---

## 2. Traceability Links

### 2.1 Implementation Links

```
ImplementsStory
├── codeArtifact: Module | Member | CodeRegion
├── story: UserStory
├── coverage: enum [full, partial, supporting]
└── notes: string?

SatisfiesCriterion
├── codeArtifact: Module | Member | CodeRegion
├── criterion: AcceptanceCriterion
├── verificationMethod: enum [unit_test, integration_test, manual, assertion]
└── testReference: string?
```

### 2.2 Dependency Links

```
DependsOn
├── source: Module | Member
├── target: Module | Member
├── type: enum [calls, imports, extends, implements, uses]
└── coupling: enum [tight, loose]

ModifiesState
├── source: Member
├── target: string (state identifier)
├── operation: enum [read, write, read_write]
└── transactional: boolean
```

### 2.3 Architecture Links

```
BelongsToLayer
├── artifact: CodeFile | Module
├── layer: enum [presentation, business, data, infrastructure]
└── role: string

FollowsPattern
├── artifact: Module | CodeRegion
├── pattern: string (e.g., "Observer", "Factory", "SAM")
└── role: string (e.g., "Subject", "Observer", "State", "Action")
```

---

## 3. Annotation Schema

### 3.1 Annotation Structure

```
Annotation
├── type: AnnotationType
├── references: Reference[]
├── description: string?
├── confidence: enum [certain, likely, inferred]
└── generatedBy: string (model/version)

AnnotationType
├── STORY_IMPL      // Implements a user story
├── CRITERION_IMPL  // Satisfies an acceptance criterion
├── BEHAVIOR        // Describes runtime behavior
├── STATE_MUTATION  // Modifies application state
├── SIDE_EFFECT     // Has external effects
├── PATTERN_ROLE    // Role in design pattern
├── LAYER           // Architectural layer
├── DEPENDENCY      // Dependency relationship
└── TODO            // Incomplete/placeholder

Reference
├── type: enum [story, criterion, feature, behavior, artifact]
├── id: string
└── relationship: string
```

### 3.2 Annotation Syntax (Comment Format)

```javascript
/**
 * @story US-042 "User can merge feature branch"
 * @criterion US-042-AC-3 "Merge conflicts are detected"
 * @behavior Detects conflicting changes between branches
 * @modifies git.mergeState
 * @sideEffect io:filesystem (reads git index)
 * @pattern SAM:Action
 * @layer business
 */
function detectMergeConflicts(sourceBranch, targetBranch) {
  // ...
}
```

### 3.3 Inline Annotations

```javascript
function processUserStories(stories) {
  // @satisfies US-042-AC-1: Filter only pending stories
  const pending = stories.filter(s => s.status === 'pending')

  // @behavior: Sort by priority for display order
  // @modifies: none (pure transformation)
  const sorted = pending.sort((a, b) => priorityWeight(b) - priorityWeight(a))

  return sorted
}
```

---

## 4. Aggregated Views

### 4.1 Story Coverage Report

```
StoryImplementation
├── story: UserStory
├── implementingArtifacts: CodeArtifact[]
├── coveragePercentage: number
├── criteriaStatus: Map<AcceptanceCriterion, Status>
└── gaps: string[] (unimplemented aspects)
```

### 4.2 Impact Analysis

```
ImpactAnalysis
├── changedArtifact: CodeArtifact
├── affectedStories: UserStory[]
├── affectedBehaviors: Behavior[]
├── regressionRisk: enum [low, medium, high]
└── suggestedTests: string[]
```

### 4.3 Architecture Conformance

```
ArchitectureConformance
├── layer: Layer
├── artifacts: CodeArtifact[]
├── violations: Violation[]
└── patterns: PatternUsage[]

Violation
├── artifact: CodeArtifact
├── rule: string
├── severity: enum [error, warning, info]
└── suggestion: string
```

---

## 5. Lifecycle States

### 5.1 Annotation Lifecycle

```
Draft → Reviewed → Validated → Stale → Updated
         ↓
      Rejected
```

- **Draft**: Initial annotation from code generation
- **Reviewed**: Human has reviewed the annotation
- **Validated**: Verified through testing/inspection
- **Stale**: Code changed, annotation may be outdated
- **Updated**: Annotation refreshed after code change
- **Rejected**: Annotation deemed incorrect

### 5.2 Traceability Maintenance

When code changes:
1. Mark affected annotations as `Stale`
2. Re-analyze changed code regions
3. Update or confirm annotations
4. Propagate changes to coverage reports

---

## 6. Example: Full Annotation

```javascript
/**
 * @file src/renderer/sam/actions.js
 * @layer business
 * @pattern SAM:Actions
 * @purpose Central action dispatcher for state mutations
 */

/**
 * @story US-042 "Merge Feature Branch to Main"
 * @criterion US-042-AC-2 "Puffin performs merge operation"
 * @criterion US-042-AC-4 "Successful merge displays confirmation"
 * @behavior Initiates git merge and reports result
 * @modifies app.mergeState, app.toasts
 * @sideEffect io:git (executes git merge command)
 * @sideEffect notification:toast (displays result to user)
 * @depends git-service.mergeBranches
 * @depends toast-service.show
 */
async function mergeBranch(sourceBranch, targetBranch) {
  // @satisfies US-042-AC-3: Check for uncommitted changes first
  const status = await gitService.getStatus()
  if (status.hasUncommittedChanges) {
    // @behavior: Warn user before proceeding
    return { blocked: true, reason: 'uncommitted_changes' }
  }

  try {
    // @behavior: Execute the merge operation
    const result = await gitService.mergeBranches(sourceBranch, targetBranch)

    // @satisfies US-042-AC-4: Show success message
    toastService.show('success', `Merged ${sourceBranch} into ${targetBranch}`)

    return { success: true, result }
  } catch (error) {
    // @satisfies US-042-AC-5: Report conflicts with affected files
    if (error.type === 'merge_conflict') {
      return {
        success: false,
        conflicts: error.conflictingFiles,
        guidance: 'Resolve conflicts manually, then commit'
      }
    }
    throw error
  }
}
```

---

## 7. Integration Points

### 7.1 With Puffin

- **Story Derivation**: When deriving stories, create `UserStory` entities
- **Implementation**: When implementing, generate annotations linking to stories
- **Handoff**: Include annotation summary in handoff context
- **Sprint Tracking**: Use `SatisfiesCriterion` to track completion

### 7.2 With Claude Code

- **Context**: Include relevant annotations in CLAUDE.md
- **Generation**: Apply annotations during code generation
- **Review**: Validate annotations during architecture review

### 7.3 With Version Control

- **Commits**: Reference story IDs in commit messages
- **Branches**: Name branches after story IDs
- **Tags**: Include story completion status in release notes

---

## 8. Future Considerations

1. **Machine-Readable Format**: JSON/YAML annotation files alongside code
2. **IDE Integration**: Hover tooltips showing traceability
3. **Automated Validation**: CI checks for annotation completeness
4. **Coverage Metrics**: Dashboard showing story-to-code coverage
5. **Refactoring Support**: Update annotations during code moves/renames
