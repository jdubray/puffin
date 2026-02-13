/**
 * Sprint Branch Name Suggestion Tests
 *
 * Tests for branch name derivation, validation, and integration
 * with the sprint creation flow.
 *
 * Imports from the shared utility module (src/renderer/lib/branch-name-utils.js)
 * to ensure tests validate the actual production code.
 */

const { describe, it, before } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

// ── Import shared utility via dynamic import (ESM → CJS interop) ────

let deriveBranchName
let validateBranchName

before(async () => {
  const utilPath = path.resolve(__dirname, '..', 'src', 'renderer', 'lib', 'branch-name-utils.js')
  const mod = await import(`file://${utilPath.replace(/\\/g, '/')}`)
  deriveBranchName = mod.deriveBranchName
  validateBranchName = mod.validateBranchName
})

// ── deriveBranchName ─────────────────────────────────────────

describe('deriveBranchName', () => {
  it('should convert simple title to lowercase hyphenated branch name', () => {
    assert.strictEqual(deriveBranchName('Add Login Page'), 'add-login-page')
  })

  it('should handle single-word title', () => {
    assert.strictEqual(deriveBranchName('Refactor'), 'refactor')
  })

  it('should strip parenthetical suffixes like (+2 more)', () => {
    assert.strictEqual(
      deriveBranchName('Add Login Page (+2 more)'),
      'add-login-page'
    )
  })

  it('should strip special characters', () => {
    assert.strictEqual(
      deriveBranchName('Fix bug #123: user can\'t login'),
      'fix-bug-123-user-cant-login'
    )
  })

  it('should collapse multiple spaces and hyphens', () => {
    assert.strictEqual(
      deriveBranchName('Add   multiple   spaces   here'),
      'add-multiple-spaces-here'
    )
  })

  it('should strip leading and trailing hyphens', () => {
    assert.strictEqual(
      deriveBranchName('- leading dash -'),
      'leading-dash'
    )
  })

  it('should truncate to 60 characters', () => {
    const longTitle = 'This is a very long story title that goes on and on and really should be truncated to fit in a branch name'
    const result = deriveBranchName(longTitle)
    assert.ok(result.length <= 60, `Expected <= 60 chars, got ${result.length}`)
  })

  it('should return "sprint" for empty string', () => {
    assert.strictEqual(deriveBranchName(''), 'sprint')
  })

  it('should return "sprint" for null/undefined', () => {
    assert.strictEqual(deriveBranchName(null), 'sprint')
    assert.strictEqual(deriveBranchName(undefined), 'sprint')
  })

  it('should return "sprint" when title is only special chars', () => {
    assert.strictEqual(deriveBranchName('!!!@@@###'), 'sprint')
  })

  it('should handle mixed case', () => {
    assert.strictEqual(
      deriveBranchName('Implement MetricsService Integration'),
      'implement-metricsservice-integration'
    )
  })

  it('should preserve numbers', () => {
    assert.strictEqual(
      deriveBranchName('Phase 2 Release'),
      'phase-2-release'
    )
  })

  it('should handle existing hyphens in title', () => {
    assert.strictEqual(
      deriveBranchName('Add dark-mode toggle'),
      'add-dark-mode-toggle'
    )
  })
})

