require('../helpers/test-compat')
/**
 * Claude Config Plugin Tests
 *
 * Tests for the Claude Config plugin structure and lifecycle.
 */

const path = require('path')
const fs = require('fs').promises
const os = require('os')

// Plugin modules
const ClaudeConfigPlugin = require('../../plugins/claude-config-plugin/index')
const { ClaudeConfig } = require('../../plugins/claude-config-plugin/claude-config')

describe('ClaudeConfigPlugin', () => {
  let mockContext
  let testDir

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = path.join(os.tmpdir(), `claude-config-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })

    // Create mock plugin context
    mockContext = {
      projectPath: testDir,
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      registerIpcHandler: jest.fn(),
      registerAction: jest.fn(),
      emit: jest.fn()
    }
  })

  afterEach(async () => {
    // Deactivate plugin if active
    if (ClaudeConfigPlugin.context) {
      await ClaudeConfigPlugin.deactivate()
    }

    // Cleanup temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('Plugin Structure', () => {
    it('should have required lifecycle methods', () => {
      expect(typeof ClaudeConfigPlugin.activate).toBe('function')
      expect(typeof ClaudeConfigPlugin.deactivate).toBe('function')
    })

    it('should have null initial state', () => {
      expect(ClaudeConfigPlugin.context).toBeNull()
      expect(ClaudeConfigPlugin.config).toBeNull()
    })
  })

  describe('activate()', () => {
    it('should throw if projectPath is not provided', async () => {
      const contextWithoutProject = {
        ...mockContext,
        projectPath: null
      }

      await expect(ClaudeConfigPlugin.activate(contextWithoutProject))
        .rejects.toThrow('requires projectPath')
    })

    it('should initialize config service on activation', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      expect(ClaudeConfigPlugin.config).toBeInstanceOf(ClaudeConfig)
      expect(ClaudeConfigPlugin.context).toBe(mockContext)
    })

    it('should register IPC handlers', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      expect(mockContext.registerIpcHandler).toHaveBeenCalledWith(
        'getConfig',
        expect.any(Function)
      )
      expect(mockContext.registerIpcHandler).toHaveBeenCalledWith(
        'updateConfig',
        expect.any(Function)
      )
      expect(mockContext.registerIpcHandler).toHaveBeenCalledWith(
        'getMetadata',
        expect.any(Function)
      )
    })

    it('should register actions', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      expect(mockContext.registerAction).toHaveBeenCalledWith(
        'getConfig',
        expect.any(Function)
      )
      expect(mockContext.registerAction).toHaveBeenCalledWith(
        'updateConfig',
        expect.any(Function)
      )
      expect(mockContext.registerAction).toHaveBeenCalledWith(
        'getMetadata',
        expect.any(Function)
      )
    })

    it('should log activation success', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      expect(mockContext.log.info).toHaveBeenCalledWith(
        'Claude Config plugin activated'
      )
    })
  })

  describe('deactivate()', () => {
    it('should clean up resources on deactivation', async () => {
      await ClaudeConfigPlugin.activate(mockContext)
      await ClaudeConfigPlugin.deactivate()

      expect(ClaudeConfigPlugin.config).toBeNull()
      expect(mockContext.log.info).toHaveBeenCalledWith(
        'Claude Config plugin deactivated'
      )
    })
  })

  describe('getConfig()', () => {
    it('should return empty content when no context file has content', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      const result = await ClaudeConfigPlugin.getConfig()

      // New API: auto-creates context files, so exists=true but content is empty string
      expect(result.exists).toBe(true)
      expect(result.content).toBe('')
    })

    it('should return content when context file exists with content', async () => {
      const testContent = '# Test Config\n\nThis is a test.'
      await fs.writeFile(
        path.join(testDir, '.claude', 'CLAUDE_specifications.md'),
        testContent
      )

      await ClaudeConfigPlugin.activate(mockContext)

      const result = await ClaudeConfigPlugin.getConfig({ contextName: 'specifications' })

      expect(result.exists).toBe(true)
      expect(result.content).toBe(testContent)
    })
  })

  describe('updateConfig()', () => {
    it('should write content to context file', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      const newContent = '# New Config\n\nCreated by test.'
      const result = await ClaudeConfigPlugin.updateConfig(newContent)

      expect(result.path).toBeDefined()

      const fileContent = await fs.readFile(result.path, 'utf-8')
      expect(fileContent).toBe(newContent)
    })

    it('should update existing context file', async () => {
      const initialContent = '# Initial'
      await fs.writeFile(
        path.join(testDir, '.claude', 'CLAUDE_specifications.md'),
        initialContent
      )

      await ClaudeConfigPlugin.activate(mockContext)

      const updatedContent = '# Updated'
      const result = await ClaudeConfigPlugin.updateConfig(updatedContent, { contextName: 'specifications' })

      expect(result.path).toBeDefined()

      const fileContent = await fs.readFile(result.path, 'utf-8')
      expect(fileContent).toBe(updatedContent)
    })
  })

  describe('getMetadata()', () => {
    it('should return metadata for context file', async () => {
      await ClaudeConfigPlugin.activate(mockContext)

      const metadata = await ClaudeConfigPlugin.getMetadata()

      // New API: always has a path because of auto-created context files
      expect(metadata).toBeDefined()
    })

    it('should return file stats when context file has content', async () => {
      const content = '# Test'
      await fs.writeFile(
        path.join(testDir, '.claude', 'CLAUDE_specifications.md'),
        content
      )

      await ClaudeConfigPlugin.activate(mockContext)

      const metadata = await ClaudeConfigPlugin.getMetadata({ contextName: 'specifications' })

      expect(metadata.exists).toBe(true)
      expect(metadata.size).toBeGreaterThan(0)
      expect(metadata.lastModified).toBeDefined()
    })
  })
})

describe('ClaudeConfig', () => {
  let config
  let testDir

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `claude-config-service-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    config = new ClaudeConfig(testDir, mockLogger)
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('findConfigFile()', () => {
    it('should find CLAUDE_*.md context file', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(path.join(testDir, '.claude', 'CLAUDE_specifications.md'), 'test')

      const found = await config.findConfigFile()

      // New API: returns { path, source, contextName }
      expect(found).toHaveProperty('path')
      expect(found).toHaveProperty('source')
      expect(found).toHaveProperty('contextName')
      expect(found.path).toContain('.claude')
    })

    it('should return object with source=not-found when no context file has content', async () => {
      // With no content, findConfigFile still returns first default context file path
      const found = await config.findConfigFile()

      expect(found).toHaveProperty('path')
      expect(found).toHaveProperty('source')
    })

    it('should return context file path for selected context', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(path.join(testDir, '.claude', 'CLAUDE_ui.md'), 'ui content')

      config.setSelectedContext('ui')
      const found = await config.findConfigFile()

      expect(found.contextName).toBe('ui')
      expect(found.path).toContain('CLAUDE_ui.md')
    })

    it('should find first default context file', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(path.join(testDir, '.claude', 'CLAUDE_specifications.md'), 'specs')

      const found = await config.findConfigFile()

      expect(found.path).toBeDefined()
      expect(found.source).toBeDefined()
    })
  })

  describe('caching', () => {
    it('should cache content on read', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(path.join(testDir, '.claude', 'CLAUDE_specifications.md'), 'cached content')

      config.setSelectedContext('specifications')
      await config.readConfig()

      expect(config._cachedContent).toBe('cached content')
      expect(config._cacheTime).toBeDefined()
    })

    it('should return cached content when useCache is true', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(path.join(testDir, '.claude', 'CLAUDE_specifications.md'), 'original')

      config.setSelectedContext('specifications')
      await config.readConfig()

      // Modify file
      await fs.writeFile(path.join(testDir, '.claude', 'CLAUDE_specifications.md'), 'modified')

      // Should still return cached
      const result = await config.readConfig({ useCache: true })

      expect(result.content).toBe('original')
      expect(result.cached).toBe(true)
    })

    it('should invalidate cache when invalidateCache is called', async () => {
      config._cachedContent = 'old'
      config._cacheTime = Date.now()

      config.invalidateCache()

      expect(config._cachedContent).toBeNull()
      expect(config._cacheTime).toBeNull()
    })
  })

  describe('detectConfigSource()', () => {
    it('should not exist as a method (API changed to context-file model)', () => {
      // detectConfigSource was removed when the API evolved to multi-context files
      // Each context file (CLAUDE_*.md) represents its own branch context
      expect(typeof config.detectConfigSource).toBe('undefined')
    })
  })

  describe('getConfigWithContext()', () => {
    it('should return config with contextFiles and selectedContext', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(
        path.join(testDir, '.claude', 'CLAUDE_specifications.md'),
        '# Project Config\n\nGeneric content.'
      )

      config.setSelectedContext('specifications')
      const result = await config.getConfigWithContext()

      expect(result.exists).toBe(true)
      expect(result.content).toContain('Project Config')
      expect(result).toHaveProperty('contextFiles')
      expect(result).toHaveProperty('selectedContext')
      expect(result).toHaveProperty('source')
    })

    it('should return contextFiles array', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(
        path.join(testDir, '.claude', 'CLAUDE_bug-fixes.md'),
        '# Bug Fixes\n\nFocus on fixing bugs.'
      )

      config.setSelectedContext('bug-fixes')
      const result = await config.getConfigWithContext()

      expect(Array.isArray(result.contextFiles)).toBe(true)
    })

    it('should return result with source property', async () => {
      await fs.mkdir(path.join(testDir, '.claude'), { recursive: true })
      await fs.writeFile(
        path.join(testDir, '.claude', 'CLAUDE_specifications.md'),
        '# Specs\n\nPlanning content.'
      )

      config.setSelectedContext('specifications')
      const result = await config.getConfigWithContext()

      expect(result.source).toBeDefined()
    })
  })
})

