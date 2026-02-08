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
            // Tool started — only pass minimal input to avoid storing large content in SAM model.
            // We only need enough to extract the file path when the tool completes.
            const liteInput = block.input ? this.extractMinimalInput(block.name, block.input) : null
            console.log('[ACTIVITY-DEBUG] Tool start:', block.name, 'id:', block.id)
            this.intents.toolStart(block.id, block.name, liteInput)
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
   * Extract only the fields needed from tool input to keep SAM model lightweight.
   * Full tool inputs (especially Write/Edit content) can be very large.
   * @param {string} toolName - Name of the tool
   * @param {Object} input - Full tool input object
   * @returns {Object|null} Minimal input with only path-related fields
   */
  extractMinimalInput(toolName, input) {
    if (!input) return null
    const result = {}
    // Only keep path-like fields needed by extractFilePath
    if (input.file_path) result.file_path = input.file_path
    if (input.path) result.path = input.path
    // Keep tool name for display (small string)
    if (input.command && toolName === 'Bash') {
      result.command = typeof input.command === 'string' && input.command.length > 200
        ? input.command.slice(0, 200) + '...'
        : input.command
    }
    return Object.keys(result).length > 0 ? result : null
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
