/**
 * Notes Storage Service
 *
 * Handles CRUD operations for calendar post-it notes.
 * Notes are stored in plugin data file: .puffin/plugins/calendar/notes.json
 */

const MAX_NOTE_LENGTH = 500
const MAX_NOTES_PER_DAY = 10
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple']

/**
 * Generate a unique ID for a note
 * @returns {string} Unique ID
 */
function generateNoteId() {
  return 'note-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

/**
 * Validate note text
 * @param {string} text - Note text
 * @returns {Object} Validation result with isValid and error
 */
function validateNoteText(text) {
  if (!text || typeof text !== 'string') {
    return { isValid: false, error: 'Note text is required' }
  }

  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Note text cannot be empty' }
  }

  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { isValid: false, error: `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters` }
  }

  return { isValid: true, error: null }
}

/**
 * Validate note color
 * @param {string} color - Note color
 * @returns {string} Valid color (defaults to yellow)
 */
function validateNoteColor(color) {
  if (NOTE_COLORS.includes(color)) {
    return color
  }
  return 'yellow'
}

/**
 * Format a date to ISO string (YYYY-MM-DD)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDateISO(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

/**
 * Load notes data from storage
 * @returns {Promise<Object>} Notes data keyed by date
 */
async function loadNotesData() {
  try {
    // Try plugin API
    if (window.puffin?.plugins?.calendar?.getNotesData) {
      return await window.puffin.plugins.calendar.getNotesData() || {}
    }

    // Try IPC
    if (window.electronAPI?.getCalendarNotes) {
      return await window.electronAPI.getCalendarNotes() || {}
    }

    // Try reading file directly
    if (window.electronAPI?.readPluginData) {
      const data = await window.electronAPI.readPluginData('calendar', 'notes.json')
      return data || {}
    }

    console.warn('[NotesStorage] No API available to load notes')
    return {}
  } catch (error) {
    console.error('[NotesStorage] Failed to load notes:', error)
    return {}
  }
}

/**
 * Save notes data to storage
 * @param {Object} notesData - Notes data to save
 * @returns {Promise<boolean>} Success status
 */
async function saveNotesData(notesData) {
  try {
    // Try plugin API
    if (window.puffin?.plugins?.calendar?.saveNotesData) {
      await window.puffin.plugins.calendar.saveNotesData(notesData)
      return true
    }

    // Try IPC
    if (window.electronAPI?.saveCalendarNotes) {
      await window.electronAPI.saveCalendarNotes(notesData)
      return true
    }

    // Try writing file directly
    if (window.electronAPI?.writePluginData) {
      await window.electronAPI.writePluginData('calendar', 'notes.json', notesData)
      return true
    }

    console.warn('[NotesStorage] No API available to save notes')
    return false
  } catch (error) {
    console.error('[NotesStorage] Failed to save notes:', error)
    return false
  }
}

/**
 * Get notes for a specific date
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {Object} notesData - Notes data object
 * @returns {Array} Notes for the date
 */
function getNotesForDate(dateStr, notesData = {}) {
  return notesData[dateStr] || []
}

/**
 * Get note count for a date
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {Object} notesData - Notes data object
 * @returns {number} Note count
 */
function getNoteCountForDate(dateStr, notesData = {}) {
  const notes = notesData[dateStr]
  return Array.isArray(notes) ? notes.length : 0
}

/**
 * Check if a date has notes
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {Object} notesData - Notes data object
 * @returns {boolean}
 */
function hasNotesForDate(dateStr, notesData = {}) {
  return getNoteCountForDate(dateStr, notesData) > 0
}

/**
 * Create a new note
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} text - Note text
 * @param {string} color - Note color
 * @param {Object} notesData - Notes data object
 * @returns {Object} Result with success, note, warning, and updated data
 */
function createNote(dateStr, text, color, notesData = {}) {
  // Validate text
  const validation = validateNoteText(text)
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  // Get existing notes for the date
  const existingNotes = notesData[dateStr] || []
  let warning = null

  // Check note limit
  if (existingNotes.length >= MAX_NOTES_PER_DAY) {
    warning = `You have many notes for this day (${existingNotes.length}). Consider consolidating.`
  }

  // Create new note
  const now = new Date().toISOString()
  const note = {
    id: generateNoteId(),
    text: text.trim(),
    color: validateNoteColor(color),
    createdAt: now,
    updatedAt: now
  }

  // Add to data
  const updatedData = {
    ...notesData,
    [dateStr]: [...existingNotes, note]
  }

  return {
    success: true,
    note,
    warning,
    data: updatedData
  }
}

/**
 * Update an existing note
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} noteId - Note ID
 * @param {Object} updates - Updates to apply (text, color)
 * @param {Object} notesData - Notes data object
 * @returns {Object} Result with success, note, and updated data
 */
function updateNote(dateStr, noteId, updates, notesData = {}) {
  const existingNotes = notesData[dateStr] || []
  const noteIndex = existingNotes.findIndex(n => n.id === noteId)

  if (noteIndex === -1) {
    return { success: false, error: 'Note not found' }
  }

  // Validate text if provided
  if (updates.text !== undefined) {
    const validation = validateNoteText(updates.text)
    if (!validation.isValid) {
      return { success: false, error: validation.error }
    }
  }

  // Update note
  const existingNote = existingNotes[noteIndex]
  const updatedNote = {
    ...existingNote,
    ...(updates.text !== undefined && { text: updates.text.trim() }),
    ...(updates.color !== undefined && { color: validateNoteColor(updates.color) }),
    updatedAt: new Date().toISOString()
  }

  // Update data
  const updatedNotes = [...existingNotes]
  updatedNotes[noteIndex] = updatedNote

  const updatedData = {
    ...notesData,
    [dateStr]: updatedNotes
  }

  return {
    success: true,
    note: updatedNote,
    data: updatedData
  }
}

