/**
 * State Persistence Manager
 *
 * Handles persisting state changes to the .puffin/ directory.
 * Extracted from app.js for better separation of concerns.
 */

export class StatePersistence {
  constructor(getState, intents, showToast) {
    this.getState = getState
    this.intents = intents
    this.showToast = showToast
  }

  /**
   * Persist state changes based on action type
   * @param {string} actionType - The action that triggered the persist
   */
  async persist(actionType) {
    if (!window.puffin) {
      console.log('Persist skipped: no window.puffin')
      return
    }

    const state = this.getState()

    // Normalize action type
    const normalizedType = actionType?.toUpperCase?.() || actionType

    // Only persist for certain action types
    const persistActions = [
      'UPDATE_CONFIG', 'UPDATE_OPTIONS',
      'SUBMIT_PROMPT', 'COMPLETE_RESPONSE',
      'SELECT_BRANCH', 'CREATE_BRANCH', 'DELETE_BRANCH',
      'UPDATE_ARCHITECTURE',
      'ADD_GUI_ELEMENT', 'UPDATE_GUI_ELEMENT', 'DELETE_GUI_ELEMENT',
      'MOVE_GUI_ELEMENT', 'RESIZE_GUI_ELEMENT', 'CLEAR_GUI_CANVAS',
      'ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY',
      'ADD_STORIES_TO_BACKLOG', 'START_STORY_IMPLEMENTATION',
      // Story generation tracking
      'RECEIVE_DERIVED_STORIES', 'CREATE_STORY_GENERATION', 'UPDATE_GENERATED_STORY_FEEDBACK',
      'FINALIZE_STORY_GENERATION', 'CREATE_IMPLEMENTATION_JOURNEY',
      'ADD_IMPLEMENTATION_INPUT', 'UPDATE_IMPLEMENTATION_JOURNEY',
      'COMPLETE_IMPLEMENTATION_JOURNEY',
      // Story feedback actions (trigger generation tracking persistence)
      'MARK_STORY_READY', 'UNMARK_STORY_READY', 'UPDATE_DERIVED_STORY', 'DELETE_DERIVED_STORY',
      // Thread completion (triggers journey completion)
      'MARK_THREAD_COMPLETE', 'UNMARK_THREAD_COMPLETE'
    ]

    if (!persistActions.includes(normalizedType)) {
      console.log('[PERSIST-DEBUG] Skipping persist for action:', actionType, '(normalized:', normalizedType, ')')
      return
    }

    try {
      // Persist based on what changed
      if (['UPDATE_CONFIG', 'UPDATE_OPTIONS'].includes(normalizedType)) {
        console.log('Persisting config:', state.config)
        const result = await window.puffin.state.updateConfig(state.config)
        console.log('Config persist result:', result)
      }

      if (['SUBMIT_PROMPT', 'COMPLETE_RESPONSE', 'SELECT_BRANCH', 'CREATE_BRANCH', 'DELETE_BRANCH'].includes(normalizedType)) {
        console.log('[PERSIST-DEBUG] Action:', normalizedType)

        // For COMPLETE_RESPONSE, verify the response is in the history before persisting
        if (normalizedType === 'COMPLETE_RESPONSE') {
          const activePrompt = state.history.selectedPrompt
          console.log('[PERSIST-DEBUG] selectedPrompt.id:', activePrompt?.id)
          console.log('[PERSIST-DEBUG] selectedPrompt.response:', activePrompt?.response ? 'EXISTS' : 'NULL')

          // Also check directly in raw history
          const activeBranch = state.history.activeBranch
          const branchData = state.history.raw?.branches?.[activeBranch]
          if (branchData) {
            const lastPrompt = branchData.prompts[branchData.prompts.length - 1]
            console.log('[PERSIST-DEBUG] Last prompt in branch:', lastPrompt?.id)
            console.log('[PERSIST-DEBUG] Last prompt response:', lastPrompt?.response ? 'EXISTS' : 'NULL')
            if (lastPrompt?.response) {
              console.log('[PERSIST-DEBUG] Last prompt response content length:', lastPrompt.response.content?.length || 0)
            }
          }
        }

        await window.puffin.state.updateHistory(state.history.raw)
        console.log('[PERSIST-DEBUG] History persisted successfully')

        // If COMPLETE_RESPONSE, also persist any updated implementation journeys (turn count)
        if (normalizedType === 'COMPLETE_RESPONSE' && state.storyGenerations?.implementation_journeys) {
          const journeys = state.storyGenerations.implementation_journeys
          // Persist pending journeys that may have been updated
          for (const journey of journeys.filter(j => j.status === 'pending')) {
            try {
              await window.puffin.state.updateImplementationJourney(journey.id, journey)
            } catch (e) {
              // Journey might not exist yet, which is fine
              console.log('[PERSIST-DEBUG] Journey update skipped:', journey.id)
            }
          }
        }

        // When switching branches, activate the branch-specific CLAUDE.md
        if (normalizedType === 'SELECT_BRANCH') {
          const activeBranch = state.history.activeBranch
          console.log('[PERSIST-DEBUG] Activating CLAUDE.md for branch:', activeBranch)
          await window.puffin.state.activateBranch(activeBranch)
        }

        // NOTE: Auto-extraction of user stories is disabled.
        // Use the explicit "Derive User Stories" checkbox instead, which provides
        // better control and a review modal before adding stories.
        // The old auto-extraction was creating too many false positives.
      }

      if (normalizedType === 'UPDATE_ARCHITECTURE') {
        await window.puffin.state.updateArchitecture(state.architecture.content)
      }

      // Persist individual user story updates (status changes, edits)
      if (['ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY'].includes(normalizedType)) {
        // Persist all user stories
        for (const story of state.userStories) {
          try {
            await window.puffin.state.updateUserStory(story.id, story)
          } catch (e) {
            // Story might not exist yet, try adding it
            try {
              await window.puffin.state.addUserStory(story)
            } catch (e2) {
              console.error('Failed to persist story:', story.id, e2)
            }
          }
        }
        console.log('[PERSIST-DEBUG] User stories persisted')
      }

      // Persist user stories and history when adding to backlog from derivation
      if (normalizedType === 'ADD_STORIES_TO_BACKLOG') {
        // Persist history (we added a prompt entry)
        await window.puffin.state.updateHistory(state.history.raw)

        // The stories have been added to state.userStories via the acceptor
        for (const story of state.userStories) {
          try {
            await window.puffin.state.addUserStory(story)
          } catch (e) {
            // Story might already exist, update instead
            await window.puffin.state.updateUserStory(story.id, story)
          }
        }
      }

      // Handle start story implementation - persist and submit to Claude
      if (normalizedType === 'START_STORY_IMPLEMENTATION') {
        // Persist updated user stories (status changed to in-progress)
        for (const story of state.userStories) {
          try {
            await window.puffin.state.updateUserStory(story.id, story)
          } catch (e) {
            console.error('Failed to update story:', story.id, e)
          }
        }

        // Persist history (we added a prompt entry)
        await window.puffin.state.updateHistory(state.history.raw)

        // Check if there's a pending implementation to submit
        const pendingImpl = state._pendingImplementation
        if (pendingImpl) {
          console.log('[IMPLEMENT] Submitting implementation prompt to Claude on branch:', pendingImpl.branchId)

          // Get session ID from last successful prompt in the target branch
          const targetBranch = state.history.raw?.branches?.[pendingImpl.branchId]
          const lastPromptWithResponse = targetBranch?.prompts
            ?.filter(p => p.response?.sessionId && p.response?.content !== 'Prompt is too long')
            ?.pop()
          const sessionId = lastPromptWithResponse?.response?.sessionId || null

          // Submit to Claude
          await window.puffin.claude.submit({
            prompt: pendingImpl.promptContent,
            branchId: pendingImpl.branchId,
            sessionId,
            project: state.config ? {
              name: state.config.name,
              description: state.config.description
            } : null
          })
        }
      }

      // Story Generation Tracking persistence
      const storyGenActions = [
        'RECEIVE_DERIVED_STORIES', 'CREATE_STORY_GENERATION', 'UPDATE_GENERATED_STORY_FEEDBACK',
        'FINALIZE_STORY_GENERATION', 'CREATE_IMPLEMENTATION_JOURNEY',
        'ADD_IMPLEMENTATION_INPUT', 'UPDATE_IMPLEMENTATION_JOURNEY',
        'COMPLETE_IMPLEMENTATION_JOURNEY',
        'START_STORY_IMPLEMENTATION', // Creates implementation journeys
        'MARK_THREAD_COMPLETE', 'UNMARK_THREAD_COMPLETE' // Updates journey status
      ]
      if (storyGenActions.includes(normalizedType)) {
        // Persist the entire story generations state
        const generations = state.storyGenerations
        if (generations) {
          // For individual updates, use specific IPC methods
          if (normalizedType === 'RECEIVE_DERIVED_STORIES' || normalizedType === 'CREATE_STORY_GENERATION') {
            // Save the newly created generation
            const latestGen = generations.generations[generations.generations.length - 1]
            if (latestGen) {
              await window.puffin.state.addStoryGeneration(latestGen)
            }
          } else if (normalizedType === 'UPDATE_GENERATED_STORY_FEEDBACK') {
            const currentGenId = generations.currentGenerationId
            const currentGen = generations.generations.find(g => g.id === currentGenId)
            if (currentGen) {
              await window.puffin.state.updateStoryGeneration(currentGenId, currentGen)
            }
          } else if (normalizedType === 'FINALIZE_STORY_GENERATION') {
            const currentGenId = generations.currentGenerationId
            const currentGen = generations.generations.find(g => g.id === currentGenId)
            if (currentGen) {
              await window.puffin.state.updateStoryGeneration(currentGenId, currentGen)
            }
          } else if (normalizedType === 'CREATE_IMPLEMENTATION_JOURNEY') {
            const latestJourney = generations.implementation_journeys[generations.implementation_journeys.length - 1]
            if (latestJourney) {
              await window.puffin.state.addImplementationJourney(latestJourney)
            }
          } else if (normalizedType === 'START_STORY_IMPLEMENTATION') {
            // Persist all newly created journeys (one per story being implemented)
            const journeys = generations.implementation_journeys
            // Get journeys created in this action (status: pending, recently created)
            const recentJourneys = journeys.filter(j => j.status === 'pending' && !j.completed_at)
            for (const journey of recentJourneys) {
              try {
                await window.puffin.state.addImplementationJourney(journey)
              } catch (e) {
                // Journey might already exist, try updating
                await window.puffin.state.updateImplementationJourney(journey.id, journey)
              }
            }
          } else if (['MARK_THREAD_COMPLETE', 'UNMARK_THREAD_COMPLETE'].includes(normalizedType)) {
            // Persist updated journeys (status changed to success/partial/failed or back to pending)
            const journeys = generations.implementation_journeys
            for (const journey of journeys) {
              try {
                await window.puffin.state.updateImplementationJourney(journey.id, journey)
              } catch (e) {
                console.error('Failed to persist journey:', journey.id, e)
              }
            }
          } else if (['ADD_IMPLEMENTATION_INPUT', 'UPDATE_IMPLEMENTATION_JOURNEY', 'COMPLETE_IMPLEMENTATION_JOURNEY'].includes(normalizedType)) {
            // Find the most recently updated journey and persist it
            const journeys = generations.implementation_journeys
            if (journeys.length > 0) {
              const latestJourney = journeys[journeys.length - 1]
              await window.puffin.state.updateImplementationJourney(latestJourney.id, latestJourney)
            }
          }
          console.log('[PERSIST-DEBUG] Story generation tracking persisted for action:', normalizedType)
        }
      }

      console.log('[PERSIST-DEBUG] State persisted for action:', normalizedType)
    } catch (error) {
      console.error('Failed to persist state:', error)
    }
  }

