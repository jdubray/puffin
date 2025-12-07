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

/**
 * Tool emoji mapping for different tool types
 */
const TOOL_EMOJIS = {
  // File reading operations
  Read: '📖',

  // File editing operations
  Edit: '✏️',

  // File writing operations
  Write: '📝',

  // Search operations
  Grep: '🔍',
  Glob: '🔍',

  // Command execution
  Bash: '💻',

  // Web operations
  WebFetch: '🌐',
  WebSearch: '🔎',

  // Task/Agent operations
  Task: '🤖',

  // Notebook operations
  NotebookEdit: '📓',

  // Todo operations
  TodoWrite: '📋',

  // Other specialized tools
  Skill: '🎯',
  SlashCommand: '⚡',
  EnterPlanMode: '📋',
  ExitPlanMode: '✅',

  // Default fallback
  default: '⚙️'
}

/**
 * Get emoji for a tool name
 * @param {string} toolName - The name of the tool
 * @returns {string} The corresponding emoji
 */
function getToolEmoji(toolName) {
  return TOOL_EMOJIS[toolName] || TOOL_EMOJIS.default
}

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
      let streamedContent = '' // Accumulate ALL streamed assistant text
      let lastAssistantMessage = '' // Track the last complete assistant message
      let errorOutput = ''
      let resultData = null
      let buffer = ''
      let allMessages = [] // Store all messages for debugging/fallback

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
            allMessages.push(json)

            // Accumulate assistant text content
            if (json.type === 'assistant' && json.message?.content) {
              let messageText = ''
              for (const block of json.message.content) {
                if (block.type === 'text') {
                  messageText += block.text
                  streamedContent += block.text
                }
              }
              // Keep track of the last assistant message with substantial text
              if (messageText.length > 50) {
                lastAssistantMessage = messageText
              }
            }

            this.handleStreamMessage(json, onChunk)

            // Capture final result
            if (json.type === 'result') {
              resultData = json
              console.log('[CLAUDE-DEBUG] Captured result, result field length:', json.result?.length || 0)
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

        console.log('[CLAUDE-DEBUG] Process closed with code:', code)
        console.log('[CLAUDE-DEBUG] buffer remaining:', buffer?.length || 0, 'chars')
        console.log('[CLAUDE-DEBUG] streamedContent length:', streamedContent?.length || 0)
        console.log('[CLAUDE-DEBUG] fullOutput length:', fullOutput?.length || 0)
        console.log('[CLAUDE-DEBUG] resultData:', resultData ? 'exists' : 'null')
        if (resultData) {
          console.log('[CLAUDE-DEBUG] resultData.result length:', resultData.result?.length || 0)
          console.log('[CLAUDE-DEBUG] resultData.result preview:', resultData.result?.substring(0, 200) || '(empty)')
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          console.log('[CLAUDE-DEBUG] Processing remaining buffer:', buffer.substring(0, 200))
          try {
            const json = JSON.parse(buffer)
            if (json.type === 'result') {
              resultData = json
              console.log('[CLAUDE-DEBUG] Found result in buffer, result length:', resultData.result?.length || 0)
            }
          } catch (e) {
            fullOutput += buffer
            console.log('[CLAUDE-DEBUG] Buffer was not JSON, added to fullOutput')
          }
        }

        if (code === 0 || resultData) {
          // Determine best response content:
          // Due to a known bug in Claude Code CLI (issue #8126), the result field
          // can be empty even when the conversation completed successfully.
          // We need to extract content from multiple sources.
          let responseContent = ''

          console.log('[CLAUDE-DEBUG] Final response content selection:')
          console.log('[CLAUDE-DEBUG]   resultData?.result:', resultData?.result ? `${resultData.result.length} chars` : 'null/empty')
          console.log('[CLAUDE-DEBUG]   streamedContent:', streamedContent ? `${streamedContent.length} chars` : 'empty')
          console.log('[CLAUDE-DEBUG]   lastAssistantMessage:', lastAssistantMessage ? `${lastAssistantMessage.length} chars` : 'empty')
          console.log('[CLAUDE-DEBUG]   fullOutput:', fullOutput ? `${fullOutput.length} chars` : 'empty')
          console.log('[CLAUDE-DEBUG]   Total messages captured:', allMessages.length)

          // Try to extract the best content in order of preference:
          // 1. resultData.result (if substantial)
          // 2. Look for the final assistant message with actual content (not just "thinking" text)
          // 3. streamedContent (accumulated text from all assistant messages)
          // 4. fullOutput (non-JSON fallback)

          if (resultData?.result && resultData.result.length > 100) {
            responseContent = resultData.result
            console.log('[CLAUDE-DEBUG]   -> Using resultData.result (substantial content)')
          } else {
            // Look for the last assistant message that contains substantial content
            // This handles the case where Claude outputs a final response after tool use
            const assistantMessages = allMessages.filter(m => m.type === 'assistant')
            console.log('[CLAUDE-DEBUG]   Assistant messages count:', assistantMessages.length)

            // Find the last assistant message with substantial text content
            for (let i = assistantMessages.length - 1; i >= 0; i--) {
              const msg = assistantMessages[i]
              if (msg.message?.content) {
                let textContent = ''
                for (const block of msg.message.content) {
                  if (block.type === 'text') {
                    textContent += block.text
                  }
                }
                // If this message has substantial content (not just short thinking text)
                if (textContent.length > 200) {
                  responseContent = textContent
                  console.log('[CLAUDE-DEBUG]   -> Using last substantial assistant message:', textContent.length, 'chars')
                  break
                }
              }
            }

            // If we still don't have content, use streamedContent
            if (!responseContent && streamedContent && streamedContent.length > 0) {
              responseContent = streamedContent
              console.log('[CLAUDE-DEBUG]   -> Using streamedContent (accumulated)')
            }

            // Last resort: use result even if short, or fullOutput
            if (!responseContent) {
              responseContent = resultData?.result || fullOutput || ''
              console.log('[CLAUDE-DEBUG]   -> Using fallback:', responseContent.length, 'chars')
            }
          }

          console.log('[CLAUDE-DEBUG]   -> Final content:', responseContent ? `${responseContent.length} chars` : 'EMPTY!')
          console.log('[CLAUDE-DEBUG]   -> Content preview:', responseContent?.substring(0, 200) || '(EMPTY)')

          const response = {
            content: responseContent,
            sessionId: resultData?.session_id,
            cost: resultData?.total_cost_usd,
            turns: resultData?.num_turns,
            duration: resultData?.duration_ms,
            exitCode: code
          }
          console.log('[CLAUDE-DEBUG] Calling onComplete with response.content length:', response.content?.length || 0)
          onComplete(response)
          resolve(response)
        } else {
          const error = new Error(`Claude CLI exited with code ${code}: ${errorOutput}`)
          console.error('[CLAUDE-DEBUG] Process failed:', error.message)
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
              // Show tool emoji only
              onChunk(getToolEmoji(block.name))
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
Consider reliability, scalability, and operational concerns.`,

      tmp: `[TEMPORARY/SCRATCH THREAD]
This is a scratch space for ad-hoc tasks and experiments.
IMPORTANT: Always output your final results as text in your response, not just as file writes.
When asked to create documents, lists, or summaries, include the full content in your response text.`
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

  /**
   * Derive user stories from a prompt
   * @param {string} prompt - The original prompt
   * @param {string} projectPath - Project directory path
   * @param {Object} project - Project context
   * @returns {Promise<{success: boolean, stories?: Array, error?: string}>}
   */
  async deriveStories(prompt, projectPath, project = null) {
    const systemPrompt = `You are a requirements analyst. Your task is to derive user stories from the following request.

Output ONLY a valid JSON array of user stories in this exact format:
[
  {
    "title": "Brief title of the user story",
    "description": "As a [type of user], I want [goal] so that [benefit]",
    "acceptanceCriteria": ["Criterion 1", "Criterion 2", "..."]
  }
]

Guidelines:
- Each story should be focused on a single feature or capability
- Write clear, actionable acceptance criteria
- Keep stories at a granular enough level to be implemented individually
- Output ONLY the JSON array, no other text or markdown`

    const fullPrompt = `${systemPrompt}

${project?.description ? `Project Context: ${project.description}\n` : ''}
Request to analyze:
${prompt}`

    return new Promise((resolve, reject) => {
      const cwd = projectPath || this.projectPath || process.cwd()
      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', '3',
        '--permission-mode', 'acceptEdits',
        '-'
      ]

      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']
      const proc = spawn('claude', args, spawnOptions)

      let buffer = ''
      let resultText = ''
      let allMessages = []

      proc.stdin.write(fullPrompt)
      proc.stdin.end()

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            allMessages.push(json)

            if (json.type === 'assistant' && json.message?.content) {
              for (const block of json.message.content) {
                if (block.type === 'text') {
                  resultText += block.text
                }
              }
            }

            if (json.type === 'result' && json.result) {
              resultText = json.result
            }
          } catch (e) {
            // Not JSON
          }
        }
      })

      proc.on('close', (code) => {
        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer)
            if (json.type === 'result' && json.result) {
              resultText = json.result
            }
          } catch (e) {
            // Not JSON
          }
        }

        try {
          // Extract JSON array from the response
          const jsonMatch = resultText.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const stories = JSON.parse(jsonMatch[0])
            resolve({ success: true, stories })
          } else {
            resolve({ success: false, error: 'Could not parse stories from response' })
          }
        } catch (e) {
          resolve({ success: false, error: `Failed to parse stories: ${e.message}` })
        }
      })

      proc.on('error', (error) => {
        resolve({ success: false, error: error.message })
      })

      // Timeout after 60 seconds
      setTimeout(() => {
        proc.kill()
        resolve({ success: false, error: 'Story derivation timed out' })
      }, 60000)
    })
  }

  /**
   * Modify stories based on user feedback
   * @param {Array} currentStories - Current story list
   * @param {string} feedback - User feedback
   * @param {string} projectPath - Project directory path
   * @param {Object} project - Project context
   * @returns {Promise<{success: boolean, stories?: Array, error?: string}>}
   */
  async modifyStories(currentStories, feedback, projectPath, project = null) {
    const storiesJson = JSON.stringify(currentStories, null, 2)

    const systemPrompt = `You are a requirements analyst. You have previously derived user stories from a request.
Now the user wants to modify these stories based on their feedback.

Current stories:
${storiesJson}

Output ONLY a valid JSON array with the modified user stories in this exact format:
[
  {
    "title": "Brief title of the user story",
    "description": "As a [type of user], I want [goal] so that [benefit]",
    "acceptanceCriteria": ["Criterion 1", "Criterion 2", "..."]
  }
]

Apply the user's feedback to modify, add, remove, or clarify the stories as needed.
Output ONLY the JSON array, no other text or markdown.`

    const fullPrompt = `${systemPrompt}

User's feedback:
${feedback}`

    return this.deriveStories(fullPrompt, projectPath, project)
  }

  /**
   * Implement user stories
   * @param {Array} stories - Stories to implement
   * @param {string} projectPath - Project directory path
   * @param {Object} project - Project context
   * @param {boolean} withPlanning - Whether to plan first
   * @param {Function} onChunk - Streaming callback
   * @param {Function} onComplete - Completion callback
   * @param {Function} onRaw - Raw JSON callback
   */
  async implementStories(stories, projectPath, project, withPlanning, onChunk, onComplete, onRaw) {
    // Build implementation prompt from stories
    let prompt = ''

    if (withPlanning) {
      prompt = `Please analyze and create an implementation plan for the following user stories:

${stories.map((s, i) => `### Story ${i + 1}: ${s.title}
${s.description}

Acceptance Criteria:
${s.acceptanceCriteria.map(c => `- ${c}`).join('\n')}
`).join('\n')}

First, create a detailed implementation plan covering:
1. Technical approach for each story
2. Files to create or modify
3. Key components and their relationships
4. Implementation order and dependencies

Then wait for my approval before implementing.`
    } else {
      prompt = `Please implement the following user stories:

${stories.map((s, i) => `### Story ${i + 1}: ${s.title}
${s.description}

Acceptance Criteria:
${s.acceptanceCriteria.map(c => `- ${c}`).join('\n')}
`).join('\n')}

Implement each story ensuring all acceptance criteria are met.`
    }

    // Use the existing submit method
    return this.submit(
      {
        prompt,
        projectPath,
        project,
        branchId: 'backend', // Default to backend for implementation
        maxTurns: 20
      },
      onChunk,
      onComplete,
      onRaw
    )
  }
}

module.exports = { ClaudeService }
