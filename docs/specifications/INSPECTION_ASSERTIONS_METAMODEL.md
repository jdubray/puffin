# Inspection Assertions Metamodel

## Overview

Inspection Assertions are declarative verification statements attached to user stories that can be evaluated after implementation to confirm the code changes meet structural and behavioral expectations—without requiring test execution or runtime verification.

### Design Principles

1. **Declarative**: Assertions describe *what* to verify, not *how* to verify it
2. **Tool-Executable**: Claude (or other tools) can evaluate assertions using file system inspection
3. **Failure-Tolerant**: Failed assertions are reported; user decides remediation
4. **Composable**: Simple assertion types combine to cover complex requirements
5. **Traceable**: Each assertion maps to an acceptance criterion

---

## Metamodel Structure

### User Story with Inspection Assertions

```yaml
story:
  id: string                    # Unique identifier (e.g., "DOC-001")
  title: string                 # Brief descriptive name
  description: string           # "As a [role], I want [feature] so that [benefit]"

  acceptance_criteria:          # List of testable conditions
    - id: string                # e.g., "AC1"
      description: string       # Human-readable criterion

  inspection_assertions:        # Verification statements
    - id: string                # e.g., "IA1"
      criterion: string         # Reference to AC (e.g., "AC1") or "general"
      type: AssertionType       # Type of assertion (see below)
      target: string            # File path, glob pattern, or identifier
      assertion: object         # Type-specific assertion parameters
      message: string           # Human-readable description of what's being verified
```

---

## Assertion Types

### 1. FILE_EXISTS

Verify that a file or directory exists at the specified path.

```yaml
type: FILE_EXISTS
target: "path/to/file.js"       # Relative to project root
assertion:
  type: "file" | "directory"    # Optional, defaults to "file"
message: "Plugin entry point exists"
```

**Evaluation**: Check if path exists and matches expected type.

---

### 2. FILE_CONTAINS

Verify that a file contains specific content (literal or pattern).

```yaml
type: FILE_CONTAINS
target: "path/to/file.js"
assertion:
  match: "literal" | "regex"
  content: string               # Literal string or regex pattern
  count: number                 # Optional: expected occurrence count
  min_count: number             # Optional: minimum occurrences
message: "File exports activate function"
```

**Examples**:
```yaml
# Literal match
assertion:
  match: "literal"
  content: "export function activate"

# Regex match
assertion:
  match: "regex"
  content: "class\\s+\\w+Component"
  min_count: 1
```

---

### 3. JSON_PROPERTY

Verify that a JSON file contains expected properties and values.

```yaml
type: JSON_PROPERTY
target: "package.json"
assertion:
  path: "scripts.build"         # Dot-notation path
  operator: "exists" | "equals" | "contains" | "matches"
  value: any                    # Expected value (for equals/contains/matches)
message: "Build script is defined"
```

**Operators**:
- `exists`: Property exists (value ignored)
- `equals`: Property equals exact value
- `contains`: Property (string/array) contains value
- `matches`: Property matches regex pattern

**Examples**:
```yaml
# Check property exists
assertion:
  path: "contributes.views"
  operator: "exists"

# Check exact value
assertion:
  path: "name"
  operator: "equals"
  value: "document-viewer-plugin"

# Check array contains
assertion:
  path: "dependencies"
  operator: "contains"
  value: "marked"
```

---

### 4. EXPORT_EXISTS

Verify that a JavaScript/TypeScript module exports specific identifiers.

```yaml
type: EXPORT_EXISTS
target: "src/components/index.js"
assertion:
  exports:
    - name: "DocumentViewerComponent"
      type: "class" | "function" | "const" | "default" | "any"
    - name: "renderMarkdown"
      type: "function"
message: "Component is exported from module"
```

**Evaluation**: Parse file and check for export statements matching the criteria.

---

### 5. CLASS_STRUCTURE

Verify that a class has expected methods and properties.

```yaml
type: CLASS_STRUCTURE
target: "src/components/DocumentViewer.js"
assertion:
  class_name: "DocumentViewerComponent"
  methods:
    - name: "init"
      async: true               # Optional
    - name: "render"
    - name: "destroy"
  properties:                   # Optional
    - name: "container"
message: "Component implements required lifecycle methods"
```

**Evaluation**: Parse class definition and verify method/property presence.

---

### 6. FUNCTION_SIGNATURE

Verify that a function has the expected signature.

```yaml
type: FUNCTION_SIGNATURE
target: "src/scanner.js"
assertion:
  function_name: "scanDirectory"
  parameters:
    - name: "dirPath"
    - name: "isRoot"
      optional: true
  async: true
message: "Scanner function has correct signature"
```

