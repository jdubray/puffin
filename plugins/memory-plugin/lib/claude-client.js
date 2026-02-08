/**
 * Lightweight Claude CLI Client
 *
 * Spawns `claude --print --model <model>` with prompt via stdin.
 * Modeled on the RLM plugin's claude-code-client.js but simplified
 * for single-turn extraction/evolution prompts.
 *
 * @module claude-client
 */

const { spawn } = require('child_process')

/** Default timeout for LLM invocations (120 seconds) */
const DEFAULT_TIMEOUT_MS = 120000

class ClaudeClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.claudePath='claude'] - Path to the Claude CLI
   * @param {string} [options.model='haiku'] - Default model
   * @param {number} [options.timeoutMs=60000] - Timeout in milliseconds
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor(options = {}) {
    this.claudePath = options.claudePath || 'claude'
    this.model = options.model || 'haiku'
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
    this.logger = options.logger || console
  }

  /**
   * Send a prompt to Claude CLI and return the response
   * @param {string} prompt - The prompt text
   * @param {Object} [options]
   * @param {string} [options.model] - Override model for this call
   * @param {number} [options.timeoutMs] - Override timeout for this call
   * @returns {Promise<string>} Claude's response text
   */
  async invoke(prompt, options = {}) {
    const model = options.model || this.model
    const timeoutMs = options.timeoutMs || this.timeoutMs

    const args = ['--print', '--model', model, '--max-turns', '1', '--disallowedTools', 'AskUserQuestion']

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const proc = spawn(this.claudePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
        reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      proc.stdout.on('data', (data) => { stdout += data.toString() })
      proc.stderr.on('data', (data) => { stderr += data.toString() })

      proc.on('error', (err) => {
        clearTimeout(timer)
        if (err.code === 'ENOENT') {
          reject(new Error(`Claude CLI not found at "${this.claudePath}". Ensure it is installed and in PATH.`))
        } else {
          reject(err)
        }
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) return

        if (code === 0) {
          resolve(stdout.trim())
        } else {
          const lowerStderr = stderr.toLowerCase()
          if (lowerStderr.includes('rate limit')) {
            reject(new Error('Claude CLI rate limit exceeded'))
          } else {
            reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim()}`))
          }
        }
      })

      // Send prompt via stdin
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }
}

module.exports = { ClaudeClient, DEFAULT_TIMEOUT_MS }
