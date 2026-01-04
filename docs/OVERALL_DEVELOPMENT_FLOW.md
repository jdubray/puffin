# Puffin Development Workflow Documentation

## Human-AI Collaborative Development Process

**This workflow represents a new paradigm for human-AI collaboration in software development.** Puffin orchestrates a structured handoff between human decision-making and Claude Code execution, ensuring humans retain control over requirements and quality while delegating implementation to AI agents.

---

## Core Philosophy

> **Humans define WHAT and WHY. Claude Code determines HOW and executes.**

The workflow is designed around clear boundaries:
- **Human Checkpoints:** Approval gates, quality decisions, requirement definitions
- **AI Execution:** Research, planning, implementation, verification
- **Collaborative Points:** Iteration cycles where both participate

---

## Implementation Process Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PUFFIN: HUMAN-AI COLLABORATIVE WORKFLOW                      │
│                                                                                 │
│   Legend:
👤 = Human Action
🤖 = Claude Code
🤝 = Collaborative          │
└─────────────────────────────────────────────────────────────────────────────────┘

                                    ┌──────────────┐
                                    │  🤖 
RESEARCH │ (Optional)
                                    │              │
                                    │ • Explore    │
                                    │   codebase   │
                                    │ • Understand │
                                    │   patterns   │
                                    │ • Identify   │
                                    │   gaps       │
                                    │ • Report     │
                                    │   findings   │
                                    └──────┬───────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  🤝 
SPECIFICATION      │
                              │                        │
                              │ 👤 
Define requirements │
                              │ 👤 
Set scope/rules     │
                              │ 🤖 
Clarify questions   │
                              │ 🤖 
Document edge cases │
                              │ 👤 
Approve spec        │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │  🤝 
USER STORIES       │
                              │                        │
                              │ 🤖 
Draft stories from  │
                              │    specifications      │
                              │ 🤖 
Propose acceptance  │
                              │    criteria            │
                              │ 👤 
Review & refine     │
                              │ 👤 
Approve final       │
                              │    stories             │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │  👤 
SPRINT SELECTION   │
                              │                        │
                              │ 👤 
Select stories      │
                              │    from backlog        │
                              │ 👤 
Set priorities      │
                              │ 👤 
Define sprint scope │
                              │ 👤 
Start sprint        │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │  🤖 
PLAN               │
                              │                        │
                              │ 🤖 
Analyze codebase    │
                              │ 🤖 
Design approach     │
                              │ 🤖 
Identify files      │
                              │ 🤖 
Assess risks        │
                              │ 🤖 
Propose impl order  │
                              └───────────┬────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │                                 │
                    ┌────┴────┐                       ┌────┴────┐
                    │   🤝    │                       │   👤    │
                    │ ITERATE │◄──────────────────────│ APPROVE │
                    │         │   Refinement needed   │  PLAN   │
                    │ 🤖 
Revise│                      │         │
                    │ 👤 
Guide │                      │ ✓ 
Ready │
                    │ 🤖 
Update│                      │   to    │
                    └─────────┘                       │implement│
                                                      └────┬────┘
                                                           │
                                                           ▼
                                         ┌─────────────────────────────────┐
                                         │  🤖 
GENERATE INSPECTION         │
                                         │       ASSERTIONS                │
                                         │                                 │
                                         │ 🤖 
Parse acceptance criteria    │
                                         │ 🤖 
Generate testable assertions │
                                         │ 🤖 
Map to assertion types       │
                                         │    (FILE_EXISTS, CLASS_STRUCT,  │
                                         │     FUNCTION_SIG, etc.)         │
                                         └──────────────┬──────────────────┘
                                                        │
                                                        ▼
                                         ┌─────────────────────────────────┐
                                         │  🤖 
IMPLEMENT                   │
                                         │                                 │
                                         │ 🤖 
Write code per plan          │
                                         │ 🤖 
Follow patterns              │
                                         │ 🤖 
Update story status          │
                                         │    (pending → in-progress)      │
                                         │ 🤖 
Track file modifications     │
                                         └──────────────┬──────────────────┘
                                                        │
                                                        ▼
                                         ┌─────────────────────────────────┐
                                         │  🤖 
VERIFY ACCEPTANCE           │
                                         │        CRITERIA                 │
                                         │                                 │
                                         │ 🤖 
Test each criterion          │
                                         │ 🤖 
Document verification        │
                                         │ 🤖 
Report results               │
                                         └──────────────┬──────────────────┘
                                                        │
                                              ┌─────────┴─────────┐
                                              │                   │
                                         ┌────┴────┐         ┌────┴────┐
                                         │  FAIL   │         │  PASS   │
                                         │         │         │         │
                                         │ 🤖 