---

### 7. IMPORT_EXISTS

Verify that a file imports specific modules or identifiers.

```yaml
type: IMPORT_EXISTS
target: "src/main/index.js"
assertion:
  imports:
    - module: "fs/promises"
      as: "fs"                  # Optional: import alias
    - module: "./document-scanner"
      named:                    # Optional: named imports
        - "scanDirectory"
message: "Required modules are imported"
```

---

### 8. IPC_HANDLER_REGISTERED

Verify that IPC handlers are registered (Puffin-specific pattern).

```yaml
type: IPC_HANDLER_REGISTERED
target: "plugins/document-viewer-plugin/index.js"
assertion:
  handlers:
    - "getDocumentTree"
    - "readDocument"
  registration_pattern: "context.registerIpcHandler"  # Optional override
message: "IPC handlers are registered in activate()"
```

**Evaluation**: Search for registration pattern with handler names.

---

### 9. CSS_SELECTOR_EXISTS

Verify that CSS defines expected selectors.

```yaml
type: CSS_SELECTOR_EXISTS
target: "src/styles/document-viewer.css"
assertion:
  selectors:
    - ".document-viewer"
    - ".doc-nav-panel"
    - ".doc-preview-panel"
message: "Core layout selectors are defined"
```

---

### 10. PATTERN_MATCH

Generic pattern matching across files (flexible fallback).

```yaml
type: PATTERN_MATCH
target: "src/**/*.js"           # Glob pattern supported
assertion:
  pattern: "TODO|FIXME"
  operator: "absent" | "present"
  count: number                 # Optional: exact count
message: "No TODO comments left in source files"
```

**Operators**:
- `present`: Pattern must be found
- `absent`: Pattern must NOT be found

---

## Assertion Result Schema

When assertions are evaluated, results follow this structure:

```yaml
assertion_results:
  story_id: "DOC-001"
  evaluated_at: "2024-01-15T10:30:00Z"
  summary:
    total: 8
    passed: 7
    failed: 1
  results:
    - assertion_id: "IA1"
      status: "passed" | "failed" | "error"
      message: "Plugin entry point exists"
      details: null             # Additional info on failure
    - assertion_id: "IA5"
      status: "failed"
      message: "Component implements required lifecycle methods"
      details:
        expected: "Method 'destroy' in class DocumentViewerComponent"
        actual: "Method not found"
        file: "plugins/document-viewer-plugin/renderer/components/DocumentViewerComponent.js"
        suggestion: "Add destroy() method to handle cleanup"
```

---

## Failure Handling

When assertions fail, the evaluator should:

