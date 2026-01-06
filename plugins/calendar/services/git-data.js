/**
 * Git Data Service
 *
 * Handles loading and parsing git branch data from git-operations.json
 * for display on the calendar.
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
 * Extract branch name from a git operation
 * @param {Object} operation - Git operation object
 * @returns {string|null} Branch name or null
 */
function extractBranchName(operation) {
  if (!operation) return null

  // Direct branch field
  if (operation.branch) {
    return operation.branch
  }

  // Source branch for merge operations
  if (operation.type === 'merge' && operation.sourceBranch) {
    return operation.sourceBranch
  }

  return null
}

/**
 * Generate a consistent color for a branch name using hash
 * @param {string} branchName - Branch name
 * @returns {string} HSL color string
 */
function getBranchColor(branchName) {
  if (!branchName) return 'hsl(0, 0%, 50%)'

  // Hash the branch name to get a consistent hue
  let hash = 0
  for (let i = 0; i < branchName.length; i++) {
    hash = branchName.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32-bit integer
  }

  // Use hash to generate hue (0-360)
  const hue = Math.abs(hash % 360)

  // Special handling for common branch types
  if (branchName === 'main' || branchName === 'master') {
    return 'hsl(220, 70%, 55%)' // Blue for main
  }
  if (branchName.startsWith('feature/')) {
    return `hsl(${(hue % 60) + 120}, 65%, 50%)` // Green-ish for features
  }
  if (branchName.startsWith('bugfix/') || branchName.startsWith('fix/')) {
    return `hsl(${(hue % 30) + 0}, 70%, 55%)` // Red-ish for bugfixes
  }
  if (branchName.startsWith('hotfix/')) {
    return 'hsl(15, 80%, 50%)' // Orange for hotfixes
  }
  if (branchName.startsWith('release/')) {
    return `hsl(${(hue % 40) + 260}, 60%, 55%)` // Purple-ish for releases
  }

  // Default: use the hash-based hue with good saturation
  return `hsl(${hue}, 60%, 50%)`
}

/**
 * Get abbreviated branch name for display
 * @param {string} branchName - Full branch name
 * @param {number} maxLength - Maximum length
 * @returns {string} Abbreviated name
 */
function abbreviateBranchName(branchName, maxLength = 12) {
  if (!branchName) return ''
  if (branchName.length <= maxLength) return branchName

  // Handle prefixed branches (feature/, bugfix/, etc.)
  const prefixMatch = branchName.match(/^([a-z]+)\/(.+)$/i)
  if (prefixMatch) {
    const prefix = prefixMatch[1]
    const name = prefixMatch[2]

    // Use short prefix (f/, b/, h/, r/)
    const shortPrefix = prefix.charAt(0).toLowerCase() + '/'
    const remaining = maxLength - shortPrefix.length - 1 // -1 for ellipsis

    if (name.length <= remaining) {
      return shortPrefix + name
    }
    return shortPrefix + name.substring(0, remaining) + '…'
  }

  // No prefix, just truncate
  return branchName.substring(0, maxLength - 1) + '…'
}

/**
 * Get branches active on a specific date from operations
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {Array} operations - Git operations array
 * @returns {Array} Array of unique branch info objects
 */
function getBranchesForDate(dateStr, operations = []) {
  if (!dateStr || !Array.isArray(operations)) return []

  const branchMap = new Map()

  operations.forEach(op => {
    if (!op.timestamp) return

    // Check if operation is on the target date
    const opDate = formatDateISO(op.timestamp)
    if (opDate !== dateStr) return

    // Extract branch name based on operation type
    const branchName = extractBranchName(op)
    if (!branchName) return

    // Track unique branches with operation counts
    if (!branchMap.has(branchName)) {
      branchMap.set(branchName, {
        name: branchName,
        abbreviatedName: abbreviateBranchName(branchName),
        color: getBranchColor(branchName),
        operationCount: 0,
        operations: []
      })
    }

    const branchInfo = branchMap.get(branchName)
    branchInfo.operationCount++
    branchInfo.operations.push({
      type: op.type,
      timestamp: op.timestamp,
      message: op.message || null
    })
  })

  // Convert to array and sort by operation count (most active first)
  return Array.from(branchMap.values())
    .sort((a, b) => b.operationCount - a.operationCount)
}