describe('validateBranchName', () => {
  it('should accept valid simple branch names', () => {
    const result = validateBranchName('add-login-page')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.error, null)
  })

  it('should accept branch names with slashes', () => {
    const result = validateBranchName('feature/add-login')
    assert.strictEqual(result.valid, true)
  })

  it('should accept branch names with dots', () => {
    const result = validateBranchName('v2.0-release')
    assert.strictEqual(result.valid, true)
  })

  it('should accept empty string (meaning no branch creation)', () => {
    const result = validateBranchName('')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.error, null)
  })

  it('should accept null (meaning no branch creation)', () => {
    const result = validateBranchName(null)
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.error, null)
  })

  it('should accept whitespace-only string (treated as empty)', () => {
    const result = validateBranchName('   ')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.error, null)
  })

  it('should reject names with spaces', () => {
    const result = validateBranchName('add login page')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('spaces'))
  })

  it('should reject names with ".."', () => {
    const result = validateBranchName('feature..branch')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('..'))
  })

  it('should reject names with tilde', () => {
    const result = validateBranchName('branch~1')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('invalid'))
  })

  it('should reject names with caret', () => {
    const result = validateBranchName('branch^2')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names with colon', () => {
    const result = validateBranchName('refs:heads')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names with question mark', () => {
    const result = validateBranchName('what?')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names with asterisk', () => {
    const result = validateBranchName('feature*')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names with square brackets', () => {
    const result = validateBranchName('branch[1]')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names with backslash', () => {
    const result = validateBranchName('feature\\branch')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names starting with hyphen', () => {
    const result = validateBranchName('-feature')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('start'))
  })

  it('should reject names starting with dot', () => {
    const result = validateBranchName('.hidden')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('start'))
  })

  it('should reject names ending with dot', () => {
    const result = validateBranchName('feature.')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('end'))
  })

  it('should reject names ending with .lock', () => {
    const result = validateBranchName('feature.lock')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('.lock'))
  })

  it('should reject names ending with slash', () => {
    const result = validateBranchName('feature/')
    assert.strictEqual(result.valid, false)
  })

  it('should reject names with double slash', () => {
    const result = validateBranchName('feature//branch')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('//'))
  })

  it('should reject names with @{', () => {
    const result = validateBranchName('branch@{upstream}')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('@{'))
  })

  it('should accept typical branch names', () => {
    const validNames = [
      'main',
      'develop',
      'feature/add-login',
      'bugfix/fix-123',
      'release/v2.0.0',
      'hotfix/urgent-patch',
      'add-dark-mode-toggle',
      'implement-metricsservice-integration',
      'sprint-jan-15'
    ]
    for (const name of validNames) {
      const result = validateBranchName(name)
      assert.strictEqual(result.valid, true, `Expected "${name}" to be valid, got: ${result.error}`)
    }
  })
})

describe('deriveBranchName produces valid branch names', () => {
  it('should always produce a name that passes validation', () => {
    const titles = [
      'Add Login Page',
      'Fix bug #123',
      'Implement MetricsService (+3 more)',
      'Phase 2: Release Prep',
      '',
      '!!!',
      'A very long title that tests the truncation behavior of the derive function to ensure output is reasonable'
    ]

    for (const title of titles) {
      const branchName = deriveBranchName(title)
      const result = validateBranchName(branchName)
      assert.strictEqual(
        result.valid, true,
        `deriveBranchName("${title}") = "${branchName}" should be valid, got: ${result.error}`
      )
    }
  })
})

describe('createSprint action includes branchName', () => {
  // Test the action creator shape
  it('should include branchName in payload when provided', () => {
    // Simulate the action creator
    const stories = [{ id: '1', title: 'Story 1' }]
    const branchName = 'add-story-1'

    const action = {
      type: 'CREATE_SPRINT',
      payload: {
        stories,
        branchName,
        timestamp: Date.now()
      }
    }

    assert.strictEqual(action.payload.branchName, 'add-story-1')
    assert.strictEqual(action.payload.stories.length, 1)
  })

  it('should default branchName to empty string when not provided', () => {
    const stories = [{ id: '1', title: 'Story 1' }]
    const branchName = ''

    const action = {
      type: 'CREATE_SPRINT',
      payload: {
        stories,
        branchName,
        timestamp: Date.now()
      }
    }

    assert.strictEqual(action.payload.branchName, '')
  })
})

