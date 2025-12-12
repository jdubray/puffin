> I have started to test Puffin on a real project. This morning I started working on user stories that I had derive yesterday. I initiated the implementation from the backend
thread even though it was a UI user story. Puffin (Claude) started doing backend implementation exclusively which was ok, these additional APIs could be used by the front-end.
When I restarted the implementation from the UI branch with the same user stories, it still focused on the backend only. Can you review the code and try to understand why this
happened? what is the relationship between User Stories and branches, and between branches and implementation. Here are the User stories in question: {
    "id": "b0e52cc2-a1d6-4c62-91c9-24b8f69459f5",
    "branchId": null,
    "title": "Add Stock Ticker Entry for Trading Events",
    "description": "As a trader, I want to enter stock ticker symbols for an upcoming trading event so that I can prepare orders for stocks I expect to be affected",
    "acceptanceCriteria": [
      "Input field allows entering a stock ticker symbol",
      "Ticker symbol is validated against known symbols",
      "User can specify the number of shares for each ticker",
      "Added tickers appear in a table/list view",
      "User can remove a ticker from the list"
    ],
    "status": "in-progress",
    "sourcePromptId": null,
    "createdAt": 1765383526857,
    "updatedAt": "2025-12-10T16:32:06.314Z"
  },
  {
    "id": "dcf6f1ea-134c-41f7-b6b3-96ae9180d9bb",
    "branchId": null,
    "title": "Display Trading Event Orders Table",
    "description": "As a trader, I want to see all my prepared orders in a table format so that I can quickly review and manage my event trading positions",
    "acceptanceCriteria": [
      "Table displays columns: Stock, # of Shares, Buy/Short, Market",
      "Each row represents one prepared order",
      "Table updates in real-time as orders are added or modified",
      "Table clearly distinguishes between Buy and Short orders visually"
    ],
    "status": "in-progress",
    "sourcePromptId": null,
    "createdAt": 1765383526857,
    "updatedAt": "2025-12-10T16:32:06.316Z"
  },
  {
    "id": "09eba64b-a1dc-4e50-8ddc-ece36580d72f",
    "branchId": null,
    "title": "Create Buy and Short Order Buttons",
    "description": "As a trader, I want to have both Buy and Short order buttons ready for each stock so that I can quickly execute either direction based on market reaction to
 the event",
    "acceptanceCriteria": [
      "Each stock entry has a 'Buy' button to place a market buy order",
      "Each stock entry has a 'Short' button to place a market short order",
      "Only one order type (Buy or Short) can be active per stock at a time",
      "Buttons are prominently displayed and easily clickable for fast execution"
    ],
    "status": "in-progress",
    "sourcePromptId": null,
    "createdAt": 1765383526857,
    "updatedAt": "2025-12-10T16:32:06.317Z"
  },

● I'll explore the codebase to understand how user stories relate to branches and how implementation prompts are generated. Let me investigate this systematically.

● Explore(Explore user stories and branches)
  ⎿  Done (24 tool uses · 89.8k tokens · 1m 23s)

● This is an excellent investigation. The agent found the root cause. Let me verify the key findings by looking at the specific code:

● Read(src/renderer/sam/model.js)
  ⎿  Read 100 lines

● Read(src/renderer/sam/model.js)
  ⎿  Read 50 lines

● Now I have a clear picture. Let me also check if there's any UI context or guidelines that should be passed:

● Read(src/renderer/lib/state-persistence.js)
  ⎿  Read 60 lines