  /**
   * Extract user stories from specifications response
   * @param {Object} state - Current app state
   */
  async extractUserStoriesFromResponse(state) {
    try {
      const specBranch = state.history.raw.branches.specifications
      if (!specBranch || !specBranch.prompts.length) return

      // Get the most recent prompt with a response
      const recentPrompt = [...specBranch.prompts].reverse().find(p => p.response)
      if (!recentPrompt || !recentPrompt.response?.content) return

      const content = recentPrompt.content + '\n' + recentPrompt.response.content
      const extractedStories = this.parseUserStories(content)

      if (extractedStories.length === 0) {
        console.log('No user stories found in specifications response')
        return
      }

      // Add each extracted story
      for (const story of extractedStories) {
        // Check if a similar story already exists (by title)
        const exists = state.userStories?.some(
          s => s.title.toLowerCase() === story.title.toLowerCase()
        )

        if (!exists) {
          await window.puffin.state.addUserStory({
            ...story,
            sourcePromptId: recentPrompt.id
          })
          console.log('Auto-extracted user story:', story.title)
        }
      }

      // Reload user stories to update state
      const result = await window.puffin.state.getUserStories()
      if (result.success) {
        this.intents.loadUserStories(result.stories)
      }

      if (extractedStories.length > 0) {
        this.showToast(`Extracted ${extractedStories.length} user ${extractedStories.length === 1 ? 'story' : 'stories'} from specifications`, 'success')
      }
    } catch (error) {
      console.error('Failed to extract user stories:', error)
    }
  }

