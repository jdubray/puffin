/**
 * Puffin Validators
 */

/**
 * Validate project configuration
 * @param {Object} project - Project object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProject(project) {
  const errors = []

  if (!project) {
    return { valid: false, errors: ['Project is required'] }
  }

  if (!project.name || typeof project.name !== 'string' || project.name.trim().length === 0) {
    errors.push('Project name is required')
  }

  if (project.name && project.name.length > 100) {
    errors.push('Project name must be 100 characters or less')
  }

  if (!project.description || typeof project.description !== 'string') {
    errors.push('Project description is required')
  }

  if (project.assumptions && !Array.isArray(project.assumptions)) {
    errors.push('Assumptions must be an array')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate prompt content
 * @param {Object} prompt - Prompt object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePrompt(prompt) {
  const errors = []

  if (!prompt) {
    return { valid: false, errors: ['Prompt is required'] }
  }

  if (!prompt.content || typeof prompt.content !== 'string' || prompt.content.trim().length === 0) {
    errors.push('Prompt content is required')
  }

  if (!prompt.branchId || typeof prompt.branchId !== 'string') {
    errors.push('Branch ID is required')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate GUI element
 * @param {Object} element - GUI element to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGuiElement(element) {
  const errors = []
  const validTypes = ['container', 'text', 'input', 'button', 'image', 'list', 'form', 'nav', 'card', 'modal']

  if (!element) {
    return { valid: false, errors: ['Element is required'] }
  }

  if (!element.type || !validTypes.includes(element.type)) {
    errors.push(`Element type must be one of: ${validTypes.join(', ')}`)
  }

  if (!element.properties || typeof element.properties !== 'object') {
    errors.push('Element properties are required')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate branch configuration
 * @param {Object} branch - Branch object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBranch(branch) {
  const errors = []

  if (!branch) {
    return { valid: false, errors: ['Branch is required'] }
  }

  if (!branch.id || typeof branch.id !== 'string') {
    errors.push('Branch ID is required')
  }

  if (!branch.name || typeof branch.name !== 'string' || branch.name.trim().length === 0) {
    errors.push('Branch name is required')
  }

  if (branch.prompts && !Array.isArray(branch.prompts)) {
    errors.push('Branch prompts must be an array')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Sanitize string for safe display
 * @param {string} str - String to sanitize
 * @returns {string}
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Validate file path for security
 * @param {string} filePath - Path to validate
 * @returns {boolean}
 */
export function isValidFilePath(filePath) {
  if (typeof filePath !== 'string') return false

  // Prevent directory traversal
  if (filePath.includes('..')) return false

  // Check for valid characters
  const validPathRegex = /^[a-zA-Z0-9_\-./\\]+$/
  return validPathRegex.test(filePath)
}

// Re-export inspection assertion validators for convenience
export {
  validateAssertion,
  validateAssertions,
  validateAssertionResults,
  AssertionType,
  AssertionStatus,
  ASSERTION_TYPES
} from './inspection-assertions.js'
