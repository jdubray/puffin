/**
 * State Persistence Manager
 *
 * Handles persisting state changes to the .puffin/ directory.
 * Extracted from app.js for better separation of concerns.
 *
 * NOTE: Puffin is a documentation manager. Sprint, orchestration,
 * inspection-assertion, and story-derivation persistence have been removed.
 * This module now persists only plain user stories (the Kanban board),
 * branch/workspace state, prompts, and history.
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
      'ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY',
      'ADD_STORIES_TO_BACKLOG'
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

        // NOTE: Auto-extraction of user stories is disabled.
        // Use the explicit "Derive User Stories" checkbox instead, which provides
        // better control and a review modal before adding stories.
        // The old auto-extraction was creating too many false positives.
      }

      // Persist individual user story updates (status changes, edits)
      if (['ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY'].includes(normalizedType)) {
        console.log('[PERSIST-DEBUG] persist() called with action type:', normalizedType, 'payload:', action.payload)
        // Safety check: don't persist ADD/UPDATE if stories array is empty (prevents accidental wipe).
        // DELETE is exempt — deleting the last story legitimately leaves the array empty.
        if ((!state.userStories || state.userStories.length === 0) && normalizedType !== 'DELETE_USER_STORY') {
          console.warn('[PERSIST-DEBUG] Skipping user story persist: stories array is empty')
        } else {
          // Only persist the specific story that changed, not all stories.
          // NOTE: action comes from lastAction (set in wrapIntentsForDebugging) which has
          // { type, args: [storyId, updates] } format, NOT SAM's { type, payload } format.
          // We must extract IDs from action.args as fallback.
          const storyId = action.payload?.id || action.args?.[0] || state._lastUpdatedStoryId
          if (storyId && normalizedType === 'UPDATE_USER_STORY') {
            try {
              // Extract updates from action.args[1] (the second arg to updateUserStory(id, updates))
              // or fall back to action.payload if available.
              const updates = action.payload || action.args?.[1] || {}
              if (updates.id === undefined) updates.id = storyId
              await window.puffin.state.updateUserStory(storyId, updates)
              console.log('[PERSIST-DEBUG] User story updated:', storyId, 'status:', updates.status || '(unchanged)')
            } catch (e) {
              console.error('Failed to persist story:', storyId, e)
            }
          } else if (normalizedType === 'ADD_USER_STORY') {
            // For new stories, find and add the most recently created one
            const newestStory = state.userStories[state.userStories.length - 1]
            if (newestStory) {
              try {
                const result = await window.puffin.state.addUserStory(newestStory)
                console.log('[PERSIST-DEBUG] User story added:', newestStory.id, 'result:', result)
              } catch (e) {
                // Story might already exist, try updating
                await window.puffin.state.updateUserStory(newestStory.id, newestStory)
              }
            }
          } else if (normalizedType === 'DELETE_USER_STORY') {
            // Get story ID from action.args[0] (lastAction format) or action.payload.id (SAM format)
            const deleteStoryId = action.payload?.id || action.args?.[0]
            console.log('[PERSIST-DEBUG] DELETE_USER_STORY persist triggered, storyId:', deleteStoryId, 'action.args:', action.args, 'action.payload:', action.payload)
            if (deleteStoryId) {
              try {
                const result = await window.puffin.state.deleteUserStory(deleteStoryId)
                console.log('[PERSIST-DEBUG] User story deleted:', deleteStoryId, 'result:', result)
              } catch (e) {
                console.error('[PERSIST-DEBUG] Failed to delete user story:', deleteStoryId, e)
              }
            } else {
              console.warn('[PERSIST-DEBUG] DELETE_USER_STORY missing story ID in payload, action:', JSON.stringify(action))
            }
          }
        }
      }

      // Persist user stories and history when adding to backlog
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
