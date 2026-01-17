Now I have a comprehensive understanding of the current state. Let me create the revised implementation plan.

---

# Revised Implementation Plan: Document Editor AI Integration (Iteration 1)

## Executive Summary

This is a **planning-only** document. The Document Editor Plugin already has a solid foundation with file I/O, auto-save, syntax highlighting, and basic AI prompt UI structure. This plan covers implementing the AI integration features: prompt harness, response handling, change highlighting, and syntax validation.

**Key Finding from Analysis:** The existing plugin has more infrastructure in place than the previous plan anticipated. Auto-save is already implemented with a 1.5s debounce and visual indicators (green/yellow/red dots). The AI prompt input area and response area UI shells exist but are not yet connected to actual AI functionality.

---

## 1. What Already Exists (No Implementation Needed)

| Feature | Status | Location |
|---------|--------|----------|
| Auto-save | ✅ 
Complete | `DocumentEditorView.js:handleContentInput()` with 1.5s debounce |
| Save indicator | ✅ 
Complete | Green/yellow/red dots in toolbar |
| Auto-save toggle | ✅ 
Complete | Checkbox in toolbar, stored in `state.autoSaveEnabled` |
| AI prompt input UI shell | ✅ 
Partial | Text input + "Ask" button exists, needs backend |
| AI response area UI shell | ✅ 
Partial | Collapsible area exists, needs formatting |
| Syntax highlighting | ✅ 
Complete | 50+ languages via highlight.js |
| File watching | ✅ 
Complete | Watches for external changes |
| Recent files | ✅ 
Complete | Persisted with auto-cleanup |

---

## 2. Revised Architecture Analysis

### Dependency Map (Updated)

```
┌─────────────────────────────────────────────────────────────────┐
│                   Story Dependencies (Revised)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │ Story 4      │  ← Foundation (Prompt Harness)                │
│  │ Prompt       │    Creates DocumentEditorPromptService        │
│  │ Harness      │    Defines system prompt template             │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ├──────────────────┐                                    │
│         ▼                  ▼                                    │
│  ┌──────────────┐   ┌──────────────┐                           │
│  │ Story 5      │   │ Story 1      │                           │
│  │ Syntax       │   │ Prompt Input │  ← Extends existing UI    │
│  │ Validation   │   │ Interface    │    Adds model selector    │
│  └──────┬───────┘   └──────┬───────┘                           │
│         │                  │                                    │
│         │    ┌─────────────┘                                    │
│         ▼    ▼                                                  │
│  ┌──────────────┐                                               │
│  │ Story 2      │  ← Parses responses, manages session         │
│  │ Response     │                                               │
│  │ Handling     │                                               │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │ Story 3      │  ← Depends on knowing what changed            │
│  │ Highlight    │                                               │
│  │ Changes      │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Infrastructure (Services to Create)

| Service | Used By | Purpose |
|---------|---------|---------|
| **DocumentEditorPromptService** | Stories 1, 2, 4 | Central service for Claude communication with harness |
| **ResponseParser** | Stories 2, 4 | Parse Claude responses into summaries/questions |
| **ChangeTracker** | Stories 2, 3 | Track document modifications using line-level diff |
| **SyntaxValidator** | Stories 4, 5 | Regex-based validation for md/json/html |
| **SessionManager** | Stories 2 | Persist response history linked to document |

---

## 3. Implementation Order (Revised)

| Order | Story | Rationale |
|-------|-------|-----------|
| **1st** | Story 4: Prompt Harness | Foundation - defines system prompt and creates DocumentEditorPromptService |
| **2nd** | Story 5: Syntax Validation | Integrates into harness; called before Claude finalizes edits |
| **3rd** | Story 1: Prompt Input Interface | Extends existing UI with model selector, context files; uses service |
| **4th** | Story 2: Response Handling | Processes responses, manages session persistence |
| **5th** | Story 3: Highlight Changes | Uses ChangeTracker to highlight modifications |

---

## 4. Technical Approach Per Story

### Story 4: Create Prompt Harness for Document-Only Editing
**ID:** `88bd2c66-0413-4656-962d-497c3d339d17`
**Complexity: Medium**

**What Exists:** Nothing - this is new infrastructure.

**Technical Approach:**
- Create `DocumentEditorPromptService` that wraps `window.puffin.claude.submit()` calls
- Create `prompt-harness.json` configuration file
- System prompt instructs Claude to:
  1. Only modify the target document
  2. Read project files for context but not write to them
  3. Validate syntax before completing
  4. Provide concise change summaries
  5. Ask clarifying questions when needed

**Files to Create:**
| File | Purpose |
|------|---------|
| `plugins/document-editor-plugin/config/prompt-harness.json` | Harness configuration |
| `plugins/document-editor-plugin/renderer/services/DocumentEditorPromptService.js` | Service wrapping Claude API |
| `plugins/document-editor-plugin/renderer/services/index.js` | Service exports |

**Files to Modify:**
| File | Changes |
|------|---------|
| `plugins/document-editor-plugin/index.js` | Add IPC handler for loading harness config |
| `plugins/document-editor-plugin/puffin-plugin.json` | Register config contribution |

**System Prompt Template:**
```markdown
## Document Editor Mode

