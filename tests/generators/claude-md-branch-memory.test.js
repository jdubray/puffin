'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

const ClaudeMdGenerator = require('../../src/main/claude-md-generator')
const { generate, SECTIONS } = require('../../plugins/memory-plugin/lib/branch-template')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'puffin-test-'))
  await fs.mkdir(path.join(dir, '.claude'), { recursive: true })
  await fs.mkdir(path.join(dir, '.puffin', 'memory', 'branches'), { recursive: true })
  return dir
}

async function writeMemory(projectDir, branch, options) {
  const md = generate(branch, options)
  await fs.writeFile(
    path.join(projectDir, '.puffin', 'memory', 'branches', `${branch}.md`),
    md, 'utf-8'
  )
  return md
}

async function writeRawMemory(projectDir, branch, content) {
  await fs.writeFile(
    path.join(projectDir, '.puffin', 'memory', 'branches', `${branch}.md`),
    content, 'utf-8'
  )
}

// ---------------------------------------------------------------------------
// getBranchMemoryContent
// ---------------------------------------------------------------------------

describe('ClaudeMdGenerator — getBranchMemoryContent', () => {
  let gen
  let projectDir

  beforeEach(async () => {
    projectDir = await createTempProject()
    gen = new ClaudeMdGenerator()
    await gen.initialize(projectDir)
  })

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true })
  })

  it('returns empty string when no memory file exists', async () => {
    const result = await gen.getBranchMemoryContent('nonexistent')
    assert.equal(result, '')
  })

  it('returns empty string when all included sections are empty', async () => {
    await writeMemory(projectDir, 'empty-branch', {
      facts: ['some fact'],
      conventions: [],
      architecturalDecisions: [],
      bugPatterns: []
    })
    const result = await gen.getBranchMemoryContent('empty-branch')
    assert.equal(result, '')
  })

  it('extracts Conventions section', async () => {
    await writeMemory(projectDir, 'test-branch', {
      conventions: ['Use camelCase', 'Always async/await']
    })
    const result = await gen.getBranchMemoryContent('test-branch')
    assert.ok(result.includes('### Conventions'))
    assert.ok(result.includes('- Use camelCase'))
    assert.ok(result.includes('- Always async/await'))
  })

  it('extracts Architectural Decisions section', async () => {
    await writeMemory(projectDir, 'test-branch', {
      architecturalDecisions: ['Use SAM pattern', 'SQLite as source of truth']
    })
    const result = await gen.getBranchMemoryContent('test-branch')
    assert.ok(result.includes('### Architectural Decisions'))
    assert.ok(result.includes('- Use SAM pattern'))
  })

  it('extracts Bug Patterns section when non-empty', async () => {
    await writeMemory(projectDir, 'test-branch', {
      bugPatterns: ['Race condition in IPC handlers']
    })
    const result = await gen.getBranchMemoryContent('test-branch')
    assert.ok(result.includes('### Bug Patterns'))
    assert.ok(result.includes('- Race condition in IPC handlers'))
  })

  it('excludes Facts section (not actionable for implementation)', async () => {
    await writeMemory(projectDir, 'test-branch', {
      facts: ['Project uses Electron'],
      conventions: ['Use camelCase']
    })
    const result = await gen.getBranchMemoryContent('test-branch')
    assert.ok(!result.includes('Project uses Electron'))
    assert.ok(!result.includes('### Facts'))
  })

  it('includes header "Branch Memory (auto-extracted)"', async () => {
    await writeMemory(projectDir, 'test-branch', {
      conventions: ['Rule 1']
    })
    const result = await gen.getBranchMemoryContent('test-branch')
    assert.ok(result.includes('## Branch Memory (auto-extracted)'))
  })

  it('respects size limit by truncating lower-priority sections', async () => {
    // Create a memory file with a lot of content
    const longConventions = Array.from({ length: 50 }, (_, i) =>
      `Convention ${i}: ${'x'.repeat(100)}`
    )
    const longDecisions = Array.from({ length: 50 }, (_, i) =>
      `Decision ${i}: ${'y'.repeat(100)}`
    )
    await writeMemory(projectDir, 'big-branch', {
      conventions: longConventions,
      architecturalDecisions: longDecisions
    })

    const result = await gen.getBranchMemoryContent('big-branch', 2000)
    assert.ok(result.length <= 2100) // Allow some overhead for headers
    // Conventions (higher priority) should be present
    assert.ok(result.includes('### Conventions'))
  })

  it('truncates items within a section when hitting limit', async () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      `Item ${i}: ${'z'.repeat(80)}`
    )
    await writeMemory(projectDir, 'huge-branch', {
      conventions: items
    })

    const result = await gen.getBranchMemoryContent('huge-branch', 1000)
    // Should include some but not all items
    assert.ok(result.includes('### Conventions'))
    assert.ok(result.includes('- Item 0:'))
    // Should not include all 100 items
    assert.ok(!result.includes('- Item 99:'))
  })
})

