/**
 * Activity Tracker
 *
 * Tracks Claude CLI tool execution for activity monitoring.
 * Extracted from app.js for better separation of concerns.
 */

export class ActivityTracker {
  constructor(intents, getState) {
    this.intents = intents
    this.getState = getState
  }

  /**
   * Process raw JSON message for activity tracking
   * @param {string} jsonLine - Raw JSON line from Claude CLI
   */
  processMessage(jsonLine) {
    try {
      const msg = JSON.parse(jsonLine)
      const state = this.getState()

      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            // Tool started
            console.log('[ACTIVITY-DEBUG] Tool start:', block.name, 'id:', block.id)
            console.log('[ACTIVITY-DEBUG] Tool input:', JSON.stringify(block.input)?.substring(0, 200))
            this.intents.toolStart(block.id, block.name, block.input)
          }
        }
      } else if (msg.type === 'user' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            // Tool completed
            const toolInfo = state?.activity?.activeTools?.find(t => t.id === block.tool_use_id)
            const filePath = toolInfo ? this.extractFilePath(toolInfo.name, toolInfo.input) : null
            const action = toolInfo?.name === 'Write' || toolInfo?.name === 'Edit' ? 'write' :
                          toolInfo?.name === 'Read' ? 'read' : null
            console.log('[ACTIVITY-DEBUG] Tool end:', toolInfo?.name, 'id:', block.tool_use_id, 'filePath:', filePath, 'action:', action)
            this.intents.toolEnd(block.tool_use_id, filePath, action)
          }
        }
      } else if (msg.type === 'result') {
        // Response complete - don't clear here, let completion handler do it
        console.log('[ACTIVITY-DEBUG] Result received, NOT clearing activity yet (filesModified count:', state?.activity?.filesModified?.length || 0, ')')
      }
    } catch (e) {
      // Not valid JSON, ignore
    }
  }

  /**
   * Extract file path from tool input
   * @param {string} toolName - Name of the tool
   * @param {Object} input - Tool input object
   * @returns {string|null} File path or null
   */
  extractFilePath(toolName, input) {
    if (!input) return null

    // Different tools have different input shapes
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      return input.file_path || input.path || null
    }
    if (toolName === 'Bash') {
      return null // Bash doesn't have a specific file path
    }
    if (toolName === 'Grep' || toolName === 'Glob') {
      return input.path || null
    }
    return null
  }

  /**
   * Get files modified from current state
   * @returns {Array} List of modified files
   */
  getFilesModified() {
    const state = this.getState()
    return state?.activity?.filesModified || []
  }
}