You are editing a single document: `{filename}`
File type: {extension}

### STRICT RULES:
1. You may ONLY modify the content of this document
2. You may READ any project file for context but CANNOT write to other files
3. Before completing, validate the document syntax ({extension} format)
4. Provide a CONCISE CHANGE SUMMARY (bulleted list of what you changed)
5. If requirements are unclear, ASK CLARIFYING QUESTIONS
6. Do NOT provide verbose explanations - focus on the changes

### Current Document Content:
```{extension}
{content}
```

{context_files_section}

### User's Request:
{user_prompt}
```

**Configuration Schema:**
```json
{
  "systemPromptTemplate": "...",
  "validationEnabled": true,
  "summaryFormat": "concise",
  "defaultModel": "haiku",
  "allowContextFiles": true,
  "maxContextFiles": 5
}
```

---

### Story 5: Implement File Syntax Validation
**ID:** `725edc89-e512-4fa0-92f6-5a4811191004`
**Complexity: Medium**

**What Exists:** Nothing - validation is new.

**Technical Approach:**
- Create `SyntaxValidator` class with regex-based validators (per user preference)
- Support `.md`, `.json`, `.html` validation
- Integrate validation instructions into prompt harness
- Validation runs client-side to verify Claude's output

**Files to Create:**
| File | Purpose |
|------|---------|
| `plugins/document-editor-plugin/renderer/services/SyntaxValidator.js` | Validation logic |

**Files to Modify:**
| File | Changes |
|------|---------|
| `plugins/document-editor-plugin/config/prompt-harness.json` | Add validation instructions |
| `plugins/document-editor-plugin/renderer/services/index.js` | Export validator |

**Validation Implementation:**
```javascript
class SyntaxValidator {
  validate(content, extension) {
    switch (extension) {
      case '.md': return this.validateMarkdown(content);
      case '.json': return this.validateJson(content);
      case '.html': return this.validateHtml(content);
      default: return { valid: true, errors: [] };
    }
  }
  
