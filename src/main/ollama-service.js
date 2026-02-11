/**
 * Puffin - Ollama Service
 *
 * LLM provider that connects to a remote Ollama instance via SSH.
 * Each prompt spawns a new SSH connection running `ollama run <model>`.
 * Streams responses back line-by-line in a format compatible with the
 * existing Claude response pipeline.
 *
 * @module ollama-service
 */

const { spawn } = require('child_process')
const os = require('os')
const path = require('path')
const { LLMProvider } = require('./llm-provider')

/**
 * Default SSH configuration for Ollama connection
 */
const DEFAULT_SSH_CONFIG = {
  host: '',
  user: '',
  port: 22,
  privateKeyPath: path.join(os.homedir(), '.ssh', 'id_ed25519'),
  timeout: 10000
}

/**
 * Map common SSH/Ollama stderr patterns to user-friendly messages.
 * Checked in order — first match wins.
 * @type {Array<{pattern: RegExp, message: string}>}
 */
const SSH_ERROR_PATTERNS = [
  { pattern: /Connection refused/i, message: 'SSH connection refused. Is the remote server running and accepting SSH connections?' },
  { pattern: /Connection timed out/i, message: 'SSH connection timed out. The remote server may be unreachable or a firewall is blocking the connection.' },
  { pattern: /No route to host/i, message: 'Cannot reach the remote server. Check the host address and your network connection.' },
  { pattern: /Host key verification failed/i, message: 'SSH host key verification failed. The server identity may have changed.' },
  { pattern: /Permission denied/i, message: 'SSH authentication failed. Check your SSH key and username.' },
  { pattern: /Could not resolve hostname/i, message: 'Cannot resolve the remote hostname. Check the host address.' },
  { pattern: /Network is unreachable/i, message: 'Network is unreachable. Check your internet connection.' },
  { pattern: /model '?[^']*'? not found/i, message: null }, // Handled specially — includes model name
  { pattern: /Error:\s*model\s/i, message: null } // Ollama model errors — handled specially
]

/**
 * OllamaService connects to a remote Ollama instance via SSH
 * and implements the LLMProvider interface.
 */
class OllamaService extends LLMProvider {
  /**
   * @param {Object} [sshConfig] - SSH connection configuration
   * @param {string} sshConfig.host - Remote host address
   * @param {string} sshConfig.user - SSH username
   * @param {number} [sshConfig.port=22] - SSH port
   * @param {string} [sshConfig.privateKeyPath] - Path to private key
   * @param {number} [sshConfig.timeout=10000] - Connection timeout in ms
   */
  constructor(sshConfig = {}) {
    super({ id: 'ollama', name: 'Ollama' })
    this._sshConfig = { ...DEFAULT_SSH_CONFIG, ...sshConfig }
    this._currentProcess = null
    this._cancelRequested = false
    this._cachedModels = null
  }

  /**
   * Check if the SSH config is populated (host and user are set).
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this._sshConfig.host && this._sshConfig.user)
  }

  /**
   * Update SSH configuration.
   * @param {Object} config - Partial SSH config to merge
   */
  updateConfig(config) {
    this._sshConfig = { ...this._sshConfig, ...config }
    this._cachedModels = null // Invalidate model cache
  }

  /**
   * Submit an interactive prompt with streaming callbacks.
   *
   * Spawns a new SSH connection running `ollama run <model>` on the remote
   * host. Streams stdout back line-by-line through the onChunk callback.
   * Response structure matches Claude's format for renderer compatibility.
   *
   * @param {Object} data - Submission data
   * @param {string} data.prompt - The user prompt
   * @param {string} [data.model] - Ollama model name (with or without 'ollama:' prefix)
   * @param {Function} onChunk - Called with each text line (string)
   * @param {Function} onComplete - Called with Claude-compatible response object
   * @param {Function} [onRaw] - Called with raw JSON-like line for CLI Output view
   * @param {Function} [onFullPrompt] - Called with the full prompt text
   * @param {Function} [onQuestion] - Not used by Ollama (no tool interaction)
   * @returns {Promise<Object>} Claude-compatible completion result
   */
  async submit(data, onChunk, onComplete, onRaw, onFullPrompt, onQuestion) {
    if (!this.isConfigured()) {
      const error = 'Ollama SSH connection is not configured. Set host and user in settings.'
      const result = this._buildCompleteResponse('', error, 1, 0)
      onComplete?.(result)
      return result
    }

    if (this._currentProcess) {
      const error = 'An Ollama request is already running.'
      const result = this._buildCompleteResponse('', error, 1, 0)
      onComplete?.(result)
      return result
    }

    const model = this._stripPrefix(data.model || 'llama3.2:latest')
    const prompt = data.prompt || ''
    const timeout = data.timeout || 300000  // Default 5 minute timeout for interactive sessions

    if (onFullPrompt) onFullPrompt(prompt)

    const startTime = Date.now()
    this._cancelRequested = false

    return new Promise((resolve) => {
      const sshArgs = this._buildSshArgs(model, prompt)

      console.log(`[OLLAMA] Spawning SSH to ${this._sshConfig.user}@${this._sshConfig.host} for model: ${model}`)

      // Emit SSH connection status (AC3)
      onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'connecting', message: `Connecting to ${this._sshConfig.host}...` }))