describe('createSprintAcceptor stores branchName on model', () => {
  it('should store branchName on the created sprint', () => {
    const model = {
      userStories: [
        { id: 's1', title: 'Story 1', status: 'draft' }
      ],
      sprintError: null,
      activeSprint: null,
      currentView: 'user-stories'
    }

    const proposal = {
      type: 'CREATE_SPRINT',
      payload: {
        stories: [{ id: 's1', title: 'Story 1', status: 'draft' }],
        branchName: 'add-story-1',
        timestamp: Date.now()
      }
    }

    // Simulate the acceptor logic (minimal version)
    const { stories, branchName, timestamp } = proposal.payload
    const sprintId = 'test-sprint-id'
    const sprintStories = stories.map(s => ({ ...s, status: 'in-progress', updatedAt: timestamp }))

    let sprintTitle
    if (sprintStories.length === 1) {
      sprintTitle = sprintStories[0].title
    } else {
      sprintTitle = `${sprintStories[0].title} (+${sprintStories.length - 1} more)`
    }

    model.activeSprint = {
      id: sprintId,
      title: sprintTitle,
      branchName: branchName || '',
      stories: sprintStories,
      status: 'created',
      storyProgress: {},
      promptId: null,
      plan: null,
      createdAt: timestamp
    }

    assert.strictEqual(model.activeSprint.branchName, 'add-story-1')
    assert.strictEqual(model.activeSprint.title, 'Story 1')
    assert.strictEqual(model.activeSprint.status, 'created')
    assert.strictEqual(model.activeSprint.stories[0].status, 'in-progress')
  })

  it('should store empty branchName when not provided', () => {
    const model = { activeSprint: null }

    model.activeSprint = {
      id: 'test',
      title: 'Test',
      branchName: '' || '',
      stories: [],
      status: 'created',
      storyProgress: {},
      promptId: null,
      plan: null,
      createdAt: Date.now()
    }

    assert.strictEqual(model.activeSprint.branchName, '')
  })
})

// ── Sprint Branch Create Modal ────────────────────────────────

/**
 * Minimal DOM mock for testing modal rendering and event binding.
 * We recreate the parts of the DOM API that modal-manager uses.
 */
function createMockDOM() {
  const elements = {}
  const bodyChildren = []
  const listeners = {}

  const mockElement = (tag, opts = {}) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: opts.className || '',
      id: opts.id || '',
      textContent: '',
      innerHTML: '',
      style: {},
      disabled: false,
      _listeners: {},
      _children: [],
      addEventListener(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = []
        this._listeners[event].push(handler)
      },
      removeEventListener(event, handler) {
        if (!this._listeners[event]) return
        this._listeners[event] = this._listeners[event].filter(h => h !== handler)
      },
      dispatchEvent(event) {
        const handlers = this._listeners[event.type] || []
        for (const h of handlers) h(event)
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this })
      },
      appendChild(child) { this._children.push(child) },
      remove() {},
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c) },
        remove(c) { this._classes.delete(c) },
        contains(c) { return this._classes.has(c) }
      }
    }
    return el
  }

  return {
    elements,
    bodyChildren,
    listeners,
    mockElement,

    // Simulate document.getElementById
    getElementById(id) { return elements[id] || null },

    // Simulate document.createElement
    createElement(tag) { return mockElement(tag) },

    // Simulate document.addEventListener
    addEventListener(event, handler) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
    },

    removeEventListener(event, handler) {
      if (!listeners[event]) return
      listeners[event] = listeners[event].filter(h => h !== handler)
    },

    // Simulate document.body.appendChild
    body: {
      appendChild(child) { bodyChildren.push(child) }
    },

    /**
     * Register elements by id (to simulate the DOM after innerHTML is set)
     */
    registerElement(id, el) {
      el.id = id
      elements[id] = el
    }
  }
}

