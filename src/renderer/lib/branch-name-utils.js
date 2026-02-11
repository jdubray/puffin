/**
 * Branch Name Utilities
 *
 * Shared utility functions for git branch name generation and validation.
 * Used by the sprint creation modal and available for testing.
 */

/**
 * Derive a git-friendly branch name from a sprint title.
 * Follows git conventions: lowercase, hyphens, no spaces/special chars.
 * @param {string} title - Sprint title
 * @returns {string} Suggested branch name
 */
export function deriveBranchName(title) {
  if (!title) return 'sprint'
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '')        // strip parenthetical like "(+2 more)"
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
    .trim()
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '')          // strip leading/trailing hyphens
    .slice(0, 60)                   // git branch name length limit
    || 'sprint'
}

/**
 * Validate a git branch name.
 * @param {string} name - Branch name to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateBranchName(name) {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Branch name is required' }
  }
  if (/\s/.test(name)) {
    return { valid: false, error: 'Branch name cannot contain spaces' }
  }
  if (/\.\./.test(name)) {
    return { valid: false, error: 'Branch name cannot contain ".."' }
  }
  if (/[~^:?*\[\]\\]/.test(name)) {
    return { valid: false, error: 'Branch name contains invalid characters' }
  }
  if (name.startsWith('-') || name.startsWith('.')) {
    return { valid: false, error: 'Branch name cannot start with "-" or "."' }
  }
  if (name.endsWith('.') || name.endsWith('.lock') || name.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot end with ".", ".lock", or "/"' }
  }
  if (name.includes('//')) {
    return { valid: false, error: 'Branch name cannot contain "//"' }
  }
  if (name.includes('@{')) {
    return { valid: false, error: 'Branch name cannot contain "@{"' }
  }
  return { valid: true, error: null }
}
