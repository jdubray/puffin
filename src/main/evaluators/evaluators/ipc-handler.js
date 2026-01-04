/**
 * IPC_HANDLER_REGISTERED Assertion Evaluator
 *
 * Verifies that IPC handlers are registered in Electron main process.
 *
 * @module evaluators/ipc-handler
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for IPC_HANDLER_REGISTERED assertions
 */
class IpcHandlerEvaluator extends BaseEvaluator {
  /**
   * Evaluate an IPC_HANDLER_REGISTERED assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to file containing IPC handlers
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string[]} assertion.assertion.handlers - Expected handler channel names
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { handlers: expectedHandlers } = assertion.assertion || {}

    if (!expectedHandlers || !Array.isArray(expectedHandlers)) {
      return this.fail(
        'IPC_HANDLER_REGISTERED requires handlers array',
        { path: assertion.target }
      )
    }

    // Check file exists
    if (!(await this.fileExists(targetPath))) {
      return this.fail(
        `File does not exist: ${assertion.target}`,
        { path: assertion.target, exists: false }
      )
    }

    // Read file content
    let fileContent
    try {
      fileContent = await this.readFile(targetPath)
    } catch (error) {
      return this.fail(
        `Failed to read file: ${assertion.target}`,
        { path: assertion.target, error: error.message }
      )
    }

    // Parse IPC handlers from file
    const foundHandlers = this.parseIpcHandlers(fileContent)
    const missing = expectedHandlers.filter(h => !foundHandlers.includes(h))

    if (missing.length > 0) {
      return this.fail(
        `Missing IPC handlers in: ${assertion.target}`,
        {
          path: assertion.target,
          missing,
          foundHandlers
        }
      )
    }

    return this.pass(
      `All expected IPC handlers registered in: ${assertion.target}`,
      {
        path: assertion.target,
        handlers: expectedHandlers
      }
    )
  }

  /**
   * Parse IPC handler registrations from file content
   *
   * @param {string} content - File content
   * @returns {string[]} Array of handler channel names
   */
  parseIpcHandlers(content) {
    const handlers = []

    // ipcMain.handle('channel', ...)
    const handlePattern = /ipcMain\.handle\s*\(\s*['"`]([^'"`]+)['"`]/g
    let match

    while ((match = handlePattern.exec(content)) !== null) {
      if (!handlers.includes(match[1])) {
        handlers.push(match[1])
      }
    }

    // ipcMain.on('channel', ...)
    const onPattern = /ipcMain\.on\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((match = onPattern.exec(content)) !== null) {
      if (!handlers.includes(match[1])) {
        handlers.push(match[1])
      }
    }

    // ipcMain.once('channel', ...)
    const oncePattern = /ipcMain\.once\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((match = oncePattern.exec(content)) !== null) {
      if (!handlers.includes(match[1])) {
        handlers.push(match[1])
      }
    }

    // ipcMain.handleOnce('channel', ...)
    const handleOncePattern = /ipcMain\.handleOnce\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((match = handleOncePattern.exec(content)) !== null) {
      if (!handlers.includes(match[1])) {
        handlers.push(match[1])
      }
    }

    // Template literal handlers: ipcMain.handle(`channel${var}`, ...)
    // Extract the static prefix at least
    const templatePattern = /ipcMain\.(?:handle|on|once|handleOnce)\s*\(\s*`([^$`]+)/g
    while ((match = templatePattern.exec(content)) !== null) {
      const prefix = match[1]
      if (prefix && !handlers.some(h => h.startsWith(prefix))) {
        // Add as partial match indicator
        handlers.push(prefix + '*')
      }
    }

    return handlers
  }
}

module.exports = { IpcHandlerEvaluator }
