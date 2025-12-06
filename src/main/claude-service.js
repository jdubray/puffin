/**
 * Puffin - Claude Service
 *
 * Spawns and manages the Claude Code CLI as a subprocess.
 * Acts as the bridge between Puffin's management layer and the CLI.
 * This gives Puffin the full capabilities of the CLI:
 * - File read/write
 * - Bash execution
 * - Project awareness
 * - Tool use and agentic loops
 * - Integration with Puffin's management layer
 *
 */

const { spawn } = require('child_process')
const path = require('path')

class ClaudeService {
  constructor() {
    this.currentProcess = null
    this.projectPath = null
  }

  /**
   * Set the working directory for Claude CLI
   * @param {string} projectPath - Path to the project directory
   */
  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  /**
   * Submit a prompt to Claude Code CLI
   * @param {Object} data - Request data
   * @param {Function} onChunk - Callback for streaming output
   * @param {Function} onComplete - Callback when complete
   * @param {Function} onRaw - Callback for raw JSON lines (optional)
   */
  async submit(data, onChunk, onComplete, onRaw = null) {
    return new Promise((resolve, reject) => {
      // Build the prompt with project context
      const prompt = this.buildPrompt(data)

      // Determine working directory
      const cwd = data.projectPath || this.projectPath || process.cwd()

      // Build CLI arguments (without prompt - we'll pass via stdin)
      const args = this.buildArgs(data)

      console.log('Spawning Claude CLI:', 'claude', args)
      console.log('Working directory:', cwd)
      console.log('Prompt length:', prompt.length)

      // Spawn the Claude CLI process with stdin for prompt
      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']
      this.currentProcess = spawn('claude', args, spawnOptions)

      let fullOutput = ''
      let errorOutput = ''
      let resultData = null
      let buffer = ''

      console.log('Claude CLI process started, PID:', this.currentProcess.pid)

      // Write prompt to stdin and close it
      this.currentProcess.stdin.write(prompt)
      this.currentProcess.stdin.end()

      // Handle stdout (streaming JSON response)
      this.currentProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString()
        console.log('Claude CLI stdout chunk:', text.substring(0, 200))
        buffer += text

        // Parse streaming JSON lines
        const lines = buffer.split('\n')
        buffer = lines.pop() // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          // Always emit raw line to CLI Output view
          if (onRaw) {
            onRaw(line)
          }

          try {
            const json = JSON.parse(line)
            this.handleStreamMessage(json, onChunk)

            // Capture final result
            if (json.type === 'result') {
              resultData = json
            }
          } catch (e) {
            // Not JSON, treat as plain text
            console.log('Non-JSON output:', line.substring(0, 100))
            fullOutput += line + '\n'
            onChunk(line + '\n')
          }
        }
      })