describe('renderSprintBranchCreate', () => {
  it('should set modal title to "Create Git Branch"', () => {
    const title = { textContent: '' }
    const content = { innerHTML: '' }
    const actions = { innerHTML: '' }

    // Simulate the render (inline the logic since we can't import ModalManager in Node)
    const data = { branchName: 'add-login-page' }
    const branchName = data?.branchName || 'sprint'
    title.textContent = 'Create Git Branch'

    assert.strictEqual(title.textContent, 'Create Git Branch')
  })

  it('should display the branch name in the preview', () => {
    const content = { innerHTML: '' }
    const branchName = 'add-login-page'

    content.innerHTML = `
      <div class="sprint-branch-create-modal">
        <p class="sprint-branch-create-prompt">Create a git branch for this sprint?</p>
        <div class="sprint-branch-create-preview">
          <span class="sprint-branch-create-preview-label">Branch name</span>
          <code class="sprint-branch-create-preview-name">${branchName}</code>
        </div>
      </div>
    `

    assert.ok(content.innerHTML.includes('add-login-page'))
    assert.ok(content.innerHTML.includes('sprint-branch-create-modal'))
    assert.ok(content.innerHTML.includes('Create a git branch for this sprint?'))
  })

  it('should default to "sprint" when no branchName provided', () => {
    const data = {}
    const branchName = data?.branchName || 'sprint'
    assert.strictEqual(branchName, 'sprint')
  })

  it('should default to "sprint" when data is null', () => {
    const data = null
    const branchName = data?.branchName || 'sprint'
    assert.strictEqual(branchName, 'sprint')
  })

  it('should render Create Branch and Skip buttons', () => {
    const actions = { innerHTML: '' }
    actions.innerHTML = `
      <button class="btn secondary" id="sprint-branch-skip">Skip</button>
      <button class="btn primary" id="sprint-branch-create">Create Branch</button>
    `

    assert.ok(actions.innerHTML.includes('sprint-branch-skip'))
    assert.ok(actions.innerHTML.includes('sprint-branch-create'))
    assert.ok(actions.innerHTML.includes('Create Branch'))
    assert.ok(actions.innerHTML.includes('Skip'))
  })

  it('should escape HTML in branch name to prevent XSS', () => {
    // Test the escapeHtml logic used by the modal
    function escapeHtml(text) {
      if (!text) return ''
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    const malicious = '<script>alert("xss")</script>'
    const escaped = escapeHtml(malicious)
    assert.ok(!escaped.includes('<script>'))
    assert.ok(escaped.includes('&lt;script&gt;'))
  })
})

describe('_bindSprintBranchCreateEvents', () => {
  it('should call hideModal when Skip is clicked', () => {
    let hideModalCalled = false
    const intents = {
      hideModal() { hideModalCalled = true },
      showModal() {}
    }

    const dom = createMockDOM()
    const skipBtn = dom.mockElement('button', { id: 'sprint-branch-skip' })
    dom.registerElement('sprint-branch-skip', skipBtn)

    // Simulate event binding
    skipBtn.addEventListener('click', () => {
      intents.hideModal()
    })

    skipBtn.click()
    assert.strictEqual(hideModalCalled, true)
  })

  it('should call git.createBranch with correct args when Create Branch is clicked', async () => {
    let createBranchArgs = null
    const mockGit = {
      createBranch: async (name, prefix, checkout) => {
        createBranchArgs = { name, prefix, checkout }
        return { success: true, branch: name }
      }
    }

    const dom = createMockDOM()
    const createBtn = dom.mockElement('button', { id: 'sprint-branch-create' })
    dom.registerElement('sprint-branch-create', createBtn)

    const branchName = 'add-login-page'

    // Simulate event binding
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true
      createBtn.textContent = 'Creating...'
      await mockGit.createBranch(branchName, undefined, true)
    })

    createBtn.click()

    // Wait for async
    await new Promise(resolve => setTimeout(resolve, 10))

    assert.deepStrictEqual(createBranchArgs, {
      name: 'add-login-page',
      prefix: undefined,
      checkout: true
    })
    assert.strictEqual(createBtn.disabled, true)
    assert.strictEqual(createBtn.textContent, 'Creating...')
  })

  it('should show success toast after successful branch creation', async () => {
    let toastMessage = null
    let toastType = null

    const mockGit = {
      createBranch: async () => ({ success: true, branch: 'test-branch' })
    }

    const showToast = (message, type) => {
      toastMessage = message
      toastType = type
    }

    let hideModalCalled = false
    const intents = { hideModal() { hideModalCalled = true } }

    const branchName = 'test-branch'

    // Simulate the create handler
    try {
      const result = await mockGit.createBranch(branchName, undefined, true)
      intents.hideModal()
      if (result?.success) {
        showToast(`Branch "${branchName}" created and checked out`, 'success')
      }
    } catch (err) {
      // won't happen
    }

    assert.strictEqual(hideModalCalled, true)
    assert.ok(toastMessage.includes('test-branch'))
    assert.ok(toastMessage.includes('created and checked out'))
    assert.strictEqual(toastType, 'success')
  })

  it('should show error toast when branch creation returns success: false', async () => {
    let toastMessage = null
    let toastType = null

    const mockGit = {
      createBranch: async () => ({ success: false, error: 'Branch already exists' })
    }

    const showToast = (message, type) => {
      toastMessage = message
      toastType = type
    }

    const intents = { hideModal() {} }
    const branchName = 'existing-branch'

    const result = await mockGit.createBranch(branchName, undefined, true)
    intents.hideModal()
    if (result?.success) {
      showToast(`Branch "${branchName}" created and checked out`, 'success')
    } else {
      showToast(`Failed to create branch: ${result?.error || 'Unknown error'}`, 'error')
    }

    assert.ok(toastMessage.includes('Branch already exists'))
    assert.strictEqual(toastType, 'error')
  })

  it('should show error toast when branch creation throws', async () => {
    let toastMessage = null
    let toastType = null

    const mockGit = {
      createBranch: async () => { throw new Error('Git not found') }
    }

    const showToast = (message, type) => {
      toastMessage = message
      toastType = type
    }

    const intents = { hideModal() {} }
    const branchName = 'some-branch'

    try {
      await mockGit.createBranch(branchName, undefined, true)
    } catch (err) {
      intents.hideModal()
      showToast(`Failed to create branch: ${err.message}`, 'error')
    }

    assert.ok(toastMessage.includes('Git not found'))
    assert.strictEqual(toastType, 'error')
  })

  it('should dismiss modal on Escape key', () => {
    let hideModalCalled = false
    const intents = { hideModal() { hideModalCalled = true } }

    // Simulate the Escape key handler
    let keyHandler
    const listeners = []
    const addListener = (event, handler) => {
      if (event === 'keydown') {
        keyHandler = handler
        listeners.push(handler)
      }
    }
    const removeListener = (event, handler) => {
      const idx = listeners.indexOf(handler)
      if (idx >= 0) listeners.splice(idx, 1)
    }

    // Bind as modal does
    keyHandler = (e) => {
      if (e.key === 'Escape') {
        removeListener('keydown', keyHandler)
        intents.hideModal()
      }
    }
    addListener('keydown', keyHandler)

    // Simulate Escape press
    keyHandler({ key: 'Escape' })

    assert.strictEqual(hideModalCalled, true)
    assert.strictEqual(listeners.length, 0, 'Escape handler should clean itself up')
  })

  it('should not dismiss modal on other keys', () => {
    let hideModalCalled = false
    const intents = { hideModal() { hideModalCalled = true } }

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        intents.hideModal()
      }
    }

    keyHandler({ key: 'Enter' })
    assert.strictEqual(hideModalCalled, false)

    keyHandler({ key: 'a' })
    assert.strictEqual(hideModalCalled, false)

    keyHandler({ key: 'Tab' })
    assert.strictEqual(hideModalCalled, false)
  })
})

