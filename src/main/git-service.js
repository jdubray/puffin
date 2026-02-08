/**
 * Puffin - Git Service
 *
 * Provides Git repository operations for Puffin.
 * Handles repository detection, branch management, staging, commits, and merges.
 */

const { spawn } = require('child_process')
const fs = require('fs').promises
const path = require('path')

/**
 * Git branch name validation regex
 * Follows Git naming conventions:
 * - Cannot start with '.'
 * - Cannot contain '..' or '//'
 * - Cannot contain special characters like ~, ^, :, ?, *, [, @{, \
 * - Cannot end with '.lock' or '/'
 */
const BRANCH_NAME_REGEX = /^(?!\.)[^\~\^\:\?\*\[\@\{\\]+(?<!\.lock|\/)$/

/**
 * Default Git settings
 */
const DEFAULT_GIT_SETTINGS = {
  mainBranch: 'main',
  branchPrefixes: ['feature/', 'bugfix/', 'hotfix/', 'release/'],
  defaultPrefix: 'feature/',
  autoPromptPostMerge: true,
  enabled: true
}

class GitService {
  constructor() {
    this.projectPath = null
    this.settings = { ...DEFAULT_GIT_SETTINGS }
  }

  /**
   * Set the project path for Git operations
   * @param {string} projectPath - Path to the project directory
   */
  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  /**
   * Update Git settings
   * @param {Object} settings - Settings to update
   */
  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings }
  }

  /**
   * Get current Git settings
   * @returns {Object} Current settings
   */
  getSettings() {
    return { ...this.settings }
  }

  /**
   * Execute a Git command
   * @param {string[]} args - Git command arguments
   * @param {Object} options - Spawn options
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   * @private
   */
  async execGit(args, options = {}) {
    return new Promise((resolve, reject) => {
      const gitProcess = spawn('git', args, {
        cwd: this.projectPath,
        ...options
      })

      let stdout = ''
      let stderr = ''

      gitProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      gitProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      gitProcess.on('close', (code) => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code })
      })

      gitProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Check if Git is installed and available
   * @returns {Promise<boolean>}
   */
  async isGitAvailable() {
    try {
      const result = await this.execGit(['--version'])
      return result.code === 0
    } catch {
      return false
    }
  }

  /**
   * Check if the project is a Git repository
   * @returns {Promise<{isRepo: boolean, message: string}>}
   */
  async isGitRepository() {
    if (!this.projectPath) {
      return { isRepo: false, message: 'No project path set' }
    }

    try {
      // Check if .git directory exists
      const gitDir = path.join(this.projectPath, '.git')
      await fs.access(gitDir)

      // Verify it's a valid Git repository
      const result = await this.execGit(['rev-parse', '--git-dir'])
      if (result.code === 0) {
        return { isRepo: true, message: 'Git repository detected' }
      }
      return { isRepo: false, message: 'Invalid Git repository' }
    } catch {
      return {
        isRepo: false,
        message: 'Not a Git repository. Run "git init" in the project directory to initialize Git.'
      }
    }
  }

  /**
   * Get the current branch name
   * @returns {Promise<{success: boolean, branch?: string, error?: string}>}
   */
  async getCurrentBranch() {
    try {
      const result = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'])
      if (result.code === 0) {
        return { success: true, branch: result.stdout }
      }
      return { success: false, error: result.stderr || 'Failed to get current branch' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get list of all branches
   * @returns {Promise<{success: boolean, branches?: Array<{name: string, current: boolean}>, error?: string}>}
   */
  async getBranches() {
    try {
      const result = await this.execGit(['branch', '--list', '--format=%(refname:short)|%(HEAD)'])
      if (result.code === 0) {
        const branches = result.stdout
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [name, head] = line.split('|')
            return { name: name.trim(), current: head === '*' }
          })
        return { success: true, branches }
      }
      return { success: false, error: result.stderr || 'Failed to get branches' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get repository status
   * @returns {Promise<{success: boolean, status?: Object, error?: string}>}
   */
  async getStatus() {
    try {
      // Get current branch
      const branchResult = await this.getCurrentBranch()
      if (!branchResult.success) {
        return branchResult
      }

      // Get file status using porcelain format for machine parsing
      const statusResult = await this.execGit(['status', '--porcelain', '-uall'])
      if (statusResult.code !== 0) {
        return { success: false, error: statusResult.stderr || 'Failed to get status' }
      }

      // Parse status output
      const files = {
        staged: [],
        unstaged: [],
        untracked: []
      }

      const lines = statusResult.stdout.split('\n').filter(line => line.trim())
      for (const line of lines) {
        const indexStatus = line[0]
        const workTreeStatus = line[1]
        const filePath = line.substring(3)

        // Determine file status category
        if (indexStatus === '?' && workTreeStatus === '?') {
          files.untracked.push({ path: filePath, status: 'untracked' })
        } else if (indexStatus !== ' ' && indexStatus !== '?') {
          files.staged.push({
            path: filePath,
            status: this.getStatusLabel(indexStatus)
          })
        }

        if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
          files.unstaged.push({
            path: filePath,
            status: this.getStatusLabel(workTreeStatus)
          })
        }
      }

      // Check ahead/behind status
      const aheadBehind = await this.getAheadBehind()

      return {
        success: true,
        status: {
          branch: branchResult.branch,
          files,
          hasChanges: files.staged.length > 0 || files.unstaged.length > 0 || files.untracked.length > 0,
          hasUncommittedChanges: files.staged.length > 0 || files.unstaged.length > 0,
          ahead: aheadBehind.ahead,
          behind: aheadBehind.behind,
          hasRemote: aheadBehind.hasRemote
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get ahead/behind counts for current branch
   * @returns {Promise<{ahead: number, behind: number, hasRemote: boolean}>}
   * @private
   */
  async getAheadBehind() {
    try {
      const result = await this.execGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
      if (result.code === 0) {
        const [behind, ahead] = result.stdout.split('\t').map(Number)
        return { ahead, behind, hasRemote: true }
      }
      return { ahead: 0, behind: 0, hasRemote: false }
    } catch {
      return { ahead: 0, behind: 0, hasRemote: false }
    }
  }

  /**
   * Convert status code to human-readable label
   * @param {string} code - Single character status code
   * @returns {string}
   * @private
   */
  getStatusLabel(code) {
    const labels = {
      'M': 'modified',
      'A': 'added',
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied',
      'U': 'unmerged',
      '?': 'untracked'
    }
    return labels[code] || 'unknown'
  }

  /**
   * Validate a branch name according to Git conventions
   * @param {string} name - Branch name to validate
   * @returns {{valid: boolean, error?: string}}
   */
  validateBranchName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Branch name is required' }
    }

    const trimmedName = name.trim()

    if (trimmedName.length === 0) {
      return { valid: false, error: 'Branch name cannot be empty' }
    }

    if (trimmedName.startsWith('.')) {
      return { valid: false, error: 'Branch name cannot start with "."' }
    }

    if (trimmedName.endsWith('/')) {
      return { valid: false, error: 'Branch name cannot end with "/"' }
    }

    if (trimmedName.endsWith('.lock')) {
      return { valid: false, error: 'Branch name cannot end with ".lock"' }
    }

    if (trimmedName.includes('..')) {
      return { valid: false, error: 'Branch name cannot contain ".."' }
    }

    if (trimmedName.includes('//')) {
      return { valid: false, error: 'Branch name cannot contain "//"' }
    }

    // Check for invalid characters
    const invalidChars = ['~', '^', ':', '?', '*', '[', '@{', '\\', ' ']
    for (const char of invalidChars) {
      if (trimmedName.includes(char)) {
        return { valid: false, error: `Branch name cannot contain "${char}"` }
      }
    }

    return { valid: true }
  }

  /**
   * Create a new branch
   * @param {string} name - Branch name
   * @param {Object} options - Options
   * @param {string} [options.prefix] - Branch prefix to apply
   * @param {boolean} [options.checkout=true] - Whether to checkout the new branch
   * @returns {Promise<{success: boolean, branch?: string, error?: string}>}
   */
  async createBranch(name, options = {}) {
    const { prefix = '', checkout = true } = options

    // Build full branch name
    const fullName = prefix ? `${prefix}${name}` : name

    // Validate branch name
    const validation = this.validateBranchName(fullName)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      // Check if branch already exists
      const branchCheck = await this.execGit(['rev-parse', '--verify', fullName])
      if (branchCheck.code === 0) {
        return { success: false, error: `Branch "${fullName}" already exists` }
      }

      // Create the branch
      const createArgs = checkout
        ? ['checkout', '-b', fullName]
        : ['branch', fullName]

      const result = await this.execGit(createArgs)

      if (result.code === 0) {
        return { success: true, branch: fullName }
      }

      return { success: false, error: result.stderr || 'Failed to create branch' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Checkout an existing branch
   * @param {string} name - Branch name to checkout
   * @returns {Promise<{success: boolean, branch?: string, error?: string}>}
   */
  async checkout(name) {
    try {
      const result = await this.execGit(['checkout', name])
      if (result.code === 0) {
        return { success: true, branch: name }
      }
      return { success: false, error: result.stderr || 'Failed to checkout branch' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Stage files for commit
   * @param {string|string[]} files - File path(s) to stage, or '.' for all
   * @returns {Promise<{success: boolean, staged?: string[], error?: string}>}
   */
  async stageFiles(files) {
    try {
      const fileList = Array.isArray(files) ? files : [files]
      const result = await this.execGit(['add', ...fileList])

      if (result.code === 0) {
        return { success: true, staged: fileList }
      }
      return { success: false, error: result.stderr || 'Failed to stage files' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Unstage files
   * @param {string|string[]} files - File path(s) to unstage
   * @returns {Promise<{success: boolean, unstaged?: string[], error?: string}>}
   */
  async unstageFiles(files) {
    try {
      const fileList = Array.isArray(files) ? files : [files]
      const result = await this.execGit(['reset', 'HEAD', '--', ...fileList])

      if (result.code === 0) {
        return { success: true, unstaged: fileList }
      }
      return { success: false, error: result.stderr || 'Failed to unstage files' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Create a commit
   * @param {string} message - Commit message
   * @returns {Promise<{success: boolean, hash?: string, error?: string}>}
   */
  async commit(message) {
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return { success: false, error: 'Commit message cannot be empty' }
    }

    try {
      // Check if there are staged changes
      const statusResult = await this.getStatus()
      if (statusResult.success && statusResult.status.files.staged.length === 0) {
        return { success: false, error: 'No changes staged for commit' }
      }

      const result = await this.execGit(['commit', '-m', message.trim()])

      if (result.code === 0) {
        // Extract commit hash from output
        const hashMatch = result.stdout.match(/\[[\w/-]+ ([a-f0-9]+)\]/)
        const hash = hashMatch ? hashMatch[1] : null

        return { success: true, hash, message: result.stdout }
      }

      return { success: false, error: result.stderr || 'Failed to create commit' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Merge a branch into the current branch
   * @param {string} sourceBranch - Branch to merge from
   * @param {Object} options - Merge options
   * @param {boolean} [options.noFf=false] - Create merge commit even for fast-forward
   * @returns {Promise<{success: boolean, merged?: boolean, conflicts?: string[], error?: string}>}
   */
  async merge(sourceBranch, options = {}) {
    const { noFf = false } = options

    try {
      // Check for uncommitted changes
      const statusResult = await this.getStatus()
      if (statusResult.success && statusResult.status.hasUncommittedChanges) {
        return {
          success: false,
          error: 'You have uncommitted changes. Please commit or stash them before merging.'
        }
      }

      // Build merge command
      const mergeArgs = ['merge', sourceBranch]
      if (noFf) {
        mergeArgs.push('--no-ff')
      }

      const result = await this.execGit(mergeArgs)

      if (result.code === 0) {
        return { success: true, merged: true }
      }

      // Check for merge conflicts
      if (result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT')) {
        const conflicts = await this.getConflictedFiles()
        return {
          success: false,
          merged: false,
          conflicts: conflicts.files,
          error: 'Merge conflicts detected. Please resolve conflicts manually and then commit.',
          guidance: [
            'The following files have conflicts:',
            ...conflicts.files.map(f => `  - ${f}`),
            '',
            'To resolve:',
            '1. Open each conflicted file and resolve the conflicts',
            '2. Stage the resolved files: git add <file>',
            '3. Complete the merge: git commit',
            '',
            'Or to abort the merge: git merge --abort'
          ].join('\n')
        }
      }

      return { success: false, error: result.stderr || 'Merge failed' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get list of conflicted files
   * @returns {Promise<{files: string[]}>}
   * @private
   */
  async getConflictedFiles() {
    try {
      const result = await this.execGit(['diff', '--name-only', '--diff-filter=U'])
      const files = result.stdout.split('\n').filter(f => f.trim())
      return { files }
    } catch {
      return { files: [] }
    }
  }

  /**
   * Abort an ongoing merge
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async abortMerge() {
    try {
      const result = await this.execGit(['merge', '--abort'])
      if (result.code === 0) {
        return { success: true }
      }
      return { success: false, error: result.stderr || 'Failed to abort merge' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Delete a branch
   * @param {string} name - Branch name to delete
   * @param {Object} options - Delete options
   * @param {boolean} [options.force=false] - Force delete even if not merged
   * @returns {Promise<{success: boolean, deleted?: string, error?: string}>}
   */
  async deleteBranch(name, options = {}) {
    const { force = false } = options

    try {
      // Prevent deletion of current branch
      const currentBranch = await this.getCurrentBranch()
      if (currentBranch.success && currentBranch.branch === name) {
        return { success: false, error: 'Cannot delete the current branch' }
      }

      const deleteFlag = force ? '-D' : '-d'
      const result = await this.execGit(['branch', deleteFlag, name])

      if (result.code === 0) {
        return { success: true, deleted: name }
      }

      return { success: false, error: result.stderr || 'Failed to delete branch' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get commit log
   * @param {Object} options - Log options
   * @param {number} [options.limit=50] - Number of commits to return
   * @param {string} [options.branch] - Branch to get log for (default: current)
   * @returns {Promise<{success: boolean, commits?: Array, error?: string}>}
   */
  async getLog(options = {}) {
    const { limit = 50, branch } = options

    try {
      const logArgs = [
        'log',
        `--max-count=${limit}`,
        '--format=%H|%h|%an|%ae|%at|%s',
        branch || 'HEAD'
      ]

      const result = await this.execGit(logArgs)

      if (result.code === 0) {
        const commits = result.stdout
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [hash, shortHash, authorName, authorEmail, timestamp, subject] = line.split('|')
            return {
              hash,
              shortHash,
              author: { name: authorName, email: authorEmail },
              date: new Date(parseInt(timestamp) * 1000).toISOString(),
              message: subject
            }
          })

        return { success: true, commits }
      }

      return { success: false, error: result.stderr || 'Failed to get commit log' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get diff for a file or all files
   * @param {Object} options - Diff options
   * @param {string} [options.file] - Specific file to diff
   * @param {boolean} [options.staged=false] - Show staged changes
   * @returns {Promise<{success: boolean, diff?: string, error?: string}>}
   */
  async getDiff(options = {}) {
    const { file, staged = false } = options

    try {
      const diffArgs = ['diff']
      if (staged) {
        diffArgs.push('--staged')
      }
      if (file) {
        diffArgs.push('--', file)
      }

      const result = await this.execGit(diffArgs)

      if (result.code === 0) {
        return { success: true, diff: result.stdout }
      }

      return { success: false, error: result.stderr || 'Failed to get diff' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Configure Git user identity (name and email)
   * @param {string} name - User's name
   * @param {string} email - User's email
   * @param {boolean} global - Whether to set globally (default: false, repo-only)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async configureUserIdentity(name, email, global = false) {
    try {
      const scope = global ? '--global' : '--local'

      // Set user name
      const nameResult = await this.execGit(['config', scope, 'user.name', name])
      if (nameResult.code !== 0) {
        return { success: false, error: `Failed to set user name: ${nameResult.stderr}` }
      }

      // Set user email
      const emailResult = await this.execGit(['config', scope, 'user.email', email])
      if (emailResult.code !== 0) {
        return { success: false, error: `Failed to set user email: ${emailResult.stderr}` }
      }

      return { success: true, name, email, scope: global ? 'global' : 'local' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Get Git user identity configuration
   * @param {boolean} global - Whether to get global config (default: false, repo-only)
   * @returns {Promise<{success: boolean, name?: string, email?: string, error?: string}>}
   */
  async getUserIdentity(global = false) {
    try {
      const scope = global ? '--global' : '--local'

      const nameResult = await this.execGit(['config', scope, 'user.name'])
      const emailResult = await this.execGit(['config', scope, 'user.email'])

      return {
        success: true,
        name: nameResult.code === 0 ? nameResult.stdout : null,
        email: emailResult.code === 0 ? emailResult.stdout : null
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Check for active (executable) Git hooks in the repository
   * @returns {Promise<{hasActiveHooks: boolean, hooks: Array<string>}>}
   */
  async checkForActiveGitHooks() {
    if (!this.projectPath) {
      return { hasActiveHooks: false, hooks: [] }
    }

    const hooksDir = path.join(this.projectPath, '.git', 'hooks')

    try {
      const entries = await fs.readdir(hooksDir, { withFileTypes: true })
      const activeHooks = []

      for (const entry of entries) {
        // Skip .sample files (these are inactive templates)
        if (entry.name.endsWith('.sample')) continue

        // Check if it's a file (not a directory)
        if (!entry.isFile()) continue

        const hookPath = path.join(hooksDir, entry.name)
        try {
          const stats = await fs.stat(hookPath)
          // On Unix-like systems, check if executable bit is set
          // On Windows, just check if it's a non-sample file in hooks/
          if (process.platform === 'win32' || (stats.mode & 0o111) !== 0) {
            activeHooks.push(entry.name)
          }
        } catch {
          // Skip files we can't stat
        }
      }

      return {
        hasActiveHooks: activeHooks.length > 0,
        hooks: activeHooks
      }
    } catch (error) {
      // .git/hooks doesn't exist or isn't readable
      return { hasActiveHooks: false, hooks: [] }
    }
  }
}

module.exports = { GitService, DEFAULT_GIT_SETTINGS }