/**
 * Delete a note
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} noteId - Note ID
 * @param {Object} notesData - Notes data object
 * @returns {Object} Result with success and updated data
 */
function deleteNote(dateStr, noteId, notesData = {}) {
  const existingNotes = notesData[dateStr] || []
  const noteIndex = existingNotes.findIndex(n => n.id === noteId)

  if (noteIndex === -1) {
    return { success: false, error: 'Note not found' }
  }

  // Remove note
  const updatedNotes = existingNotes.filter(n => n.id !== noteId)

  // Update data (remove date key if no notes left)
  const updatedData = { ...notesData }
  if (updatedNotes.length > 0) {
    updatedData[dateStr] = updatedNotes
  } else {
    delete updatedData[dateStr]
  }

  return {
    success: true,
    data: updatedData
  }
}

/**
 * Get notes activity for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Object} notesData - Notes data object
 * @returns {Object} Activity data keyed by date
 */
function getNotesActivityForRange(startDate, endDate, notesData = {}) {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T23:59:59')
  const activity = {}

  Object.keys(notesData).forEach(dateStr => {
    const date = new Date(dateStr + 'T00:00:00')
    if (date >= start && date <= end) {
      const notes = notesData[dateStr] || []
      if (notes.length > 0) {
        activity[dateStr] = {
          noteCount: notes.length,
          notes: notes,
          colors: [...new Set(notes.map(n => n.color))]
        }
      }
    }
  })

  return activity
}

/**
 * Create a notes storage service instance
 * @returns {Object} Notes storage service API
 */
function createNotesStorageService() {
  let cachedData = null
  let cacheTime = 0
  const CACHE_TTL = 10000 // 10 seconds (shorter for notes since they change more often)

  return {
    /**
     * Get all notes data (cached)
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Object>} Notes data
     */
    async getData(forceRefresh = false) {
      const now = Date.now()
      if (!forceRefresh && cachedData && (now - cacheTime) < CACHE_TTL) {
        return cachedData
      }

      cachedData = await loadNotesData()
      cacheTime = now
      return cachedData
    },

    /**
     * Get notes for a specific date
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @returns {Promise<Array>} Notes for the date
     */
    async getNotesForDate(dateStr) {
      const data = await this.getData()
      return getNotesForDate(dateStr, data)
    },

    /**
     * Get notes activity for a date range
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Promise<Object>} Notes activity data
     */
    async getNotesActivityForRange(startDate, endDate) {
      const data = await this.getData()
      return getNotesActivityForRange(startDate, endDate, data)
    },

    /**
     * Create a new note
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @param {string} text - Note text
     * @param {string} color - Note color
     * @returns {Promise<Object>} Result
     */
    async createNote(dateStr, text, color = 'yellow') {
      const data = await this.getData()
      const result = createNote(dateStr, text, color, data)

      if (result.success) {
        const saved = await saveNotesData(result.data)
        if (saved) {
          cachedData = result.data
          cacheTime = Date.now()
        } else {
          return { success: false, error: 'Failed to save note' }
        }
      }

      return result
    },

    /**
     * Update a note
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @param {string} noteId - Note ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Result
     */
    async updateNote(dateStr, noteId, updates) {
      const data = await this.getData()
      const result = updateNote(dateStr, noteId, updates, data)

      if (result.success) {
        const saved = await saveNotesData(result.data)
        if (saved) {
          cachedData = result.data
          cacheTime = Date.now()
        } else {
          return { success: false, error: 'Failed to save note' }
        }
      }

      return result
    },

    /**
     * Delete a note
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @param {string} noteId - Note ID
     * @returns {Promise<Object>} Result
     */
    async deleteNote(dateStr, noteId) {
      const data = await this.getData()
      const result = deleteNote(dateStr, noteId, data)

      if (result.success) {
        const saved = await saveNotesData(result.data)
        if (saved) {
          cachedData = result.data
          cacheTime = Date.now()
        } else {
          return { success: false, error: 'Failed to delete note' }
        }
      }

      return result
    },

    /**
     * Clear the cache
     */
    clearCache() {
      cachedData = null
      cacheTime = 0
    },

    /**
     * Refresh data from source
     * @returns {Promise<Object>} Fresh notes data
     */
    async refresh() {
      return this.getData(true)
    },

    // Constants
    MAX_NOTE_LENGTH,
    MAX_NOTES_PER_DAY,
    NOTE_COLORS
  }
}

// Export functions and factory
module.exports = {
  generateNoteId,
  validateNoteText,
  validateNoteColor,
  formatDateISO,
  loadNotesData,
  saveNotesData,
  getNotesForDate,
  getNoteCountForDate,
  hasNotesForDate,
  createNote,
  updateNote,
  deleteNote,
  getNotesActivityForRange,
  createNotesStorageService,
  MAX_NOTE_LENGTH,
  MAX_NOTES_PER_DAY,
  NOTE_COLORS
}
