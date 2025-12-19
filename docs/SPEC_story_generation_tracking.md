# Story Generation Tracking

## Overview

This feature implements an **Experience Memory** system focused on tracking how Claude decomposes user prompts into User Stories, and what happens throughout their lifecycle. The goal is to capture raw data that can later reveal patterns about story quality and decomposition effectiveness.

## Workflow

```
┌─────────────────────────────────────────────────────────┐
│  USER PROMPT                                            │
│  "I need a way for users to export their data"          │
└─────────────────────┬───────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│  CLAUDE DECOMPOSES → User Stories                       │
│  • US1: Export to CSV                                   │
│  • US2: Export to JSON                                  │
│  • US3: Schedule automated exports                      │
└─────────────────────┬───────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│  USER REVIEW                                            │
│  • US1: ✓ Accepted                                      │
│  • US2: ✓ Accepted                                      │
│  • US3: ✗ Rejected — "Too complex for v1"               │
│  • US4: ➕ Added — "Export to PDF" (user added this)    │
└─────────────────────┬───────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│  IMPLEMENTATION OUTCOME                                 │
│  Track turns, input types, and final result             │
└─────────────────────────────────────────────────────────┘
```

## Learning Signals

| Signal | What It May Reveal |
|--------|-------------------|
| **Rejected stories** | Claude over-scoped, wrong assumptions, misread intent |
| **Modified stories** | Acceptance criteria gaps, missing context, wrong granularity |
| **User-added stories** | Claude missed obvious requirements, domain blind spots |
| **High turn count** | Possible specification gaps or implementation complexity |
| **Clarification inputs** | Story may have been ambiguous |
| **Correction inputs** | Story may have been misunderstood |

---

## User Stories

### US-1: Capture Story Generation Events

**Title:** Track prompt-to-story decomposition

**Description:** As a Puffin user, I want the system to automatically capture when Claude decomposes my prompt into user stories so that I have a record of what was generated.

**Acceptance Criteria:**
- [ ] System records the original user prompt
- [ ] System records all generated stories with title, description, and acceptance criteria
- [ ] System captures timestamp and model used
- [ ] Data persists across sessions

---

### US-2: Record User Feedback on Generated Stories

**Title:** Track user actions on generated stories

**Description:** As a Puffin user, I want to mark each generated story as accepted, modified, or rejected so that the system learns from my feedback.

**Acceptance Criteria:**
- [ ] User can mark a story as accepted (no changes)
- [ ] User can mark a story as modified (captures diff)
- [ ] User can mark a story as rejected (captures reason)
- [ ] User can add stories Claude missed (marked as user-added)
- [ ] Feedback is linked to the original generation event

---

### US-3: Record Implementation Outcomes

**Title:** Track story implementation process and results

**Description:** As a Puffin user, I want to record what happened during implementation so that I can later analyze patterns in the data.

**Acceptance Criteria:**
- [ ] System tracks number of turns to complete implementation
- [ ] System captures each user input during implementation with a simple tag:
  - **Clarification** — Asked for more detail about requirements
  - **Correction** — Changed direction based on misunderstanding
  - **Expansion** — Added scope not in original story
  - **Technical** — Guidance on how to implement
  - **Approval** — Confirmed to continue
- [ ] User can mark final outcome as success, partial, or failed
- [ ] User can add freeform notes
- [ ] All data is queryable/exportable for later analysis

---

### US-4: View Collected Data

**Title:** Display story tracking data

**Description:** As a Puffin user, I want to view the raw data collected from story generations and implementations so that I can observe patterns over time.

**Acceptance Criteria:**
- [ ] User can view all generation events with their stories
- [ ] User can filter by outcome, user action, date range
- [ ] User can export data for external analysis
- [ ] No computed scores or automated insights (defer until patterns emerge from data)

---

## Data Model (Reference)

```typescript
StoryGeneration {
  id: string

  // Input
  user_prompt: string
  project_context?: string

  // Generated output
  generated_stories: GeneratedStory[]

  // Metadata
  timestamp: Date
  model_used: string
}

GeneratedStory {
  id: string
  generation_id: string

  // The story
  title: string
  description: string
  acceptance_criteria: string[]

  // User feedback
  user_action: "accepted" | "modified" | "rejected" | "user_added"
  modification_diff?: string
  rejection_reason?: string

  // Implementation journey
  implementation?: ImplementationJourney
}

ImplementationJourney {
  story_id: string

  // Process metrics
  turn_count: number
  inputs: ImplementationInput[]

  // Outcome
  status: "success" | "partial" | "failed" | "pending"
  outcome_notes?: string
}

ImplementationInput {
  turn_number: number
  type: "clarification" | "correction" | "expansion" | "technical" | "approval"
  content_summary: string
}
```