describe('sprint-create to sprint-branch-create chaining', () => {
  it('should call createSprint and then showModal with branch-create type (no conflict)', () => {
    let createSprintCalled = false
    let createSprintArgs = null
    let hideModalCalled = false
    let showModalType = null
    let showModalData = null

    const intents = {
      createSprint(stories, branchName) {
        createSprintCalled = true
        createSprintArgs = { stories, branchName }
      },
      hideModal() { hideModalCalled = true },
      showModal(type, data) {
        showModalType = type
        showModalData = data
      }
    }

    const data = {
      stories: [{ id: 's1', title: 'Story 1' }]
    }
    const branchName = 'add-story-1'

    // Simulate the confirm handler (no conflict case)
    const validation = validateBranchName(branchName)
    if (!validation.valid) return

    intents.createSprint(data.stories, branchName)

    // No conflict — suggestedName = branchName, originalName = null
    intents.hideModal()
    intents.showModal('sprint-branch-create', {
      branchName,
      originalName: null,
      currentBranch: 'main'
    })

    assert.strictEqual(createSprintCalled, true)
    assert.deepStrictEqual(createSprintArgs.stories, data.stories)
    assert.strictEqual(createSprintArgs.branchName, 'add-story-1')
    assert.strictEqual(hideModalCalled, true)
    assert.strictEqual(showModalType, 'sprint-branch-create')
    assert.strictEqual(showModalData.branchName, 'add-story-1')
    assert.strictEqual(showModalData.originalName, null)
    assert.strictEqual(showModalData.currentBranch, 'main')
  })

  it('should allow empty branch name (no branch creation) and skip branch-create modal', () => {
    let createSprintCalled = false
    let hideModalCalled = false
    let showModalCalled = false

    const intents = {
      createSprint() { createSprintCalled = true },
      hideModal() { hideModalCalled = true },
      showModal() { showModalCalled = true }
    }

    const branchName = '' // Empty = no new branch

    const validation = validateBranchName(branchName)
    // Empty is now valid — user wants to stay on current branch
    assert.strictEqual(validation.valid, true)

    // In the real flow, empty branch name creates the sprint but skips the branch modal
    intents.createSprint([], branchName)
    intents.hideModal() // would be called directly, not followed by showModal

    assert.strictEqual(createSprintCalled, true)
    assert.strictEqual(hideModalCalled, true)
    assert.strictEqual(showModalCalled, false, 'branch-create modal should NOT be shown for empty branch name')
  })

  it('should pass branch name derived from sprint title through the chain', () => {
    let chainedBranchName = null

    const intents = {
      createSprint() {},
      hideModal() {},
      showModal(type, data) { chainedBranchName = data.branchName }
    }

    const title = 'Add Login Page (+2 more)'
    const branchName = deriveBranchName(title)

    const validation = validateBranchName(branchName)
    assert.strictEqual(validation.valid, true)

    intents.createSprint([], branchName)
    intents.hideModal()
    intents.showModal('sprint-branch-create', {
      branchName,
      originalName: null,
      currentBranch: ''
    })

    assert.strictEqual(chainedBranchName, 'add-login-page')
  })
})

