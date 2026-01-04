/**
 * State Persistence Manager
 *
 * Handles persisting state changes to the .puffin/ directory.
 * Extracted from app.js for better separation of concerns.
 */

/**
 * Trigger inspection assertion evaluation for a completed story
 * @param {string} storyId - The story ID to evaluate
 * @returns {Promise<Object>} Evaluation results
 */
async function triggerAssertionEvaluation(storyId) {
  if (!window.puffin?.state?.evaluateStoryAssertions) {
    console.log('[ASSERTION] Evaluation API not available')
    return null
  }

  console.log('[ASSERTION] Triggering evaluation for story:', storyId)

  try {
    const result = await window.puffin.state.evaluateStoryAssertions(storyId)

    if (result.success) {
      const { summary } = result.results
      console.log('[ASSERTION] Evaluation complete:', {
        storyId,
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        error: summary.error
      })

      // Log a summary for the user
      if (summary.total === 0) {
        console.log('[ASSERTION] No assertions defined for this story')
      } else if (summary.failed === 0 && summary.error === 0) {
        console.log('[ASSERTION] All assertions passed!')
      } else {
        console.warn('[ASSERTION] Some assertions failed or errored:', {
          failed: summary.failed,
          error: summary.error
        })
      }

      return result.results
    } else {
      console.error('[ASSERTION] Evaluation failed:', result.error)
      return null
    }
  } catch (e) {
    console.error('[ASSERTION] Evaluation error:', e)
    throw e
  }
}

export class StatePersistence {
  constructor(getState, intents, showToast) {
    this.getState = getState
    this.intents = intents
    this.showToast = showToast
  }