// ---------------------------------------------------------------------------
// Malformed and edge-case memory files (AC3)
// ---------------------------------------------------------------------------

describe('ClaudeMdGenerator — malformed memory files', () => {
  let gen
  let projectDir

  beforeEach(async () => {
    projectDir = await createTempProject()
    gen = new ClaudeMdGenerator()
    await gen.initialize(projectDir)
  })

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true })
  })

  it('handles empty file gracefully', async () => {
    await writeRawMemory(projectDir, 'empty', '')
    const result = await gen.getBranchMemoryContent('empty')
    assert.equal(result, '')
  })

  it('handles file with only whitespace', async () => {
    await writeRawMemory(projectDir, 'whitespace', '   \n\n  \n  ')
    const result = await gen.getBranchMemoryContent('whitespace')
    assert.equal(result, '')
  })

  it('handles file with no recognized sections', async () => {
    await writeRawMemory(projectDir, 'nosections', '# Some Random Title\n\nJust some text.\n')
    const result = await gen.getBranchMemoryContent('nosections')
    assert.equal(result, '')
  })

  it('handles file with malformed markdown (no list items)', async () => {
    await writeRawMemory(projectDir, 'noitems',
      '# Branch Memory: noitems\n\n## Conventions\n\nJust a paragraph, not a list.\n')
    const result = await gen.getBranchMemoryContent('noitems')
    // Parser extracts paragraph text as a single item; either way no crash
    assert.equal(typeof result, 'string')
  })

  it('handles binary-like content without crashing', async () => {
    await writeRawMemory(projectDir, 'binary', Buffer.from([0xFF, 0xFE, 0x00, 0x01]).toString('utf-8'))
    const result = await gen.getBranchMemoryContent('binary')
    assert.equal(typeof result, 'string')
  })

  it('handles file with only boilerplate entries', async () => {
    // The template uses "_No entries yet._" as placeholder
    const boilerplate = '# Branch Memory: bp\n\n' +
      '## Conventions\n\n_No entries yet._\n\n' +
      '## Architectural Decisions\n\n_No entries yet._\n'
    await writeRawMemory(projectDir, 'bp', boilerplate)
    const result = await gen.getBranchMemoryContent('bp')
    assert.equal(result, '')
  })

  it('handles very large memory file within size limit', async () => {
    const hugeConventions = Array.from({ length: 500 }, (_, i) =>
      `Convention ${i}: ${'a'.repeat(200)}`
    )
    await writeMemory(projectDir, 'massive', { conventions: hugeConventions })
    const result = await gen.getBranchMemoryContent('massive')
    // Default limit is 4000 chars — output must not exceed it (plus header overhead)
    assert.ok(result.length <= 4200)
    assert.ok(result.includes('### Conventions'))
    // Should not contain all 500 items
    assert.ok(!result.includes('Convention 499'))
  })
})

// ---------------------------------------------------------------------------
// Integration: generateBranch includes memory
// ---------------------------------------------------------------------------

describe('ClaudeMdGenerator — generateBranch with memory', () => {
  let gen
  let projectDir

  beforeEach(async () => {
    projectDir = await createTempProject()
    gen = new ClaudeMdGenerator()
    await gen.initialize(projectDir)
  })

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true })
  })

  it('includes branch memory in generated CLAUDE_{branch}.md', async () => {
    await writeMemory(projectDir, 'fullstack', {
      conventions: ['Follow SAM pattern'],
      architecturalDecisions: ['Use atomic transactions']
    })

    await gen.generateBranch('fullstack', {})

    const content = await fs.readFile(
      path.join(projectDir, '.claude', 'CLAUDE_fullstack.md'),
      'utf-8'
    )

    // Should contain the static branch focus
    assert.ok(content.includes('## Branch Focus'))
    // Should also contain extracted memory
    assert.ok(content.includes('## Branch Memory (auto-extracted)'))
    assert.ok(content.includes('- Follow SAM pattern'))
    assert.ok(content.includes('- Use atomic transactions'))
  })

  it('generates branch file normally when no memory exists', async () => {
    await gen.generateBranch('fullstack', {})

    const content = await fs.readFile(
      path.join(projectDir, '.claude', 'CLAUDE_fullstack.md'),
      'utf-8'
    )

    assert.ok(content.includes('## Branch Focus'))
    assert.ok(!content.includes('## Branch Memory'))
  })
})