// Section Parser and Change Proposer
const { parseSections, getSection, updateSection, addSection, removeSection, listSections, generateDiff } = require('../../plugins/claude-config-plugin/section-parser')
const { parseIntent, proposeChange, ChangeIntent } = require('../../plugins/claude-config-plugin/change-proposer')

describe('Section Parser', () => {
  // Sample CLAUDE.md content for testing
  const sampleContent = `# Project Context

This file provides context to Claude Code.

## Project Overview

**Project:** test-project

This is a test project for unit testing.

## Coding Preferences

- **Programming Style:** Hybrid (OOP + FP)
- **Testing Approach:** Behavior-Driven Development

## Branch Focus

You are working on the **main thread**. Focus on general development.

## Completed User Stories

- Story 1: Initial setup
- Story 2: Basic functionality
`

  describe('parseSections', () => {
    it('should parse markdown content into sections', () => {
      const sections = parseSections(sampleContent)

      expect(sections.length).toBe(5)
      expect(sections[0].name).toBe('Project Context')
      expect(sections[0].level).toBe(1)
      expect(sections[1].name).toBe('Project Overview')
      expect(sections[1].level).toBe(2)
    })

    it('should return empty array for empty content', () => {
      const sections = parseSections('')
      expect(sections).toEqual([])
    })

    it('should return empty array for null content', () => {
      const sections = parseSections(null)
      expect(sections).toEqual([])
    })

    it('should capture section content', () => {
      const sections = parseSections(sampleContent)
      const projectOverview = sections.find(s => s.name === 'Project Overview')

      expect(projectOverview.content).toContain('**Project:** test-project')
      expect(projectOverview.content).toContain('test project for unit testing')
    })
  })

  describe('getSection', () => {
    it('should find section by exact name', () => {
      const section = getSection(sampleContent, 'Project Overview')

      expect(section).not.toBeNull()
      expect(section.name).toBe('Project Overview')
    })

    it('should find section case-insensitively', () => {
      const section = getSection(sampleContent, 'project overview')

      expect(section).not.toBeNull()
      expect(section.name).toBe('Project Overview')
    })

    it('should return null for non-existent section', () => {
      const section = getSection(sampleContent, 'Non Existent Section')

      expect(section).toBeNull()
    })
  })

  describe('updateSection', () => {
    it('should update existing section content', () => {
      const newContent = '## Coding Preferences\n\nUpdated preferences content.'
      const result = updateSection(sampleContent, 'Coding Preferences', newContent)

      expect(result.updated).toBe(true)
      expect(result.content).toContain('Updated preferences content')
      expect(result.content).not.toContain('Behavior-Driven Development')
    })

    it('should return unchanged content for non-existent section', () => {
      const result = updateSection(sampleContent, 'Non Existent', 'new content')

      expect(result.updated).toBe(false)
      expect(result.content).toBe(sampleContent)
    })
  })

  describe('addSection', () => {
    it('should add new section at end', () => {
      const result = addSection(sampleContent, 'New Section', 'New section content.')

      expect(result.added).toBe(true)
      expect(result.content).toContain('## New Section')
      expect(result.content).toContain('New section content.')
    })

    it('should add section after specified section', () => {
      const result = addSection(sampleContent, 'Testing Guidelines', 'Test content', 'Coding Preferences')

      expect(result.added).toBe(true)
      expect(result.content).toContain('## Testing Guidelines')

      // Verify ordering
      const codingIndex = result.content.indexOf('Coding Preferences')
      const testingIndex = result.content.indexOf('Testing Guidelines')
      expect(testingIndex).toBeGreaterThan(codingIndex)
    })
  })

  describe('removeSection', () => {
    it('should remove existing section', () => {
      const result = removeSection(sampleContent, 'Branch Focus')

      expect(result.removed).toBe(true)
      expect(result.content).not.toContain('Branch Focus')
      expect(result.content).not.toContain('main thread')
    })

    it('should return unchanged content for non-existent section', () => {
      const result = removeSection(sampleContent, 'Non Existent')

      expect(result.removed).toBe(false)
    })
  })

  describe('listSections', () => {
    it('should list all sections with metadata', () => {
      const sections = listSections(sampleContent)

      expect(sections.length).toBe(5)
      sections.forEach(s => {
        expect(s).toHaveProperty('name')
        expect(s).toHaveProperty('level')
        expect(s).toHaveProperty('lineCount')
        expect(s).toHaveProperty('isStandard')
      })
    })

    it('should identify standard sections', () => {
      const sections = listSections(sampleContent)
      const projectOverview = sections.find(s => s.name === 'Project Overview')
      const codingPrefs = sections.find(s => s.name === 'Coding Preferences')

      expect(projectOverview.isStandard).toBe(true)
      expect(codingPrefs.isStandard).toBe(true)
    })
  })

  describe('generateDiff', () => {
    it('should generate diff between original and modified content', () => {
      const original = 'Line 1\nLine 2\nLine 3'
      const modified = 'Line 1\nModified Line 2\nLine 3'

      const diff = generateDiff(original, modified)

      expect(diff.some(d => d.type === 'remove' && d.line === 'Line 2')).toBe(true)
      expect(diff.some(d => d.type === 'add' && d.line === 'Modified Line 2')).toBe(true)
      expect(diff.some(d => d.type === 'unchanged' && d.line === 'Line 1')).toBe(true)
    })

    it('should handle additions at end', () => {
      const original = 'Line 1'
      const modified = 'Line 1\nLine 2'

      const diff = generateDiff(original, modified)

      expect(diff.some(d => d.type === 'add' && d.line === 'Line 2')).toBe(true)
    })

    it('should handle deletions', () => {
      const original = 'Line 1\nLine 2'
      const modified = 'Line 1'

      const diff = generateDiff(original, modified)

      expect(diff.some(d => d.type === 'remove' && d.line === 'Line 2')).toBe(true)
    })
  })
})

