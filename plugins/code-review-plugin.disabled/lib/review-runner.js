const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const REVIEW_TIMEOUT_MS = 10 * 60 * 1000  // 10 min per story

class ReviewRunner {
  /**
   * @param {string} projectPath - root of the Puffin project
   * @param {string} outputDir   - docs/code-reviews/{timestamp}/
   * @param {*} _unused - reserved for future progress channel
   */
  constructor(projectPath, outputDir, _unused) {
    this._projectPath = projectPath
    this._outputDir = outputDir
    this._progress = {}  // { [storyId]: string[] }
  }

  /** Returns accumulated stdout lines for each story in this run. */
  getProgress() {
    return Object.fromEntries(
      Object.entries(this._progress).map(([id, lines]) => [id, lines.join('')])
    )
  }

  async run(runId, stories) {
    if (!fs.existsSync(this._outputDir)) {
      fs.mkdirSync(this._outputDir, { recursive: true })
    }

    const results = new Map()

    // Sequential execution so that summary stories (sorted last) can read prior reports
    for (const story of stories) {
      try {
        const { findingCount, reportPath } = await this._runStory(story)
        results.set(story.id, { status: 'complete', findingCount, reportPath })
      } catch (err) {
        const reportPath = this._computeReportPath(story.id, story.title)
        const errMsg = `# Code Review: ${story.title}\n\n**Review failed:** ${err.message}\n`
        try { fs.writeFileSync(reportPath, errMsg, 'utf-8') } catch {}
        results.set(story.id, {
          status: 'error',
          findingCount: { critical: 0, important: 0, info: 0 },
          reportPath,
          error: err.message
        })
      }
    }

    return results
  }

  async _runStory(story) {
    const reportPath = this._computeReportPath(story.id, story.title)
    const prompt = this._buildPrompt(story)
    this._progress[story.id] = []
    const markdown = await this._invokeClaude(prompt, story.id)
    fs.writeFileSync(reportPath, markdown, 'utf-8')
    return { findingCount: this._countFindings(markdown), reportPath }
  }

  _buildPrompt(story) {
    const ac = (story.acceptanceCriteria || []).map(a => `- ${a}`).join('\n') || '_(none)_'
    const ris = story.ris || '_(none)_'
    const assertions = (story.assertions || []).map(a => `- [${a.type}] ${a.target}: ${a.detail}`).join('\n') || '_(none)_'

    return `You are performing a code review on the Puffin codebase at the current working directory.

# Review Story: ${story.title}

${story.description || ''}

## Acceptance Criteria (what this review must detect)
${ac}

## Review Rules / Implementation Specification (RIS)
${ris}

## Implementation Assertions (checks)
${assertions}

# Your Task

Inspect the codebase using Read/Grep/Glob tools and identify violations of the rules above.

Output a single markdown document with this structure:

# Code Review: ${story.title}

**Date:** ${new Date().toISOString().slice(0, 10)}

## Summary
One-paragraph summary of findings.

## Findings

List each finding as a bullet using one of these severity tags at the start:
- **[CRITICAL]** RULE_ID path/to/file.js:LINE — short description
- **[IMPORTANT]** RULE_ID path/to/file.js:LINE — short description
- **[INFO]** RULE_ID path/to/file.js:LINE — short description

RULE_ID must be UPPER_SNAKE_CASE matching the acceptance criterion (e.g., MISSING_CASCADE, UNTRANSACTED_WRITE).

If there are zero findings, write "No findings." under ## Findings.

Output ONLY the markdown document. No preamble, no commentary.`
  }

  async _invokeClaude(prompt, storyId) {
    return new Promise((resolve, reject) => {
      const args = ['--print', '--dangerously-skip-permissions', '--disallowedTools', 'AskUserQuestion']
      const proc = spawn('claude', args, {
        cwd: this._projectPath,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
      }, REVIEW_TIMEOUT_MS)

      proc.stdout.on('data', d => {
        const chunk = d.toString()
        stdout += chunk
        if (storyId && this._progress[storyId] !== undefined) {
          this._progress[storyId].push(chunk)
        }
      })
      proc.stderr.on('data', d => { stderr += d.toString() })

      proc.on('close', code => {
        clearTimeout(timeoutId)
        if (timedOut) return reject(new Error(`Claude review timed out after ${REVIEW_TIMEOUT_MS}ms`))
        if (code === 0) return resolve(stdout.trim() || '# Code Review\n\n_Empty response from Claude._\n')
        if (stderr.includes('not found') || stderr.includes('command not found')) {
          return reject(new Error('Claude CLI not found — ensure `claude` is installed and on PATH'))
        }
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`))
      })

      proc.on('error', err => {
        clearTimeout(timeoutId)
        if (err.code === 'ENOENT') return reject(new Error('Claude CLI not found — ensure `claude` is installed and on PATH'))
        reject(err)
      })

      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  _countFindings(markdown) {
    const count = { critical: 0, important: 0, info: 0 }
    for (const line of markdown.split('\n')) {
      if (/\*\*\[critical\]\*\*/i.test(line)) count.critical++
      else if (/\*\*\[important\]\*\*/i.test(line)) count.important++
      else if (/\*\*\[info\]\*\*/i.test(line)) count.info++
    }
    return count
  }

  _computeReportPath(storyId, title) {
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    return path.join(this._outputDir, `${safeName}.md`)
  }
}

module.exports = { ReviewRunner }
