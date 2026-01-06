/**
 * Calendar Plugin - Entry Point
 *
 * Provides a visual calendar view showing sprint and story activity by day.
 * Displays days in a monthly grid with activity indicators.
 */

const path = require('path')

// Import database module (relative path from plugins/ to src/main/)
let database = null

/**
 * Lazily load database module
 * This is needed because plugin loads before database might be fully initialized
 */
function getDatabase() {
  if (!database) {
    try {
      // Navigate from plugins/calendar/ to src/main/database/
      const dbPath = path.resolve(__dirname, '../../src/main/database')
      const dbModule = require(dbPath)
      database = dbModule.database
    } catch (error) {
      console.error('[CalendarPlugin] Failed to load database module:', error.message)
    }
  }
  return database
}

const CalendarPlugin = {
  context: null,
  sprintCache: null,
  cacheTimestamp: 0,
  CACHE_TTL: 5000, // 5 second cache

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context

    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Calendar plugin requires projectPath in context')
    }

    // Load database module
    getDatabase()

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getMonthData', this.handleGetMonthData.bind(this))
    context.registerIpcHandler('getDayActivity', this.handleGetDayActivity.bind(this))
    context.registerIpcHandler('getSprintsForDate', this.handleGetSprintsForDate.bind(this))
    context.registerIpcHandler('getSprintHistory', this.handleGetSprintHistory.bind(this))

    // Note handlers
    context.registerIpcHandler('createNote', this.handleCreateNote.bind(this))
    context.registerIpcHandler('updateNote', this.handleUpdateNote.bind(this))
    context.registerIpcHandler('deleteNote', this.handleDeleteNote.bind(this))
    context.registerIpcHandler('getNotesForRange', this.handleGetNotesForRange.bind(this))

    // Register actions for programmatic access
    context.registerAction('getMonthData', this.getMonthData.bind(this))
    context.registerAction('getDayActivity', this.getDayActivity.bind(this))
    context.registerAction('getSprintsForDate', this.getSprintsForDate.bind(this))

    context.log.info('Calendar plugin activated')
    context.log.debug(`Project path: ${projectPath}`)
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    this.sprintCache = null
    this.context.log.info('Calendar plugin deactivated')
  },

  // ============ Core API Methods ============

  /**
   * Get all sprint history (cached)
   * @returns {Promise<Object[]>} Array of archived sprints
   */
  async getSprintHistory() {
    const now = Date.now()

    // Return cached data if still valid
    if (this.sprintCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.sprintCache
    }

    const db = getDatabase()

    if (!db) {
      this.context.log.warn('Database not available')
      return []
    }

    if (!db.isInitialized()) {
      this.context.log.warn('Database not initialized')
      return []
    }

    try {
      // Use the pre-initialized sprint repository from the database module
      const sprintRepo = db.sprints

      if (!sprintRepo) {
        this.context.log.warn('Sprint repository not available')
        return []
      }

      // Get archived sprints (these have closed_at dates)
      const archivedSprints = sprintRepo.findArchived({ limit: 200 })

      // Get active sprint if any
      const activeSprint = sprintRepo.findActive()

      // Combine and cache
      const allSprints = [...archivedSprints]
      if (activeSprint) {
        allSprints.unshift(activeSprint)
      }

      this.sprintCache = allSprints
      this.cacheTimestamp = now

      this.context.log.debug(`Loaded ${allSprints.length} sprints (${archivedSprints.length} archived, ${activeSprint ? 1 : 0} active)`)

      return allSprints
    } catch (error) {
      this.context.log.error('Failed to load sprint history:', error.message)
      return []
    }
  },

  /**
   * Get sprints for a specific date
   * Shows sprints that were CLOSED on this date (for archived sprints)
   * or are currently active (for active sprints created on or before this date)
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Object[]>} Array of sprints for that date
   */
  async getSprintsForDate(dateStr) {
    const sprints = await this.getSprintHistory()

    // Parse the target date
    const targetDate = new Date(dateStr + 'T00:00:00')
    const targetDateStr = dateStr

    // Filter sprints for this date
    const matchingSprints = sprints.filter(sprint => {
      // For archived sprints, show on the date they were closed
      if (sprint.closedAt) {
        const closedDate = sprint.closedAt.split('T')[0]
        return closedDate === targetDateStr
      }

      // For active sprints, show on their creation date
      if (sprint.createdAt) {
        const createdDate = sprint.createdAt.split('T')[0]
        return createdDate === targetDateStr
      }

      return false
    })

    return matchingSprints
  },

  /**
   * Get calendar data for a specific month
   * @param {number} year - The year
   * @param {number} month - The month (0-11)
   * @returns {Promise<Object>} Month data with days and activity
   */
  async getMonthData(year, month) {
    const startDate = new Date(year, month, 1)
    const endDate = new Date(year, month + 1, 0)
    const daysInMonth = endDate.getDate()

    // Preload sprint history for the month
    await this.getSprintHistory()

    // Build days array
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      days.push({
        date: date.toISOString().split('T')[0],
        dayOfMonth: day,
        dayOfWeek: date.getDay(),
        activity: await this.getDayActivity(year, month, day)
      })
    }

    return {
      year,
      month,
      monthName: startDate.toLocaleString('default', { month: 'long' }),
      daysInMonth,
      firstDayOfWeek: startDate.getDay(),
      days
    }
  },

  /**
   * Get activity data for a specific day
   * @param {number} year - The year
   * @param {number} month - The month (0-11)
   * @param {number} day - The day of month
   * @returns {Promise<Object>} Activity data for the day
   */
  async getDayActivity(year, month, day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const sprints = await this.getSprintsForDate(dateStr)

    // Count stories across all sprints
    let totalStories = 0
    const storySet = new Set()

    for (const sprint of sprints) {
      if (sprint.stories && Array.isArray(sprint.stories)) {
        for (const story of sprint.stories) {
          if (!storySet.has(story.id)) {
            storySet.add(story.id)
            totalStories++
          }
        }
      }
    }

    return {
      hasActivity: sprints.length > 0,
      sprintCount: sprints.length,
      storyCount: totalStories,
      sprints: sprints.map(s => ({
        id: s.id,
        title: s.title || 'Untitled Sprint',
        status: s.status,
        createdAt: s.createdAt,
        closedAt: s.closedAt,
        storyCount: s.stories?.length || 0
      })),
      stories: []
    }
  },

  // ============ Notes API ============

  /**
   * Get all notes from storage
   * @returns {Promise<Object>} Notes object keyed by date
   */
  async getAllNotes() {
    try {
      const notes = await this.context.storage.get('notes')
      return notes || {}
    } catch (error) {
      this.context.log.error('Failed to load notes:', error.message)
      return {}
    }
  },

  /**
   * Save all notes to storage
   * @param {Object} notes - Notes object keyed by date
   */
  async saveAllNotes(notes) {
    try {
      await this.context.storage.set('notes', notes)
    } catch (error) {
      this.context.log.error('Failed to save notes:', error.message)
      throw error
    }
  },

  /**
   * Create a new note
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @param {string} text - Note text
   * @param {string} color - Note color
   * @returns {Promise<Object>} Result with created note
   */
  async createNote(dateStr, text, color = 'yellow') {
    const notes = await this.getAllNotes()

    if (!notes[dateStr]) {
      notes[dateStr] = []
    }

    const note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    notes[dateStr].push(note)
    await this.saveAllNotes(notes)

    this.context.log.debug(`Created note for ${dateStr}: ${note.id}`)

    return { success: true, note }
  },

  /**
   * Update an existing note
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @param {string} noteId - Note ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Result with updated note
   */
  async updateNote(dateStr, noteId, updates) {
    const notes = await this.getAllNotes()

    if (!notes[dateStr]) {
      return { success: false, error: 'Date not found' }
    }

    const noteIndex = notes[dateStr].findIndex(n => n.id === noteId)
    if (noteIndex === -1) {
      return { success: false, error: 'Note not found' }
    }

    notes[dateStr][noteIndex] = {
      ...notes[dateStr][noteIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }

    await this.saveAllNotes(notes)

    this.context.log.debug(`Updated note ${noteId} for ${dateStr}`)

    return { success: true, note: notes[dateStr][noteIndex] }
  },

  /**
   * Delete a note
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @param {string} noteId - Note ID
   * @returns {Promise<Object>} Result
   */
  async deleteNote(dateStr, noteId) {
    const notes = await this.getAllNotes()

    if (!notes[dateStr]) {
      return { success: false, error: 'Date not found' }
    }

    const noteIndex = notes[dateStr].findIndex(n => n.id === noteId)
    if (noteIndex === -1) {
      return { success: false, error: 'Note not found' }
    }

    notes[dateStr].splice(noteIndex, 1)

    // Clean up empty date entries
    if (notes[dateStr].length === 0) {
      delete notes[dateStr]
    }

    await this.saveAllNotes(notes)

    this.context.log.debug(`Deleted note ${noteId} from ${dateStr}`)

    return { success: true }
  },

  /**
   * Get notes for a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Notes activity by date
   */
  async getNotesForRange(startDate, endDate) {
    const allNotes = await this.getAllNotes()
    const result = {}

    const start = new Date(startDate)
    const end = new Date(endDate)

    for (const [dateStr, dateNotes] of Object.entries(allNotes)) {
      const date = new Date(dateStr)
      if (date >= start && date <= end && dateNotes.length > 0) {
        result[dateStr] = {
          notes: dateNotes,
          noteCount: dateNotes.length
        }
      }
    }

    return result
  },

  // ============ IPC Handlers ============

  async handleGetMonthData({ year, month }) {
    return this.getMonthData(year, month)
  },

  async handleGetDayActivity({ year, month, day }) {
    return this.getDayActivity(year, month, day)
  },

  async handleGetSprintsForDate({ dateStr }) {
    return this.getSprintsForDate(dateStr)
  },

  async handleGetSprintHistory() {
    return this.getSprintHistory()
  },

  async handleCreateNote({ dateStr, text, color }) {
    return this.createNote(dateStr, text, color)
  },

  async handleUpdateNote({ dateStr, noteId, updates }) {
    return this.updateNote(dateStr, noteId, updates)
  },

  async handleDeleteNote({ dateStr, noteId }) {
    return this.deleteNote(dateStr, noteId)
  },

  async handleGetNotesForRange({ startDate, endDate }) {
    return this.getNotesForRange(startDate, endDate)
  }
}

module.exports = CalendarPlugin