  validateMarkdown(content) {
    const errors = [];
    // Check unclosed code blocks (``` count should be even)
    const codeBlockMatches = content.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
      errors.push({ message: 'Unclosed code block detected' });
    }
    // Check broken link syntax [text](
    const brokenLinks = content.match(/\[[^\]]*\]\([^)]*$/gm);
    if (brokenLinks) {
      errors.push({ message: 'Broken link syntax detected' });
    }
    return { valid: errors.length === 0, errors };
  }
  
  validateJson(content) {
    try {
      JSON.parse(content);
      return { valid: true, errors: [] };
    } catch (e) {
      return { valid: false, errors: [{ message: e.message }] };
    }
  }
  
  validateHtml(content) {
    const errors = [];
    // Simple tag matching for common unclosed tags
    const voidElements = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    const stack = [];
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      if (voidElements.includes(tagName)) continue;
      if (fullTag.startsWith('</')) {
        if (stack.length === 0 || stack.pop() !== tagName) {
          errors.push({ message: `Mismatched closing tag: </${tagName}>` });
        }
      } else if (!fullTag.endsWith('/>')) {
        stack.push(tagName);
      }
    }
    if (stack.length > 0) {
      errors.push({ message: `Unclosed tags: ${stack.join(', ')}` });
    }
    return { valid: errors.length === 0, errors };
  }
}
```

---

### Story 1: Create Prompt Input Interface for Document Editing
**ID:** `b1735685-a0bf-42fb-b338-1cfae5955e76`
**Complexity: Medium**

**What Exists:**
- Basic prompt text input and "Ask" button (in `DocumentEditorView.js`)
- Response area shell (collapsible)
- `handleAskAI()` method (stub showing "AI integration coming soon")

**What Needs to Be Added:**
- Model selector dropdown (default: Haiku per user clarification)
- Thinking budget selector
- Context file selection (GUI files, documentation files)
- Loading indicator during submission
- Connect to `DocumentEditorPromptService`

**Files to Modify:**
| File | Changes |
|------|---------|
| `plugins/document-editor-plugin/renderer/components/DocumentEditorView.js` | Add model selector, thinking budget, context files UI; wire up to service |
| `plugins/document-editor-plugin/renderer/styles/document-editor.css` | Styles for new controls |

**State Additions:**
```javascript
this.state = {
  // ... existing state
  selectedModel: 'haiku',           // Default per user preference
  thinkingBudget: 'none',
  contextFiles: [],                  // { type: 'gui'|'doc', path, name }
  isSubmitting: false
};
```

**UI Additions (to existing prompt panel):**
```html
<div class="document-editor-prompt-controls">
  <select class="model-selector">
    <option value="haiku" selected>Haiku (Default)</option>
    <option value="sonnet">Sonnet</option>
    <option value="opus">Opus</option>
  </select>
  
  <select class="thinking-budget-selector">
    <option value="none" selected>No Extended Thinking</option>
    <option value="think">Think (25%)</option>
    <option value="think-hard">Think Hard (50%)</option>
  </select>
  
  <div class="context-controls">
    <button class="add-context-btn" title="Add context file">+ Context</button>
    <div class="context-chips"></div>
  </div>
</div>
```

---

### Story 2: Implement Claude Response Handling with Change Summaries
**ID:** `4e33d663-0fde-49a4-8af8-e47548caee4f`
**Complexity: High**

**What Exists:**
- Response area UI shell (collapsible)
- `renderResponseContent()` method (currently just escapes HTML)

**What Needs to Be Added:**
- `ResponseParser` service to extract summaries and questions
- `SessionManager` for persisting response history (per user preference: file-based, linked to document)
- Question answering flow (display questions, user answers, explicit send required)
- Response history with timestamps

**Files to Create:**
| File | Purpose |
|------|---------|
| `plugins/document-editor-plugin/renderer/services/ResponseParser.js` | Parse Claude responses |
| `plugins/document-editor-plugin/renderer/services/SessionManager.js` | Persist session to file |

**Files to Modify:**
| File | Changes |
|------|---------|
| `plugins/document-editor-plugin/renderer/components/DocumentEditorView.js` | Enhanced response rendering, history, questions |
| `plugins/document-editor-plugin/renderer/styles/document-editor.css` | Styles for response sections |
| `plugins/document-editor-plugin/index.js` | IPC handlers for session file I/O |

**Session File Structure:**
```json
{
  "documentPath": "/path/to/file.md",
  "documentHash": "sha256...",
  "responses": [
    {
      "timestamp": "2026-01-17T10:23:00Z",
      "prompt": "Add introduction section",
      "summary": "- Added introduction paragraph\n- Reformatted header",
      "questions": [],
      "fullResponse": "...",
      "diffStats": { "added": 5, "modified": 2, "deleted": 0 }
    }
  ]
}
```

**Session File Location:** `{userData}/puffin-plugins/document-editor/sessions/{documentHash}.json`

**Response Parser Logic:**
```javascript
class ResponseParser {
  parse(rawResponse, previousContent, newContent) {
    return {
      changeSummary: this.extractChangeSummary(rawResponse),
      questions: this.extractQuestions(rawResponse),
      validationErrors: this.extractValidationErrors(rawResponse),
      diffStats: this.calculateDiffStats(previousContent, newContent)
    };
  }
  