1. **Report all failures** (don't stop at first failure)
2. **Provide actionable details** (what was expected vs. found)
3. **Suggest remediation** where possible
4. **Present to user** for decision:
   - Fix the issue and re-evaluate
   - Mark assertion as waived (with reason)
   - Defer to next iteration

---

## Evaluation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Story Implementation                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Implementation Complete Signal                  │
│         (Claude announces story is implemented)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Load Inspection Assertions                     │
│          (From story definition or plan document)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Evaluate Each Assertion                         │
│    • Read target files                                       │
│    • Apply type-specific checks                              │
│    • Record pass/fail/error                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Generate Results Report                     │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            ┌──────────────┐    ┌──────────────┐
            │  All Passed  │    │ Some Failed  │
            └──────────────┘    └──────────────┘
                    │                   │
                    ▼                   ▼
            ┌──────────────┐    ┌──────────────────────────┐
            │ Story Done   │    │ Present Failures to User │
            └──────────────┘    │   • Fix and re-evaluate  │
                                │   • Waive with reason    │
                                │   • Defer to later       │
                                └──────────────────────────┘
```

---

## Example: Document Viewer Plugin Story

### Story Definition with Assertions

```yaml
story:
  id: "DOC-005"
  title: "Document Viewer Plugin Registration"
  description: >
    As a user, I want the document viewer to appear as a selectable
    plugin in Puffin's plugin system so that I can access it from
    the main interface

  acceptance_criteria:
    - id: "AC1"
      description: "Plugin is registered with Puffin's plugin manager"
    - id: "AC2"
      description: "Plugin appears in the plugin/view selector with appropriate name and icon"
    - id: "AC3"
      description: "Plugin loads without errors when selected"
    - id: "AC4"
      description: "Plugin state is preserved when switching between plugins"
    - id: "AC5"
      description: "Plugin follows Puffin's existing plugin architecture patterns"

  inspection_assertions:
    # AC1: Plugin registered
    - id: "IA1"
      criterion: "AC1"
      type: FILE_EXISTS
      target: "plugins/document-viewer-plugin/puffin-plugin.json"
      assertion:
        type: "file"
      message: "Plugin manifest file exists"

    - id: "IA2"
      criterion: "AC1"
      type: JSON_PROPERTY
      target: "plugins/document-viewer-plugin/puffin-plugin.json"
      assertion:
        path: "name"
        operator: "equals"
        value: "document-viewer-plugin"
      message: "Plugin manifest has correct name"

    # AC2: Appears in selector with name and icon
    - id: "IA3"
      criterion: "AC2"
      type: JSON_PROPERTY
      target: "plugins/document-viewer-plugin/puffin-plugin.json"
      assertion:
        path: "contributes.views[0].name"
        operator: "exists"
      message: "Plugin declares view name"

    - id: "IA4"
      criterion: "AC2"
      type: JSON_PROPERTY
      target: "plugins/document-viewer-plugin/puffin-plugin.json"
      assertion:
        path: "contributes.views[0].icon"
        operator: "exists"
      message: "Plugin declares view icon"

    # AC3: Loads without errors
    - id: "IA5"
      criterion: "AC3"
      type: FILE_EXISTS
      target: "plugins/document-viewer-plugin/index.js"
      assertion:
        type: "file"
      message: "Plugin main entry point exists"

    - id: "IA6"
      criterion: "AC3"
      type: EXPORT_EXISTS
      target: "plugins/document-viewer-plugin/index.js"
      assertion:
        exports:
          - name: "activate"
            type: "function"
          - name: "deactivate"
            type: "function"
      message: "Plugin exports activate and deactivate functions"

    - id: "IA7"
      criterion: "AC3"
      type: FILE_EXISTS
      target: "plugins/document-viewer-plugin/renderer/components/DocumentViewerComponent.js"
      assertion:
        type: "file"
      message: "Renderer component file exists"

    # AC4: State preserved (lifecycle methods)
    - id: "IA8"
      criterion: "AC4"
      type: CLASS_STRUCTURE
      target: "plugins/document-viewer-plugin/renderer/components/DocumentViewerComponent.js"
      assertion:
        class_name: "DocumentViewerComponent"
        methods:
          - name: "onActivate"
          - name: "onDeactivate"
      message: "Component implements activation lifecycle methods"

    # AC5: Follows architecture patterns
    - id: "IA9"
      criterion: "AC5"
      type: CLASS_STRUCTURE
      target: "plugins/document-viewer-plugin/renderer/components/DocumentViewerComponent.js"
      assertion:
        class_name: "DocumentViewerComponent"
        methods:
          - name: "constructor"
          - name: "init"
          - name: "render"
          - name: "destroy"
      message: "Component follows standard plugin component structure"

    - id: "IA10"
      criterion: "AC5"
      type: JSON_PROPERTY
      target: "plugins/document-viewer-plugin/puffin-plugin.json"
      assertion:
        path: "renderer.components"
        operator: "exists"
      message: "Manifest declares renderer components"
```

---

## Compact Notation (Alternative)

For inline use in markdown plans, a compact notation:

```markdown
## Inspection Assertions

| ID | AC | Type | Target | Check | Message |
|----|-----|------|--------|-------|---------|
| IA1 | AC1 | FILE_EXISTS | `plugins/.../puffin-plugin.json` | file | Manifest exists |
| IA2 | AC1 | JSON_PROPERTY | `plugins/.../puffin-plugin.json` | name = "document-viewer-plugin" | Correct name |
| IA3 | AC3 | EXPORT_EXISTS | `plugins/.../index.js` | activate:function, deactivate:function | Lifecycle exports |
| IA4 | AC5 | CLASS_STRUCTURE | `.../DocumentViewerComponent.js` | methods: init, render, destroy | Standard structure |
```

---

## Integration with Puffin Workflow

### Specification Phase
- Author adds inspection assertions to user stories
- Assertions are stored in story definition (backlog/sprint data)

### Implementation Phase
- Claude implements the story
- Upon completion signal, assertions are evaluated
- Results presented to user

### Potential Automation
- Puffin could provide an "Verify Story" button
- Runs assertion evaluator against current file state
- Displays pass/fail report in UI

---

## Future Considerations

1. **Assertion Libraries**: Pre-built assertion sets for common patterns (plugin, component, API endpoint)

2. **Custom Assertion Types**: Allow projects to define domain-specific assertions

3. **Assertion Generation**: Claude could propose assertions based on acceptance criteria

4. **Continuous Verification**: Re-run assertions on file changes to catch regressions

5. **Integration with Tests**: Map assertions to test files once tests are written

---

*This metamodel provides a structured approach to verifying implementations without requiring test execution, enabling Claude to self-verify work and report issues for user decision.*
