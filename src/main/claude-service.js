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
          // 2. streamedContent (accumulated text from ALL assistant messages - preferred for multi-turn responses)
          // 3. fullOutput (non-JSON fallback)
          //
          // NOTE: Previously we tried to find the "last substantial assistant message" but this
          // fails when Claude sends multiple text blocks interspersed with tool_use blocks.
          // Using streamedContent ensures we capture ALL text content from the entire conversation.

          if (resultData?.result && resultData.result.length > 100) {
            responseContent = resultData.result
            console.log('[CLAUDE-DEBUG]   -> Using resultData.result (substantial content)')
          } else if (streamedContent && streamedContent.length > 0) {
            // Use accumulated streamed content - this captures ALL text from all assistant messages
            responseContent = streamedContent
            console.log('[CLAUDE-DEBUG]   -> Using streamedContent (accumulated from all assistant messages)')
          } else {
            // Last resort: use result even if short, or fullOutput
            responseContent = resultData?.result || fullOutput || ''
            console.log('[CLAUDE-DEBUG]   -> Using fallback:', responseContent.length, 'chars')
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
   *
   * Context strategy:
   * - When resuming a session: Claude CLI has full history server-side,
   *   so we only add lightweight context (branch tag, updated user stories)
   * - When starting new: Full project context + user stories + branch tag
   *
   * @private
   */
  buildPrompt(data) {
    let prompt = data.prompt
    const isResumingSession = !!data.sessionId

    // Branch tag is always useful - it reminds Claude of the focus area
    if (data.branchId) {
      const branchContext = this.getBranchContext(data.branchId)
      if (branchContext) {
        prompt = branchContext + '\n\n' + prompt
      }
    }

    // GUI description if provided (always include - it's specific to this prompt)
    if (data.guiDescription) {
      prompt += '\n\n## UI Layout Reference\n' + data.guiDescription
    }

    // User stories - only include for new conversations
    // When resuming a session, the stories are already in context and adding them
    // again can cause "Prompt is too long" errors
    if (data.userStories && data.userStories.length > 0 && !isResumingSession) {
      const storiesContext = this.buildUserStoriesContext(data.userStories)
      if (storiesContext) {
        prompt = storiesContext + '\n\n' + prompt
      }
    }

    // Project context - only for new conversations (resumed sessions already have it)
    if (data.project && !isResumingSession) {
      const context = this.buildProjectContext(data.project)
      if (context) {
        prompt = context + '\n\n---\n\n' + prompt
      }
    }

    console.log('[PROMPT-DEBUG] Built prompt:', {
      isResumingSession,
      hasProject: !!data.project && !isResumingSession,
      hasUserStories: !isResumingSession && data.userStories?.length || 0,
      hasGuiDescription: !!data.guiDescription,
      hasBranchContext: !!data.branchId,
      promptLength: prompt.length
    })

    return prompt
  }

  /**
   * Build user stories context string
   * @private
   */
  buildUserStoriesContext(stories) {
    if (!stories || stories.length === 0) return ''

    const lines = ['## Active User Stories']
    lines.push('')
    lines.push('The following user stories are relevant to this conversation:')
    lines.push('')

    stories.forEach((story, i) => {
      lines.push(`### ${i + 1}. ${story.title}`)
      if (story.status) {
        lines.push(`**Status:** ${story.status}`)
      }
      if (story.description) {
        lines.push('')
        lines.push(story.description)
      }
      if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        lines.push('')
        lines.push('**Acceptance Criteria:**')
        story.acceptanceCriteria.forEach(c => lines.push(`- ${c}`))
      }
      lines.push('')
    })

    return lines.join('\n')
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
   * Extract and validate user stories from Claude's response
   * Uses multiple strategies to find valid JSON array
   * @param {string} responseText - Raw response text from Claude
   * @returns {{success: boolean, stories?: Array, error?: string}}
   */
  extractStoriesFromResponse(responseText) {
    if (!responseText || responseText.trim().length === 0) {
      return { success: false, error: 'Empty response from Claude' }
    }

    // Strategy 1: Try to find a JSON array using bracket matching
    // This is more robust than a simple regex for nested structures
    const strategies = [
      // Strategy 1: Look for array starting with [ and properly closed
      () => this.findJsonArray(responseText),
      // Strategy 2: Try parsing the entire response as JSON
      () => {
        const parsed = JSON.parse(responseText.trim())
        return Array.isArray(parsed) ? parsed : null
      },
      // Strategy 3: Look for ```json code blocks
      () => {
        const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeBlockMatch) {
          const parsed = JSON.parse(codeBlockMatch[1].trim())
          return Array.isArray(parsed) ? parsed : null
        }
        return null
      },
      // Strategy 4: Simple regex for array (fallback)
      () => {
        const match = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/)
        if (match) {
          return JSON.parse(match[0])
        }
        return null
      }
    ]

    let stories = null
    let lastError = null

    for (const strategy of strategies) {
      try {
        stories = strategy()
        if (stories && Array.isArray(stories)) {
          break
        }
      } catch (e) {
        lastError = e
        // Try next strategy
      }
    }

    if (!stories || !Array.isArray(stories)) {
      return {
        success: false,
        error: 'Could not find valid JSON array in response. Claude may have returned an unexpected format.'
      }
    }

    // Validate stories array is not empty
    if (stories.length === 0) {
      return {
        success: false,
        error: 'Claude returned an empty stories array. Please try rephrasing your request with more specific requirements.'
      }
    }

    // Validate each story has required fields
    const validatedStories = []
    const validationErrors = []

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i]

      if (!story || typeof story !== 'object') {
        validationErrors.push(`Story ${i + 1}: Invalid format (not an object)`)
        continue
      }

      if (!story.title || typeof story.title !== 'string' || story.title.trim().length === 0) {
        validationErrors.push(`Story ${i + 1}: Missing or empty title`)
        continue
      }

      // Story is valid - normalize it
      validatedStories.push({
        title: story.title.trim(),
        description: (story.description || '').trim(),
        acceptanceCriteria: Array.isArray(story.acceptanceCriteria)
          ? story.acceptanceCriteria.filter(c => typeof c === 'string' && c.trim().length > 0)
          : []
      })
    }

    if (validatedStories.length === 0) {
      return {
        success: false,
        error: `No valid stories found. Issues: ${validationErrors.join('; ')}`
      }
    }

    // Log if some stories were filtered out
    if (validationErrors.length > 0) {
      console.warn('[STORY-DERIVATION] Some stories were invalid:', validationErrors)
    }

    return { success: true, stories: validatedStories }
  }

  /**
   * Find a JSON array in text using bracket matching
   * @param {string} text - Text to search
   * @returns {Array|null} Parsed array or null
   */
  findJsonArray(text) {
    // Find the first '[' character
    const startIdx = text.indexOf('[')
    if (startIdx === -1) return null

    // Track bracket depth to find matching ']'
    let depth = 0
    let inString = false
    let escapeNext = false

    for (let i = startIdx; i < text.length; i++) {
      const char = text[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === '\\' && inString) {
        escapeNext = true
        continue
      }

      if (char === '"' && !escapeNext) {
        inString = !inString
        continue
      }

      if (!inString) {
        if (char === '[') depth++
        if (char === ']') {
          depth--
          if (depth === 0) {
            // Found matching bracket
            const jsonStr = text.substring(startIdx, i + 1)
            return JSON.parse(jsonStr)
          }
        }
      }
    }

    return null
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
   * @returns {Promise<{success: boolean, stories?: Array, error?: string, rawResponse?: string}>}
   */
  async deriveStories(prompt, projectPath, project = null) {
    console.log('[STORY-DERIVATION] Starting story derivation for prompt:', prompt.substring(0, 100) + '...')

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
- Output ONLY the JSON array, no other text or markdown
- You MUST output at least one user story`

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

      console.log('[STORY-DERIVATION] Spawning claude with args:', args.join(' '))
      console.log('[STORY-DERIVATION] Working directory:', cwd)
      console.log('[STORY-DERIVATION] Prompt length being sent:', fullPrompt.length)

      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']

      console.log('[STORY-DERIVATION] Spawn options shell:', spawnOptions.shell)

      const proc = spawn('claude', args, spawnOptions)

      if (!proc.pid) {
        console.error('[STORY-DERIVATION] Failed to spawn process - no PID')
      } else {
        console.log('[STORY-DERIVATION] Process spawned with PID:', proc.pid)
      }

      let buffer = ''
      let resultText = ''
      let allMessages = []

      proc.stdin.write(fullPrompt)
      proc.stdin.end()
      console.log('[STORY-DERIVATION] Prompt written to stdin')

      let stderrBuffer = ''

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            allMessages.push(json)
            console.log('[STORY-DERIVATION] Received JSON type:', json.type)

            if (json.type === 'assistant') {
              // Log the structure to understand what we're getting
              console.log('[STORY-DERIVATION] Assistant message keys:', Object.keys(json).join(', '))
              if (json.message) {
                console.log('[STORY-DERIVATION] message keys:', Object.keys(json.message).join(', '))
                if (json.message.content) {
                  console.log('[STORY-DERIVATION] content length:', json.message.content.length)
                  for (const block of json.message.content) {
                    console.log('[STORY-DERIVATION] block type:', block.type)
                    if (block.type === 'text') {
                      console.log('[STORY-DERIVATION] Found text block, length:', block.text?.length)
                      resultText += block.text
                    }
                  }
                }
              }
              // Check alternate structure: json.content directly
              if (json.content && Array.isArray(json.content)) {
                for (const block of json.content) {
                  if (block.type === 'text') {
                    console.log('[STORY-DERIVATION] Found text in json.content, length:', block.text?.length)
                    resultText += block.text
                  }
                }
              }
            }

            // Also check for content_block_delta (streaming format)
            if (json.type === 'content_block_delta' && json.delta?.text) {
              resultText += json.delta.text
            }

            if (json.type === 'result' && json.result) {
              console.log('[STORY-DERIVATION] Found result, length:', json.result?.length)
              resultText = json.result
            }
          } catch (e) {
            // Non-JSON line - could be plain text output
            console.log('[STORY-DERIVATION] Non-JSON line:', line.substring(0, 100))
            // If we're not getting JSON, maybe it's plain text output
            if (!line.startsWith('{') && !line.startsWith('[')) {
              resultText += line + '\n'
            }
          }
        }
      })

      proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        console.log('[STORY-DERIVATION] stderr:', chunk.toString())
      })

      proc.on('close', (code) => {
        console.log('[STORY-DERIVATION] Process closed with code:', code)
        console.log('[STORY-DERIVATION] Total JSON messages received:', allMessages.length)
        console.log('[STORY-DERIVATION] Message types:', allMessages.map(m => m.type).join(', '))
        if (stderrBuffer) {
          console.log('[STORY-DERIVATION] Full stderr:', stderrBuffer)
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer)
            if (json.type === 'result' && json.result) {
              resultText = json.result
            }
          } catch (e) {
            // Expected: Remaining buffer may not be valid JSON (incomplete line or non-JSON output)
          }
        }

        console.log('[STORY-DERIVATION] Raw response length:', resultText.length)
        console.log('[STORY-DERIVATION] Raw response preview:', resultText.substring(0, 500))

        // Try to extract and parse JSON array from the response
        const parseResult = this.extractStoriesFromResponse(resultText)

        if (parseResult.success) {
          console.log('[STORY-DERIVATION] Successfully parsed', parseResult.stories.length, 'stories')
          resolve(parseResult)
        } else {
          console.error('[STORY-DERIVATION] Parse failed:', parseResult.error)
          resolve({
            success: false,
            error: parseResult.error,
            rawResponse: resultText.substring(0, 1000) // Include raw response for debugging
          })
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
   * Generate a title for a prompt using Claude
   * @param {string} content - The prompt content
   * @returns {Promise<string>} - Generated title
   */
  async generateTitle(content) {
    return new Promise((resolve, reject) => {
      // Create a simple prompt for title generation
      const titlePrompt = `Generate a concise 2-5 word title for this user request. Respond with ONLY the title, no quotes or additional text:

${content}`

      // Use minimal options for title generation
      const args = ['--print', '--max-turns', '1', '--model', 'haiku', '-']

      const cwd = this.projectPath || process.cwd()
      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']

      console.log('Generating title for prompt...')

      const titleProcess = spawn('claude', args, spawnOptions)

      let output = ''
      let errorOutput = ''

      // Write the title prompt
      titleProcess.stdin.write(titlePrompt)
      titleProcess.stdin.end()

      titleProcess.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })

      titleProcess.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString()
      })

      titleProcess.on('close', (code) => {
        if (code === 0) {
          // Extract just the text content from Claude's response
          const lines = output.trim().split('\n')
          const title = lines[lines.length - 1]?.trim() || 'New Request'

          // Clean up the title (remove quotes, limit length)
          const cleanTitle = title
            .replace(/^["']|["']$/g, '')
            .replace(/[^\w\s-]/g, '')
            .trim()
            .substring(0, 50)

          resolve(cleanTitle || 'New Request')
        } else {
          console.warn('Title generation failed, using fallback')
          resolve(this.generateFallbackTitle(content))
        }
      })

      titleProcess.on('error', (error) => {
        console.warn('Title generation process error:', error)
        resolve(this.generateFallbackTitle(content))
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        if (titleProcess) {
          titleProcess.kill()
          resolve(this.generateFallbackTitle(content))
        }
      }, 10000)
    })
  }

  /**
   * Generate a fallback title from content
   * @param {string} content - The prompt content
   * @returns {string} - Fallback title
   */
  generateFallbackTitle(content) {
    // Clean the content
    const cleaned = content.trim()
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 100)

    // Try to extract a meaningful title from the first sentence
    const firstSentence = cleaned.split(/[.!?]/)[0]

    // Look for action words and extract intent
    const actionWords = [
      'implement', 'create', 'build', 'add', 'fix', 'update', 'refactor',
      'design', 'optimize', 'test', 'deploy', 'configure', 'setup',
      'develop', 'write', 'generate', 'analyze', 'review', 'debug'
    ]

    for (const action of actionWords) {
      const regex = new RegExp(`\\b${action}\\b`, 'i')
      if (regex.test(firstSentence)) {
        // Extract the object of the action
        const words = firstSentence.toLowerCase().split(' ')
        const actionIndex = words.findIndex(word => word.includes(action.toLowerCase()))

        if (actionIndex !== -1 && actionIndex < words.length - 1) {
          const titleWords = words.slice(actionIndex, Math.min(actionIndex + 4, words.length))
          const title = titleWords.join(' ').replace(/[^\w\s]/g, '').trim()
          return title || 'New Request'
        }
      }
    }

    // If no action word found, take first few meaningful words
    const words = firstSentence.split(' ').filter(word =>
      word.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(word.toLowerCase())
    )

    return words.slice(0, 4).join(' ').substring(0, 30) || 'New Request'
  }
}

module.exports = { ClaudeService }