Loop │         │Continue │
                                         │ back to │         │         │
                                         │implement│         │         │
                                         └────┬────┘         └────┬────┘
                                              │                   │
                                              │                   ▼
                                              │    ┌─────────────────────────────┐
                                              │    │  🤖 
USER STORY COMPLETE     │
                                              │    │                             │
                                              │    │ 🤖 
Mark status: completed   │
                                              │    │ 🤖 
Record implementedOn     │
                                              │    │    branch                   │
                                              │    └──────────────┬──────────────┘
                                              │                   │
                                              │                   ▼
                                              │    ┌─────────────────────────────┐
                                              │    │  🤖 
VERIFY INSPECTION       │
                                              │    │       ASSERTIONS            │
                                              │    │                             │
                                              │    │ 🤖 
Run assertion evaluator  │
                                              │    │ 🤖 
Execute all checks       │
                                              │    │ 🤖 
Generate pass/fail report│
                                              │    │ 🤖 
Store assertionResults   │
                                              │    └──────────────┬──────────────┘
                                              │                   │
                                              │         ┌─────────┴─────────┐
                                              │         │                   │
                                              │    ┌────┴────┐         ┌────┴────┐
                                              └────│  FAIL   │         │  PASS   │
                                                   │         │         │         │
                                                   │ 🤖 
Loop │         │ Next    │
                                                   │ back to │         │ story   │
                                                   │implement│         │         │
                                                   └─────────┘         └────┬────┘
                                                                            │
                                                                            ▼
                                                        ┌───────────────────────────┐
                                                        │   MORE STORIES IN SPRINT? │
                                                        └─────────────┬─────────────┘
                                                                      │
                                                            ┌─────────┴─────────┐
                                                            │                   │
                                                       ┌────┴────┐         ┌────┴────┐
                                                       │   YES   │         │   NO    │
                                                       │         │         │         │
                                                       │ 🤖 
Loop │         │Continue │
                                                       │ to Plan │         │ to close│
                                                       │ (next   │         │         │
                                                       │  story) │         │         │
                                                       └────┬────┘         └────┬────┘
                                                            │                   │
                                              ┌─────────────┘                   │
                                              │                                 ▼
                                              │              ┌─────────────────────────────┐
                                              │              │  🤝 
COMPLETE SPRINT         │
                                              │              │                             │
                                              │              │ 🤖 
Archive to sprint_history│
                                              │              │ 🤖 
Generate commit message  │
                                              │              │ 👤 
Review commit message    │
                                              │              │ 👤 
Approve/edit message     │
                                              │              │ 🤖 
Execute git commit       │
                                              │              └──────────────┬──────────────┘
                                              │                             │
                                              │                             ▼
                                              │              ┌─────────────────────────────┐
                                              │              │  👤 
CODE REVIEW             │
                                              │              │                             │
                                              │              │ 👤 
Review implementation    │
                                              │              │ 👤 
Verify quality standards │
                                              │              │ 👤 
Check patterns followed  │
                                              │              │ 👤 
Final approval decision  │
                                              │              └──────────────┬──────────────┘
                                              │                             │
                                              │                   ┌─────────┴─────────┐
                                              │                   │                   │
                                              │              ┌────┴────┐         ┌────┴────┐
                                              │              │ ISSUES  │         │APPROVED │
                                              │              │ FOUND   │         │         │
                                              │              │         │         │         │
                                              │              │ 👤 
Create│         │ Proceed │
                                              │              │ new     │         │         │
                                              │              │ stories │         │         │
                                              │              └────┬────┘         └────┬────┘
                                              │                   │                   │
                                              ▼                   │                   ▼
                                   ┌──────────────────┐           │    ┌─────────────────────────────┐
                                   │  🤖 
PLAN         │◄──────────┘    │  👤 
END / NEXT SPRINT       │
                                   │  (for fix/new    │                │                             │
                                   │   story)         │                │ 👤 
Decide next priorities   │
                                   └──────────────────┘                │ 👤 
Select new stories       │
                                                                       │    OR close project         │
                                                                       └─────────────────────────────┘