      // Handle stderr
      this.currentProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        errorOutput += text
        console.error('Claude CLI stderr:', text)
      })

      // Log when streams close
      this.currentProcess.stdout.on('end', () => {
        console.log('Claude CLI stdout ended')
      })

      this.currentProcess.stderr.on('end', () => {
        console.log('Claude CLI stderr ended')
      })

      // Handle process completion
      this.currentProcess.on('close', (code) => {
        this.currentProcess = null

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer)
            if (json.type === 'result') {
              resultData = json
            }
          } catch (e) {
            fullOutput += buffer
          }
        }

        if (code === 0 || resultData) {
          const response = {
            content: resultData?.result || fullOutput,
            sessionId: resultData?.session_id,
            cost: resultData?.total_cost_usd,
            turns: resultData?.num_turns,
            duration: resultData?.duration_ms,
            exitCode: code
          }
          onComplete(response)
          resolve(response)
        } else {
          const error = new Error(`Claude CLI exited with code ${code}: ${errorOutput}`)
          reject(error)
        }
      })

      // Handle process errors
      this.currentProcess.on('error', (error) => {
        this.currentProcess = null
        console.error('Claude CLI spawn error:', error)
        reject(error)
      })
    })
  }

  /**
   * Build CLI arguments
   * @private
   */
  buildArgs(data) {
    const args = []

    // Use --print for non-interactive mode (it's a flag, not an option with value)
    args.push('--print')

    // Use streaming JSON for structured output (requires --verbose with --print)
    args.push('--output-format', 'stream-json')
    args.push('--verbose')

    // Limit turns to prevent runaway processes
    args.push('--max-turns', String(data.maxTurns || '10'))

    // Auto-accept edits to avoid permission prompts
    args.push('--permission-mode', 'acceptEdits')

    // Add model if specified
    if (data.model) {
      args.push('--model', data.model)
    }

    // Resume session if provided (for conversation continuity)
    if (data.sessionId) {
      args.push('--resume', data.sessionId)
    }

    // Add system prompt if provided
    if (data.systemPrompt) {
      args.push('--system-prompt', data.systemPrompt)
    }

    // Prompt will be passed via stdin (using pipe operator)
    // This is handled by the caller writing to stdin
    args.push('-')

    return args
  }

  /**
   * Handle streaming JSON messages from CLI
   * @private
   */
  handleStreamMessage(json, onChunk) {
    switch (json.type) {
      case 'assistant':
        // Assistant message with content
        if (json.message?.content) {
          for (const block of json.message.content) {
            if (block.type === 'text') {
              onChunk(block.text)
            } else if (block.type === 'tool_use') {
              // Show tool usage in a formatted way
              onChunk(`\n🔧 Using tool: ${block.name}\n`)
            }
          }
        }
        break

      case 'user':
        // Tool results - could show these differently
        if (json.message?.content) {
          for (const block of json.message.content) {
            if (block.type === 'tool_result' && block.content) {
              // Optionally show truncated tool results
              // onChunk(`\n📋 Tool result received\n`)
            }
          }
        }
        break

      case 'system':
        // System messages (initialization, etc.)
        if (json.message) {
          onChunk(`\n⚙️ ${json.message}\n`)
        }
        break

      case 'result':
        // Final result - handled in completion
        break

      default:
        // Unknown message type, log it
        console.log('Unknown stream message type:', json.type)
    }
  }

  /**
   * Build the prompt with optional context
   * @private
   */
  buildPrompt(data) {
    let prompt = data.prompt

    // Add branch tag/context at the start
    if (data.branchId) {
      const branchContext = this.getBranchContext(data.branchId)
      if (branchContext) {
        prompt = branchContext + '\n\n' + prompt
      }
    }

    // Add GUI description if provided
    if (data.guiDescription) {
      prompt += '\n\n## UI Layout Reference\n' + data.guiDescription
    }

    // Add project context as part of the prompt if provided
    if (data.project) {
      const context = this.buildProjectContext(data.project)
      if (context) {
        prompt = context + '\n\n---\n\n' + prompt
      }
    }

    return prompt
  }

  /**
   * Get context/guidance based on the branch type
   * @private
   */
  getBranchContext(branchId) {
    const branchContexts = {
      specifications: `[SPECIFICATIONS THREAD]
Focus on: Requirements gathering, feature definitions, user stories, acceptance criteria, and functional specifications.
Help clarify requirements, identify edge cases, and ensure completeness.`,

      architecture: `[ARCHITECTURE THREAD]
Focus on: System design, component structure, data flow, API design, technology choices, and architectural patterns.
Consider scalability, maintainability, and best practices.`,

      ui: `[UI/UX THREAD]
Focus on: User interface design, user experience, component layout, styling, accessibility, and frontend implementation.
Consider usability, responsiveness, and visual consistency.`,

      backend: `[BACKEND THREAD]
Focus on: Server-side logic, APIs, database operations, business logic, and backend services.
Consider performance, security, and data integrity.`,

      deployment: `[DEPLOYMENT THREAD]
Focus on: CI/CD, infrastructure, containerization, hosting, monitoring, and DevOps practices.
Consider reliability, scalability, and operational concerns.`
    }

    return branchContexts[branchId] || null
  }

  /**
   * Build project context string
   * @private
   */
  buildProjectContext(project) {
    if (!project) return ''

    const lines = ['## Project Context']

    if (project.description) {
      lines.push('')
      lines.push('### Description')
      lines.push(project.description)
    }

    if (project.assumptions && project.assumptions.length > 0) {
      lines.push('')
      lines.push('### Assumptions')
      project.assumptions.forEach(a => lines.push(`- ${a}`))
    }

    if (project.technicalArchitecture) {
      lines.push('')
      lines.push('### Technical Architecture')
      lines.push(project.technicalArchitecture)
    }

    if (project.dataModel) {
      lines.push('')
      lines.push('### Data Model')
      lines.push(project.dataModel)
    }

    if (project.options) {
      lines.push('')
      lines.push('### Coding Preferences')
      const opts = project.options
      lines.push(`- Programming Style: ${this.formatOption(opts.programmingStyle)}`)
      lines.push(`- Testing Approach: ${this.formatOption(opts.testingApproach)}`)
      lines.push(`- Documentation Level: ${this.formatOption(opts.documentationLevel)}`)
      lines.push(`- Error Handling: ${this.formatOption(opts.errorHandling)}`)
      if (opts.codeStyle) {
        lines.push(`- Naming Convention: ${this.formatOption(opts.codeStyle.naming)}`)
        lines.push(`- Comment Style: ${this.formatOption(opts.codeStyle.comments)}`)
      }
    }

    return lines.length > 1 ? lines.join('\n') : ''
  }

  /**
   * Format option value for display
   * @private
   */
  formatOption(value) {
    if (!value) return 'Not specified'

    const mappings = {
      'OOP': 'Object-Oriented Programming',
      'FP': 'Functional Programming',
      'TEMPORAL': 'Temporal Logic (TLA+/SAM)',
      'HYBRID': 'Hybrid Approach',
      'TDD': 'Test-Driven Development',
      'BDD': 'Behavior-Driven Development',
      'INTEGRATION': 'Integration First',
      'MINIMAL': 'Minimal',
      'STANDARD': 'Standard',
      'COMPREHENSIVE': 'Comprehensive',
      'EXCEPTIONS': 'Exceptions',
      'RESULT': 'Result Types',
      'EITHER': 'Either Monad',
      'CAMEL': 'camelCase',
      'SNAKE': 'snake_case',
      'PASCAL': 'PascalCase'
    }

    return mappings[value] || value
  }

  /**
   * Cancel the current request
   */
  cancel() {
    if (this.currentProcess) {
      console.log('Killing Claude CLI process')
      this.currentProcess.kill('SIGTERM')

      // Force kill after 2 seconds if still running
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill('SIGKILL')
          this.currentProcess = null
        }
      }, 2000)
    }
  }

  /**
   * Get spawn options based on platform
   * Windows requires shell: true for .cmd files
   * @private
   */
  getSpawnOptions(cwd = null) {
    const env = { ...process.env }

    // On Windows, Claude Code requires git-bash
    // Set the path if not already set and Git is in default location
    if (process.platform === 'win32' && !env.CLAUDE_CODE_GIT_BASH_PATH) {
      const fs = require('fs')
      const defaultGitBashPaths = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
      ]
      for (const gitBashPath of defaultGitBashPaths) {
        if (fs.existsSync(gitBashPath)) {
          env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
          console.log('Auto-detected git-bash at:', gitBashPath)
          break
        }
      }
    }

    const options = {
      env,
      shell: process.platform === 'win32'
    }
    if (cwd) {
      options.cwd = cwd
    }
    return options
  }

  /**
   * Check if Claude CLI is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return new Promise((resolve) => {
      const check = spawn('claude', ['--version'], this.getSpawnOptions())

      check.on('close', (code) => {
        resolve(code === 0)
      })

      check.on('error', () => {
        resolve(false)
      })

      // Timeout after 5 seconds
      setTimeout(() => {
        check.kill()
        resolve(false)
      }, 5000)
    })
  }

  /**
   * Get Claude CLI version
   * @returns {Promise<string|null>}
   */
  async getVersion() {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['--version'], this.getSpawnOptions())
      let output = ''

      proc.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim())
        } else {
          resolve(null)
        }
      })

      proc.on('error', () => {
        resolve(null)
      })
    })
  }
}

module.exports = { ClaudeService }
