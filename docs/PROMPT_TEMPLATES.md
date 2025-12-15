# Puffin Prompt Templates

This document catalogs all prompt templates used by Puffin when communicating with Claude. These templates are the structured instructions that guide Claude's behavior for specific tasks.

## Table of Contents

1. [Story Derivation](#1-story-derivation)
2. [Story Modification](#2-story-modification)
3. [Title Generation](#3-title-generation)
4. [Architecture Review](#4-architecture-review)
5. [Story Implementation](#5-story-implementation)
6. [Branch Context Prompts](#6-branch-context-prompts)
7. [Dynamic Implementation Contexts](#7-dynamic-implementation-contexts)
8. [Architecture Document Template](#8-architecture-document-template)

---

## 1. Story Derivation

**File:** `src/main/claude-service.js`
**Method:** `deriveStories()`
**Purpose:** Extracts structured user stories from specification text

### When Used
- When user checks "Derive User Stories" and submits a prompt
- Typically used in the Specifications branch

### Template

```
You are a requirements analyst. Your task is to derive user stories from the following request.

Output ONLY a valid JSON array of user stories in this exact format:
[
  {
    "title": "Brief title of the user story",
    "description": "As a [type of user], I want [goal] so that [benefit]",
    "acceptanceCriteria": ["Criterion 1", "Criterion 2", "..."]
  }
]

Guidelines:
- Each story should be focused on a single feature or capability
- Write clear, actionable acceptance criteria
- Keep stories at a granular enough level to be implemented individually
- Output ONLY the JSON array, no other text or markdown
- You MUST output at least one user story

User's Request:
{userRequest}
```

### Variables
- `{userRequest}` - The user's specification or feature description

---

## 2. Story Modification

**File:** `src/main/claude-service.js`
**Method:** `modifyStories()`
**Purpose:** Modifies existing user stories based on user feedback

### When Used
- In the story review modal when user requests changes to derived stories
- After initial story derivation when refinement is needed

### Template

```
You are a requirements analyst. You have previously derived user stories from a request.
Now the user wants to modify these stories based on their feedback.

Current stories:
{storiesJson}

Output ONLY a valid JSON array with the modified user stories in this exact format:
[
  {
    "title": "Brief title of the user story",
    "description": "As a [type of user], I want [goal] so that [benefit]",
    "acceptanceCriteria": ["Criterion 1", "Criterion 2", "..."]
  }
]

Apply the user's feedback to modify, add, remove, or clarify the stories as needed.
Output ONLY the JSON array, no other text or markdown.

User's feedback:
{userFeedback}
```

### Variables
- `{storiesJson}` - JSON array of current stories
- `{userFeedback}` - User's modification instructions

---

## 3. Title Generation

**File:** `src/main/claude-service.js`
**Method:** `generateTitle()`
**Purpose:** Generates concise titles for prompts in the history tree

### When Used
- Automatically after a prompt is submitted
- Uses Claude Haiku for efficiency

### Template

```
Generate a concise 2-5 word title for this user request. Respond with ONLY the title, no quotes or additional text:

{content}
```

### Variables
- `{content}` - The user's prompt content

### Notes
- Uses `--max-turns 1 --model haiku` for fast, low-cost generation
- Falls back to first 50 characters if generation fails

---

## 4. Architecture Review

**File:** `src/renderer/components/architecture/architecture.js`
**Method:** `buildReviewPrompt()`
**Purpose:** Requests Claude to review and provide feedback on architecture documents

### When Used
- When user clicks "Review with Claude" in the Architecture view
- Submitted to the Architecture branch

### Template

```
Please review the following architecture document for the "{projectName}" project.

Consider:
1. **Completeness**: Are all major components documented?
2. **Clarity**: Is the architecture easy to understand?
3. **Consistency**: Does it align with the project's technical requirements?
4. **Best Practices**: Does it follow good architectural patterns?
5. **Potential Issues**: Are there any red flags or missing considerations?

## Current Architecture Document

{architectureContent}

---

Please provide:
- A summary of your assessment
- Specific suggestions for improvement
- Any questions that need clarification
- Recommended additions if anything important is missing
```

### Variables
- `{projectName}` - Name from project configuration
- `{architectureContent}` - The markdown content of the architecture document

---

## 5. Story Implementation

**File:** `src/renderer/sam/model.js`
**Method:** `startStoryImplementationAcceptor()`
**Purpose:** Instructs Claude to implement selected user stories with structured verification

### When Used
- When user selects stories in Backlog and clicks "Start Implementation"
- Submitted to the current active branch (UI, Backend, Architecture, etc.)

### Template

```
Please implement the following user {storyWord}:

{storyDescriptions}

{branchContext}

**Instructions:**
1. First, think hard about the implementation approach and create a detailed plan
2. Consider the existing codebase structure and patterns
3. Identify all files that need to be created or modified
4. Then implement the changes step by step

**Criteria Verification Requirements:**
After completing the implementation, you MUST verify each numbered acceptance criterion and report its status using this format:

- ✅ Criterion N: [Brief explanation of how the implementation satisfies this criterion]
- ⚠️ Criterion N: [Partially implemented - describe what's done and what's missing]
- ❌ Criterion N: [Not implemented - explain why or what's blocking]

**Important:** Do not skip any criteria. Every numbered criterion must have a verification status in your final response.

Please start by outlining your implementation plan, then proceed with the implementation, and conclude with the criteria verification.
```

### Story Description Format

Each story in `{storyDescriptions}` is formatted as:

```
### Story N: {title}
{description}

**Acceptance Criteria:**
1. {criterion1}
2. {criterion2}
...
```

### Variables
- `{storyWord}` - "story" or "stories" based on count
- `{storyDescriptions}` - Formatted story details with numbered criteria
- `{branchContext}` - Branch-specific context (see Section 7)

---

## 6. Branch Context Prompts

**File:** `src/main/claude-service.js`
**Method:** `getBranchContext()`
**Purpose:** Provides branch-specific focus instructions prepended to all prompts

### When Used
- Automatically prepended to every prompt based on the active branch
- Helps Claude understand the current development focus

### Templates by Branch

#### Specifications Branch
```
[SPECIFICATIONS THREAD]
Focus on: Requirements gathering, feature definitions, user stories, acceptance criteria, and functional specifications.
Help clarify requirements, identify edge cases, and ensure completeness.
```

#### Architecture Branch
```
[ARCHITECTURE THREAD]
Focus on: System design, component structure, data flow, API design, technology choices, and architectural patterns.
Consider scalability, maintainability, and best practices.
```

#### UI Branch
```
[UI/UX THREAD]
Focus on: User interface design, user experience, component layout, styling, accessibility, and frontend implementation.
Consider usability, responsiveness, and visual consistency.
```

#### Backend Branch
```
[BACKEND THREAD]
Focus on: Server-side logic, APIs, database operations, business logic, and backend services.
Consider performance, security, and data integrity.
```

#### Deployment Branch
```
[DEPLOYMENT THREAD]
Focus on: CI/CD, infrastructure, containerization, hosting, monitoring, and DevOps practices.
Consider reliability, scalability, and operational concerns.
```

#### Temporary/Scratch Branch
```
[TEMPORARY/SCRATCH THREAD]
This is a scratch space for ad-hoc tasks and experiments.
IMPORTANT: Always output your final results as text in your response, not just as file writes.
When asked to create documents, lists, or summaries, include the full content in your response text.
```

---

## 7. Dynamic Implementation Contexts

These contexts are injected into the Story Implementation prompt based on the active branch.

### UI Branch Context

**File:** `src/renderer/sam/model.js`
**Method:** `buildUiBranchContext()`
**Purpose:** Provides design tokens, component patterns, and UI guidelines

#### Template Structure

```
**UI Implementation Context:**
Follow these design guidelines when implementing UI components:

**Color Tokens:**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | {primaryColor} | {primaryUsage} |
| `--color-secondary` | {secondaryColor} | {secondaryUsage} |
...

**Font Families:**
- Primary: {primaryFont}
- Monospace: {monospaceFont}

**Spacing Scale:**
- XS: {xsSpacing}
- SM: {smSpacing}
...

**Component Patterns:**

### {componentName}
{componentDescription}

**Guidelines:** {componentGuidelines}

**HTML Template:**
```html
{htmlTemplate}
```

**CSS:**
```css
{cssRules}
```

**General Guidelines:**
{layoutGuidelines}
{typographyGuidelines}
...
```

#### Dynamic Content
- Color tokens from `uiGuidelines.designTokens.colors`
- Font families from `uiGuidelines.designTokens.fontFamilies`
- Spacing from `uiGuidelines.designTokens.spacing`
- Component patterns from `uiGuidelines.componentPatterns`
- Guidelines from `uiGuidelines.guidelines`

---

### Architecture Branch Context

**File:** `src/renderer/sam/model.js`
**Method:** `buildArchitectureBranchContext()`
**Purpose:** Provides architectural context and current architecture document

#### Template

```
**Architecture Implementation Context:**
This is an architecture-focused implementation. Consider:
- System design and component boundaries
- Data flow and state management patterns
- API contracts and interfaces
- Scalability and maintainability

**Current Architecture:**
{architectureContent}
```

#### Variables
- `{architectureContent}` - First 2000 characters of architecture.md (if exists)

---

### Backend Branch Context

**File:** `src/renderer/sam/model.js`
**Method:** `buildBackendBranchContext()`
**Purpose:** Provides backend-specific implementation guidance

#### Template

```
**Backend Implementation Context:**
This is a backend-focused implementation. Consider:
- API design and REST/GraphQL conventions
- Data persistence and database patterns
- Error handling and validation
- Security and authentication
```

---

## 8. Architecture Document Template

**File:** `src/renderer/components/architecture/architecture.js`
**Method:** `insertTemplate()`
**Purpose:** Provides a starting structure for new architecture documents

### When Used
- When user clicks "Insert Template" in the Architecture view
- Not sent to Claude - inserted directly into the editor

### Template

```markdown
# Architecture Document

## Overview
[Describe the overall system architecture and its goals]

## Components

### Frontend
[Describe the frontend architecture]

### Backend
[Describe the backend architecture]

### Database
[Describe the database schema and data storage]

## Data Flow
[Explain how data flows through the system]

## APIs

### External APIs
[List external APIs consumed]

### Internal APIs
[Document internal API endpoints]

## Security Considerations
[Document security measures and considerations]

## Scalability
[Describe how the system can scale]

## Deployment
[Describe the deployment architecture]

## Future Considerations
[Note planned improvements or areas for future development]
```

---

## Summary Table

| # | Template | File | Method | Trigger |
|---|----------|------|--------|---------|
| 1 | Story Derivation | claude-service.js | `deriveStories()` | "Derive User Stories" checkbox |
| 2 | Story Modification | claude-service.js | `modifyStories()` | "Request Changes" in review modal |
| 3 | Title Generation | claude-service.js | `generateTitle()` | After prompt submission |
| 4 | Architecture Review | architecture.js | `buildReviewPrompt()` | "Review with Claude" button |
| 5 | Story Implementation | model.js | `startStoryImplementationAcceptor()` | "Start Implementation" button |
| 6 | Branch Contexts | claude-service.js | `getBranchContext()` | Every prompt (automatic) |
| 7 | UI Context | model.js | `buildUiBranchContext()` | Implementation in UI branch |
| 7 | Architecture Context | model.js | `buildArchitectureBranchContext()` | Implementation in Architecture branch |
| 7 | Backend Context | model.js | `buildBackendBranchContext()` | Implementation in Backend branch |
| 8 | Architecture Template | architecture.js | `insertTemplate()` | "Insert Template" button |

---

## Design Principles

### 1. Structured Output
Templates that expect structured data (like story derivation) explicitly request JSON-only output to ensure parseable responses.

### 2. Role Assignment
Many templates begin with role assignment ("You are a requirements analyst") to set Claude's mindset for the task.

### 3. Clear Instructions
Templates use numbered lists and bold headers to make instructions scannable and unambiguous.

### 4. Verification Requirements
The story implementation template requires explicit verification of each criterion, ensuring accountability and traceability.

### 5. Context Injection
Dynamic contexts (UI tokens, architecture docs) are injected to give Claude project-specific knowledge without manual copy-paste.

### 6. Branch Focus
Branch context prompts ensure Claude stays focused on the relevant domain (UI, Backend, etc.) without bleeding into other areas.

---

*This document reflects Puffin version 1.0.1. Templates may evolve as the application develops.*