```

---

## Responsibility Matrix

### Summary by Actor

| Phase | Human
👤 | Claude Code
🤖 | Collaborative
🤝 |
|-------|----------|----------------|------------------|
| Research | - | ✅ 
Primary | - |
| Specification | Define requirements | Ask clarifying questions | Refine together |
| User Stories | Final approval | Draft from spec | Review & iterate |
| Sprint Selection | ✅ 
Primary | - | - |
| Planning | - | ✅ 
Primary | - |
| Plan Approval | ✅ 
Primary | - | - |
| Plan Iteration | Guide direction | Execute changes | Refine together |
| Assertion Generation | - | ✅ 
Primary | - |
| Implementation | - | ✅ 
Primary | - |
| Acceptance Verification | - | ✅ 
Primary | - |
| Assertion Verification | - | ✅ 
Primary | - |
| Sprint Close | Approve commit | Generate & execute | Review message |
| Code Review | ✅ 
Primary | - | - |
| Next Sprint Decision | ✅ 
Primary | - | - |

---

## Detailed Phase Breakdown

### 1.
🤖 
Research (Optional)
**Actor:** Claude Code (autonomous)

**Why AI:** Codebase exploration is time-consuming and benefits from systematic, exhaustive search. Claude Code can quickly traverse thousands of files and identify patterns humans might miss.

**Activities:**
- Explore relevant files and patterns
- Identify integration points
- Understand existing architecture
- Summarize findings for human review

**Output:** Research summary document

---

### 2.
🤝 
Specification (Collaborative)
**Actors:** Human leads, Claude Code assists

**Human Responsibilities:**
- Define business requirements
- Set feature scope and boundaries
- Make priority decisions
- Approve final specification

**Claude Code Responsibilities:**
- Ask clarifying questions
- Document edge cases discovered
- Identify technical constraints
- Format specification document

**Why Split:** Humans understand business value; AI helps ensure completeness and consistency.

---

### 3.
🤝 
User Stories (Collaborative)
**Actors:** Claude Code drafts, Human approves

**Human Responsibilities:**
- Review drafted stories for accuracy
- Refine acceptance criteria
- Ensure business alignment
- **Final approval before sprint**

**Claude Code Responsibilities:**
- Parse specifications into story format
- Propose acceptance criteria
- Ensure testable conditions
- Maintain consistent format

**Why Split:** AI excels at structured decomposition; humans validate business intent is preserved.

---

### 4.
👤 
Sprint Selection (Human)
**Actor:** Human (full control)

**Why Human:** Sprint scope directly impacts project timeline, resource allocation, and business priorities. This is a strategic decision.

**Activities:**
- Select stories from backlog
- Set implementation priorities
- Define sprint scope
- Start sprint in Puffin

**Control Point:** Human decides what gets built and when.

---

### 5.
🤖 
Plan (Claude Code)
**Actor:** Claude Code (autonomous)

**Why AI:** Technical planning requires deep codebase analysis. Claude Code can systematically evaluate architecture fit, identify all affected files, and assess risks.

**Activities:**
- Analyze existing codebase
- Design technical approach
- Identify files to modify/create
- Assess implementation risks
- Propose implementation order

**Output:** Detailed implementation plan

---

### 6.
👤 
Plan Approval (Human Checkpoint)
**Actor:** Human (approval gate)

**Why Human:** Humans must validate that the technical approach aligns with architectural standards, long-term maintainability, and team conventions.

**Decision:**
- **Approve:** Proceed to assertions
- **Request Changes:** Enter iteration cycle

**Control Point:** No implementation begins without human approval.

---

### 7.
🤝 
Plan Iteration (Collaborative)
**Actors:** Human guides, Claude Code revises

**Human Responsibilities:**
- Provide direction on changes needed
- Clarify constraints or preferences
- Make architectural decisions

**Claude Code Responsibilities:**
- Revise plan per feedback
- Research alternatives if requested
- Update documentation

**Exit Condition:** Human approves revised plan

---

### 8.
🤖 
Generate Inspection Assertions (Claude Code)
**Actor:** Claude Code (autonomous)

**Why AI:** Pattern matching acceptance criteria to testable assertions is systematic and benefits from consistent application of rules.

**Activities:**
- Parse acceptance criteria text
- Match to assertion type patterns
- Generate specific assertions
- Map to evaluation functions

**Assertion Types:**
```
FILE_EXISTS        → Verify file/directory exists
FILE_CONTAINS      → Check file content
CLASS_STRUCTURE    → Verify class definition
FUNCTION_SIGNATURE → Check function parameters
EXPORT_EXISTS      → Verify module exports
IPC_HANDLER_REGISTERED → Check IPC handlers
JSON_PROPERTY      → Validate JSON structure
PATTERN_MATCH      → Code quality patterns
```

---

### 9.
🤖 
Implement (Claude Code)
**Actor:** Claude Code (autonomous execution)

**Why AI:** Implementation is the core AI capability—translating approved plans into working code. The approval checkpoints ensure this execution happens within defined boundaries.

**Activities:**
- Write code following approved plan
- Update story status to `in-progress`
- Track file modifications
- Follow established patterns

**Guardrails:**
- Must follow approved plan
- Cannot change scope
- Patterns enforced from codebase

---

### 10.
🤖 
Verify Acceptance Criteria (Claude Code)
**Actor:** Claude Code (autonomous verification)

**Why AI:** Systematic verification against criteria ensures nothing is missed. AI can methodically check each criterion.

**Activities:**
- Test each acceptance criterion
- Document verification method
- Report pass/fail status
- Identify gaps if any

**Loop Condition:** If fail → return to implement

---

### 11.
🤖 
User Story Complete (Claude Code)
**Actor:** Claude Code (status update)

**Activities:**
- Mark story status: `completed`
- Record `implementedOn` branch
- Update timestamps

---

### 12.
🤖 
Verify Inspection Assertions (Claude Code)
**Actor:** Claude Code (automated testing)

**Why AI:** Assertions are designed for automated evaluation. This provides objective verification without human bias.

**Process:**
1. Load assertions for story
2. Initialize type-specific evaluators
3. Evaluate in parallel (concurrency: 5)
4. Emit progress updates
5. Aggregate results
6. Store in `assertionResults`

**Loop Condition:** Any fail → return to implement

---

### 13.
🤝 
Complete Sprint (Collaborative)
**Actors:** Claude Code executes, Human approves commit

**Human Responsibilities:**
- Review generated commit message
- Edit if needed
- Approve commit execution

**Claude Code Responsibilities:**
- Archive sprint to history
- Store story snapshots
- Generate commit message
- Execute git commit (after approval)

**Why Split:** Git history is permanent and visible to the team. Human should approve the record.

---

### 14.
👤 
Code Review (Human)
**Actor:** Human (quality gate)

**Why Human:** Code review requires judgment about maintainability, team standards, and subtle quality issues that automated assertions may miss.

**Activities:**
- Review implementation quality
- Verify patterns followed
- Check for regressions
- Make final approval decision

**Outcomes:**
- **Approved:** Sprint complete
- **Issues Found:** Create new stories → return to planning

**Control Point:** Final human quality gate before completion.

---

### 15.
👤 
End / Next Sprint (Human)
**Actor:** Human (strategic decision)

**Activities:**
- Decide project continuation
- Select stories for next sprint
- Adjust priorities based on learnings

---

## Key Design Principles

### 1. Human Control at Strategic Points
Humans control:
- **What** gets built (requirements, stories)
- **When** it gets built (sprint selection)
- **Whether** it's good enough (code review)

### 2. AI Execution with Guardrails
Claude Code executes:
- **How** to build it (planning, implementation)
- **Verification** of completeness (assertions)
- **Documentation** of work done

### 3. Collaborative Refinement
Both participate in:
- Specification clarity
- Story refinement
- Plan iteration
- Commit message review

### 4. Automated Quality Checks
Inspection assertions provide:
- Objective verification
- Consistent standards
- Immediate feedback loops
- Reduced human review burden

### 5. Clear Handoff Points
Every transition between human and AI is explicit:
- Human approval gates prevent unauthorized implementation
- AI status updates keep humans informed
- Collaborative phases have defined responsibilities

---

## Benefits of This Model

| Benefit | How Achieved |
|---------|--------------|
| **Human oversight** | Approval gates at plan, commit, review |
| **AI efficiency** | Autonomous research, implementation, verification |
| **Quality assurance** | Automated assertions + human review |
| **Traceability** | Every change linked to story, plan, approval |
| **Iteration speed** | AI handles repetitive verification loops |
| **Consistency** | AI follows patterns systematically |
| **Flexibility** | Humans can intervene at any checkpoint |

---

## Anti-Patterns Prevented

| Risk | Prevention |
|------|------------|
| AI builds wrong thing | Human approves stories and plans |
| AI ignores standards | Assertions enforce structure |
| Scope creep | Plan approval locks scope |
| Poor quality merges | Human code review gate |
| Lost context | Sprint history with snapshots |
| Runaway implementation | No code without approved plan |

---

## Summary

This workflow represents a **trust but verify** model for human-AI collaboration:

1. **Trust** Claude Code to research, plan, implement, and verify
2. **Verify** through human checkpoints at stories, plans, commits, and reviews

The result is a development process that combines:
- **Human judgment** for strategy and quality
- **AI capability** for execution and verification
- **Structured handoffs** for accountability
- **Automated checks** for consistency