---

## Design Philosophy

> **Capture first, analyze later.**
>
> This feature intentionally avoids computed scores, automatic diagnoses, or premature abstractions. The goal is to collect structured raw data from real usage, observe what patterns emerge after 50+ tracked implementations, and *then* decide what insights are actually valuable.

---

## References

- Inspired by "Memory in the Age of AI Agents" survey (Experience Memory: Cases, Strategies, Skills)
- Aligns with Puffin's role as a tracking/orchestration layer for 3CLI

---

## Implementation Summary

**Status:** Implemented (December 2024)

### Files Modified

| File | Changes |
|------|---------|
| `src/main/puffin-state.js` | Added storage methods for story generations and implementation journeys |
| `src/main/ipc-handlers.js` | Added IPC handlers for CRUD operations |
| `src/main/preload.js` | Exposed IPC methods (`getStoryGenerations`, `addStoryGeneration`, `updateStoryGeneration`, `addImplementationJourney`, `updateImplementationJourney`, `addImplementationInput`, `exportStoryGenerations`) |
| `src/renderer/sam/model.js` | Added `storyGenerations` state and acceptors for tracking |
| `src/renderer/sam/actions.js` | Added actions for tracking operations |
| `src/renderer/sam/state.js` | Added `storyGenerations` to computed state |
| `src/renderer/lib/state-persistence.js` | Added persistence triggers for all tracking actions |
| `src/renderer/components/prompt-editor/prompt-editor.js` | Added input type dropdown (visible only in implementation threads) |
| `src/renderer/components/user-stories/user-stories.js` | Added Backlog/Insights tab switching |
| `src/renderer/index.html` | Added input type dropdown, Backlog subtabs (Backlog/Insights), Insights tab content |
| `src/renderer/app.js` | Added StoryGenerationsComponent initialization |

### Files Created

| File | Purpose |
|------|---------|
| `src/renderer/components/story-generations/story-generations.js` | Insights view component |
| `src/renderer/components/story-generations/story-generations.css` | Component styles |

### Implementation by User Story

#### US-1: Capture Story Generation Events
- Modified `receiveDerivedStoriesAcceptor` to create `StoryGeneration` records when Claude decomposes prompts into stories
- Records original prompt, generated stories, timestamp, and model used
- Data persists to `.puffin/story-generations.json`

#### US-2: Record User Feedback on Generated Stories
- Modified existing acceptors to capture feedback:
  - `markStoryReadyAcceptor` → sets `user_action: 'accepted'`
  - `updateDerivedStoryAcceptor` → captures modification diff, sets `user_action: 'modified'`
  - `deleteDerivedStoryAcceptor` → prompts for reason, sets `user_action: 'rejected'`
  - `addStoriesToBacklogAcceptor` → finalizes generation and links backlog story IDs

#### US-3: Record Implementation Outcomes
- `startStoryImplementationAcceptor` creates `ImplementationJourney` records linked to stories
- `completeResponseAcceptor` updates turn count by traversing parent chain to find story context
- Added optional input type dropdown in prompt editor (appears only in implementation threads)
- `markThreadCompleteAcceptor` completes journeys with outcome (success/partial/failed) and optional notes
- `unmarkThreadCompleteAcceptor` reopens journeys if thread is unmarked

#### US-4: View Collected Data (Insights View)
- New "Insights" subtab within Backlog view (not a separate top-level view)
- Shows all generations with summary (date, prompt preview, story count by action)
- Expandable cards showing per-story feedback and implementation journey details
- Filter by action type (all/accepted/modified/rejected/pending)
- Export to JSON button for external analysis

### Data Storage

Data is stored in `.puffin/story-generations.json`:

```json
{
  "generations": [
    {
      "id": "...",
      "user_prompt": "...",
      "generated_stories": [
        {
          "id": "...",
          "title": "...",
          "description": "...",
          "acceptance_criteria": [],
          "user_action": "accepted|modified|rejected|pending|user_added",
          "modification_diff": "...",
          "rejection_reason": "...",
          "backlog_story_id": "..."
        }
      ],
      "timestamp": "...",
      "model_used": "..."
    }
  ],
  "implementation_journeys": [
    {
      "id": "...",
      "story_id": "...",
      "prompt_id": "...",
      "branch_id": "...",
      "turn_count": 5,
      "inputs": [
        { "turn_number": 1, "type": "technical", "content_summary": "..." }
      ],
      "status": "pending|success|partial|failed",
      "outcome_notes": "...",
      "started_at": "...",
      "completed_at": "..."
    }
  ]
}
```
