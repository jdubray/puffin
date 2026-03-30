/**
 * ClaudeMemoryReader
 *
 * Reads the Claude Code memory sections stored after the
 * `<!-- puffin:generated-end -->` sentinel in each .claude/CLAUDE_{branch}.md
 * file.  These sections are written by Claude Code's native /memory command
 * and round-tripped back to the branch file by ClaudeMdGenerator whenever
 * Puffin switches or regenerates branches.
 *
 * @module claude-memory-reader
 */

const fs = require('fs').promises
const path = require('path')

// Keep the sentinel in sync with ClaudeMdGenerator without creating a hard
// cross-package dependency — the string is a stable constant.
const GENERATED_END_SENTINEL = '<!-- puffin:generated-end -->'

class ClaudeMemoryReader {
  /**
   * @param {string} claudeDir - Absolute path to the project's .claude/ directory
   */
  constructor(claudeDir) {
    this.claudeDir = claudeDir
  }

  /**
   * Return the Claude Code memory content for a branch.
   * That is everything after the sentinel in CLAUDE_{branch}.md.
   *
   * @param {string} branch
   * @returns {Promise<{ exists: boolean, content: string|null }>}
   */
  async getMemory(branch) {
    const filePath = this._branchFilePath(branch)
    let raw = ''
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') return { exists: false, content: null }
      throw err
    }

    const content = this._extractAdditions(raw)
    return { exists: true, content }
  }

  /**
   * List all branches that have a non-empty Claude Code memory section.
   *
   * Scans .claude/ for CLAUDE_{branch}.md files (excluding CLAUDE_base.md
   * and CLAUDE.md itself) and returns those with post-sentinel content.
   *
   * @returns {Promise<string[]>} Sorted array of branch names
   */
  async listBranches() {
    let files = []
    try {
      files = await fs.readdir(this.claudeDir)
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }

    const branchFiles = files.filter(f =>
      f.startsWith('CLAUDE_') && f.endsWith('.md') && f !== 'CLAUDE_base.md'
    )

    const entries = await Promise.all(
      branchFiles.map(async file => {
        const branch = file.replace(/^CLAUDE_/, '').replace(/\.md$/, '')
        const { content } = await this.getMemory(branch)
        return content ? branch : null
      })
    )

    return entries.filter(Boolean).sort()
  }

  /**
   * Remove the Claude Code memory section from a branch file, leaving only
   * the Puffin-generated content up to and including the sentinel.
   *
   * @param {string} branch
   * @returns {Promise<boolean>} True if content was removed, false if branch
   *   file didn't exist or had no Claude Code section.
   */
  async clearMemory(branch) {
    const filePath = this._branchFilePath(branch)
    let raw = ''
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') return false
      throw err
    }

    const idx = raw.indexOf(GENERATED_END_SENTINEL)
    if (idx === -1) return false

    const additions = raw.slice(idx + GENERATED_END_SENTINEL.length).trim()
    if (!additions) return false

    const cleared = raw.slice(0, idx + GENERATED_END_SENTINEL.length) + '\n'
    await fs.writeFile(filePath, cleared, 'utf-8')
    return true
  }

  // ── private ────────────────────────────────────────────────────────────────

  _branchFilePath(branch) {
    return path.join(this.claudeDir, `CLAUDE_${branch}.md`)
  }

  /**
   * Extract content after the sentinel, trimmed.  Returns null when empty.
   * @param {string} raw
   * @returns {string|null}
   */
  _extractAdditions(raw) {
    const idx = raw.indexOf(GENERATED_END_SENTINEL)
    if (idx === -1) return null
    const after = raw.slice(idx + GENERATED_END_SENTINEL.length).trim()
    return after || null
  }
}

module.exports = { ClaudeMemoryReader, GENERATED_END_SENTINEL }
