/**
 * Puffin Git Panel Component
 *
 * A comprehensive Git integration panel that provides:
 * - Repository status display
 * - Branch management (create, switch, delete)
 * - File staging and committing
 * - Merge workflow with conflict detection
 * - Git operation history
 *
 * Developer-friendly with intuitive UX and clear feedback.
 */

export class GitPanelComponent {
  constructor(intents) {
    this.intents = intents

    // DOM references
    this.container = null
    this.statusIndicator = null

    // Git state (populated from API)
    this.isGitAvailable = false
    this.isRepository = false
    this.repositoryMessage = ''
    this.currentBranch = ''
    this.status = null
    this.branches = []
    this.operationHistory = []
    this.settings = {}

    // UI state
    this.activeTab = 'status' // 'status' | 'branches' | 'changes' | 'history'
    this.isLoading = false
    this.error = null

    // Staging state
    this.selectedFiles = new Set()
    this.commitMessage = ''

    // Branch creation state
    this.newBranchName = ''
    this.selectedPrefix = ''

    // Puffin state (for accessing handoffs)
    this.puffinState = null
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container = document.getElementById('git-panel-view')
    this.statusIndicator = document.getElementById('git-status-indicator')

    if (!this.container) {
      console.warn('[GitPanel] Container #git-panel-view not found, skipping initialization')
      return
    }

    console.log('[GitPanel] Initialized successfully')

    this.bindEvents()
    this.subscribeToState()
    this.setupStatusIndicatorClick()

    // Render initial loading state
    this.render()

    // Initial data load
    await this.refreshGitState()
  }

  /**
   * Bind DOM event handlers
   */
  bindEvents() {
    // Use event delegation for dynamic content
    this.container.addEventListener('click', (e) => this.handleClick(e))
    this.container.addEventListener('change', (e) => this.handleChange(e))
    this.container.addEventListener('input', (e) => this.handleInput(e))
  }

  /**
   * Subscribe to SAM state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      // Store the state for accessing handoffs and other context
      this.puffinState = state
    })
  }

  /**
   * Setup click handler on the Git status indicator in the header
   */
  setupStatusIndicatorClick() {
    if (this.statusIndicator) {
      this.statusIndicator.style.cursor = 'pointer'
      this.statusIndicator.addEventListener('click', () => {
        this.intents.switchView('git')
      })
    }
  }

  /**
   * Handle click events via delegation
   */
  async handleClick(e) {
    const target = e.target.closest('[data-action]')
    if (!target) return

    const action = target.dataset.action
    const value = target.dataset.value

    switch (action) {
      case 'switch-tab':
        this.activeTab = value
        this.render()
        break

      case 'refresh':
        await this.refreshGitState()
        break

      case 'create-branch':
        await this.handleCreateBranch()
        break

      case 'checkout-branch':
        await this.handleCheckout(value)
        break

      case 'delete-branch':
        await this.handleDeleteBranch(value)
        break

      case 'stage-file':
        await this.handleStageFile(value)
        break

      case 'unstage-file':
        await this.handleUnstageFile(value)
        break

      case 'stage-all':
        await this.handleStageAll()
        break

      case 'unstage-all':
        await this.handleUnstageAll()
        break

      case 'commit':
        await this.handleCommit()
        break

      case 'generate-commit-message':
        await this.handleGenerateCommitMessage()
        break

      case 'merge-branch':
        await this.handleMerge(value)
        break

      case 'merge-current-to':
        await this.handleMergeCurrentTo()
        break

      case 'toggle-file-select':
        this.toggleFileSelection(value)
        break

      case 'set-prefix':
        this.selectedPrefix = value
        this.render()
        break
    }
  }

  /**
   * Handle input events
   */
  handleInput(e) {
    const target = e.target

    if (target.id === 'git-branch-name') {
      this.newBranchName = target.value
      // Update create branch button state
      const createBtn = this.container.querySelector('[data-action="create-branch"]')
      if (createBtn) {
        createBtn.disabled = !this.newBranchName.trim()
      }
    } else if (target.id === 'git-commit-message') {
      this.commitMessage = target.value
      // Update commit button state immediately
      const commitBtn = this.container.querySelector('[data-action="commit"]')
      if (commitBtn) {
        commitBtn.disabled = !this.commitMessage.trim()
      }
    }
  }

  /**
   * Handle change events
   */
  handleChange(e) {
    const target = e.target

    if (target.id === 'git-branch-prefix') {
      this.selectedPrefix = target.value
    }
  }

