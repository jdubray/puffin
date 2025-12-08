/**
 * Puffin Formatters
 */

/**
 * Generate a UUID v4
 * @returns {string}
 */
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Format timestamp to readable date
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {string|number} timestamp
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(timestamp)
}

/**
 * Truncate text with ellipsis
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Format file size
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Convert GUI designer elements to Claude-readable description
 * @param {Object[]} elements - Array of GUI elements
 * @returns {string}
 */
export function guiToDescription(elements) {
  if (!elements || elements.length === 0) {
    return 'No UI elements defined.'
  }

  const lines = ['## UI Layout Description\n']

  function describeElement(element, indent = 0) {
    const prefix = '  '.repeat(indent)
    const { type, properties, children } = element

    let desc = `${prefix}- **${type.charAt(0).toUpperCase() + type.slice(1)}**`

    if (properties.label) {
      desc += `: "${properties.label}"`
    }

    if (properties.placeholder) {
      desc += ` (placeholder: "${properties.placeholder}")`
    }

    const dims = []
    if (properties.width) dims.push(`width: ${properties.width}px`)
    if (properties.height) dims.push(`height: ${properties.height}px`)
    if (dims.length > 0) {
      desc += ` [${dims.join(', ')}]`
    }

    lines.push(desc)

    if (children && children.length > 0) {
      children.forEach(child => describeElement(child, indent + 1))
    }
  }

  elements.forEach(el => describeElement(el))

  return lines.join('\n')
}

/**
 * Build prompt context from project configuration
 * @param {Object} project - Project configuration
 * @returns {string}
 */
export function buildProjectContext(project) {
  const lines = []

  lines.push('# Project Context\n')

  if (project.description) {
    lines.push('## Description')
    lines.push(project.description)
    lines.push('')
  }

  if (project.assumptions && project.assumptions.length > 0) {
    lines.push('## Assumptions')
    project.assumptions.forEach(a => lines.push(`- ${a}`))
    lines.push('')
  }

  if (project.technicalArchitecture) {
    lines.push('## Technical Architecture')
    lines.push(project.technicalArchitecture)
    lines.push('')
  }

  if (project.dataModel) {
    lines.push('## Data Model')
    lines.push(project.dataModel)
    lines.push('')
  }

  if (project.options) {
    lines.push('## Coding Preferences')
    const opts = project.options
    lines.push(`- Programming Style: ${opts.programmingStyle}`)
    lines.push(`- Testing Approach: ${opts.testingApproach}`)
    lines.push(`- Documentation Level: ${opts.documentationLevel}`)
    lines.push(`- Error Handling: ${opts.errorHandling}`)
    if (opts.codeStyle) {
      lines.push(`- Naming Convention: ${opts.codeStyle.naming}`)
      lines.push(`- Comment Style: ${opts.codeStyle.comments}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Convert prompt history tree to flat array with depth
 * Shows newest prompts first while maintaining parent-child hierarchy
 * @param {Object} branch - Branch with prompts
 * @returns {Object[]}
 */
export function flattenPromptTree(branch) {
  const result = []

  function traverse(prompts, depth = 0, parentId = null) {
    const children = prompts
      .filter(p => p.parentId === parentId)
      // Sort by timestamp descending (newest first)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

    children.forEach(prompt => {
      result.push({ ...prompt, depth })
      // Recursively traverse children (which will also be in newest-first order)
      traverse(prompts, depth + 1, prompt.id)
    })
  }

  if (branch && branch.prompts) {
    traverse(branch.prompts)
  }

  return result
}