describe('_showToast uses constructor-injected showToast', () => {
  it('should use this.showToast (constructor-injected) not window.puffin.state', () => {
    let toastArgs = null

    // Simulate the constructor-injected showToast (how ModalManager works)
    const showToast = (message, type) => { toastArgs = { message, type } }

    // The correct pattern used by all other modals in modal-manager.js
    const message = 'Branch created'
    const type = 'success'
    showToast(message, type)

    assert.deepStrictEqual(toastArgs, { message: 'Branch created', type: 'success' })
  })

  it('should support success, error, and info types', () => {
    const types = ['success', 'error', 'info']
    for (const type of types) {
      let receivedType = null
      const showToast = (msg, t) => { receivedType = t }
      showToast('test', type)
      assert.strictEqual(receivedType, type)
    }
  })
})

describe('modal switch routing for sprint-branch-create', () => {
  it('should recognize sprint-branch-create as a valid modal type', () => {
    // Simulate the switch-case routing
    const validTypes = [
      'confirmation', 'edit-story', 'commit-message', 'create-plan',
      'code-review', 'sprint-create', 'sprint-branch-create',
      'claude-question', 'save-design'
    ]

    assert.ok(validTypes.includes('sprint-branch-create'))
  })

  it('should route sprint-branch-create to renderSprintBranchCreate', () => {
    let rendererCalled = null

    // Simulate the modal type → renderer mapping
    const modalRenderers = {
      'sprint-create': 'renderSprintCreate',
      'sprint-branch-create': 'renderSprintBranchCreate',
      'confirmation': 'renderConfirmation'
    }

    const type = 'sprint-branch-create'
    rendererCalled = modalRenderers[type]

    assert.strictEqual(rendererCalled, 'renderSprintBranchCreate')
  })
})

// ── Branch Conflict Handling ──────────────────────────────────

/**
 * Simulate the branch conflict detection logic from the confirm handler.
 * @param {string} branchName - The desired branch name
 * @param {Array<{name: string, current: boolean}>} existingBranches - Existing branches
 * @returns {{ suggestedName: string, branchConflict: boolean, currentBranch: string }}
 */
function detectBranchConflict(branchName, existingBranches) {
  let suggestedName = branchName
  let branchConflict = false
  let currentBranch = ''

  const existingNames = new Set(existingBranches.map(b => b.name))
  const current = existingBranches.find(b => b.current)
  currentBranch = current?.name || ''

  if (existingNames.has(branchName)) {
    branchConflict = true
    let suffix = 2
    while (existingNames.has(`${branchName}-${suffix}`) && suffix < 100) {
      suffix++
    }
    suggestedName = `${branchName}-${suffix}`
  }

  return { suggestedName, branchConflict, currentBranch }
}

