/**
 * SessionManager - Manages session persistence for document editor responses
 *
 * Sessions are stored as JSON files linked to specific documents.
 * Each document has its own session file identified by a hash of its path.
 *
 * Session File Structure:
 * {
 *   documentPath: "/path/to/file.md",
 *   documentHash: "sha256...",
 *   createdAt: "2026-01-17T10:00:00Z",
 *   updatedAt: "2026-01-17T10:23:00Z",
 *   responses: [
 *     {
 *       timestamp: "2026-01-17T10:23:00Z",
 *       prompt: "Add introduction section",
 *       summary: "- Added introduction paragraph\n- Reformatted header",
 *       questions: [],
 *       fullResponse: "...",
 *       diffStats: { added: 5, modified: 2, deleted: 0 }
 *     }
 *   ]
 * }
 */

export class SessionManager {
  /**
   * Create a SessionManager instance
   * @param {Object} options - Configuration options
   * @param {string} options.pluginName - Plugin name for IPC calls
   */
  constructor(options = {}) {
    this.pluginName = options.pluginName || 'document-editor-plugin'
    this.currentSession = null
    this.documentPath = null
    this.sessionLoaded = false
    this.maxResponses = 50 // Maximum responses to keep per session
  }

  /**
   * Generate a hash for a document path
   * Uses a simple hash for session file naming
   * @param {string} documentPath - Full path to document
   * @returns {string} Hash string
   */
  hashPath(documentPath) {
    if (!documentPath) return 'unknown'

    // Simple hash function for path (not cryptographic, just for naming)
    let hash = 0
    for (let i = 0; i < documentPath.length; i++) {
      const char = documentPath.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    // Convert to positive hex string
    return Math.abs(hash).toString(16).padStart(8, '0')
  }

  /**
   * Load session for a document
   * @param {string} documentPath - Full path to the document
   * @returns {Promise<Object>} Session data or new empty session
   */
  async loadSession(documentPath) {
    if (!documentPath) {
      console.warn('[SessionManager] No document path provided')
      return this.createEmptySession(documentPath)
    }

    this.documentPath = documentPath
    const sessionHash = this.hashPath(documentPath)

    try {
      const result = await window.puffin.plugins.invoke(
        this.pluginName,
        'loadSession',
        { documentPath, sessionHash }
      )

      if (result.error) {
        console.log('[SessionManager] No existing session found, creating new one')
        this.currentSession = this.createEmptySession(documentPath)
      } else {
        this.currentSession = result.session
        console.log(`[SessionManager] Loaded session with ${this.currentSession.responses?.length || 0} responses`)
      }

      this.sessionLoaded = true
      return this.currentSession
    } catch (error) {
      console.error('[SessionManager] Error loading session:', error)
      this.currentSession = this.createEmptySession(documentPath)
      this.sessionLoaded = true
      return this.currentSession
    }
  }

  /**
   * Create an empty session object
   * @param {string} documentPath - Document path
   * @returns {Object} Empty session object
   */
  createEmptySession(documentPath) {
    const now = new Date().toISOString()
    return {
      documentPath: documentPath || null,
      documentHash: this.hashPath(documentPath),
      createdAt: now,
      updatedAt: now,
      responses: []
    }
  }

  /**
   * Save current session to storage
   * @returns {Promise<boolean>} Success status
   */
  async saveSession() {
    if (!this.currentSession || !this.documentPath) {
      console.warn('[SessionManager] No session to save')
      return false
    }

    // Update timestamp
    this.currentSession.updatedAt = new Date().toISOString()

    try {
      const result = await window.puffin.plugins.invoke(
        this.pluginName,
        'saveSession',
        {
          documentPath: this.documentPath,
          sessionHash: this.currentSession.documentHash,
          session: this.currentSession
        }
      )

      if (result.error) {
        console.error('[SessionManager] Error saving session:', result.error)
        return false
      }

      console.log('[SessionManager] Session saved successfully')
      return true
    } catch (error) {
      console.error('[SessionManager] Error saving session:', error)
      return false
    }
  }

  /**
   * Add a response to the current session
   * @param {Object} responseData - Response data to add
   * @param {string} responseData.prompt - User's original prompt
   * @param {string} responseData.summary - Extracted change summary
   * @param {Array} responseData.questions - Extracted questions
   * @param {string} responseData.fullResponse - Full Claude response
   * @param {Object} responseData.diffStats - Diff statistics
   * @param {string} responseData.model - Model used
   * @returns {Promise<Object>} The added response entry
   */
  async addResponse(responseData) {
    if (!this.currentSession) {
      console.warn('[SessionManager] No active session')
      return null
    }

    const response = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      prompt: responseData.prompt || '',
      summary: responseData.summary || 'Changes applied.',
      questions: responseData.questions || [],
      fullResponse: responseData.fullResponse || '',
      diffStats: responseData.diffStats || { added: 0, modified: 0, deleted: 0 },
      model: responseData.model || 'haiku',
      collapsed: false
    }

    // Add to beginning (most recent first)
    this.currentSession.responses.unshift(response)

    // Trim to max responses
    if (this.currentSession.responses.length > this.maxResponses) {
      this.currentSession.responses = this.currentSession.responses.slice(0, this.maxResponses)
    }

    // Save session
    await this.saveSession()

    return response
  }