  /**
   * Parse user stories from text content
   * @param {string} content - Text content to parse
   * @returns {Array} Extracted user stories
   */
  parseUserStories(content) {
    const stories = []

    // Pattern 1: "As a [user], I want [action] so that [benefit]"
    const asAUserPattern = /as an? ([^,]+),?\s+i want\s+(.+?)\s+so that\s+(.+?)(?:\.|$)/gi
    let match
    while ((match = asAUserPattern.exec(content)) !== null) {
      const [, user, action, benefit] = match
      stories.push({
        title: `${action.trim()}`.substring(0, 100),
        description: `As a ${user.trim()}, I want ${action.trim()} so that ${benefit.trim()}.`,
        acceptanceCriteria: [],
        status: 'pending'
      })
    }

    // Pattern 2: "User Story:" or "Story:" headers
    const storyHeaderPattern = /(?:user\s+)?story[:\s]+([^\n]+)/gi
    while ((match = storyHeaderPattern.exec(content)) !== null) {
      const title = match[1].trim()
      if (title.length > 5 && !stories.some(s => s.title === title)) {
        stories.push({
          title: title.substring(0, 100),
          description: '',
          acceptanceCriteria: [],
          status: 'pending'
        })
      }
    }

    // Pattern 3: Feature descriptions with "should" or "must"
    const featurePattern = /(?:the\s+)?(?:system|app|application|user)\s+(?:should|must|can|will)\s+(?:be able to\s+)?([^.]{15,100})/gi
    while ((match = featurePattern.exec(content)) !== null) {
      const feature = match[1].trim()
      const title = feature.charAt(0).toUpperCase() + feature.slice(1)
      if (!stories.some(s => s.title.toLowerCase() === title.toLowerCase())) {
        stories.push({
          title: title.substring(0, 100),
          description: `The system should ${feature}.`,
          acceptanceCriteria: [],
          status: 'pending'
        })
      }
    }

    // Limit to avoid creating too many stories at once
    return stories.slice(0, 10)
  }
}