  extractChangeSummary(response) {
    // Look for "## Changes Made", "### Summary:", "Changes:", etc.
    const summaryPatterns = [
      /##?\s*Changes?\s*(?:Made)?:?\s*\n([\s\S]*?)(?=\n##|$)/i,
      /Summary:?\s*\n([\s\S]*?)(?=\n##|$)/i
    ];
    for (const pattern of summaryPatterns) {
      const match = response.match(pattern);
      if (match) return match[1].trim();
    }
    // Fallback: extract bullet points
    const bullets = response.match(/^[-*]\s+.+$/gm);
    return bullets ? bullets.join('\n') : 'Changes applied.';
  }
  
  extractQuestions(response) {
    // Find sentences ending with "?" that appear to be questions to the user
    const questionPattern = /(?:^|\n)([^?\n]*\?)/g;
    const questions = [];
    let match;
    while ((match = questionPattern.exec(response)) !== null) {
      const question = match[1].trim();
      // Filter out rhetorical questions in code/examples
      if (!question.startsWith('//') && !question.startsWith('#')) {
        questions.push({ id: crypto.randomUUID(), question, answered: false });
      }
    }
    return questions;
  }
}
```

**State Additions:**
```javascript
this.state = {
  // ... existing state
  responseHistory: [],          // Loaded from session file
  currentResponse: null,        // { summary, questions, fullResponse }
  pendingQuestions: [],
  sessionLoaded: false
};
```

---

### Story 3: Highlight Recent Document Modifications
**ID:** `bc0f03c6-fb19-446d-a3ef-807458cd0940`
**Complexity: Medium**

**What Exists:**
- Line numbers with synchronized scrolling
- Syntax highlighting layer

**What Needs to Be Added:**
- `ChangeTracker` service for line-level diffing
- CSS classes for highlighting (added/modified/deleted lines)
- Gutter markers for changed lines
- Toggle to show/hide highlights
- "Clear Highlights" button

**Files to Create:**
| File | Purpose |
|------|---------|
| `plugins/document-editor-plugin/renderer/services/ChangeTracker.js` | Diff computation and tracking |

**Files to Modify:**
| File | Changes |
|------|---------|
| `plugins/document-editor-plugin/renderer/components/DocumentEditorView.js` | Render highlights, toggle controls |
| `plugins/document-editor-plugin/renderer/styles/document-editor.css` | Highlight styles |

**ChangeTracker Implementation:**
```javascript
class ChangeTracker {
  constructor() {
    this.previousContent = null;
    this.changes = [];  // Array of { type: 'added'|'modified'|'deleted', startLine, endLine }
  }
  
  recordBaseline(content) {
    this.previousContent = content;
    this.changes = [];
  }
  
  computeChanges(newContent) {
    if (!this.previousContent) {
      this.previousContent = newContent;
      return [];
    }
    
    const oldLines = this.previousContent.split('\n');
    const newLines = newContent.split('\n');
    this.changes = this.computeLineDiff(oldLines, newLines);
    return this.changes;
  }
  
  computeLineDiff(oldLines, newLines) {
    // Simple line-level diff using LCS (Longest Common Subsequence)
    // Returns changes with line numbers in the NEW content
    const changes = [];
    // ... LCS diff algorithm implementation
    return changes;
  }
  
  getChangeForLine(lineNumber) {
    return this.changes.find(c => 
      lineNumber >= c.startLine && lineNumber <= c.endLine
    );
  }
  