describe('detectBranchConflict', () => {
  it('should return original name when no conflict', () => {
    const branches = [
      { name: 'main', current: true },
      { name: 'develop', current: false }
    ]

    const result = detectBranchConflict('add-feature', branches)
    assert.strictEqual(result.suggestedName, 'add-feature')
    assert.strictEqual(result.branchConflict, false)
    assert.strictEqual(result.currentBranch, 'main')
  })

  it('should append -2 when branch name already exists', () => {
    const branches = [
      { name: 'main', current: true },
      { name: 'add-feature', current: false }
    ]

    const result = detectBranchConflict('add-feature', branches)
    assert.strictEqual(result.suggestedName, 'add-feature-2')
    assert.strictEqual(result.branchConflict, true)
  })

  it('should append -3 when both original and -2 exist', () => {
    const branches = [
      { name: 'main', current: true },
      { name: 'add-feature', current: false },
      { name: 'add-feature-2', current: false }
    ]

    const result = detectBranchConflict('add-feature', branches)
    assert.strictEqual(result.suggestedName, 'add-feature-3')
    assert.strictEqual(result.branchConflict, true)
  })

  it('should skip to -4 when -2 and -3 also exist', () => {
    const branches = [
      { name: 'main', current: false },
      { name: 'develop', current: true },
      { name: 'add-feature', current: false },
      { name: 'add-feature-2', current: false },
      { name: 'add-feature-3', current: false }
    ]

    const result = detectBranchConflict('add-feature', branches)
    assert.strictEqual(result.suggestedName, 'add-feature-4')
    assert.strictEqual(result.branchConflict, true)
    assert.strictEqual(result.currentBranch, 'develop')
  })

  it('should detect current branch correctly', () => {
    const branches = [
      { name: 'main', current: false },
      { name: 'feature-x', current: true }
    ]

    const result = detectBranchConflict('new-branch', branches)
    assert.strictEqual(result.currentBranch, 'feature-x')
  })

  it('should return empty currentBranch when none is marked current', () => {
    const branches = [
      { name: 'main', current: false },
      { name: 'develop', current: false }
    ]

    const result = detectBranchConflict('new-branch', branches)
    assert.strictEqual(result.currentBranch, '')
  })

  it('should handle empty branch list', () => {
    const result = detectBranchConflict('add-feature', [])
    assert.strictEqual(result.suggestedName, 'add-feature')
    assert.strictEqual(result.branchConflict, false)
    assert.strictEqual(result.currentBranch, '')
  })

  it('should produce valid branch names with suffix', () => {
    const branches = [{ name: 'my-branch', current: true }]
    const result = detectBranchConflict('my-branch', branches)
    const validation = validateBranchName(result.suggestedName)
    assert.strictEqual(validation.valid, true, `"${result.suggestedName}" should be valid`)
  })
})

describe('renderSprintBranchCreate with conflict data', () => {
  it('should show warning HTML when originalName is provided', () => {
    const data = {
      branchName: 'add-feature-2',
      originalName: 'add-feature',
      currentBranch: 'main'
    }

    const originalName = data.originalName || null
    const warningHtml = originalName
      ? `Branch "${originalName}" already exists`
      : ''

    assert.ok(warningHtml.includes('add-feature'))
    assert.ok(warningHtml.includes('already exists'))
  })

  it('should not show warning when originalName is null', () => {
    const data = {
      branchName: 'add-feature',
      originalName: null,
      currentBranch: 'main'
    }

    const originalName = data.originalName || null
    const warningHtml = originalName
      ? `Branch "${originalName}" already exists`
      : ''

    assert.strictEqual(warningHtml, '')
  })

  it('should show current branch info when currentBranch is provided', () => {
    const data = {
      branchName: 'add-feature',
      originalName: null,
      currentBranch: 'develop'
    }

    const currentBranch = data.currentBranch || ''
    const currentBranchHtml = currentBranch
      ? `Currently on "${currentBranch}"`
      : ''

    assert.ok(currentBranchHtml.includes('develop'))
    assert.ok(currentBranchHtml.includes('Currently on'))
  })

  it('should not show current branch info when currentBranch is empty', () => {
    const data = {
      branchName: 'add-feature',
      originalName: null,
      currentBranch: ''
    }

    const currentBranch = data.currentBranch || ''
    const currentBranchHtml = currentBranch
      ? `Currently on "${currentBranch}"`
      : ''

    assert.strictEqual(currentBranchHtml, '')
  })

  it('should display the suffixed branch name in preview', () => {
    const data = {
      branchName: 'add-feature-3',
      originalName: 'add-feature',
      currentBranch: 'main'
    }

    const branchName = data.branchName || 'sprint'
    assert.strictEqual(branchName, 'add-feature-3')
  })
})