/**
 * Get branch activity data for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Array} operations - Git operations array
 * @returns {Object} Activity data keyed by date
 */
function getBranchActivityForRange(startDate, endDate, operations = []) {
  if (!Array.isArray(operations)) return {}

  const start = parseDate(startDate)
  const end = parseDate(endDate)

  if (!start || !end) return {}

  const activity = {}

  operations.forEach(op => {
    if (!op.timestamp) return

    const opDate = parseDate(op.timestamp)
    if (!opDate || opDate < start || opDate > end) return

    const dateStr = formatDateISO(opDate)
    const branchName = extractBranchName(op)

    if (!branchName) return

    if (!activity[dateStr]) {
      activity[dateStr] = {
        branches: new Set(),
        branchCount: 0,
        operationCount: 0
      }
    }

    activity[dateStr].branches.add(branchName)
    activity[dateStr].branchCount = activity[dateStr].branches.size
    activity[dateStr].operationCount++
  })

  // Convert Sets to Arrays for serialization
  Object.keys(activity).forEach(dateStr => {
    activity[dateStr].branches = Array.from(activity[dateStr].branches)
  })

  return activity
}

/**
 * Load git operations data from Puffin's data directory
 * @returns {Promise<Array>} Git operations array
 */
async function loadGitOperations() {
  try {
    // Try to load via Puffin's API if available
    if (window.puffin && window.puffin.data) {
      if (typeof window.puffin.data.getGitOperations === 'function') {
        const data = await window.puffin.data.getGitOperations()
        return data?.operations || data || []
      }
    }

    // Fallback: try IPC if available
    if (window.electronAPI) {
      if (typeof window.electronAPI.getGitOperations === 'function') {
        const data = await window.electronAPI.getGitOperations()
        return data?.operations || data || []
      }

      // Try reading file directly via IPC
      if (typeof window.electronAPI.readJsonFile === 'function') {
        const data = await window.electronAPI.readJsonFile('.puffin/git-operations.json')
        return data?.operations || []
      }
    }

    console.warn('[GitDataService] No API available to load git operations')
    return []
  } catch (error) {
    console.error('[GitDataService] Failed to load git operations:', error)
    return []
  }
}

/**
 * Create a git data service instance
 * @returns {Object} Git data service API
 */
function createGitDataService() {
  let cachedOperations = null
  let cacheTime = 0
  const CACHE_TTL = 30000 // 30 seconds

  return {
    /**
     * Get all git operations (cached)
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Array>} Git operations
     */
    async getOperations(forceRefresh = false) {
      const now = Date.now()
      if (!forceRefresh && cachedOperations && (now - cacheTime) < CACHE_TTL) {
        return cachedOperations
      }

      cachedOperations = await loadGitOperations()
      cacheTime = now
      return cachedOperations
    },

    /**
     * Get branches for a specific date
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @returns {Promise<Array>} Branches for the date
     */
    async getBranchesForDate(dateStr) {
      const operations = await this.getOperations()
      return getBranchesForDate(dateStr, operations)
    },

    /**
     * Get branch activity for a date range
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Promise<Object>} Branch activity data
     */
    async getBranchActivityForRange(startDate, endDate) {
      const operations = await this.getOperations()
      return getBranchActivityForRange(startDate, endDate, operations)
    },

    /**
     * Get branch color
     * @param {string} branchName - Branch name
     * @returns {string} Color string
     */
    getBranchColor(branchName) {
      return getBranchColor(branchName)
    },

    /**
     * Abbreviate branch name
     * @param {string} branchName - Full branch name
     * @param {number} maxLength - Max length
     * @returns {string} Abbreviated name
     */
    abbreviateBranchName(branchName, maxLength) {
      return abbreviateBranchName(branchName, maxLength)
    },

    /**
     * Clear the cache
     */
    clearCache() {
      cachedOperations = null
      cacheTime = 0
    },

    /**
     * Refresh data from source
     * @returns {Promise<Array>} Fresh git operations
     */
    async refresh() {
      return this.getOperations(true)
    }
  }
}

// Export functions and factory
module.exports = {
  formatDateISO,
  parseDate,
  extractBranchName,
  getBranchColor,
  abbreviateBranchName,
  getBranchesForDate,
  getBranchActivityForRange,
  loadGitOperations,
  createGitDataService
}