  /**
   * Refresh all Git state from backend
   */
  async refreshGitState() {
    this.isLoading = true
    this.error = null
    this.render()

    try {
      // Check if Git is available
      const availableResult = await window.puffin.git.isAvailable()
      this.isGitAvailable = availableResult.success && availableResult.available

      if (!this.isGitAvailable) {
        this.error = 'Git is not installed or not available in PATH'
        this.isLoading = false
        this.render()
        return
      }

      // Check if this is a Git repository
      const repoResult = await window.puffin.git.isRepository()
      this.isRepository = repoResult.success && repoResult.isRepo
      this.repositoryMessage = repoResult.message || ''

      if (!this.isRepository) {
        this.isLoading = false
        this.render()
        this.updateStatusIndicator()
        return
      }

      // Get full status
      const [statusResult, branchesResult, historyResult, settingsResult] = await Promise.all([
        window.puffin.git.getStatus(),
        window.puffin.git.getBranches(),
        window.puffin.git.getOperationHistory({ limit: 50 }),
        window.puffin.git.getSettings()
      ])

      if (statusResult.success) {
        this.status = statusResult.status
        this.currentBranch = this.status.branch
      }

      if (branchesResult.success) {
        this.branches = branchesResult.branches
      }

      if (historyResult.success) {
        this.operationHistory = historyResult.history
      }

      if (settingsResult.success) {
        this.settings = settingsResult.settings
      }

    } catch (err) {
      this.error = err.message
    }

    this.isLoading = false
    this.render()
    this.updateStatusIndicator()
  }

  /**
   * Update the header status indicator
   */
  updateStatusIndicator() {
    if (!this.statusIndicator) return

    if (!this.isGitAvailable || !this.isRepository) {
      this.statusIndicator.innerHTML = ''
      this.statusIndicator.className = 'git-indicator hidden'
      return
    }

    const hasChanges = this.status?.hasChanges
    const statusClass = hasChanges ? 'has-changes' : 'clean'

    this.statusIndicator.className = `git-indicator ${statusClass}`
    this.statusIndicator.innerHTML = `
      <span class="git-branch-icon">⎇</span>
      <span class="git-branch-name">${this.escapeHtml(this.currentBranch)}</span>
      ${hasChanges ? '<span class="git-changes-dot" title="Uncommitted changes">●</span>' : ''}
    `
    this.statusIndicator.classList.remove('hidden')
  }