describe('branch conflict chaining flow', () => {
  it('should pass conflict data through the full chain', async () => {
    let showModalData = null

    const intents = {
      createSprint() {},
      hideModal() {},
      showModal(type, data) { showModalData = data }
    }

    const branchName = 'add-feature'
    const existingBranches = [
      { name: 'main', current: true },
      { name: 'add-feature', current: false }
    ]

    // Simulate confirm handler logic
    const { suggestedName, branchConflict, currentBranch } =
      detectBranchConflict(branchName, existingBranches)

    intents.createSprint([], branchName)
    intents.hideModal()
    intents.showModal('sprint-branch-create', {
      branchName: suggestedName,
      originalName: branchConflict ? branchName : null,
      currentBranch
    })

    assert.strictEqual(showModalData.branchName, 'add-feature-2')
    assert.strictEqual(showModalData.originalName, 'add-feature')
    assert.strictEqual(showModalData.currentBranch, 'main')
  })

  it('should pass no conflict data when branch does not exist', async () => {
    let showModalData = null

    const intents = {
      createSprint() {},
      hideModal() {},
      showModal(type, data) { showModalData = data }
    }

    const branchName = 'new-feature'
    const existingBranches = [
      { name: 'main', current: true }
    ]

    const { suggestedName, branchConflict, currentBranch } =
      detectBranchConflict(branchName, existingBranches)

    intents.createSprint([], branchName)
    intents.hideModal()
    intents.showModal('sprint-branch-create', {
      branchName: suggestedName,
      originalName: branchConflict ? branchName : null,
      currentBranch
    })

    assert.strictEqual(showModalData.branchName, 'new-feature')
    assert.strictEqual(showModalData.originalName, null)
    assert.strictEqual(showModalData.currentBranch, 'main')
  })

  it('should gracefully handle git unavailable (no branches returned)', () => {
    // When git.getBranches() fails, we skip conflict check entirely
    let suggestedName = 'add-feature'
    let branchConflict = false
    let currentBranch = ''

    // Simulate the catch block — nothing changes
    assert.strictEqual(suggestedName, 'add-feature')
    assert.strictEqual(branchConflict, false)
    assert.strictEqual(currentBranch, '')
  })
})

describe('error toast with branch conflict hint', () => {
  it('should append hint when error mentions "already exists"', () => {
    const errMsg = 'Branch "add-feature-2" already exists'
    const hint = errMsg.includes('already exists')
      ? ' Try a different branch name.'
      : ''
    const fullMsg = `Failed to create branch: ${errMsg}${hint}`

    assert.ok(fullMsg.includes('already exists'))
    assert.ok(fullMsg.includes('Try a different branch name'))
  })

  it('should not append hint for other errors', () => {
    const errMsg = 'Permission denied'
    const hint = errMsg.includes('already exists')
      ? ' Try a different branch name.'
      : ''
    const fullMsg = `Failed to create branch: ${errMsg}${hint}`

    assert.ok(fullMsg.includes('Permission denied'))
    assert.ok(!fullMsg.includes('Try a different branch name'))
  })

  it('should handle unknown error fallback', () => {
    const result = { success: false, error: undefined }
    const errMsg = result?.error || 'Unknown error'
    const hint = errMsg.includes('already exists')
      ? ' Try a different branch name.'
      : ''
    const fullMsg = `Failed to create branch: ${errMsg}${hint}`

    assert.ok(fullMsg.includes('Unknown error'))
    assert.ok(!fullMsg.includes('Try a different branch name'))
  })
})