  clearHighlights() {
    this.changes = [];
  }
}
```

**CSS Additions:**
```css
/* Line highlighting by change type */
.line-added {
  background-color: rgba(72, 187, 120, 0.15);
  border-left: 3px solid #48bb78;
}

.line-modified {
  background-color: rgba(236, 201, 75, 0.15);
  border-left: 3px solid #ecc94b;
}

.line-deleted {
  background-color: rgba(245, 101, 101, 0.15);
  border-left: 3px solid #f56565;
  text-decoration: line-through;
}

/* Line number markers */
.line-number.change-added::before { content: '+'; color: #48bb78; }
.line-number.change-modified::before { content: '~'; color: #ecc94b; }
.line-number.change-deleted::before { content: '-'; color: #f56565; }
```

**UI Toggle (in toolbar):**
```html
<div class="highlight-controls">
  <label class="highlight-toggle">
    <input type="checkbox" checked> Show Changes
  </label>
  <button class="clear-highlights-btn" title="Clear highlights">Clear</button>
</div>
```

---

## 5. File Changes Summary

### Files to Create (6 files)

| File | Story | Purpose |
|------|-------|---------|
| `plugins/document-editor-plugin/config/prompt-harness.json` | 4 | Harness configuration |
| `plugins/document-editor-plugin/renderer/services/DocumentEditorPromptService.js` | 4 | Claude submission service |
| `plugins/document-editor-plugin/renderer/services/SyntaxValidator.js` | 5 | Regex-based validation |
| `plugins/document-editor-plugin/renderer/services/ResponseParser.js` | 2 | Response parsing |
| `plugins/document-editor-plugin/renderer/services/SessionManager.js` | 2 | Session persistence |
| `plugins/document-editor-plugin/renderer/services/ChangeTracker.js` | 3 | Diff computation |
| `plugins/document-editor-plugin/renderer/services/index.js` | All | Service exports |

### Files to Modify (4 files)

| File | Stories | Changes |
|------|---------|---------|
| `plugins/document-editor-plugin/renderer/components/DocumentEditorView.js` | 1, 2, 3 | Model selector, context files, response handling, highlighting |
| `plugins/document-editor-plugin/renderer/styles/document-editor.css` | 1, 2, 3 | Styles for controls, responses, highlights |
| `plugins/document-editor-plugin/index.js` | 2, 4 | IPC handlers for config, session I/O |
| `plugins/document-editor-plugin/puffin-plugin.json` | 4 | Config contribution registration |

---

## 6. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Claude ignores document-only constraint** | High | Medium | Strong prompt engineering with "STRICT RULES" section; test extensively |
| **Line-level diff performance on large files** | Medium | Low | Use efficient LCS algorithm; debounce highlight updates |
| **Response parsing accuracy** | Medium | Medium | Multiple pattern matching; fallback to bullet extraction |
| **Session file corruption** | Low | Low | Atomic writes (already implemented pattern in plugin) |
| **Context file security** | Medium | Low | Reuse existing `validateFilePath()` for context file reads |

---

## 7. Complexity Ratings

| Story | ID | Complexity | Rationale |
|-------|-----|------------|-----------|
| Story 4: Prompt Harness | `88bd2c66-0413-4656-962d-497c3d339d17` | **Medium** | New service creation, prompt template design |
| Story 5: Syntax Validation | `725edc89-e512-4fa0-92f6-5a4811191004` | **Medium** | Regex-based; three format handlers |
| Story 1: Prompt Input Interface | `b1735685-a0bf-42fb-b338-1cfae5955e76` | **Medium** | Extends existing UI; adds controls |
| Story 2: Response Handling | `4e33d663-0fde-49a4-8af8-e47548caee4f` | **High** | Parsing, session persistence, question flow |
| Story 3: Highlight Changes | `bc0f03c6-fb19-446d-a3ef-807458cd0940` | **Medium** | Diff algorithm, UI integration |

---

## 8. Clarifications Applied

| Question | Answer | Implementation Impact |
|----------|--------|----------------------|
| Default model | Haiku | `selectedModel: 'haiku'` in state; Haiku as first option |
| Response history persistence | File-based, linked to document | Create `SessionManager` service; store in `{userData}/puffin-plugins/document-editor/sessions/` |
| Validation approach | Regex-based | No external libraries needed; smaller plugin size |
| Diff granularity | Line-level | Simpler algorithm; sufficient for document editing UX |
| Question answering | Explicit send required | Display questions with input + "Reply" button; no auto-submit |
| Auto-save | Already implemented | ✅ 
No work needed; 1.5s debounce with toggle |

---

## 9. Open Questions (None Remaining)

All previous questions have been answered by the developer. No blocking questions remain.

---

## 10. Visual Architecture (Updated)

```
┌─────────────────────────────────────────────────────────────────────┐
│                Document Editor Plugin Architecture (Final)           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  DocumentEditorView.js                       │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Toolbar                                            │    │   │
│  │  │  - File actions (New, Open, Save)                   │    │   │
│  │  │  - Auto-save toggle [EXISTING]                      │    │   │
│  │  │  - Highlight toggle + Clear [NEW]                   │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Editor Area [EXISTING]                             │    │   │
│  │  │  - Line numbers with change markers [ENHANCED]      │    │   │
│  │  │  - Syntax highlighting [EXISTING]                   │    │   │
│  │  │  - Change highlighting overlay [NEW]                │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Prompt Panel [ENHANCED]                            │    │   │
│  │  │  - Model selector (default: Haiku) [NEW]            │    │   │
│  │  │  - Thinking budget selector [NEW]                   │    │   │
│  │  │  - Context file chips [NEW]                         │    │   │
│  │  │  - Prompt textarea [EXISTING]                       │    │   │
│  │  │  - Send button [EXISTING, rewired]                  │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Response Area [ENHANCED]                           │    │   │
│  │  │  - Change summary (bulleted) [NEW]                  │    │   │
│  │  │  - Questions with reply inputs [NEW]                │    │   │
│  │  │  - Collapsible history [NEW]                        │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                        Services Layer                         │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                  │  │
│  │  │ PromptService    │  │ ResponseParser   │                  │  │
│  │  │ - buildPrompt()  │  │ - parse()        │                  │  │
│  │  │ - submit()       │  │ - extractSummary │                  │  │
│  │  │ - loadHarness()  │  │ - extractQs()    │                  │  │
│  │  └────────┬─────────┘  └────────┬─────────┘                  │  │
│  │           │                     │                             │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                  │  │
│  │  │ ChangeTracker    │  │ SessionManager   │                  │  │
│  │  │ - recordBaseline │  │ - loadSession()  │                  │  │
│  │  │ - computeChanges │  │ - saveSession()  │                  │  │
│  │  │ - getHighlights  │  │ - addResponse()  │                  │  │
│  │  └────────┬─────────┘  └────────┬─────────┘                  │  │
│  │           │                     │                             │  │
│  │  ┌──────────────────────────────┴─────────────────────────┐  │  │
│  │  │              SyntaxValidator (Story 5)                  │  │  │
│  │  │  - validateMarkdown() | validateJson() | validateHtml() │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 prompt-harness.json (Story 4)                 │  │
│  │  { systemPromptTemplate, defaultModel: "haiku", ... }        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 Session Files (Story 2)                       │  │
│  │  {userData}/puffin-plugins/document-editor/sessions/*.json   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │  window.puffin.claude    │
                    │  .submit()               │
                    └──────────────────────────┘
```

---

## 11. Implementation Order & Branch Assignments

```
IMPLEMENTATION_ORDER: 88bd2c66-0413-4656-962d-497c3d339d17, 725edc89-e512-4fa0-92f6-5a4811191004, b1735685-a0bf-42fb-b338-1cfae5955e76, 4e33d663-0fde-49a4-8af8-e47548caee4f, bc0f03c6-fb19-446d-a3ef-807458cd0940
```

```
BRANCH_ASSIGNMENTS: 88bd2c66-0413-4656-962d-497c3d339d17=plugin, 725edc89-e512-4fa0-92f6-5a4811191004=plugin, b1735685-a0bf-42fb-b338-1cfae5955e76=plugin, 4e33d663-0fde-49a4-8af8-e47548caee4f=plugin, bc0f03c6-fb19-446d-a3ef-807458cd0940=plugin
```

**Branch Assignment Rationale:**
All stories remain on the **plugin** branch because:
- All changes are scoped to the document-editor-plugin directory
- No core backend or UI framework changes required
- Uses existing `window.puffin.claude.submit()` API
- Cohesive feature set that should be developed together
- Consistent with the previous iteration's assignment