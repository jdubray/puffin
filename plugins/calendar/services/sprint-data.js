/**
 * Sprint Data Service
 *
 * Handles loading, filtering, and managing sprint data for the calendar plugin.
 * Reads from sprint-history.json and active-sprint.json.
 */

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
 * Parse a date string safely
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null
 */
function parseDate(dateStr) {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Get sprints for a specific date
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {Object} data - Data object containing sprintHistory and activeSprint
 * @returns {Array} Array of sprints for the date
 */
function getSprintsForDate(dateStr, data = {}) {
  const { sprintHistory = [], activeSprint = null } = data
  const sprints = []

  // Check sprint history
  if (Array.isArray(sprintHistory)) {
    sprintHistory.forEach(sprint => {
      const sprintDate = getSprintDateStr(sprint)
      if (sprintDate === dateStr) {
        sprints.push({
          ...sprint,
          status: sprint.status || 'completed'
        })
      }
    })
  }

  // Check active sprint
  if (activeSprint) {
    const activeDate = getSprintDateStr(activeSprint)
    if (activeDate === dateStr) {
      sprints.push({
        ...activeSprint,
        status: 'active'
      })
    }
  }

  return sprints
}

/**
 * Get the date string from a sprint object
 * @param {Object} sprint - Sprint object
 * @returns {string} Date string (YYYY-MM-DD) or empty string
 */
function getSprintDateStr(sprint) {
  if (!sprint) return ''

  // Try different date field names
  const dateValue = sprint.date || sprint.startDate || sprint.createdAt || sprint.created

  if (!dateValue) return ''

  // Handle timestamp (number)
  if (typeof dateValue === 'number') {
    return formatDateISO(new Date(dateValue))
  }

  // Handle string date
  if (typeof dateValue === 'string') {
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue
    }
    // Parse and format
    const parsed = parseDate(dateValue)
    return parsed ? formatDateISO(parsed) : ''
  }

  return ''
}

/**
 * Get activity data for a date range
 * Groups sprints by date and returns activity indicators
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Object} data - Data object containing sprintHistory and activeSprint
 * @returns {Object} Activity data keyed by date
 */
function getActivityDataForRange(startDate, endDate, data = {}) {
  const { sprintHistory = [], activeSprint = null } = data
  const activity = {}

  const start = parseDate(startDate)
  const end = parseDate(endDate)

  if (!start || !end) return activity

  // Process sprint history
  if (Array.isArray(sprintHistory)) {
    sprintHistory.forEach(sprint => {
      const dateStr = getSprintDateStr(sprint)
      if (!dateStr) return

      const sprintDate = parseDate(dateStr)
      if (!sprintDate || sprintDate < start || sprintDate > end) return

      if (!activity[dateStr]) {
        activity[dateStr] = {
          hasActivity: false,
          sprintCount: 0,
          storyCount: 0,
          sprints: []
        }
      }

      activity[dateStr].hasActivity = true
      activity[dateStr].sprintCount++
      activity[dateStr].storyCount += sprint.userStories?.length || 0
      activity[dateStr].sprints.push(sprint)
    })
  }

  // Process active sprint
  if (activeSprint) {
    const dateStr = getSprintDateStr(activeSprint)
    if (dateStr) {
      const sprintDate = parseDate(dateStr)
      if (sprintDate && sprintDate >= start && sprintDate <= end) {
        if (!activity[dateStr]) {
          activity[dateStr] = {
            hasActivity: false,
            sprintCount: 0,
            storyCount: 0,
            sprints: []
          }
        }

        activity[dateStr].hasActivity = true
        activity[dateStr].sprintCount++
        activity[dateStr].storyCount += activeSprint.userStories?.length || 0
        activity[dateStr].sprints.push({ ...activeSprint, status: 'active' })
      }
    }
  }

  return activity
}

/**
 * Load sprint data from Puffin's data directory
 * @returns {Promise<Object>} Sprint data object
 */
async function loadSprintData() {
  const data = {
    sprintHistory: [],
    activeSprint: null
  }

  try {
    // Try to load via Puffin's API if available
    if (window.puffin && window.puffin.data) {
      if (typeof window.puffin.data.getSprintHistory === 'function') {
        data.sprintHistory = await window.puffin.data.getSprintHistory() || []
      }
      if (typeof window.puffin.data.getActiveSprint === 'function') {
        data.activeSprint = await window.puffin.data.getActiveSprint() || null
      }
    }

    // Fallback: try IPC if available
    if (window.electronAPI) {
      if (data.sprintHistory.length === 0 && typeof window.electronAPI.getSprintHistory === 'function') {
        data.sprintHistory = await window.electronAPI.getSprintHistory() || []
      }
      if (!data.activeSprint && typeof window.electronAPI.getActiveSprint === 'function') {
        data.activeSprint = await window.electronAPI.getActiveSprint() || null
      }
    }
  } catch (error) {
    console.error('[SprintDataService] Failed to load sprint data:', error)
  }

  return data
}

/**
 * Create a sprint data service instance
 * @returns {Object} Sprint data service API
 */
function createSprintDataService() {
  let cachedData = null
  let cacheTime = 0
  const CACHE_TTL = 30000 // 30 seconds

  return {
    /**
     * Get all sprint data (cached)
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Object>} Sprint data
     */
    async getData(forceRefresh = false) {
      const now = Date.now()
      if (!forceRefresh && cachedData && (now - cacheTime) < CACHE_TTL) {
        return cachedData
      }

      cachedData = await loadSprintData()
      cacheTime = now
      return cachedData
    },

    /**
     * Get sprints for a specific date
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @returns {Promise<Array>} Sprints for the date
     */
    async getSprintsForDate(dateStr) {
      const data = await this.getData()
      return getSprintsForDate(dateStr, data)
    },

    /**
     * Get activity data for a date range
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Promise<Object>} Activity data
     */
    async getActivityData(startDate, endDate) {
      const data = await this.getData()
      return getActivityDataForRange(startDate, endDate, data)
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
     * @returns {Promise<Object>} Fresh sprint data
     */
    async refresh() {
      return this.getData(true)
    }
  }
}

// Export functions and factory
module.exports = {
  formatDateISO,
  parseDate,
  getSprintsForDate,
  getSprintDateStr,
  getActivityDataForRange,
  loadSprintData,
  createSprintDataService
}