● Now I have all the evidence I need to explain the issue. Here's my analysis:

  ---
  Root Cause Analysis

  I found two critical issues that explain why your UI-focused user stories resulted in backend-only implementation:

  Issue 1: Hardcoded Backend Branch (Primary Cause)

  In src/renderer/sam/model.js:962, the implementation is hardcoded to always use the 'backend' branch:

  // Use backend branch for implementation
  const branchId = 'backend'

  This means regardless of:
  - Which branch the user stories were derived from
  - Which branch you're currently viewing
  - The nature of the user story (UI vs backend)

  All implementations always go to the 'backend' branch.

  Issue 2: branchId Not Stored on User Stories

  When stories are added to the backlog in addStoriesToBacklogAcceptor (model.js:828-837), the branchId is not transferred to the story objects:

  selectedStories.forEach(story => {
    model.userStories.push({
      id: story.id,
      title: story.title,
      description: story.description,
      acceptanceCriteria: story.acceptanceCriteria,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
      // NOTE: branchId is NOT included here!
    })
  })

  Even though model.storyDerivation.branchId is available (line 841), it's never assigned to individual stories. That's why your user stories show "branchId": null.

  Issue 3: No Branch-Specific Context in Prompts

  The implementation prompt (model.js:948-959) is completely generic:

  const promptContent = `Please implement the following user ${stories.length === 1 ? 'story' : 'stories'}:
  ${storyDescriptions}
  **Instructions:**
  1. First, think hard about the implementation approach...

  There's no:
  - UI guidelines reference
  - Architecture context
  - Branch-specific implementation hints
  - Any indication this should be UI work vs backend work

  Why This Matters

  When Claude receives the implementation request via state-persistence.js:151-159:

  await window.puffin.claude.submit({
    prompt: pendingImpl.promptContent,
    branchId: pendingImpl.branchId,  // Always 'backend'
    sessionId,  // From backend branch history
    project: state.config ? {
      name: state.config.name,
      description: state.config.description
    } : null
    // No UI guidelines, no branch context
  })

  Claude only receives:
  - The generic implementation prompt
  - Project name and description
  - Session context from the backend branch's conversation history

  Claude has no awareness that this is UI work.

  ---
  Summary

  | Problem                            | Location                     | Impact                                         |
  |------------------------------------|------------------------------|------------------------------------------------|
  | Hardcoded branchId = 'backend'     | model.js:962                 | All implementations go to backend branch       |
  | branchId not stored on stories     | model.js:828-837             | Stories lose their source branch context       |
  | No branch-specific prompt context  | model.js:948-959             | Claude doesn't know if it's UI or backend work |
  | Only project config sent to Claude | state-persistence.js:151-159 | No UI guidelines or architecture context       |

  The design intent appears to have been that stories would carry their branchId and implementation would route to the appropriate branch with relevant context - but the
  current implementation shortcuts everything to 'backend' with no differentiation.

> Could we fix that? Ideally I want to keep the relationship between branch and user story but some user stories have implemented across different branches.

● Yes, we can fix this! Let me think through the design:

  Current state: Stories have a branchId field but it's always null. Implementation is hardcoded to 'backend'.

  Goal:
  1. Track which branch a story was derived from (source context)
  2. Allow implementation to happen on any branch (user choice)
  3. Track which branches have implemented parts of a story (implementation history)

  Let me propose a solution:

● User answered Claude's questions:
  ⎿  · How should the user select which branch to implement on? → Use current branch

● Good choice - that's the simplest and most intuitive. Now let me plan the implementation:

● Update(src/renderer/sam/model.js)
  ⎿  Updated src/renderer/sam/model.js with 3 additions
       825        )
       826
       827        // Add each story to the backlog (userStories)
       828 +      const sourceBranchId = model.storyDerivation.branchId || null
       829        selectedStories.forEach(story => {
       830          model.userStories.push({
       831            id: story.id,
       832 +          branchId: sourceBranchId,
       833            title: story.title,
       834            description: story.description,
       835            acceptanceCriteria: story.acceptanceCriteria,
       836            status: 'pending',
       837 +          implementedOn: [],
       838            createdAt: Date.now(),
       839            updatedAt: Date.now()
       840          })

● Now let me fix the implementation to use the active branch and track which branches have implemented the story:

● Read(src/renderer/sam/model.js)
  ⎿  Read 90 lines

● Now I need to check what branch context information is available (like UI guidelines for the ui branch):

● Search(pattern: "uiGuidelines|ui-guidelines", path: "src")
  ⎿  Found 2 files (ctrl+o to expand)

● Search(pattern: "uiGuidelines", path: "src/renderer/sam/model.js", output_mode: "content")
  ⎿  Found 2 lines (ctrl+o to expand)

● Read(src/renderer/sam/model.js)
  ⎿  Read 30 lines

● Good, I can see uiGuidelines is available in the model. Now let me update the implementation acceptor to use the active branch and add branch-specific context:

● Update(src/renderer/sam/model.js)
  ⎿  Error editing file

● Let me re-read that section to get the exact text:

● Read(src/renderer/sam/model.js)
  ⎿  Read 100 lines

● Update(src/renderer/sam/model.js)
  ⎿  Updated src/renderer/sam/model.js with 119 additions and 10 removals
       917    /**
       918     * Start implementation for selected stories
       919     * - Updates story status to 'in-progress'
       920 -   * - Creates a prompt in the backend branch for implementation
       921 -   * - Triggers Claude to plan and implement
       920 +   * - Uses the currently active branch for implementation
       921 +   * - Adds branch-specific context (UI guidelines for ui branch, architecture for others)
       922 +   * - Tracks which branches have implemented each story
       923     */
       924    export const startStoryImplementationAcceptor = model => proposal => {
       925      if (proposal?.type === 'START_STORY_IMPLEMENTATION') {
     ...
       926
       927        if (!stories || stories.length === 0) return
       928
       929 -      // Update story statuses to in-progress
       929 +      // Use the currently active branch for implementation
       930 +      const branchId = model.history.activeBranch || 'backend'
       931 +
       932 +      // Update story statuses to in-progress and track implementation branch
       933        stories.forEach(story => {
       934          const existingStory = model.userStories.find(s => s.id === story.id)
       935          if (existingStory) {
       936            existingStory.status = 'in-progress'
       937            existingStory.updatedAt = Date.now()
       938 +          // Track which branches have implemented this story
       939 +          if (!existingStory.implementedOn) {
       940 +            existingStory.implementedOn = []
       941 +          }
       942 +          if (!existingStory.implementedOn.includes(branchId)) {
       943 +            existingStory.implementedOn.push(branchId)
       944 +          }
       945          }
       946        })
       947
     ...
       948          return desc
       949        }).join('\n\n')
       950
       951 +      // Build branch-specific context
       952 +      let branchContext = ''
       953 +      if (branchId === 'ui') {
       954 +        branchContext = buildUiBranchContext(model)
       955 +      } else if (branchId === 'architecture') {
       956 +        branchContext = buildArchitectureBranchContext(model)
       957 +      } else if (branchId === 'backend') {
       958 +        branchContext = buildBackendBranchContext(model)
       959 +      }
       960 +
       961        const promptContent = `Please implement the following user ${stories.length === 1 ? 'story' : 'stories'}:
       962
       963    ${storyDescriptions}
       964 -
       964 +  ${branchContext}
       965    **Instructions:**
       966    1. First, think hard about the implementation approach and create a detailed plan
       967    2. Consider the existing codebase structure and patterns
     ...
       961
       962    Please start by outlining your implementation plan, then proceed with the implementation.`
       963
       964 -      // Use backend branch for implementation
       965 -      const branchId = 'backend'
       966 -
       964        // Ensure branch exists
       965        if (!model.history.branches[branchId]) {
       966          model.history.branches[branchId] = {
       967            id: branchId,
       968 -          name: 'Backend',
       968 +          name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
       969            prompts: []
       970          }
       971        }
     ...
       987        // Add to branch
       988        model.history.branches[branchId].prompts.push(prompt)
       989
       990 -      // Switch to backend branch and select the new prompt
       991 -      model.history.activeBranch = branchId
       990 +      // Keep the active branch (don't switch)
       991        model.history.activePromptId = promptId
       992
       993        // Set pending prompt for streaming
     ...
       1009    }
       1010
       1011    /**
       1012 +   * Build UI branch context with design tokens and guidelines
       1013 +   */
       1014 +  function buildUiBranchContext(model) {
       1015 +    const guidelines = model.uiGuidelines
       1016 +    if (!guidelines) return ''
       1017 +
       1018 +    let context = '\n**UI Implementation Context:**\n'
       1019 +    context += 'This is a UI-focused implementation. Please follow these guidelines:\n\n'
       1020 +
       1021 +    // Add design tokens if available
       1022 +    if (guidelines.designTokens) {
       1023 +      const tokens = guidelines.designTokens
       1024 +      if (tokens.colors && Object.keys(tokens.colors).length > 0) {
       1025 +        context += '**Color Tokens:**\n'
       1026 +        for (const [name, token] of Object.entries(tokens.colors)) {
       1027 +          context += `- ${name}: ${token.value}\n`
       1028 +        }
       1029 +        context += '\n'
       1030 +      }
       1031 +      if (tokens.fontFamilies && tokens.fontFamilies.length > 0) {
       1032 +        context += '**Font Families:**\n'
       1033 +        tokens.fontFamilies.forEach(f => {
       1034 +          context += `- ${f.name}: ${f.value}\n`
       1035 +        })
       1036 +        context += '\n'
       1037 +      }
       1038 +      if (tokens.spacing && tokens.spacing.length > 0) {
       1039 +        context += '**Spacing Scale:**\n'
       1040 +        tokens.spacing.forEach(s => {
       1041 +          context += `- ${s.name}: ${s.value}\n`
       1042 +        })
       1043 +        context += '\n'
       1044 +      }
       1045 +    }
       1046 +
       1047 +    // Add component patterns if available
       1048 +    if (guidelines.componentPatterns && guidelines.componentPatterns.length > 0) {
       1049 +      context += '**Existing Component Patterns:**\n'
       1050 +      guidelines.componentPatterns.forEach(p => {
       1051 +        context += `- ${p.name}: ${p.description || ''}\n`
       1052 +      })
       1053 +      context += '\n'
       1054 +    }
       1055 +
       1056 +    // Add general guidelines
       1057 +    if (guidelines.guidelines) {
       1058 +      const g = guidelines.guidelines
       1059 +      if (g.components) {
       1060 +        context += '**Component Guidelines:**\n' + g.components + '\n\n'
       1061 +      }
       1062 +      if (g.interactions) {
       1063 +        context += '**Interaction Guidelines:**\n' + g.interactions + '\n\n'
       1064 +      }
       1065 +    }
       1066 +
       1067 +    return context
       1068 +  }
       1069 +
       1070 +  /**
       1071 +   * Build architecture branch context
       1072 +   */
       1073 +  function buildArchitectureBranchContext(model) {
       1074 +    let context = '\n**Architecture Implementation Context:**\n'
       1075 +    context += 'This is an architecture-focused implementation. Consider:\n'
       1076 +    context += '- System design and component boundaries\n'
       1077 +    context += '- Data flow and state management patterns\n'
       1078 +    context += '- API contracts and interfaces\n'
       1079 +    context += '- Scalability and maintainability\n\n'
       1080 +
       1081 +    if (model.architecture?.content) {
       1082 +      context += '**Current Architecture:**\n'
       1083 +      context += model.architecture.content.substring(0, 2000) + '\n\n'
       1084 +    }
       1085 +
       1086 +    return context
       1087 +  }
       1088 +
       1089 +  /**
       1090 +   * Build backend branch context
       1091 +   */
       1092 +  function buildBackendBranchContext(model) {
       1093 +    let context = '\n**Backend Implementation Context:**\n'
       1094 +    context += 'This is a backend-focused implementation. Consider:\n'
       1095 +    context += '- API design and REST/GraphQL conventions\n'
       1096 +    context += '- Data persistence and database patterns\n'
       1097 +    context += '- Error handling and validation\n'
       1098 +    context += '- Security and authentication\n\n'
       1099 +
       1100 +    return context
       1101 +  }
       1102 +
       1103 +  /**
       1104     * Activity Tracking Acceptors
       1105     */
       1106

● Now I need to update state-persistence to use the correct branch's session ID instead of always using backend:

● Read(src/renderer/lib/state-persistence.js)
  ⎿  Read 50 lines

● Update(src/renderer/lib/state-persistence.js)
  ⎿  Updated src/renderer/lib/state-persistence.js with 4 additions and 4 removals
       138            // Check if there's a pending implementation to submit
       139            const pendingImpl = state._pendingImplementation
       140            if (pendingImpl) {
       141 -            console.log('[IMPLEMENT] Submitting implementation prompt to Claude')
       141 +            console.log('[IMPLEMENT] Submitting implementation prompt to Claude on branch:', pendingImpl.branchId)
       142
       143 -            // Get session ID from last successful prompt in backend branch
       144 -            const backendBranch = state.history.raw?.branches?.backend
       145 -            const lastPromptWithResponse = backendBranch?.prompts
       143 +            // Get session ID from last successful prompt in the target branch
       144 +            const targetBranch = state.history.raw?.branches?.[pendingImpl.branchId]
       145 +            const lastPromptWithResponse = targetBranch?.prompts
       146                ?.filter(p => p.response?.sessionId && p.response?.content !== 'Prompt is too long')
       147                ?.pop()
       148              const sessionId = lastPromptWithResponse?.response?.sessionId || null

● Now let me also check if we need to update the main process puffin-state.js to handle the new implementedOn field when persisting stories:

● Search(pattern: "updateUserStory|addUserStory", path: "src/main/puffin-state.js", output_mode: "content")
  ⎿  Found 20 lines (ctrl+o to expand)

● Read(src/main/puffin-state.js)
  ⎿  Read 50 lines

● The updateUserStory method spreads all updates, so the implementedOn array will be persisted correctly. Let me also add the field to addUserStory for completeness:

● Update(src/main/puffin-state.js)
  ⎿  Updated src/main/puffin-state.js with 2 additions and 1 removal
       171      async addUserStory(story) {
       172        const newStory = {
       173          id: story.id || this.generateId(),
       174 -        branchId: story.branchId || null, // Branch context for the story
       174 +        branchId: story.branchId || null, // Branch where story was derived from
       175          title: story.title,
       176          description: story.description || '',
       177          acceptanceCriteria: story.acceptanceCriteria || [],
       178          status: story.status || 'pending',
       179 +        implementedOn: story.implementedOn || [], // Branches where this story has been implemented
       180          sourcePromptId: story.sourcePromptId || null,
       181          createdAt: story.createdAt || new Date().toISOString(),
       182          updatedAt: new Date().toISOString()

● All the core changes are done. Let me summarize what was changed:

  Summary of Changes

  1. src/renderer/sam/model.js - addStoriesToBacklogAcceptor (lines 827-841)

  - Now stores branchId from model.storyDerivation.branchId on each story
  - Added implementedOn: [] array to track which branches have implemented the story

  2. src/renderer/sam/model.js - startStoryImplementationAcceptor (lines 924-1025)

  - Uses active branch instead of hardcoded 'backend': const branchId = model.history.activeBranch || 'backend'
  - Tracks implementation branches: Adds current branch to story.implementedOn[] array
  - Adds branch-specific context via helper functions:
    - buildUiBranchContext() - includes design tokens, component patterns, UI guidelines
    - buildArchitectureBranchContext() - includes architecture docs and design considerations
    - buildBackendBranchContext() - includes backend implementation hints

  3. src/renderer/lib/state-persistence.js (lines 138-161)

  - Changed from hardcoded backend branch to use pendingImpl.branchId
  - Session ID is now retrieved from the target branch's history (not always backend)

  4. src/main/puffin-state.js - addUserStory (lines 171-187)

  - Added implementedOn field to story schema for persistence

  How It Works Now

  | Before                                         | After                                                       |
  |------------------------------------------------|-------------------------------------------------------------|
  | Implementation always went to 'backend' branch | Implementation uses current active branch                   |
  | Stories had branchId: null                     | Stories store their source branch                           |
  | No tracking of where stories were implemented  | implementedOn[] tracks all branches                         |
  | Generic prompt with no context                 | Branch-specific context (UI guidelines, architecture, etc.) |
  | Session from backend branch only               | Session from target branch                                  |

  Now when you're on the UI branch and click "Start Implementation", Claude will:
  1. Receive UI-specific context (design tokens, component patterns)
  2. Use the UI branch's conversation history
  3. Track that this story was implemented on the 'ui' branch

> Could you elaborate on the difference between Puffin and Claude Code in terms of implementation context? The main reason I built Puffin is because it seemed that it was hard
to keep track of both the intent of the design/implementation and the context that Claude relies on. Do you see any potential improvement to Puffin to improve the context that
Claude Code will rely on?

● Great question. Let me analyze how context flows from Puffin to Claude Code and identify gaps.

● Explore(Analyze context flow to Claude)
  ⎿  Done (17 tool uses · 53.2k tokens · 60s)

● This is an excellent analysis. Let me synthesize this into a clear comparison and identify improvement opportunities:

  Current Context Flow: Puffin → Claude Code

  What Claude Code Actually Receives

  | Context Type             | New Session | Resumed Session |
  |--------------------------|-------------|-----------------|
  | Branch tag (focus area)  | ✅           | ✅               |
  | Project description      | ✅           | ❌ (in memory)   |
  | Architecture doc         | ✅           | ❌ (in memory)   |
  | Coding preferences       | ✅           | ❌ (in memory)   |
  | User stories             | ✅           | ❌ (in memory)   |
  | GUI layout (if included) | ✅           | ✅               |
  | UI Guidelines/Tokens     | ❌           | ❌               |
  | Cross-branch history     | ❌           | ❌               |
  | Component patterns       | ❌           | ❌               |

  The Key Gap

  Puffin stores a lot of valuable context that never reaches Claude Code:

  1. UI Guidelines (ui-guidelines.json) - design tokens, color palettes, spacing, component patterns
  2. Cross-branch context - decisions made in architecture branch aren't visible when working on UI
  3. Implementation history per story - Claude doesn't know what was already tried/done
  4. Stylesheets - stored but not communicated

  ---
  Potential Improvements

  1. Generate a Dynamic CLAUDE.md for the Target Project

  Instead of just passing context in prompts (which gets lost on resume), Puffin could write a .claude/CLAUDE.md file in the target project that Claude Code reads
  automatically.

  .claude/
  └── CLAUDE.md  ← Generated by Puffin with:
      - Project description & assumptions
      - Architecture summary
      - UI design tokens & patterns
      - Active user stories
      - Branch-specific guidelines

  Benefit: Claude Code reads this file automatically on every invocation - context is persistent and always available, even across sessions.

  2. Cross-Branch Context Summaries

  When implementing on the UI branch, Claude should know about relevant backend decisions. Puffin could:
  - Summarize key decisions from other branches
  - Include API contracts defined in backend when doing UI work
  - Reference architecture decisions when implementing features

  3. Story Implementation Context

  Track and communicate:
  - What was attempted before (failed approaches)
  - What files were touched in previous implementation attempts
  - Dependencies between stories

  4. Selective Context Injection Based on Task

  Right now branch context is generic. Puffin could analyze the prompt and inject relevant context:
  - Implementing a form? Include form component patterns
  - Working on API? Include data model and validation rules
  - Styling work? Include full design token set

  5. Session Memory Bridge

  When resuming a session, Claude CLI has server-side memory, but it doesn't know about:
  - What happened in Puffin while it was idle
  - New stories added
  - Config changes

  Puffin could inject a "since last session" summary.

  ---
  Recommended Priority

  | Improvement                          | Impact                            | Effort |
  |--------------------------------------|-----------------------------------|--------|
  | Generate CLAUDE.md in target project | High - always-on context          | Medium |
  | Include UI guidelines in prompts     | High - fixes the gap you hit      | Low    |
  | Cross-branch summaries               | Medium - prevents silos           | Medium |
  | Story implementation history         | Medium - prevents repeat mistakes | Low    |
  | Task-specific context injection      | Medium - reduces noise            | High   |

  The CLAUDE.md generation approach is particularly powerful because it leverages Claude Code's native behavior - it reads .claude/CLAUDE.md automatically, so Puffin wouldn't
  need to stuff everything into prompts.

  Would you like me to implement any of these improvements?

> yes, that sounds good. How often or more exactly what would trigger a dynamic generation of CLAUDE.md?

● Good question. Let me think through the triggers:

  Potential Triggers for CLAUDE.md Generation

  | Trigger                    | Rationale                                       |
  |----------------------------|-------------------------------------------------|
  | Project opened in Puffin   | Ensure CLAUDE.md is fresh when starting work    |
  | Config changes saved       | Coding preferences, project description updated |
  | Architecture doc updated   | Key context changed                             |
  | User stories added/updated | Active work items changed                       |
  | UI guidelines changed      | Design tokens, component patterns updated       |
  | Before prompt submission   | Guarantee latest context before Claude runs     |
  | Branch switch              | Could tailor CLAUDE.md to current branch focus  |

● User answered Claude's questions:
  ⎿  · When should Puffin regenerate the target project's CLAUDE.md? → On state changes
     · Should CLAUDE.md content vary by active branch? → That's a good idea, maybe we need to maintain a CLAUDE.md per branch and substitute CLAUDE_BRANCH_X.md to CLAUDE.md
     when we run a thread in that branch?

● That's a clever approach - maintaining branch-specific files and swapping them in. Let me design this:

  Proposed Design

  target-project/
  └── .claude/
      ├── CLAUDE.md                    ← Active file (symlink or copy of current branch)
      ├── CLAUDE_specifications.md     ← Requirements focus
      ├── CLAUDE_architecture.md       ← System design focus
      ├── CLAUDE_ui.md                 ← Design tokens, component patterns
      ├── CLAUDE_backend.md            ← API design, data models
      └── CLAUDE_base.md               ← Shared context (project, assumptions)

  On branch switch or before submission:
  1. Generate/update CLAUDE_base.md (shared content)
  2. Generate/update CLAUDE_{branch}.md (branch-specific)
  3. Combine base + branch content into CLAUDE.md

  On state changes:
  - Config change → regenerate CLAUDE_base.md + active CLAUDE.md
  - Architecture change → regenerate CLAUDE_architecture.md + CLAUDE.md if on that branch
  - UI guidelines change → regenerate CLAUDE_ui.md + CLAUDE.md if on UI branch
  - Stories change → regenerate all branch files that reference stories

● User answered Claude's questions:
  ⎿  · How should we combine base + branch content into CLAUDE.md? → Concatenate files

● Simple and effective. Let me plan the implementation:

● Write(src/main/claude-md-generator.js)
  ⎿  Wrote 522 lines to src/main/claude-md-generator.js
     /**
      * ClaudeMdGenerator - Generates dynamic CLAUDE.md files for target projects
      *
      * Maintains branch-specific context files that are concatenated into the active CLAUDE.md:
      * - CLAUDE_base.md: Shared project context (description, assumptions, coding preferences)
      * - CLAUDE_{branch}.md: Branch-specific focus and relevant data
      * - CLAUDE.md: Active file = base + current branch content
      */
     const fs = require('fs').promises
     … +512 lines (ctrl+o to expand)

● Now let me integrate this with the IPC handlers and puffin-state to trigger regeneration on state changes:

● Read(src/main/ipc-handlers.js)
  ⎿  Read 60 lines

● Read(src/main/ipc-handlers.js)
  ⎿  Read 150 lines

● Read(src/main/ipc-handlers.js)
  ⎿  Read 100 lines

● Now I understand the structure. I need to:
  1. Add the ClaudeMdGenerator to the IPC handlers
  2. Trigger regeneration on relevant state changes
  3. Add handlers for branch switching

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 2 additions
        9    const { PuffinState } = require('./puffin-state')
       10    const { ClaudeService } = require('./claude-service')
       11    const { DeveloperProfileManager } = require('./developer-profile')
       12 +  const ClaudeMdGenerator = require('./claude-md-generator')
       13
       14    let puffinState = null
       15    let claudeService = null
       16    let developerProfile = null
       17 +  let claudeMdGenerator = null
       18    let projectPath = null
       19
       20    /**

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 1 addition
       27      puffinState = new PuffinState()
       28      claudeService = new ClaudeService()
       29      developerProfile = new DeveloperProfileManager()
       30 +    claudeMdGenerator = new ClaudeMdGenerator()
       31
       32      // Set Claude CLI working directory to the project path
       33      claudeService.setProjectPath(projectPath)

● Now I need to update the state:init handler to initialize the generator and generate initial CLAUDE.md files:

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 6 additions
       53      ipcMain.handle('state:init', async () => {
       54        try {
       55          const state = await puffinState.open(projectPath)
       56 +
       57 +        // Initialize CLAUDE.md generator and generate initial files
       58 +        await claudeMdGenerator.initialize(projectPath)
       59 +        const activeBranch = state.history?.activeBranch || 'specifications'
       60 +        await claudeMdGenerator.generateAll(state, activeBranch)
       61 +
       62          return { success: true, state }
       63        } catch (error) {
       64          return { success: false, error: error.message }

● Now let me add regeneration triggers to the config, architecture, user story, and UI guidelines update handlers:

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 6 additions
       79      ipcMain.handle('state:updateConfig', async (event, updates) => {
       80        try {
       81          const config = await puffinState.updateConfig(updates)
       82 +
       83 +        // Regenerate CLAUDE.md base (config affects all branches)
       84 +        const state = puffinState.getState()
       85 +        const activeBranch = state.history?.activeBranch || 'specifications'
       86 +        await claudeMdGenerator.updateBase(state, activeBranch)
       87 +
       88          return { success: true, config }
       89        } catch (error) {
       90          return { success: false, error: error.message }

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 8 additions
       125      ipcMain.handle('state:updateArchitecture', async (event, content) => {
       126        try {
       127          const architecture = await puffinState.updateArchitecture(content)
       128 +
       129 +        // Regenerate architecture branch CLAUDE.md
       130 +        const state = puffinState.getState()
       131 +        const activeBranch = state.history?.activeBranch || 'specifications'
       132 +        await claudeMdGenerator.updateBranch('architecture', state, activeBranch)
       133 +        // Also update backend branch (it extracts data model from architecture)
       134 +        await claudeMdGenerator.updateBranch('backend', state, activeBranch)
       135 +
       136          return { success: true, architecture }
       137        } catch (error) {
       138          return { success: false, error: error.message }

● Now let me update the user story handlers:

● Read(src/main/ipc-handlers.js)
  ⎿  Read 50 lines

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 18 additions
       226      ipcMain.handle('state:addUserStory', async (event, story) => {
       227        try {
       228          const newStory = await puffinState.addUserStory(story)
       229 +
       230 +        // Regenerate CLAUDE.md base (stories are in base context)
       231 +        const state = puffinState.getState()
       232 +        const activeBranch = state.history?.activeBranch || 'specifications'
       233 +        await claudeMdGenerator.updateBase(state, activeBranch)
       234 +
       235          return { success: true, story: newStory }
       236        } catch (error) {
       237          return { success: false, error: error.message }
     ...
       235      ipcMain.handle('state:updateUserStory', async (event, { storyId, updates }) => {
       236        try {
       237          const story = await puffinState.updateUserStory(storyId, updates)
       238 +
       239 +        // Regenerate CLAUDE.md base (stories are in base context)
       240 +        const state = puffinState.getState()
       241 +        const activeBranch = state.history?.activeBranch || 'specifications'
       242 +        await claudeMdGenerator.updateBase(state, activeBranch)
       243 +
       244          return { success: true, story }
       245        } catch (error) {
       246          return { success: false, error: error.message }
     ...
       244      ipcMain.handle('state:deleteUserStory', async (event, storyId) => {
       245        try {
       246          const deleted = await puffinState.deleteUserStory(storyId)
       247 +
       248 +        // Regenerate CLAUDE.md base (stories are in base context)
       249 +        const state = puffinState.getState()
       250 +        const activeBranch = state.history?.activeBranch || 'specifications'
       251 +        await claudeMdGenerator.updateBase(state, activeBranch)
       252 +
       253          return { success: true, deleted }
       254        } catch (error) {
       255          return { success: false, error: error.message }

● Now let me update the UI Guidelines handlers:

● Read(src/main/ipc-handlers.js)
  ⎿  Read 80 lines

● I need to update all the UI Guidelines handlers to regenerate the UI branch CLAUDE.md. Let me create a helper function for this:

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 16 additions
       268        }
       269      })
       270
       271 +    // Helper to regenerate UI branch CLAUDE.md
       272 +    async function regenerateUiBranchContext() {
       273 +      const state = puffinState.getState()
       274 +      const activeBranch = state.history?.activeBranch || 'specifications'
       275 +      await claudeMdGenerator.updateBranch('ui', state, activeBranch)
       276 +    }
       277 +
       278      // UI Guidelines operations
       279      ipcMain.handle('state:updateUiGuidelines', async (event, updates) => {
       280        try {
       281          const guidelines = await puffinState.updateUiGuidelines(updates)
       282 +        await regenerateUiBranchContext()
       283          return { success: true, guidelines }
       284        } catch (error) {
       285          return { success: false, error: error.message }
     ...
       281      ipcMain.handle('state:updateGuidelineSection', async (event, { section, content }) => {
       282        try {
       283          const guidelines = await puffinState.updateGuidelineSection(section, content)
       284 +        await regenerateUiBranchContext()
       285          return { success: true, guidelines }
       286        } catch (error) {
       287          return { success: false, error: error.message }
     ...
       290      ipcMain.handle('state:addStylesheet', async (event, stylesheet) => {
       291        try {
       292          const newStylesheet = await puffinState.addStylesheet(stylesheet)
       293 +        await regenerateUiBranchContext()
       294          return { success: true, stylesheet: newStylesheet }
       295        } catch (error) {
       296          return { success: false, error: error.message }
     ...
       299      ipcMain.handle('state:updateStylesheet', async (event, { stylesheetId, updates }) => {
       300        try {
       301          const stylesheet = await puffinState.updateStylesheet(stylesheetId, updates)
       302 +        await regenerateUiBranchContext()
       303          return { success: true, stylesheet }
       304        } catch (error) {
       305          return { success: false, error: error.message }
     ...
       308      ipcMain.handle('state:deleteStylesheet', async (event, stylesheetId) => {
       309        try {
       310          const deleted = await puffinState.deleteStylesheet(stylesheetId)
       311 +        await regenerateUiBranchContext()
       312          return { success: true, deleted }
       313        } catch (error) {
       314          return { success: false, error: error.message }
     ...
       317      ipcMain.handle('state:updateDesignTokens', async (event, tokenUpdates) => {
       318        try {
       319          const tokens = await puffinState.updateDesignTokens(tokenUpdates)
       320 +        await regenerateUiBranchContext()
       321          return { success: true, tokens }
       322        } catch (error) {
       323          return { success: false, error: error.message }
     ...
       326      ipcMain.handle('state:addComponentPattern', async (event, pattern) => {
       327        try {
       328          const newPattern = await puffinState.addComponentPattern(pattern)
       329 +        await regenerateUiBranchContext()
       330          return { success: true, pattern: newPattern }
       331        } catch (error) {
       332          return { success: false, error: error.message }
     ...
       335      ipcMain.handle('state:updateComponentPattern', async (event, { patternId, updates }) => {
       336        try {
       337          const pattern = await puffinState.updateComponentPattern(patternId, updates)
       338 +        await regenerateUiBranchContext()
       339          return { success: true, pattern }
       340        } catch (error) {
       341          return { success: false, error: error.message }
     ...
       344      ipcMain.handle('state:deleteComponentPattern', async (event, patternId) => {
       345        try {
       346          const deleted = await puffinState.deleteComponentPattern(patternId)
       347 +        await regenerateUiBranchContext()
       348          return { success: true, deleted }
       349        } catch (error) {
       350          return { success: false, error: error.message }

● Now I need to add an IPC handler for branch switching that will activate the appropriate CLAUDE.md. Let me check if there's an existing branch switch handler:

● Search(pattern: "activeBranch|switchBranch|branch:switch", path: "src", output_mode: "content")
  ⎿  Found 20 lines (ctrl+o to expand)

● I see that branch switching happens in the renderer process through model.history.activeBranch. Let me check how the history is updated and where branch switching occurs:

● Search(pattern: "SET_ACTIVE_BRANCH|setActiveBranch|activeBranch =", path: "src/renderer", output_mode: "content")
  ⎿  Found 6 lines (ctrl+o to expand)

● Read(src/renderer/sam/model.js)
  ⎿  Read 30 lines

● I see branch switching happens through the SELECT_BRANCH action in the renderer. The state-persistence layer should handle calling IPC to update the CLAUDE.md. Let me check
  state-persistence.js:

● Read(src/renderer/lib/state-persistence.js)
  ⎿  Read 40 lines

● I see that SELECT_BRANCH already triggers updateHistory. I need to add a new IPC handler and call it from state-persistence. Let me first add the IPC handler:

● Read(src/main/ipc-handlers.js)
  ⎿  Read 40 lines

● There's already a state:generateClaudeMd handler - but that's for the old static generation. I need to add a new handler for activating a branch. Let me add it:

● Update(src/main/ipc-handlers.js)
  ⎿  Updated src/main/ipc-handlers.js with 12 additions and 1 removal
       375        }
       376      })
       377
       378 -    // Generate Claude.md file
       378 +    // Generate Claude.md file (legacy - static generation)
       379      ipcMain.handle('state:generateClaudeMd', async (event, options) => {
       380        try {
       381          const result = await puffinState.writeClaudeMd(options)
     ...
       384          return { success: false, error: error.message }
       385        }
       386      })
       387 +
       388 +    // Activate a branch - swaps CLAUDE.md to branch-specific content
       389 +    ipcMain.handle('state:activateBranch', async (event, branchId) => {
       390 +      try {
       391 +        const state = puffinState.getState()
       392 +        await claudeMdGenerator.activateBranch(branchId)
       393 +        return { success: true, branchId }
       394 +      } catch (error) {
       395 +        return { success: false, error: error.message }
       396 +      }
       397 +    })
       398    }
       399
       400    /**

● Now I need to expose this in the preload.js and call it from state-persistence.js when branches switch:

● Read(src/main/preload.js)
  ⎿  Read 60 lines

● Update(src/main/preload.js)
  ⎿  Updated src/main/preload.js with 5 additions and 2 removals
       82        // Export UI guidelines
       83        exportUiGuidelines: (options) => ipcRenderer.invoke('state:exportUiGuidelines', options),
       84
       85 -      // Generate Claude.md file
       86 -      generateClaudeMd: (options) => ipcRenderer.invoke('state:generateClaudeMd', options)
       85 +      // Generate Claude.md file (legacy)
       86 +      generateClaudeMd: (options) => ipcRenderer.invoke('state:generateClaudeMd', options),
       87 +
       88 +      // Activate branch - swaps CLAUDE.md to branch-specific content
       89 +      activateBranch: (branchId) => ipcRenderer.invoke('state:activateBranch', branchId)
       90      },
       91
       92      /**

● Now let me update state-persistence.js to call activateBranch when switching branches:

● Update(src/renderer/lib/state-persistence.js)
  ⎿  Updated src/renderer/lib/state-persistence.js with 7 additions
       77            await window.puffin.state.updateHistory(state.history.raw)
       78            console.log('[PERSIST-DEBUG] History persisted successfully')
       79
       80 +          // When switching branches, activate the branch-specific CLAUDE.md
       81 +          if (normalizedType === 'SELECT_BRANCH') {
       82 +            const activeBranch = state.history.activeBranch
       83 +            console.log('[PERSIST-DEBUG] Activating CLAUDE.md for branch:', activeBranch)
       84 +            await window.puffin.state.activateBranch(activeBranch)
       85 +          }
       86 +
       87            // NOTE: Auto-extraction of user stories is disabled.
       88            // Use the explicit "Derive User Stories" checkbox instead, which provides
       89            // better control and a review modal before adding stories.

● All tasks are complete. Let me provide a summary of what was implemented:

  ---
  Summary: Dynamic CLAUDE.md Generation

  What Was Built

  New file: src/main/claude-md-generator.js

  A generator class that creates and manages branch-specific CLAUDE.md files in the target project:

  target-project/.claude/
  ├── CLAUDE.md            ← Active file (base + current branch)
  ├── CLAUDE_base.md       ← Shared: project, assumptions, preferences, active stories
  ├── CLAUDE_specifications.md
  ├── CLAUDE_architecture.md  ← Includes architecture.md content
  ├── CLAUDE_ui.md            ← Includes design tokens, component patterns, guidelines
  ├── CLAUDE_backend.md       ← Includes data model extracted from architecture
  └── CLAUDE_deployment.md

  Regeneration Triggers

  | Event                            | What Regenerates                                        |
  |----------------------------------|---------------------------------------------------------|
  | Project opened                   | All files generated                                     |
  | Config updated                   | Base + active CLAUDE.md                                 |
  | Architecture updated             | Architecture branch + Backend branch + active CLAUDE.md |
  | User story added/updated/deleted | Base + active CLAUDE.md                                 |
  | UI guidelines changed            | UI branch + active CLAUDE.md (if on UI)                 |
  | Design tokens changed            | UI branch + active CLAUDE.md (if on UI)                 |
  | Component pattern changed        | UI branch + active CLAUDE.md (if on UI)                 |
  | Branch switched                  | Active CLAUDE.md swapped to new branch                  |

  What Claude Code Sees

  When you switch to the UI branch, CLAUDE.md contains:

  # Project Context
  (project description, assumptions, coding preferences, active user stories)

  ---

  ## Branch Focus: UI/UX
  You are working on the **UI/UX thread**. Focus on:
  - User interface implementation
  - Component design and structure
  ...

  ### Color Tokens
  | Token | Value | Usage |
  |-------|-------|-------|
  | `--color-primary` | `#6c63ff` | Main brand color |
  ...

  ### Component Patterns
  #### Primary Button
  **Guidelines:** Use for primary actions...
  **HTML Template:** ...
  **CSS:** ...

  When you switch to Backend branch, the same CLAUDE.md now contains backend-specific context instead.

  Files Modified

  1. src/main/claude-md-generator.js - New file
  2. src/main/ipc-handlers.js - Added generator integration, regeneration triggers
  3. src/main/preload.js - Exposed activateBranch API
  4. src/renderer/lib/state-persistence.js - Calls activateBranch on branch switch

  This means Claude Code now automatically receives branch-appropriate context through the standard .claude/CLAUDE.md mechanism, without Puffin needing to stuff it all into
  prompts.