  /**
   * Persist state changes based on action type
   * @param {string} actionType - The action that triggered the persist
   * @param {Object} action - The full action object with payload
   */
  async persist(actionType, action = {}) {
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
      'SELECT_BRANCH', 'SELECT_PROMPT', 'CREATE_BRANCH', 'DELETE_BRANCH', 'REORDER_BRANCHES',
      'UPDATE_BRANCH_SETTINGS',
      'ADD_GUI_ELEMENT', 'UPDATE_GUI_ELEMENT', 'DELETE_GUI_ELEMENT',
      'MOVE_GUI_ELEMENT', 'RESIZE_GUI_ELEMENT', 'CLEAR_GUI_CANVAS',
      'ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY',
      'ADD_STORIES_TO_BACKLOG',
      // Sprint actions
      'CREATE_SPRINT', 'START_SPRINT_PLANNING', 'APPROVE_PLAN', 'SET_SPRINT_PLAN',
      'CLEAR_SPRINT', 'CLEAR_SPRINT_WITH_DETAILS',
      'START_SPRINT_STORY_IMPLEMENTATION', 'UPDATE_SPRINT_STORY_STATUS',
      'TOGGLE_CRITERIA_COMPLETION', 'COMPLETE_STORY_BRANCH',
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

      if (['SUBMIT_PROMPT', 'COMPLETE_RESPONSE', 'SELECT_BRANCH', 'SELECT_PROMPT', 'CREATE_BRANCH', 'DELETE_BRANCH', 'REORDER_BRANCHES', 'UPDATE_BRANCH_SETTINGS'].includes(normalizedType)) {
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
        // This includes explicit branch selection AND sprint implementation which changes branch
        if (normalizedType === 'SELECT_BRANCH' || normalizedType === 'START_SPRINT_STORY_IMPLEMENTATION') {
          const activeBranch = state.history.activeBranch
          console.log('[PERSIST-DEBUG] Activating CLAUDE.md for branch:', activeBranch)
          await window.puffin.state.activateBranch(activeBranch)
        }

        // NOTE: Auto-extraction of user stories is disabled.
        // Use the explicit "Derive User Stories" checkbox instead, which provides
        // better control and a review modal before adding stories.
        // The old auto-extraction was creating too many false positives.
      }

      // Persist individual user story updates (status changes, edits)
      if (['ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY'].includes(normalizedType)) {
        // Safety check: don't persist if stories array is empty (prevents accidental wipe)
        if (!state.userStories || state.userStories.length === 0) {
          console.warn('[PERSIST-DEBUG] Skipping user story persist: stories array is empty')
        } else {
          // Only persist the specific story that changed, not all stories
          const storyId = state._lastUpdatedStoryId
          if (storyId && normalizedType === 'UPDATE_USER_STORY') {
            const story = state.userStories.find(s => s.id === storyId)
            if (story) {
              try {
                await window.puffin.state.updateUserStory(story.id, story)
                console.log('[PERSIST-DEBUG] User story updated:', story.id)
              } catch (e) {
                console.error('Failed to persist story:', story.id, e)
              }
            }
          } else if (normalizedType === 'ADD_USER_STORY') {
            // For new stories, find and add the most recently created one
            const newestStory = state.userStories[state.userStories.length - 1]
            if (newestStory) {
              try {
                await window.puffin.state.addUserStory(newestStory)
                console.log('[PERSIST-DEBUG] User story added:', newestStory.id)
              } catch (e) {
                // Story might already exist, try updating
                await window.puffin.state.updateUserStory(newestStory.id, newestStory)
              }
            }
          } else if (normalizedType === 'DELETE_USER_STORY') {
            // Delete is handled by the IPC call directly, just log
            console.log('[PERSIST-DEBUG] User story deleted')
          }
        }
      }

      // Persist sprint state changes (including criteria progress and story status)
      if (['CREATE_SPRINT', 'START_SPRINT_PLANNING', 'APPROVE_PLAN', 'SET_SPRINT_PLAN',
           'CLEAR_SPRINT', 'CLEAR_SPRINT_WITH_DETAILS',
           'UPDATE_SPRINT_STORY_STATUS', 'TOGGLE_CRITERIA_COMPLETION', 'COMPLETE_STORY_BRANCH'].includes(normalizedType)) {
        console.log('[PERSIST-DEBUG] Persisting sprint state for action:', normalizedType)

        // For UPDATE_SPRINT_STORY_STATUS: use atomic sync to update both sprint and backlog
        // This ensures status is always consistent between views with no manual refresh needed
        if (normalizedType === 'UPDATE_SPRINT_STORY_STATUS') {
          const { storyId, status } = action.payload || {}
          if (storyId && status) {
            try {
              const syncResult = await window.puffin.state.syncStoryStatus(storyId, status)
              if (syncResult.success) {
                console.log('[PERSIST-DEBUG] Atomic status sync completed:', storyId, '->', status)
                // The event listener will handle UI refresh automatically

                // Trigger assertion evaluation when story is marked complete
                if (status === 'completed') {
                  triggerAssertionEvaluation(storyId).catch(e => {
                    console.error('[PERSIST-DEBUG] Assertion evaluation failed:', storyId, e)
                  })
                }
              } else {
                console.error('[PERSIST-DEBUG] Atomic status sync failed:', syncResult.error)
                // Fallback to separate updates if atomic fails
                await window.puffin.state.updateActiveSprint(state.activeSprint)
              }
            } catch (e) {
              console.error('[PERSIST-DEBUG] Atomic status sync error:', e)
              // Fallback to separate updates
              await window.puffin.state.updateActiveSprint(state.activeSprint)
            }
          } else {
            // No payload, just update sprint
            await window.puffin.state.updateActiveSprint(state.activeSprint)
          }
        }
        // For TOGGLE_CRITERIA_COMPLETION: use atomic sync when story becomes complete
        else if (normalizedType === 'TOGGLE_CRITERIA_COMPLETION') {
          const { storyId } = action.payload || {}
          const storyProgress = state.activeSprint?.storyProgress?.[storyId]

          // First update the sprint
          await window.puffin.state.updateActiveSprint(state.activeSprint)

          // Then atomically sync if story is now complete or was uncompleted
          if (storyId && storyProgress) {
            const status = storyProgress.status === 'completed' ? 'completed' : 'in-progress'
            try {
              const syncResult = await window.puffin.state.syncStoryStatus(storyId, status)
              if (syncResult.success) {
                console.log('[PERSIST-DEBUG] Atomic criteria sync completed:', storyId, '->', status)

                // Trigger assertion evaluation when story auto-completes from criteria
                if (status === 'completed') {
                  triggerAssertionEvaluation(storyId).catch(e => {
                    console.error('[PERSIST-DEBUG] Assertion evaluation failed:', storyId, e)
                  })
                }
              }
            } catch (e) {
              // Fallback: update story separately
              const story = state.userStories?.find(s => s.id === storyId)
              if (story) {
                await window.puffin.state.updateUserStory(storyId, story)
                console.log('[PERSIST-DEBUG] Fallback story sync after criteria toggle:', storyId, story.status)
              }
            }
          }
        }
        // For other sprint actions, use regular update
        else {
          console.log('[PERSIST-DEBUG] Calling updateActiveSprint for action:', normalizedType, 'sprint:', state.activeSprint?.id, 'stories:', state.activeSprint?.stories?.length)
          await window.puffin.state.updateActiveSprint(state.activeSprint)
          console.log('[PERSIST-DEBUG] updateActiveSprint completed for action:', normalizedType)
        }

        // For COMPLETE_STORY_BRANCH: use atomic sync for completed stories
        if (normalizedType === 'COMPLETE_STORY_BRANCH' && state.activeSprint?.storyProgress) {
          for (const [storyId, progress] of Object.entries(state.activeSprint.storyProgress)) {
            if (progress?.status === 'completed') {
              try {
                const syncResult = await window.puffin.state.syncStoryStatus(storyId, 'completed')
                if (syncResult.success) {
                  console.log('[PERSIST-DEBUG] Atomic branch completion sync:', storyId)
                }
              } catch (e) {
                // Fallback to separate update
                const story = state.userStories?.find(s => s.id === storyId)
                if (story && story.status === 'completed') {
                  await window.puffin.state.updateUserStory(storyId, story)
                  console.log('[PERSIST-DEBUG] Fallback persisted completed story:', storyId)
                }
              }
            }
          }
        }

        // For CLEAR_SPRINT or CLEAR_SPRINT_WITH_DETAILS: archive sprint and persist story status changes
        if (normalizedType === 'CLEAR_SPRINT' || normalizedType === 'CLEAR_SPRINT_WITH_DETAILS') {
          console.log('[PERSIST-DEBUG] CLEAR_SPRINT_WITH_DETAILS - state.userStories count:', state.userStories?.length || 0)
          console.log('[PERSIST-DEBUG] _completedStoryIdsToSync:', state._completedStoryIdsToSync)
          console.log('[PERSIST-DEBUG] _resetToPendingStoryIds:', state._resetToPendingStoryIds)

          // Archive the sprint to history BEFORE clearing
          if (state._sprintToArchive) {
            console.log('[PERSIST-DEBUG] Archiving sprint to history:', state._sprintToArchive.id)
            try {
              await window.puffin.state.archiveSprintToHistory(state._sprintToArchive)
              console.log('[PERSIST-DEBUG] Sprint archived successfully')

              // Refresh sprint history in the renderer from the main process
              const historyResult = await window.puffin.state.getSprintHistory()
              if (historyResult.success && historyResult.sprints) {
                this.intents.loadSprintHistory(historyResult.sprints)
                console.log('[PERSIST-DEBUG] Sprint history refreshed:', historyResult.sprints.length, 'sprints')
              }
            } catch (e) {
              console.error('[PERSIST-DEBUG] Failed to archive sprint:', e)
            }
          }

          // Persist completed stories directly (sprint already archived, can't use syncStoryStatus)
          // IMPORTANT: Only update status field to 'completed' - don't pass entire story object
          // to avoid any potential status corruption from stale data
          if (state._completedStoryIdsToSync?.length > 0) {
            console.log('[PERSIST-DEBUG] Persisting completed stories on sprint clear:', state._completedStoryIdsToSync)
            for (const storyId of state._completedStoryIdsToSync) {
              try {
                // Update only the status field to 'completed' - this is safe and explicit
                await window.puffin.state.updateUserStory(storyId, { status: 'completed' })
                console.log('[PERSIST-DEBUG] Updated story status to completed:', storyId)
              } catch (e) {
                console.error('[PERSIST-DEBUG] Failed to update story status:', storyId, e)
              }
            }
          }

          // Persist reset-to-pending stories
          // IMPORTANT: Only update status field to 'pending' - don't pass entire story object
          if (state._resetToPendingStoryIds?.length > 0) {
            console.log('[PERSIST-DEBUG] Resetting in-progress stories to pending:', state._resetToPendingStoryIds)
            for (const storyId of state._resetToPendingStoryIds) {
              try {
                // Update only the status field to 'pending' - this is safe and explicit
                await window.puffin.state.updateUserStory(storyId, { status: 'pending' })
                console.log('[PERSIST-DEBUG] Reset story status to pending:', storyId)
              } catch (e) {
                console.error('[PERSIST-DEBUG] Failed to reset story status:', storyId, e)
              }
            }
          }

          // Refresh user stories from disk to ensure UI is in sync
          // SAFETY: Only refresh if the result has stories - never wipe with empty array
          try {
            const storiesResult = await window.puffin.state.getUserStories()
            if (storiesResult.success && Array.isArray(storiesResult.stories)) {
              const currentStoryCount = state.userStories?.length || 0
              const newStoryCount = storiesResult.stories.length

              // CRITICAL SAFETY CHECK: Prevent data loss by refusing to load fewer stories
              // This protects against race conditions, file corruption, or timing issues
              if (newStoryCount === 0 && currentStoryCount > 0) {
                console.error('[PERSIST-DEBUG] SAFETY: Refusing to load empty stories array when', currentStoryCount, 'stories exist in memory')
                console.error('[PERSIST-DEBUG] This may indicate file corruption or a race condition - stories preserved')
              } else if (newStoryCount < currentStoryCount * 0.5 && currentStoryCount > 3) {
                // Significant loss (more than 50%) - log warning but still load (user might have deleted)
                console.warn('[PERSIST-DEBUG] WARNING: Story count dropping from', currentStoryCount, 'to', newStoryCount, '- potential data loss')
                this.intents.loadUserStories(storiesResult.stories)
                console.log('[PERSIST-DEBUG] User stories refreshed with warning:', newStoryCount, 'stories')
              } else {
                this.intents.loadUserStories(storiesResult.stories)
                console.log('[PERSIST-DEBUG] User stories refreshed:', newStoryCount, 'stories')
              }
            } else {
              console.warn('[PERSIST-DEBUG] getUserStories returned invalid data, keeping current stories')
            }
          } catch (e) {
            console.error('[PERSIST-DEBUG] Failed to refresh user stories:', e)
          }
        }
      }

      // Persist user stories and history when adding to backlog from derivation
      if (normalizedType === 'ADD_STORIES_TO_BACKLOG') {
        // Persist history (we added a prompt entry) - wrapped in try-catch so story persistence still runs
        try {
          await window.puffin.state.updateHistory(state.history.raw)
        } catch (historyError) {
          console.error('[PERSIST-DEBUG] History update failed, continuing with story persistence:', historyError)
        }

        // Get story IDs from action - check both payload format and args format
        // payload format: { type, payload: { storyIds } } - from action creators
        // args format: { type, args: [storyIds] } - from lastAction wrapper
        const newStoryIds = action.payload?.storyIds || action.args?.[0] || []
        console.log('[PERSIST-DEBUG] ADD_STORIES_TO_BACKLOG - storyIds:', newStoryIds, 'source:', action.payload?.storyIds ? 'payload' : action.args?.[0] ? 'args' : 'none')

        if (newStoryIds.length > 0) {
          const newStories = state.userStories.filter(s => newStoryIds.includes(s.id))
          console.log('[PERSIST-DEBUG] Found stories to persist:', newStories.length, 'of', newStoryIds.length, 'requested')
          console.log('[PERSIST-DEBUG] Total stories in state:', state.userStories.length)

          if (newStories.length === 0) {
            console.error('[PERSIST-DEBUG] CRITICAL: Stories not found in state.userStories!', {
              requestedIds: newStoryIds,
              availableIds: state.userStories.map(s => s.id)
            })
          }

          let persistedCount = 0
          for (const story of newStories) {
            try {
              const result = await window.puffin.state.addUserStory(story)
              console.log('[PERSIST-DEBUG] Added story to database:', story.id, story.title, 'result:', result)
              persistedCount++
            } catch (e) {
              console.error('[PERSIST-DEBUG] addUserStory failed:', e.message)
              // Story might already exist, update instead
              try {
                await window.puffin.state.updateUserStory(story.id, story)
                console.log('[PERSIST-DEBUG] Updated existing story:', story.id)
                persistedCount++
              } catch (e2) {
                console.error('[PERSIST-DEBUG] Failed to persist story:', story.id, e2)
              }
            }
          }
          console.log('[PERSIST-DEBUG] Successfully persisted', persistedCount, 'of', newStories.length, 'stories')
        } else {
          console.warn('[PERSIST-DEBUG] No storyIds in action payload - stories may not persist!')
        }
      }

      // Persist user story status changes when sprint is created (stories become in-progress)
      if (normalizedType === 'CREATE_SPRINT') {
        // Handle both proposal format (payload.stories) and lastAction format (args[0])
        const stories = action.payload?.stories || action.args?.[0] || []
        const sprintStoryIds = stories.map(s => s.id)
        console.log('[PERSIST-DEBUG] CREATE_SPRINT - syncing story statuses for:', sprintStoryIds.length, 'stories')

        for (const storyId of sprintStoryIds) {
          const story = state.userStories?.find(s => s.id === storyId)
          if (story) {
            try {
              await window.puffin.state.updateUserStory(storyId, story)
              console.log('[PERSIST-DEBUG] Synced story status to in-progress:', storyId, 'status:', story.status)
            } catch (e) {
              console.error('[PERSIST-DEBUG] Failed to sync story status:', storyId, e)
            }
          }
        }
      }

      // Persist user story status when manually updated in sprint
      if (normalizedType === 'UPDATE_SPRINT_STORY_STATUS') {
        const storyId = action.payload?.storyId || action.args?.[0]
        if (storyId) {
          const story = state.userStories?.find(s => s.id === storyId)
          if (story) {
            try {
              await window.puffin.state.updateUserStory(storyId, story)
              console.log('[PERSIST-DEBUG] Synced story status change:', storyId, story.status)
            } catch (e) {
              console.error('[PERSIST-DEBUG] Failed to sync story status:', storyId, e)
            }
          }
        }
      }

      // Handle sprint story implementation - persist sprint and submit to Claude
      if (normalizedType === 'START_SPRINT_STORY_IMPLEMENTATION') {
        // Persist sprint state (status changed to implementing)
        if (state.activeSprint) {
          await window.puffin.state.updateActiveSprint(state.activeSprint)
        }

        // Check if there's a pending story implementation from sprint
        const pendingSprintImpl = state._pendingStoryImplementation
        if (pendingSprintImpl) {
          // CRITICAL: Check if a CLI process is already running
          if (window.puffin?.claude?.isRunning) {
            const isRunning = await window.puffin.claude.isRunning()
            if (isRunning) {
              console.error('[SPRINT-IMPLEMENT] Cannot start implementation: CLI process already running')
              // Clear the pending flag to prevent retry loop
              if (this.intents?.clearPendingStoryImplementation) {
                this.intents.clearPendingStoryImplementation()
              }
              return
            }
          }

          console.log('[SPRINT-IMPLEMENT] Submitting implementation prompt to Claude on branch:', pendingSprintImpl.branchId)

          // Get session ID from last successful prompt in the target branch
          const targetBranch = state.history.raw?.branches?.[pendingSprintImpl.branchId]
          const lastPromptWithResponse = targetBranch?.prompts
            ?.filter(p => p.response?.sessionId && p.response?.content !== 'Prompt is too long')
            ?.pop()
          const sessionId = lastPromptWithResponse?.response?.sessionId || null

          // Note: Debug prompt is now captured via onFullPrompt callback from main process
          // This ensures we get the complete prompt with all context

          // Submit to Claude
          await window.puffin.claude.submit({
            prompt: pendingSprintImpl.promptContent,
            branchId: pendingSprintImpl.branchId,
            sessionId,
            maxTurns: 40, // Max turns per request
            project: state.config ? {
              name: state.config.name,
              description: state.config.description
            } : null
          })

          // Clear the pending implementation flag
          if (this.intents?.clearPendingStoryImplementation) {
            this.intents.clearPendingStoryImplementation()
          }
        }
      }

      // Story Generation Tracking persistence
      const storyGenActions = [
        'RECEIVE_DERIVED_STORIES', 'CREATE_STORY_GENERATION', 'UPDATE_GENERATED_STORY_FEEDBACK',
        'FINALIZE_STORY_GENERATION', 'CREATE_IMPLEMENTATION_JOURNEY',
        'ADD_IMPLEMENTATION_INPUT', 'UPDATE_IMPLEMENTATION_JOURNEY',
        'COMPLETE_IMPLEMENTATION_JOURNEY',
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