  /**
   * Handle creating a new branch
   */
  async handleCreateBranch() {
    const name = this.newBranchName.trim()
    if (!name) {
      this.showToast('Please enter a branch name', 'error')
      return
    }

    // Validate branch name
    const validation = await window.puffin.git.validateBranchName(
      this.selectedPrefix ? `${this.selectedPrefix}${name}` : name
    )

    if (!validation.valid) {
      this.showToast(validation.error, 'error')
      return
    }

    this.isLoading = true
    this.render()

    try {
      const result = await window.puffin.git.createBranch(name, this.selectedPrefix, true)

      if (result.success) {
        this.showToast(`Created and switched to branch: ${result.branch}`, 'success')
        this.newBranchName = ''
        this.selectedPrefix = ''
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }

    this.isLoading = false
    this.render()
  }

  /**
   * Handle checking out a branch
   */
  async handleCheckout(branchName) {
    if (branchName === this.currentBranch) return

    this.isLoading = true
    this.render()

    try {
      const result = await window.puffin.git.checkout(branchName)

      if (result.success) {
        this.showToast(`Switched to branch: ${result.branch}`, 'success')
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }

    this.isLoading = false
    this.render()
  }

  /**
   * Handle deleting a branch
   */
  async handleDeleteBranch(branchName) {
    if (branchName === this.currentBranch) {
      this.showToast('Cannot delete the current branch', 'error')
      return
    }

    if (!confirm(`Delete branch "${branchName}"? This cannot be undone.`)) {
      return
    }

    try {
      const result = await window.puffin.git.deleteBranch(branchName, false)

      if (result.success) {
        this.showToast(`Deleted branch: ${result.deleted}`, 'success')
        await this.refreshGitState()
      } else {
        // Offer force delete if branch is not merged
        if (result.error.includes('not fully merged')) {
          if (confirm(`Branch "${branchName}" is not fully merged. Force delete?`)) {
            const forceResult = await window.puffin.git.deleteBranch(branchName, true)
            if (forceResult.success) {
              this.showToast(`Force deleted branch: ${forceResult.deleted}`, 'success')
              await this.refreshGitState()
            } else {
              this.showToast(forceResult.error, 'error')
            }
          }
        } else {
          this.showToast(result.error, 'error')
        }
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }
  }

  /**
   * Handle staging a file
   */
  async handleStageFile(filePath) {
    try {
      const result = await window.puffin.git.stageFiles(filePath)
      if (result.success) {
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }
  }

  /**
   * Handle unstaging a file
   */
  async handleUnstageFile(filePath) {
    try {
      const result = await window.puffin.git.unstageFiles(filePath)
      if (result.success) {
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }
  }

  /**
   * Handle staging all files
   */
  async handleStageAll() {
    try {
      const result = await window.puffin.git.stageFiles('.')
      if (result.success) {
        this.showToast('Staged all changes', 'success')
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }
  }

  /**
   * Handle unstaging all files
   */
  async handleUnstageAll() {
    if (!this.status?.files?.staged?.length) return

    try {
      const files = this.status.files.staged.map(f => f.path)
      const result = await window.puffin.git.unstageFiles(files)
      if (result.success) {
        this.showToast('Unstaged all changes', 'success')
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }
  }

  /**
   * Handle generating a commit message with Claude
   */
  async handleGenerateCommitMessage() {
    if (!this.status?.files?.staged?.length) {
      this.showToast('No changes staged - stage files first', 'error')
      return
    }

    // Show loading state on button
    const generateBtn = this.container.querySelector('[data-action="generate-commit-message"]')
    const originalText = generateBtn?.textContent
    if (generateBtn) {
      generateBtn.textContent = 'Generating...'
      generateBtn.disabled = true
    }

    try {
      // Get the diff of staged changes
      const diffResult = await window.puffin.git.getDiff({ staged: true })

      if (!diffResult.success) {
        this.showToast('Could not get staged changes diff: ' + (diffResult.error || 'Unknown error'), 'error')
        return
      }

      // Get list of staged files for context
      const stagedFiles = this.status.files.staged.map(f => `${f.status}: ${f.path}`).join('\n')

      // If diff is empty (e.g., only new files added), use file list as context
      const diffContent = diffResult.diff || '(New files staged - no diff available)'

      // Create prompt for Claude
      const prompt = `Generate a concise, professional git commit message for these changes.

STAGED FILES:
${stagedFiles}

DIFF:
${diffContent.substring(0, 8000)}

Rules:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore
- Keep the first line under 72 characters
- Be specific about what changed
- Do not include any explanation, just return the commit message itself
- If there are multiple changes, summarize the main purpose`

      // Call Claude to generate the message
      console.log('[GIT-PANEL] Calling sendPrompt with prompt length:', prompt.length)
      const response = await window.puffin.claude.sendPrompt(prompt, {
        model: 'haiku',
        maxTokens: 200
      })
      console.log('[GIT-PANEL] sendPrompt response:', JSON.stringify(response, null, 2))

      if (response.success && response.response) {
        // Clean up the response - remove any markdown code blocks
        let message = response.response.trim()
        message = message.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim()

        // Update the commit message textarea
        this.commitMessage = message
        const textarea = this.container.querySelector('#git-commit-message')
        if (textarea) {
          textarea.value = message
        }

        // Enable commit button
        const commitBtn = this.container.querySelector('[data-action="commit"]')
        if (commitBtn) {
          commitBtn.disabled = false
        }

        this.showToast('Commit message generated', 'success')
      } else {
        this.showToast('Failed to generate commit message', 'error')
      }
    } catch (err) {
      console.error('Error generating commit message:', err)
      this.showToast('Error generating commit message: ' + err.message, 'error')
    } finally {
      // Restore button state
      if (generateBtn) {
        generateBtn.textContent = originalText || 'Generate'
        generateBtn.disabled = false
      }
    }
  }

  /**
   * Handle creating a commit
   */
  async handleCommit() {
    const message = this.commitMessage.trim()
    if (!message) {
      this.showToast('Please enter a commit message', 'error')
      return
    }

    if (!this.status?.files?.staged?.length) {
      this.showToast('No changes staged for commit', 'error')
      return
    }

    this.isLoading = true
    this.render()

    try {
      const result = await window.puffin.git.commit(message)

      if (result.success) {
        this.showToast(`Committed: ${result.hash}`, 'success')
        this.commitMessage = ''
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
      }
    } catch (err) {
      this.showToast(err.message, 'error')
    }

    this.isLoading = false
    this.render()
  }

  /**
   * Handle merging current branch into target branch - shows the merge dialog
   * @param {string} targetBranch - The branch to merge INTO
   */
  async handleMerge(targetBranch) {
    // Check for uncommitted changes first
    if (this.status?.hasUncommittedChanges) {
      this.showUncommittedChangesWarning()
      return
    }

    // sourceBranch is the current branch, targetBranch is where we're merging to
    this.showMergeDialog(this.currentBranch, targetBranch)
  }

  /**
   * Handle "Merge To..." button on current branch - shows dialog to select target
   */
  async handleMergeCurrentTo() {
    // Check for uncommitted changes first
    if (this.status?.hasUncommittedChanges) {
      this.showUncommittedChangesWarning()
      return
    }

    // Show dialog with target branch selection
    this.showMergeDialog(this.currentBranch)
  }

  /**
   * Show warning dialog for uncommitted changes
   */
  showUncommittedChangesWarning(sourceBranch) {
    const dialog = document.createElement('div')
    dialog.className = 'git-dialog-overlay'
    dialog.innerHTML = `
      <div class="git-dialog git-warning-dialog">
        <h3>⚠️ Uncommitted Changes</h3>
        <p>You have uncommitted changes in your working tree. Please commit or stash your changes before merging.</p>
        <div class="uncommitted-files-preview">
          ${this.renderUncommittedFilesList()}
        </div>
        <div class="git-dialog-actions">
          <button class="btn secondary" data-action="dismiss-dialog">Cancel</button>
          <button class="btn primary" data-action="go-to-changes">View Changes</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    dialog.addEventListener('click', (e) => {
      const action = e.target.dataset.action

      if (action === 'dismiss-dialog') {
        dialog.remove()
      } else if (action === 'go-to-changes') {
        dialog.remove()
        this.activeTab = 'changes'
        this.render()
      }
    })
  }

  /**
   * Render a list of uncommitted files for the warning dialog
   */
  renderUncommittedFilesList() {
    const files = []
    if (this.status?.files?.staged) {
      files.push(...this.status.files.staged.map(f => ({ ...f, section: 'staged' })))
    }
    if (this.status?.files?.unstaged) {
      files.push(...this.status.files.unstaged.map(f => ({ ...f, section: 'unstaged' })))
    }
    if (this.status?.files?.untracked) {
      files.push(...this.status.files.untracked.map(f => ({ path: f.path || f, status: 'untracked', section: 'untracked' })))
    }

    if (files.length === 0) {
      return '<p class="empty-message">No files to display</p>'
    }

    const displayFiles = files.slice(0, 5)
    const remaining = files.length - displayFiles.length

    return `
      <ul class="uncommitted-files-list">
        ${displayFiles.map(f => `
          <li>
            <span class="file-status ${f.status}">${this.getStatusIcon(f.status)}</span>
            <span class="file-path">${this.escapeHtml(f.path)}</span>
          </li>
        `).join('')}
      </ul>
      ${remaining > 0 ? `<p class="files-remaining">...and ${remaining} more file${remaining !== 1 ? 's' : ''}</p>` : ''}
    `
  }

  /**
   * Detect the main/master branch
   */
  getMainBranch() {
    // Check for common main branch names
    const mainBranchNames = ['main', 'master', 'develop', 'development']
    for (const name of mainBranchNames) {
      const found = this.branches.find(b => b.name === name)
      if (found) {
        return found.name
      }
    }
    // Default to first branch if no common name found
    return this.branches.length > 0 ? this.branches[0].name : 'main'
  }

  /**
   * Show the merge dialog with target branch selection
   * @param {string} sourceBranch - The branch to merge FROM (usually current)
   * @param {string} [preselectedTarget] - Optional pre-selected target branch
   */
  showMergeDialog(sourceBranch, preselectedTarget = null) {
    const mainBranch = this.getMainBranch()
    const targetBranches = this.branches.filter(b => b.name !== sourceBranch)

    // Determine the default selected target
    const defaultTarget = preselectedTarget || mainBranch

    const dialog = document.createElement('div')
    dialog.className = 'git-dialog-overlay'
    dialog.innerHTML = `
      <div class="git-dialog git-merge-dialog">
        <h3>Merge Branch</h3>
        <p>Merge <strong>${this.escapeHtml(sourceBranch)}</strong> into the selected target branch.</p>

        <div class="merge-branch-selector">
          <label for="merge-target-branch">Target Branch (merge into)</label>
          <select id="merge-target-branch" class="merge-target-select">
            ${targetBranches.map(b => `
              <option value="${this.escapeHtml(b.name)}" ${b.name === defaultTarget ? 'selected' : ''}>
                ${this.escapeHtml(b.name)}${b.name === mainBranch ? ' ★' : ''}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="merge-preview">
          <div class="merge-arrow">
            <span class="branch-badge source">${this.escapeHtml(sourceBranch)}</span>
            <span class="arrow">→</span>
            <span class="branch-badge target" id="merge-target-preview">${this.escapeHtml(defaultTarget)}</span>
          </div>
        </div>

        <div class="git-dialog-actions">
          <button class="btn secondary" data-action="dismiss-dialog">Cancel</button>
          <button class="btn primary" data-action="execute-merge">Merge</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    // Update preview when target changes
    const targetSelect = dialog.querySelector('#merge-target-branch')
    const targetPreview = dialog.querySelector('#merge-target-preview')
    targetSelect.addEventListener('change', () => {
      targetPreview.textContent = targetSelect.value
    })

    dialog.addEventListener('click', async (e) => {
      const action = e.target.dataset.action

      if (action === 'dismiss-dialog') {
        dialog.remove()
      } else if (action === 'execute-merge') {
        const targetBranch = targetSelect.value
        dialog.remove()
        await this.executeMerge(sourceBranch, targetBranch)
      }
    })
  }

  /**
   * Execute the merge operation
   */
  async executeMerge(sourceBranch, targetBranch) {
    this.isLoading = true
    this.render()

    const originalBranch = this.currentBranch
    const needsCheckout = targetBranch !== this.currentBranch

    try {
      if (needsCheckout) {
        const checkoutResult = await window.puffin.git.checkout(targetBranch)
        if (!checkoutResult.success) {
          this.showToast(`Failed to switch to ${targetBranch}: ${checkoutResult.error}`, 'error')
          this.isLoading = false
          this.render()
          return
        }

        // After checkout, refresh status and check for uncommitted changes on target branch
        const statusResult = await window.puffin.git.getStatus()
        if (statusResult.success && statusResult.status.hasUncommittedChanges) {
          this.status = statusResult.status
          this.currentBranch = statusResult.status.branch
          this.isLoading = false
          this.render()
          this.showUncommittedChangesWarning()
          // Switch back to original branch since we can't merge
          await window.puffin.git.checkout(originalBranch)
          await this.refreshGitState()
          return
        }
      }

      const result = await window.puffin.git.merge(sourceBranch, false)

      if (result.success) {
        this.showToast(`Successfully merged ${sourceBranch} into ${targetBranch}`, 'success')

        // Stay on the target branch so the merged source branch can be deleted
        // (git cannot delete the currently checked-out branch)
        await this.refreshGitState()

        // Offer post-merge workflow (delete source branch, create new branch)
        this.showPostMergeDialog(sourceBranch)
      } else if (result.conflicts) {
        // Abort the conflicted merge and switch back
        if (needsCheckout) {
          await window.puffin.git.abortMerge()
          await window.puffin.git.checkout(originalBranch)
        }
        this.showMergeConflictDialog(result.conflicts, result.guidance)
        await this.refreshGitState()
      } else {
        this.showToast(result.error, 'error')
        if (needsCheckout) {
          await window.puffin.git.checkout(originalBranch)
          await this.refreshGitState()
        }
      }
    } catch (err) {
      this.showToast(err.message, 'error')
      // Best-effort switch back on unexpected error
      if (needsCheckout) {
        try { await window.puffin.git.checkout(originalBranch) } catch (_) { /* ignore */ }
        await this.refreshGitState()
      }
    }

    this.isLoading = false
    this.render()
  }

  /**
   * Show post-merge workflow dialog
   */
  showPostMergeDialog(mergedBranch) {
    const dialog = document.createElement('div')
    dialog.className = 'git-dialog-overlay'
    dialog.innerHTML = `
      <div class="git-dialog">
        <h3>Merge Complete</h3>
        <p>Successfully merged <strong>${this.escapeHtml(mergedBranch)}</strong> into <strong>${this.escapeHtml(this.currentBranch)}</strong>.</p>
        <div class="git-dialog-options">
          <label>
            <input type="checkbox" id="delete-merged-branch" checked>
            Delete merged branch (${this.escapeHtml(mergedBranch)})
          </label>
          <label>
            <input type="checkbox" id="create-new-branch">
            Create new feature branch
          </label>
          <input type="text" id="new-branch-after-merge" placeholder="New branch name" class="hidden">
        </div>
        <div class="git-dialog-actions">
          <button class="btn secondary" data-action="dismiss-dialog">Skip</button>
          <button class="btn primary" data-action="complete-post-merge">Continue</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    // Handle checkbox toggle for new branch input
    const createNewBranchCheckbox = dialog.querySelector('#create-new-branch')
    const newBranchInput = dialog.querySelector('#new-branch-after-merge')
    createNewBranchCheckbox.addEventListener('change', () => {
      newBranchInput.classList.toggle('hidden', !createNewBranchCheckbox.checked)
    })

    // Handle dialog actions
    dialog.addEventListener('click', async (e) => {
      const action = e.target.dataset.action

      if (action === 'dismiss-dialog') {
        dialog.remove()
      } else if (action === 'complete-post-merge') {
        const deleteMerged = dialog.querySelector('#delete-merged-branch').checked
        const createNew = createNewBranchCheckbox.checked
        const newBranchName = newBranchInput.value.trim()

        dialog.remove()

        if (deleteMerged) {
          await this.handleDeleteBranch(mergedBranch)
        }

        if (createNew && newBranchName) {
          this.newBranchName = newBranchName
          await this.handleCreateBranch()
        }
      }
    })
  }

  /**
   * Show merge conflict dialog
   */
  showMergeConflictDialog(conflicts, guidance) {
    const dialog = document.createElement('div')
    dialog.className = 'git-dialog-overlay'
    dialog.innerHTML = `
      <div class="git-dialog git-conflict-dialog">
        <h3>⚠️ Merge Conflicts Detected</h3>
        <p>The following files have conflicts that need to be resolved:</p>
        <ul class="conflict-file-list">
          ${conflicts.map(f => `<li><code>${this.escapeHtml(f)}</code></li>`).join('')}
        </ul>
        <div class="conflict-guidance">
          <h4>How to resolve:</h4>
          <ol>
            <li>Open each conflicted file in your editor</li>
            <li>Look for conflict markers: <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code>, <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code></li>
            <li>Edit the file to resolve the conflicts</li>
            <li>Stage the resolved files using this panel</li>
            <li>Create a commit to complete the merge</li>
          </ol>
          <p class="conflict-tip">💡 To abort the merge: <code>git merge --abort</code></p>
        </div>
        <div class="git-dialog-actions">
          <button class="btn secondary" data-action="abort-merge">Abort Merge</button>
          <button class="btn primary" data-action="dismiss-dialog">I'll Resolve Manually</button>
        </div>
      </div>
    `

    document.body.appendChild(dialog)

    dialog.addEventListener('click', async (e) => {
      const action = e.target.dataset.action

      if (action === 'dismiss-dialog') {
        dialog.remove()
        await this.refreshGitState()
      } else if (action === 'abort-merge') {
        dialog.remove()
        try {
          const result = await window.puffin.git.abortMerge()
          if (result.success) {
            this.showToast('Merge aborted', 'info')
          } else {
            this.showToast(result.error, 'error')
          }
        } catch (err) {
          this.showToast(err.message, 'error')
        }
        await this.refreshGitState()
      }
    })
  }

  /**
   * Toggle file selection for batch operations
   */
  toggleFileSelection(filePath) {
    if (this.selectedFiles.has(filePath)) {
      this.selectedFiles.delete(filePath)
    } else {
      this.selectedFiles.add(filePath)
    }
    this.render()
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    // Use Puffin's toast system if available
    if (window.puffinApp?.showToast) {
      window.puffinApp.showToast(message, type)
    } else {
      console.log(`[Git ${type}] ${message}`)
    }
  }

  /**
   * Render the component
   */
  render() {
    if (!this.container) return

    // Render loading state
    if (this.isLoading) {
      this.container.innerHTML = `
        <div class="git-panel">
          <div class="git-loading">
            <span class="spinner"></span>
            <span>Loading Git status...</span>
          </div>
        </div>
      `
      return
    }

    // Render error state
    if (this.error) {
      this.container.innerHTML = `
        <div class="git-panel">
          <div class="git-error">
            <span class="error-icon">⚠️</span>
            <span>${this.escapeHtml(this.error)}</span>
            <button class="btn small" data-action="refresh">Retry</button>
          </div>
        </div>
      `
      return
    }

    // Render not a repository state
    if (!this.isRepository) {
      this.container.innerHTML = `
        <div class="git-panel">
          <div class="git-not-repo">
            <div class="not-repo-icon">📁</div>
            <h3>Not a Git Repository</h3>
            <p>${this.escapeHtml(this.repositoryMessage)}</p>
            <div class="git-init-help">
              <p>To initialize Git for this project, run in your terminal:</p>
              <code>cd "${this.escapeHtml(window.__puffin_projectPath || '.')}"<br>git init</code>
            </div>
            <button class="btn primary" data-action="refresh">Check Again</button>
          </div>
        </div>
      `
      return
    }

    // Render main Git panel
    this.container.innerHTML = `
      <div class="git-panel">
        ${this.renderHeader()}
        ${this.renderTabs()}
        ${this.renderTabContent()}
      </div>
    `
  }

  /**
   * Render panel header
   */
  renderHeader() {
    const ahead = this.status?.ahead || 0
    const behind = this.status?.behind || 0
    const hasRemote = this.status?.hasRemote

    return `
      <div class="git-header">
        <div class="git-branch-info">
          <span class="git-branch-icon">⎇</span>
          <span class="git-current-branch">${this.escapeHtml(this.currentBranch)}</span>
          ${hasRemote ? `
            <span class="git-remote-status">
              ${ahead > 0 ? `<span class="ahead" title="${ahead} commit(s) ahead">↑${ahead}</span>` : ''}
              ${behind > 0 ? `<span class="behind" title="${behind} commit(s) behind">↓${behind}</span>` : ''}
              ${ahead === 0 && behind === 0 ? '<span class="synced" title="Up to date">✓</span>' : ''}
            </span>
          ` : ''}
        </div>
        <button class="btn icon-btn" data-action="refresh" title="Refresh">↻</button>
      </div>
    `
  }

  /**
   * Render tab navigation
   */
  renderTabs() {
    const tabs = [
      { id: 'status', label: 'Status', icon: '📊' },
      { id: 'branches', label: 'Branches', icon: '⎇' },
      { id: 'changes', label: 'Changes', icon: '📝', badge: this.getChangesCount() },
      { id: 'history', label: 'History', icon: '📜' }
    ]

    return `
      <div class="git-tabs">
        ${tabs.map(tab => `
          <button
            class="git-tab ${this.activeTab === tab.id ? 'active' : ''}"
            data-action="switch-tab"
            data-value="${tab.id}"
          >
            <span class="tab-icon">${tab.icon}</span>
            <span class="tab-label">${tab.label}</span>
            ${tab.badge ? `<span class="tab-badge">${tab.badge}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `
  }

  /**
   * Get total changes count for badge
   */
  getChangesCount() {
    if (!this.status?.files) return 0
    const { staged, unstaged, untracked } = this.status.files
    return (staged?.length || 0) + (unstaged?.length || 0) + (untracked?.length || 0)
  }

  /**
   * Render tab content
   */
  renderTabContent() {
    switch (this.activeTab) {
      case 'status':
        return this.renderStatusTab()
      case 'branches':
        return this.renderBranchesTab()
      case 'changes':
        return this.renderChangesTab()
      case 'history':
        return this.renderHistoryTab()
      default:
        return ''
    }
  }

  /**
   * Render Status tab
   */
  renderStatusTab() {
    const { staged, unstaged, untracked } = this.status?.files || {}
    const hasChanges = this.status?.hasChanges

    return `
      <div class="git-tab-content git-status-tab">
        <div class="git-status-summary ${hasChanges ? 'has-changes' : 'clean'}">
          <div class="status-icon">${hasChanges ? '⚡' : '✓'}</div>
          <div class="status-text">
            <h4>${hasChanges ? 'Working tree has changes' : 'Working tree is clean'}</h4>
            ${hasChanges ? `
              <p>
                ${staged?.length ? `${staged.length} staged` : ''}
                ${unstaged?.length ? `${staged?.length ? ', ' : ''}${unstaged.length} modified` : ''}
                ${untracked?.length ? `${(staged?.length || unstaged?.length) ? ', ' : ''}${untracked.length} untracked` : ''}
              </p>
            ` : '<p>Nothing to commit</p>'}
          </div>
        </div>

        ${hasChanges ? `
          <div class="git-quick-actions">
            <button class="btn primary" data-action="switch-tab" data-value="changes">
              View Changes
            </button>
          </div>
        ` : ''}

        <div class="git-status-details">
          <h4>Repository Info</h4>
          <dl class="status-details-list">
            <dt>Current Branch</dt>
            <dd>${this.escapeHtml(this.currentBranch)}</dd>
            <dt>Total Branches</dt>
            <dd>${this.branches.length}</dd>
            ${this.status?.hasRemote ? `
              <dt>Remote Status</dt>
              <dd>
                ${this.status.ahead > 0 ? `${this.status.ahead} ahead` : ''}
                ${this.status.behind > 0 ? `${this.status.ahead > 0 ? ', ' : ''}${this.status.behind} behind` : ''}
                ${this.status.ahead === 0 && this.status.behind === 0 ? 'Up to date' : ''}
              </dd>
            ` : `
              <dt>Remote</dt>
              <dd class="muted">No remote configured</dd>
            `}
          </dl>
        </div>
      </div>
    `
  }

  /**
   * Render Branches tab
   */
  renderBranchesTab() {
    const prefixes = this.settings?.branchPrefixes || ['feature/', 'bugfix/', 'hotfix/', 'release/']

    return `
      <div class="git-tab-content git-branches-tab">
        <div class="git-create-branch">
          <h4>Create New Branch</h4>
          <div class="create-branch-form">
            <div class="branch-prefix-selector">
              <button
                class="prefix-btn ${this.selectedPrefix === '' ? 'active' : ''}"
                data-action="set-prefix"
                data-value=""
              >none</button>
              ${prefixes.map(p => `
                <button
                  class="prefix-btn ${this.selectedPrefix === p ? 'active' : ''}"
                  data-action="set-prefix"
                  data-value="${p}"
                >${p}</button>
              `).join('')}
            </div>
            <div class="branch-name-input">
              <span class="prefix-preview">${this.escapeHtml(this.selectedPrefix)}</span>
              <input
                type="text"
                id="git-branch-name"
                placeholder="branch-name"
                value="${this.escapeHtml(this.newBranchName)}"
              >
            </div>
            <button class="btn primary" data-action="create-branch" ${!this.newBranchName.trim() ? 'disabled' : ''}>
              Create & Switch
            </button>
          </div>
        </div>

        <div class="git-branch-list">
          <h4>Local Branches</h4>
          <ul class="branch-list">
            ${this.branches.map(branch => `
              <li class="branch-item ${branch.current ? 'current' : ''}">
                <span class="branch-name">
                  ${branch.current ? '<span class="current-indicator">●</span>' : ''}
                  ${this.escapeHtml(branch.name)}
                </span>
                <div class="branch-actions">
                  ${!branch.current ? `
                    <button
                      class="btn small"
                      data-action="checkout-branch"
                      data-value="${this.escapeHtml(branch.name)}"
                      title="Switch to this branch"
                    >Switch</button>
                    <button
                      class="btn small primary"
                      data-action="merge-branch"
                      data-value="${this.escapeHtml(branch.name)}"
                      title="Merge ${this.escapeHtml(this.currentBranch)} into ${this.escapeHtml(branch.name)}"
                    >Merge Here</button>
                    <button
                      class="btn small danger"
                      data-action="delete-branch"
                      data-value="${this.escapeHtml(branch.name)}"
                      title="Delete branch"
                    >×</button>
                  ` : `
                    <button
                      class="btn small primary"
                      data-action="merge-current-to"
                      title="Merge this branch into another branch"
                    >Merge To...</button>
                  `}
                </div>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `
  }

  /**
   * Render Changes tab
   */
  renderChangesTab() {
    const { staged, unstaged, untracked } = this.status?.files || {}
    const hasStaged = staged?.length > 0
    const hasUnstaged = unstaged?.length > 0 || untracked?.length > 0

    return `
      <div class="git-tab-content git-changes-tab">
        <!-- Staged Changes -->
        <div class="git-changes-section">
          <div class="section-header">
            <h4>Staged Changes ${hasStaged ? `(${staged.length})` : ''}</h4>
            ${hasStaged ? `
              <button class="btn small" data-action="unstage-all">Unstage All</button>
            ` : ''}
          </div>
          ${hasStaged ? `
            <ul class="file-list staged">
              ${staged.map(file => `
                <li class="file-item">
                  <span class="file-status ${file.status}">${this.getStatusIcon(file.status)}</span>
                  <span class="file-path">${this.escapeHtml(file.path)}</span>
                  <button
                    class="btn small"
                    data-action="unstage-file"
                    data-value="${this.escapeHtml(file.path)}"
                  >−</button>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="empty-message">No staged changes</p>'}
        </div>

        <!-- Unstaged Changes -->
        <div class="git-changes-section">
          <div class="section-header">
            <h4>Changes ${hasUnstaged ? `(${(unstaged?.length || 0) + (untracked?.length || 0)})` : ''}</h4>
            ${hasUnstaged ? `
              <button class="btn small primary" data-action="stage-all">Stage All</button>
            ` : ''}
          </div>
          ${hasUnstaged ? `
            <ul class="file-list unstaged">
              ${(unstaged || []).map(file => `
                <li class="file-item">
                  <span class="file-status ${file.status}">${this.getStatusIcon(file.status)}</span>
                  <span class="file-path">${this.escapeHtml(file.path)}</span>
                  <button
                    class="btn small primary"
                    data-action="stage-file"
                    data-value="${this.escapeHtml(file.path)}"
                  >+</button>
                </li>
              `).join('')}
              ${(untracked || []).map(file => `
                <li class="file-item">
                  <span class="file-status untracked">?</span>
                  <span class="file-path">${this.escapeHtml(file.path)}</span>
                  <button
                    class="btn small primary"
                    data-action="stage-file"
                    data-value="${this.escapeHtml(file.path)}"
                  >+</button>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="empty-message">No unstaged changes</p>'}
        </div>

        <!-- Commit Section -->
        ${hasStaged ? `
          <div class="git-commit-section">
            <div class="commit-header">
              <h4>Commit</h4>
              <button
                class="btn small secondary"
                data-action="generate-commit-message"
                title="Generate commit message with Claude"
              >✨ Generate</button>
            </div>
            <textarea
              id="git-commit-message"
              placeholder="Enter commit message or click Generate..."
              rows="3"
            >${this.escapeHtml(this.commitMessage)}</textarea>
            <button
              class="btn primary"
              data-action="commit"
              ${!this.commitMessage.trim() ? 'disabled' : ''}
            >
              Commit ${staged.length} file${staged.length !== 1 ? 's' : ''}
            </button>
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render History tab
   */
  renderHistoryTab() {
    return `
      <div class="git-tab-content git-history-tab">
        <h4>Puffin Git Operations</h4>
        ${this.operationHistory.length > 0 ? `
          <ul class="operation-history-list">
            ${this.operationHistory.map(op => `
              <li class="operation-item ${op.type}">
                <span class="operation-icon">${this.getOperationIcon(op.type)}</span>
                <div class="operation-details">
                  <span class="operation-description">${this.formatOperation(op)}</span>
                  <span class="operation-time">${this.formatRelativeTime(op.timestamp)}</span>
                </div>
              </li>
            `).join('')}
          </ul>
        ` : '<p class="empty-message">No Git operations recorded yet</p>'}
      </div>
    `
  }

  /**
   * Get status icon for file status
   */
  getStatusIcon(status) {
    const icons = {
      'added': 'A',
      'modified': 'M',
      'deleted': 'D',
      'renamed': 'R',
      'copied': 'C',
      'untracked': '?',
      'unmerged': '!'
    }
    return icons[status] || '?'
  }

  /**
   * Get operation icon
   */
  getOperationIcon(type) {
    const icons = {
      'branch_create': '⎇+',
      'branch_delete': '⎇−',
      'checkout': '⎇→',
      'commit': '●',
      'merge': '⤵'
    }
    return icons[type] || '•'
  }

  /**
   * Format operation for display
   */
  formatOperation(op) {
    switch (op.type) {
      case 'branch_create':
        return `Created branch <strong>${this.escapeHtml(op.branch)}</strong>`
      case 'branch_delete':
        return `Deleted branch <strong>${this.escapeHtml(op.branch)}</strong>`
      case 'checkout':
        return `Switched to <strong>${this.escapeHtml(op.branch)}</strong>`
      case 'commit':
        return `Committed <code>${this.escapeHtml(op.hash?.substring(0, 7) || '???')}</code>: ${this.escapeHtml(op.message?.substring(0, 50) || '')}`
      case 'merge':
        return `Merged <strong>${this.escapeHtml(op.sourceBranch)}</strong>`
      default:
        return `${op.type}`
    }
  }

  /**
   * Format relative time
   */
  formatRelativeTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * Cleanup
   */
  destroy() {
    // Clean up if needed
  }
}