      const proc = spawn('ssh', sshArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      this._currentProcess = proc
      let fullResponse = ''
      let stderrOutput = ''
      let stdoutBuffer = '' // Buffer for line-by-line parsing
      let firstChunkReceived = false
      let timedOut = false

      // Set timeout for hung connections
      const timer = setTimeout(() => {
        timedOut = true
        this._killProcess(proc)
        this._currentProcess = null
        const duration = Date.now() - startTime
        onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'error', message: 'Connection timed out' }))
        const result = this._buildCompleteResponse(fullResponse, `Ollama request timed out after ${timeout}ms`, 1, duration)
        onComplete?.(result)
        resolve(result)
      }, timeout)

      // Stream stdout line-by-line (AC2)
      proc.stdout.on('data', (chunk) => {
        if (this._cancelRequested) return

        // Emit "Connected" status on first data received
        if (!firstChunkReceived) {
          firstChunkReceived = true
          onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'connected', message: 'Connected' }))
        }

        const text = chunk.toString()
        stdoutBuffer += text

        // Emit complete lines, keep partial line in buffer
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() // Last element is either '' (after trailing \n) or partial line

        for (const line of lines) {
          const lineWithNewline = line + '\n'
          fullResponse += lineWithNewline
          onChunk?.(lineWithNewline)
          // Emit raw line as JSON-like string for CLI Output view
          onRaw?.(JSON.stringify({ type: 'assistant', provider: 'ollama', model, text: line }))
        }
      })

      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString()
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) return  // Already resolved by timeout handler
        this._currentProcess = null
        const duration = Date.now() - startTime

        // Flush any remaining buffered content
        if (stdoutBuffer && !this._cancelRequested) {
          fullResponse += stdoutBuffer
          onChunk?.(stdoutBuffer)
          onRaw?.(JSON.stringify({ type: 'assistant', provider: 'ollama', model, text: stdoutBuffer }))
          stdoutBuffer = ''
        }

        if (this._cancelRequested) {
          onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'closed', message: 'Connection closed (cancelled)' }))
          const result = this._buildCompleteResponse(fullResponse, null, -1, duration, true)
          onComplete?.(result)
          resolve(result)
          return
        }

        // Check for errors
        if (code !== 0 || (stderrOutput && !fullResponse)) {
          onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'error', message: 'Connection closed (error)' }))
          const error = this._formatSshError(stderrOutput, model, code)
          const result = this._buildCompleteResponse(fullResponse, error, code ?? 1, duration)
          onComplete?.(result)
          resolve(result)
          return
        }

        console.log(`[OLLAMA] Response complete: ${fullResponse.length} chars in ${duration}ms`)
        onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'complete', message: 'Response received' }))
        onRaw?.(JSON.stringify({ type: 'status', provider: 'ollama', model, status: 'closed', message: 'Connection closed' }))
        const result = this._buildCompleteResponse(fullResponse, null, 0, duration)
        onComplete?.(result)
        resolve(result)
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        if (timedOut) return  // Already resolved by timeout handler
        this._currentProcess = null
        const duration = Date.now() - startTime
        const error = this._formatSpawnError(err)
        const result = this._buildCompleteResponse('', error, 1, duration)
        onComplete?.(result)
        resolve(result)
      })

      // Write prompt to stdin and close (each call is a fresh SSH connection — AC7)
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  /**
   * Send a one-shot prompt (non-streaming).
   *
   * @param {string} prompt - The prompt text
   * @param {Object} [options] - Options
   * @param {string} [options.model] - Ollama model name
   * @param {number} [options.timeout=60000] - Timeout in ms
   * @returns {Promise<{success: boolean, response?: string, error?: string}>}
   */
  async sendPrompt(prompt, options = {}) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Ollama SSH connection is not configured' }
    }

    const model = this._stripPrefix(options.model || 'llama3.2:latest')
    const timeout = options.timeout || 60000
    this._cancelRequested = false

    return new Promise((resolve) => {
      const sshArgs = this._buildSshArgs(model, prompt)
      const proc = spawn('ssh', sshArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      this._currentProcess = proc
      let fullResponse = ''
      let stderrOutput = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        this._killProcess(proc)
        this._currentProcess = null
        resolve({ success: false, error: `Ollama request timed out after ${timeout}ms` })
      }, timeout)

      proc.stdout.on('data', (chunk) => {
        fullResponse += chunk.toString()
      })

      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString()
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) return  // Already resolved by timeout handler
        this._currentProcess = null

        if (this._cancelRequested) {
          resolve({ success: true, response: fullResponse })
          return
        }

        if (code !== 0 || (stderrOutput && !fullResponse)) {
          const error = this._formatSshError(stderrOutput, model, code)
          resolve({ success: false, error })
          return
        }

        resolve({ success: true, response: fullResponse })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        if (timedOut) return  // Already resolved by timeout handler
        this._currentProcess = null
        resolve({ success: false, error: this._formatSpawnError(err) })
      })

      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  /**
   * Cancel the currently running Ollama request (AC5).
   * Terminates the SSH process tree.
   */
  cancel() {
    this._cancelRequested = true
    if (this._currentProcess) {
      console.log('[OLLAMA] Cancelling active request')
      this._killProcess(this._currentProcess)
    }
  }

  /**
   * Check if a request is currently running.
   * @returns {boolean}
   */
  isProcessRunning() {
    return this._currentProcess !== null
  }

  /**
   * Get available Ollama models from the remote server.
   * Runs `ollama list` via SSH and parses the output.
   *
   * @returns {Promise<import('./llm-provider').LLMModel[]>}
   */
  async getAvailableModels() {
    if (!this.isConfigured()) return []

    // Return cached models if available
    if (this._cachedModels) return this._cachedModels

    try {
      const models = await this._fetchRemoteModels()
      this._cachedModels = models
      return models
    } catch {
      return []
    }
  }

  /**
   * Invalidate the cached models list.
   */
  clearModelCache() {
    this._cachedModels = null
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Build a Claude-compatible completion response object (AC6).
   * This ensures the renderer can process Ollama responses identically
   * to Claude responses.
   *
   * @param {string} content - Full response text
   * @param {string|null} error - Error message, if any
   * @param {number} exitCode - Process exit code
   * @param {number} duration - Duration in milliseconds
   * @param {boolean} [cancelled=false] - Whether the request was cancelled
   * @returns {Object} Claude-compatible response
   * @private
   */
  _buildCompleteResponse(content, error, exitCode, duration, cancelled = false) {
    const response = {
      content: content || '',
      sessionId: null,   // Ollama has no session concept
      cost: null,        // Ollama is self-hosted, no cost
      turns: 1,          // Always single-turn for Ollama
      duration: duration ?? null,  // Use nullish coalescing to preserve 0ms durations
      exitCode: exitCode ?? 0
    }
    if (cancelled) response.cancelled = true
    if (error) response.error = error
    return response
  }

  /**
   * Format SSH/Ollama stderr into a user-friendly error message (AC3, AC4).
   *
   * @param {string} stderr - Raw stderr output
   * @param {string} model - The model name that was requested
   * @param {number|null} exitCode - Process exit code
   * @returns {string} User-friendly error message
   * @private
   */
  _formatSshError(stderr, model, exitCode) {
    const trimmed = (stderr || '').trim()
    if (!trimmed) {
      return `SSH process exited with code ${exitCode ?? 'unknown'}`
    }

    // Check for model-not-found specifically (AC4)
    if (/model\s+'?[^']*'?\s+not found/i.test(trimmed) || /Error:\s*model\s/i.test(trimmed)) {
      return `Model "${model}" is not available on the remote server. Run 'ollama pull ${model}' on the server to download it.`
    }

    // Check known SSH error patterns (AC3)
    for (const { pattern, message } of SSH_ERROR_PATTERNS) {
      if (message && pattern.test(trimmed)) {
        return message
      }
    }

    // Return the raw stderr as fallback, truncated for readability
    if (trimmed.length > 200) {
      return trimmed.slice(0, 200) + '...'
    }
    return trimmed
  }

  /**
   * Format spawn errors (e.g. SSH binary not found) into user-friendly messages.
   *
   * @param {Error} err - The spawn error
   * @returns {string} User-friendly error message
   * @private
   */
  _formatSpawnError(err) {
    if (err.code === 'ENOENT') {
      return 'SSH client not found. Ensure OpenSSH is installed and in your PATH.'
    }
    return `SSH connection failed: ${err.message}`
  }

  /**
   * Build SSH command arguments for running an Ollama command (AC1).
   * @param {string} model - Ollama model name
   * @param {string} prompt - The prompt text
   * @returns {string[]}
   * @private
   */
  _buildSshArgs(model, prompt) {
    const { host, user, port, privateKeyPath } = this._sshConfig
    const target = `${user}@${host}`

    // Sanitize model name to prevent command injection
    // Only allow alphanumerics, dots, underscores, colons, and hyphens
    const safeModel = model.replace(/[^a-zA-Z0-9._:-]/g, '')

    // Escape single quotes for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''")

    // Set PATH and run ollama directly
    const command = `PATH=$PATH:/usr/local/bin:/usr/bin:~/.local/bin ollama run ${safeModel} '${escapedPrompt}'`

    return [
      '-i', privateKeyPath,
      '-p', String(port),
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', `ConnectTimeout=${Math.ceil(this._sshConfig.timeout / 1000)}`,
      '-o', 'BatchMode=yes',
      target,
      command
    ]
  }

  /**
   * Fetch model list from remote Ollama instance.
   * @returns {Promise<import('./llm-provider').LLMModel[]>}
   * @private
   */
  _fetchRemoteModels() {
    return new Promise((resolve, reject) => {
      const { host, user, port, privateKeyPath } = this._sshConfig
      const target = `${user}@${host}`

      console.log(`[OLLAMA] Fetching models via SSH: ${target}`)

      // First find where ollama is installed, then run list
      // Common locations: /usr/local/bin, /usr/bin, ~/.local/bin
      const command = 'PATH=$PATH:/usr/local/bin:/usr/bin:~/.local/bin ollama list'

      console.log(`[OLLAMA] SSH command: ${command}`)

      const proc = spawn('ssh', [
        '-i', privateKeyPath,
        '-p', String(port),
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', `ConnectTimeout=${Math.ceil(this._sshConfig.timeout / 1000)}`,
        '-o', 'BatchMode=yes',
        target,
        command
      ], { stdio: ['pipe', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })

      const timer = setTimeout(() => {
        this._killProcess(proc)
        reject(new Error('Timeout fetching Ollama models'))
      }, this._sshConfig.timeout)

      proc.on('close', (code) => {
        clearTimeout(timer)
        console.log(`[OLLAMA] ======== SSH COMMAND COMPLETED ========`)
        console.log(`[OLLAMA] Exit code: ${code}`)
        console.log(`[OLLAMA] stdout length: ${stdout.length} bytes`)
        console.log(`[OLLAMA] stderr length: ${stderr.length} bytes`)
        console.log(`[OLLAMA] stdout raw bytes:`, Buffer.from(stdout).toString('hex').slice(0, 100))
        console.log(`[OLLAMA] stdout content:`, JSON.stringify(stdout))
        if (stderr) console.log(`[OLLAMA] stderr content:`, JSON.stringify(stderr))
        console.log(`[OLLAMA] =====================================`)

        if (code !== 0) {
          reject(new Error(stderr.trim() || `ollama list failed with code ${code}`))
          return
        }
        const parsed = this._parseOllamaList(stdout)
        console.log(`[OLLAMA] Parsed ${parsed.length} models:`, parsed.map(m => m.name))
        resolve(parsed)
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  /**
   * Parse `ollama list` output into LLMModel objects.
   * Output format:
   *   NAME              ID            SIZE    MODIFIED
   *   mistral-small:latest  abc123...  14 GB   2 days ago
   *
   * @param {string} output - Raw output from `ollama list`
   * @returns {import('./llm-provider').LLMModel[]}
   * @private
   */
  _parseOllamaList(output) {
    const lines = output.split('\n').filter(l => l.trim())
    if (lines.length < 2) return [] // Header + at least one model

    // Skip header line
    return lines.slice(1).map(line => {
      const name = line.split(/\s+/)[0] // First column is the model name
      if (!name) return null
      return {
        id: `ollama:${name}`,
        name,
        provider: 'ollama'
      }
    }).filter(Boolean)
  }

  /**
   * Strip 'ollama:' prefix from a model identifier.
   * @param {string} model - Model identifier, possibly prefixed
   * @returns {string} Model name without prefix
   * @private
   */
  _stripPrefix(model) {
    return model.startsWith('ollama:') ? model.slice(7) : model
  }

  /**
   * Kill a spawned process, handling Windows process tree correctly.
   * @param {import('child_process').ChildProcess} proc
   * @private
   */
  _killProcess(proc) {
    if (!proc) return
    if (process.platform === 'win32' && proc.pid) {
      const { exec } = require('child_process')
      exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
        if (err) {
          try { proc.kill('SIGTERM') } catch { /* already dead */ }
        }
      })
    } else {
      try { proc.kill('SIGTERM') } catch { /* already dead */ }
    }
  }
}

module.exports = { OllamaService }