  /**
   * Update a question's answer in a response
   * @param {string} responseId - Response ID
   * @param {string} questionId - Question ID
   * @param {string} answer - User's answer
   * @returns {Promise<boolean>} Success status
   */
  async answerQuestion(responseId, questionId, answer) {
    if (!this.currentSession) return false

    const response = this.currentSession.responses.find(r => r.id === responseId)
    if (!response) return false

    const question = response.questions.find(q => q.id === questionId)
    if (!question) return false

    question.answer = answer
    question.answered = true
    question.answeredAt = new Date().toISOString()

    await this.saveSession()
    return true
  }

  /**
   * Toggle collapsed state of a response
   * @param {string} responseId - Response ID
   * @returns {boolean} New collapsed state
   */
  toggleResponseCollapsed(responseId) {
    if (!this.currentSession) return false

    const response = this.currentSession.responses.find(r => r.id === responseId)
    if (!response) return false

    response.collapsed = !response.collapsed
    // Don't save on toggle - this is UI state only
    return response.collapsed
  }

  /**
   * Get all responses for current session
   * @returns {Array} Array of response objects
   */
  getResponses() {
    return this.currentSession?.responses || []
  }

  /**
   * Get the most recent response
   * @returns {Object|null} Most recent response or null
   */
  getLatestResponse() {
    const responses = this.getResponses()
    return responses.length > 0 ? responses[0] : null
  }

  /**
   * Get unanswered questions from all responses
   * @returns {Array} Array of { responseId, question } objects
   */
  getUnansweredQuestions() {
    if (!this.currentSession) return []

    const unanswered = []
    for (const response of this.currentSession.responses) {
      for (const question of response.questions || []) {
        if (!question.answered) {
          unanswered.push({
            responseId: response.id,
            question
          })
        }
      }
    }
    return unanswered
  }

  /**
   * Clear all responses from current session
   * @returns {Promise<boolean>} Success status
   */
  async clearSession() {
    if (!this.currentSession) return false

    this.currentSession.responses = []
    this.currentSession.updatedAt = new Date().toISOString()

    await this.saveSession()
    return true
  }

  /**
   * Delete a specific response
   * @param {string} responseId - Response ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteResponse(responseId) {
    if (!this.currentSession) return false

    const index = this.currentSession.responses.findIndex(r => r.id === responseId)
    if (index === -1) return false

    this.currentSession.responses.splice(index, 1)
    await this.saveSession()
    return true
  }

  /**
   * Generate a unique ID
   * @returns {string} UUID-like string
   */
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Check if session is loaded
   * @returns {boolean} Whether session is loaded
   */
  isLoaded() {
    return this.sessionLoaded
  }

  /**
   * Get current document path
   * @returns {string|null} Current document path
   */
  getCurrentDocumentPath() {
    return this.documentPath
  }
}

export default SessionManager