describe('Change Proposer', () => {
  const sampleContent = `# Project Context

This file provides context to Claude Code.

## Project Overview

**Project:** test-project

## Coding Preferences

- **Programming Style:** OOP
- **Testing Approach:** BDD

## Branch Focus

You are working on the **main thread**.
`

  describe('parseIntent', () => {
    it('should detect update intent', () => {
      const result = parseIntent('Update the Coding Preferences section', sampleContent)

      expect(result.intent).toBe(ChangeIntent.UPDATE_SECTION)
      expect(result.target.toLowerCase()).toBe('coding preferences')
    })

    it('should detect add section intent', () => {
      const result = parseIntent('Add a new section called Testing Guidelines', sampleContent)

      expect(result.intent).toBe(ChangeIntent.ADD_SECTION)
    })

    it('should detect remove intent', () => {
      const result = parseIntent('Remove the Branch Focus section', sampleContent)

      expect(result.intent).toBe(ChangeIntent.REMOVE_SECTION)
      expect(result.target.toLowerCase()).toBe('branch focus')
    })

    it('should extract quoted content', () => {
      const result = parseIntent('Update coding preferences to "Use TypeScript"', sampleContent)

      expect(result.extractedContent).toBe('Use TypeScript')
    })

    it('should return low confidence for ambiguous prompts', () => {
      const result = parseIntent('Something about the file', sampleContent)

      expect(result.confidence).toBeLessThan(0.5)
    })
  })

  describe('proposeChange', () => {
    it('should propose section update with quoted content', () => {
      const result = proposeChange('Update Coding Preferences to "Use TypeScript"', sampleContent)

      expect(result.success).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
      expect(result.proposedContent).toContain('Use TypeScript')
      expect(result.diff).toBeDefined()
      expect(result.diff.length).toBeGreaterThan(0)
    })

    it('should propose adding new section', () => {
      const result = proposeChange('Add a section called Testing Guidelines', sampleContent)

      expect(result.success).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
      expect(result.proposedContent).toContain('## Testing Guidelines')
    })

    it('should propose removing section', () => {
      const result = proposeChange('Remove the Branch Focus section', sampleContent)

      expect(result.success).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
      expect(result.proposedContent).not.toContain('Branch Focus')
    })

    it('should return suggestions for unclear prompts', () => {
      const result = proposeChange('do something', sampleContent)

      expect(result.success).toBe(false)
      expect(result.suggestions).toBeDefined()
      expect(result.suggestions.length).toBeGreaterThan(0)
    })

    it('should handle non-existent section gracefully', () => {
      const result = proposeChange('Remove the NonExistent section', sampleContent)

      expect(result.success).toBe(false)
      expect(result.summary).toBeDefined()
    })
  })
})

