/**
 * Puffin - Vibe Service
 *
 * Spawns and manages the Mistral Vibe CLI (`vibe`) as a subprocess in
 * programmatic mode (`-p`).  The prompt is passed directly as a CLI argument;
 * stdin is not used.  Output is captured as newline-delimited JSON
 * (`--output streaming`) and forwarded to callers chunk-by-chunk.
 */

const { spawn } = require('child_process')
const os = require('os')

class VibeService {
  constructor() {
    this.currentProcess = null
    this.projectPath = null
    this._processLock = false
  }

  /** Set the working directory used when no per-call projectPath is supplied. */
  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  /** Returns true while a CLI process is running. */
  isProcessRunning() {
    return this._processLock || this.currentProcess !== null
  }

  /**
   * Submit a prompt to the Vibe CLI in programmatic mode.
   *
   * @param {Object} data
   * @param {string}  data.prompt      - The prompt text to send.
   * @param {string}  [data.apiKey]    - Mistral API key (from config).
   * @param {string}  [data.model]     - Model name, passed as MISTRAL_MODEL env var.
   * @param {string}  [data.projectPath] - Override working directory.
   * @param {number}  [data.maxTurns]  - Max agent turns (--max-turns).
   * @param {Function} onChunk         - Called with each text chunk as it arrives.
   * @param {Function} onComplete      - Called with the final response object.
   */
  async submit(data, onChunk, onComplete) {
    if (this.isProcessRunning()) {
      throw new Error('A Vibe CLI process is already running. Please wait for it to complete.')
    }

    this._processLock = true

    return new Promise((resolve, reject) => {
      const cwd = data.projectPath || this.projectPath || process.cwd()

      // Build arguments for programmatic mode
      const args = [
        '-p', data.prompt,
        '--output', 'streaming',
        '--workdir', cwd
      ]
      if (data.maxTurns) {
        args.push('--max-turns', String(data.maxTurns))
      }

      // Build environment — inject API key and optional model override
      const env = { ...process.env }
      if (data.apiKey) env.MISTRAL_API_KEY = data.apiKey
      // Model is managed by vibe's own config (~/.vibe/config.toml, via `vibe --setup`).
      // Do NOT override VIBE_ACTIVE_MODEL here — vibe aliases differ from Mistral API model IDs.
      // Force UTF-8 on Windows so vibe's JSON output (which may contain non-ASCII
      // characters) doesn't crash with a cp1252 UnicodeEncodeError.
      env.PYTHONIOENCODING = 'utf-8'
      env.PYTHONUTF8 = '1'
      // Disable stdout buffering so streaming output arrives immediately
      env.PYTHONUNBUFFERED = '1'
      // In programmatic (-p) mode there's no interactive UI to approve tool calls.
      // Override bash/write_file permissions to "always" so vibe doesn't hang waiting.
      env.VIBE_TOOLS__BASH__PERMISSION = 'always'
      env.VIBE_TOOLS__WRITE_FILE__PERMISSION = 'always'
      env.VIBE_TOOLS__SEARCH_REPLACE__PERMISSION = 'always'

      // Augment PATH on macOS so vibe is found in common install locations
      if (process.platform === 'darwin') {
        const home = os.homedir()
        const extraPaths = [`${home}/.local/bin`, '/usr/local/bin', '/opt/homebrew/bin']
        const currentPath = env.PATH || ''
        const missing = extraPaths.filter(p => !currentPath.split(':').includes(p))
        if (missing.length) env.PATH = [...missing, currentPath].join(':')
      }

      console.log('[VIBE-SERVICE] Spawning vibe', args.slice(0, 3).join(' '), '…')

      this.currentProcess = spawn('vibe', args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let fullOutput = ''
      let errorOutput = ''
      let buffer = ''

      // Parse newline-delimited JSON; extract text from each message object
      const processLine = (line) => {
        line = line.trim()
        if (!line) return
        try {
          const msg = JSON.parse(line)
          // Skip system/user messages — only forward assistant output
          if (msg.role && msg.role !== 'assistant') return
          // Extract text from common streaming message shapes
          // content may be a string or a list of content blocks [{type:'text', text:'...'}]
          const rawContent = msg.content ?? msg.text ?? msg.delta?.content ?? msg.delta?.text ?? null
          const text = Array.isArray(rawContent)
            ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
            : (typeof rawContent === 'string' ? rawContent : null)
          if (text) {
            fullOutput += text
            if (onChunk) onChunk(text)
          }
        } catch {
          // Non-JSON line — treat as plain text (e.g., status messages)
          console.log('[VIBE-SERVICE] stdout:', line)
        }
      }

      this.currentProcess.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep the incomplete last fragment
        lines.forEach(processLine)
      })

      this.currentProcess.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString()
        console.error('[VIBE-SERVICE] stderr:', chunk.toString().trim())
      })

      this.currentProcess.on('close', (code) => {
        // Flush any remaining buffered output
        if (buffer.trim()) processLine(buffer)
        buffer = ''
        this.currentProcess = null
        this._processLock = false

        if (code === 0 || code === null) {
          const response = { content: fullOutput, exitCode: code }
          if (onComplete) onComplete(response)
          resolve(response)
        } else {
          reject(new Error(`Vibe CLI exited with code ${code}: ${errorOutput}`))
        }
      })

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null
        this._processLock = false
        reject(error)
      })
    })
  }

  /**
   * sendAnswer is not supported in programmatic mode (-p).
   * Included for API compatibility; always returns false.
   */
  sendAnswer(toolUseId, answers) {
    console.warn('[VIBE-SERVICE] sendAnswer is not supported in programmatic mode (-p)')
    return false
  }

  /** Cancel the running process. */
  cancel() {
    if (this.currentProcess) {
      try {
        if (process.platform === 'win32') {
          const { exec } = require('child_process')
          exec(`taskkill /pid ${this.currentProcess.pid} /T /F`)
        } else {
          this.currentProcess.kill('SIGTERM')
        }
      } catch { /* already dead */ }
      this.currentProcess = null
      this._processLock = false
    }
  }

  /** Check whether the `vibe` CLI is installed and callable. */
  async isAvailable() {
    return new Promise((resolve) => {
      const check = spawn('vibe', ['--version'], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      check.on('close', (code) => resolve(code === 0))
      check.on('error', () => resolve(false))
      setTimeout(() => { check.kill(); resolve(false) }, 5000)
    })
  }
}

module.exports = VibeService