describe('Plugin Manifest', () => {
  let manifest

  beforeAll(async () => {
    const manifestPath = path.join(__dirname, '..', '..', 'plugins', 'claude-config-plugin', 'puffin-plugin.json')
    const content = await fs.readFile(manifestPath, 'utf-8')
    manifest = JSON.parse(content)
  })

  it('should have required name field', () => {
    expect(manifest.name).toBe('claude-config-plugin')
  })

  it('should have required version field', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('should have required main field', () => {
    expect(manifest.main).toBe('index.js')
  })

  it('should have displayName for UI', () => {
    expect(manifest.displayName).toBeDefined()
    expect(typeof manifest.displayName).toBe('string')
  })

  it('should have description', () => {
    expect(manifest.description).toBeDefined()
    expect(typeof manifest.description).toBe('string')
  })

  it('should have activationEvents', () => {
    expect(manifest.activationEvents).toBeDefined()
    expect(Array.isArray(manifest.activationEvents)).toBe(true)
    expect(manifest.activationEvents).toContain('onStartup')
  })

  it('should declare capabilities', () => {
    expect(manifest.capabilities).toBeDefined()
    expect(manifest.capabilities.fileRead).toBe(true)
    expect(manifest.capabilities.fileWrite).toBe(true)
  })
})
