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
const fs = require('fs')
const os = require('os')

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

// Import branch defaults as fallback when plugin is unavailable
const { getDefaultBranchFocus, getCustomBranchFallback } = require('../../plugins/claude-config-plugin/branch-defaults')

class ClaudeService {
  constructor() {
    this.currentProcess = null
    this.projectPath = null
    this._processLock = false // Prevents multiple CLI spawns
    this._cancelRequested = false // Track explicit cancel to distinguish from errors
    this._pluginManager = null // Reference to plugin manager for branch focus retrieval
    this._pendingContextUpdate = null // Queued branch focus update to include in next prompt
    this._currentBranchId = null // Track current branch for context updates
  }

  /**
   * Check if a CLI process is currently running
   * @returns {boolean}
   */
  isProcessRunning() {
    return this._processLock || this.currentProcess !== null
  }

  /**
   * Kill a spawned process, handling Windows process tree correctly.
   * On Windows with shell: true, process.kill() only kills the shell (cmd.exe),
   * leaving child processes orphaned. This method uses taskkill /T /F to kill
   * the entire process tree.
   * @param {ChildProcess} proc - The process to kill
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

  /**
   * Get path to an empty MCP config file. Used by sendPrompt with
   * --strict-mcp-config to prevent the model from accessing MCP tools
   * (e.g. hdsl_*) which cause it to explore the codebase instead of
   * producing structured output.
   * @returns {string} Absolute path to empty MCP config JSON file
   * @private
   */
  _getEmptyMcpConfigPath() {
    if (!this._emptyMcpConfigPath) {
      this._emptyMcpConfigPath = path.join(os.tmpdir(), 'puffin-empty-mcp.json')
      if (!fs.existsSync(this._emptyMcpConfigPath)) {
        fs.writeFileSync(this._emptyMcpConfigPath, '{"mcpServers": {}}', 'utf8')
      }
    }
    return this._emptyMcpConfigPath
  }

  /**
   * Acquire the process lock for an external caller (e.g. CRE).
   * Retries briefly to handle transient lock states, then throws if still held.
   * @param {number} [retries=3] - Number of retry attempts
   * @param {number} [delayMs=500] - Delay between retries in ms
   * @returns {Promise<boolean>} true if lock was acquired
   */
  async acquireLock(retries = 3, delayMs = 500) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (!this.isProcessRunning()) {
        this._processLock = true
        console.log(`[acquireLock] Lock acquired on attempt ${attempt + 1}`)
        return true
      }
      if (attempt < retries) {
        console.log(`[acquireLock] Lock busy (attempt ${attempt + 1}/${retries + 1}), retrying in ${delayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    throw new Error('Claude CLI process is busy. Wait for the current operation to complete.')
  }

  /**
   * Release the process lock held by an external caller.
   */
  releaseLock() {
    this._processLock = false
  }

  /**
   * Set the working directory for Claude CLI
   * @param {string} projectPath - Path to the project directory
   */
  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  /**
   * Set the plugin manager reference for accessing plugin actions
   * @param {PluginManager} pluginManager - The plugin manager instance
   */
  setPluginManager(pluginManager) {
    this._pluginManager = pluginManager

    // Subscribe to branch focus updates from the plugin
    if (pluginManager) {
      const registry = pluginManager.getRegistry()
      if (registry) {
        registry.on('plugin-event', (eventName, pluginName, data) => {
          if (eventName === 'branch-focus-updated') {
            this.handleBranchFocusUpdate(data)
          }
        })
      }
    }
  }

  /**
   * Handle branch focus update from plugin
   * Queues the update to be included in the next prompt
   * @param {Object} data - Update data from plugin event
   * @private
   */
  handleBranchFocusUpdate(data) {
    // Only queue if the update is for the current branch
    if (data.branchId && data.branchId === this._currentBranchId) {
      console.log(`[ClaudeService] Branch focus updated for ${data.branchId}, queuing for next prompt`)
      this._pendingContextUpdate = {
        branchId: data.branchId,
        timestamp: Date.now(),
        source: data.source || 'unknown'
      }
    }
  }

  /**
   * Submit a prompt to Claude Code CLI
   * @param {Object} data - Request data
   * @param {Function} onChunk - Callback for streaming output
   * @param {Function} onComplete - Callback when complete
   * @param {Function} onRaw - Callback for raw JSON lines (optional)
   * @param {Function} onFullPrompt - Callback with the full built prompt (optional)
   */
  async submit(data, onChunk, onComplete, onRaw = null, onFullPrompt = null, onQuestion = null) {
    // CRITICAL: Prevent multiple CLI instances from being spawned
    if (this.isProcessRunning()) {
      console.error('[CLAUDE-GUARD] Attempted to spawn CLI while another process is running! Rejecting.')
      throw new Error('A Claude CLI process is already running. Please wait for it to complete or cancel it first.')
    }

    // Acquire the process lock immediately
    this._processLock = true
    this._cancelRequested = false
    console.log('[CLAUDE-GUARD] Process lock acquired')

    // Build the prompt with project context (async for plugin-based branch context)
    const prompt = await this.buildPrompt(data)

    // Emit the full built prompt for debugging
    if (onFullPrompt) {
      onFullPrompt(prompt)
    }

    return new Promise((resolve, reject) => {

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
      let completionCalled = false // Track if we've already called onComplete

      console.log('Claude CLI process started, PID:', this.currentProcess.pid)

      // Write prompt as stream-json message to stdin (keep stdin open for answers)
      const promptMessage = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] }
      })
      this.currentProcess.stdin.write(promptMessage + '\n')

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

            // Accumulate assistant text content with tool indicators
            if (json.type === 'assistant' && json.message?.content) {
              let messageText = ''
              for (const block of json.message.content) {
                if (block.type === 'text') {
                  // Add line break before text if content doesn't end with newline
                  // This ensures text starts on a new line after tool emojis
                  if (streamedContent.length > 0 && !streamedContent.endsWith('\n')) {
                    streamedContent += '\n'
                  }
                  messageText += block.text
                  streamedContent += block.text
                } else if (block.type === 'tool_use' && block.name === 'AskUserQuestion') {
                  // Claude is asking the user a question — emit for UI handling
                  console.log('[CLAUDE-QUESTION] AskUserQuestion detected, tool_use_id:', block.id)
                  if (onQuestion) {
                    onQuestion({
                      toolUseId: block.id,
                      questions: block.input?.questions || [],
                      // Store process reference for answer delivery
                      _processRef: this.currentProcess
                    })
                  }
                  streamedContent += '\n❓'
                } else if (block.type === 'tool_use') {
                  // Add tool emoji indicator to content with line break
                  const toolEmoji = getToolEmoji(block.name)
                  if (streamedContent.length > 0 && !streamedContent.endsWith('\n')) {
                    streamedContent += '\n'
                  }
                  streamedContent += toolEmoji
                }
              }
              // Keep track of the last assistant message with substantial text
              if (messageText.length > 50) {
                lastAssistantMessage = messageText
              }
            }

            this.handleStreamMessage(json, onChunk)

            // Capture final result and trigger completion immediately
            if (json.type === 'result') {
              resultData = json
              console.log('[CLAUDE-DEBUG] Captured result, result field length:', json.result?.length || 0)

              // Close stdin now that the session is complete
              if (this.currentProcess?.stdin && !this.currentProcess.stdin.destroyed) {
                this.currentProcess.stdin.end()
              }

              // Call onComplete immediately when we get the result message
              // Don't wait for process close - the CLI may hang
              if (!completionCalled) {
                completionCalled = true
                console.log('[CLAUDE-DEBUG] Calling onComplete from result message handler')

                // Build response - prefer result field, then format it
                let responseContent = ''
                if (json.result && json.result.length > 0) {
                  responseContent = json.result
                } else if (streamedContent && streamedContent.length > 0) {
                  responseContent = streamedContent
                }

                // Format content: add line breaks between emoji sequences and text
                responseContent = this.formatResponseContent(responseContent)

                const response = {
                  content: responseContent,
                  sessionId: json.session_id,
                  cost: json.total_cost_usd,
                  turns: json.num_turns,
                  duration: json.duration_ms,
                  exitCode: 0
                }
                console.log('[CLAUDE-DEBUG] onComplete response:', {
                  contentLength: response.content?.length || 0,
                  turns: response.turns,
                  exitCode: response.exitCode
                })
                onComplete(response)
              }
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
        const wasCancelled = this._cancelRequested
        this.currentProcess = null
        this._processLock = false
        this._cancelRequested = false
        console.log('[CLAUDE-GUARD] Process lock released (close)', wasCancelled ? '(cancelled)' : '')

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
          // If completion was already called when we received the result message, just resolve
          if (completionCalled) {
            console.log('[CLAUDE-DEBUG] onComplete already called from result handler, skipping')
            resolve({ content: streamedContent || resultData?.result || '', exitCode: code })
            return
          }

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
          completionCalled = true
          console.log('[CLAUDE-DEBUG] onComplete (close handler) response:', {
            contentLength: response.content?.length || 0,
            turns: response.turns,
            exitCode: response.exitCode
          })
          onComplete(response)
          resolve(response)
        } else if (wasCancelled) {
          // User cancelled — treat as normal completion with partial content
          console.log('[CLAUDE-DEBUG] Process was cancelled by user')
          if (!completionCalled) {
            completionCalled = true
            const response = {
              content: streamedContent || fullOutput || '',
              cancelled: true,
              exitCode: code
            }
            onComplete(response)
          }
          resolve({ content: '', cancelled: true, exitCode: code })
        } else {
          const error = new Error(`Claude CLI exited with code ${code}: ${errorOutput}`)
          console.error('[CLAUDE-DEBUG] Process failed:', error.message)
          reject(error)
        }
      })

      // Handle process errors
      this.currentProcess.on('error', (error) => {
        this.currentProcess = null
        this._processLock = false
        console.log('[CLAUDE-GUARD] Process lock released (error)')
        console.error('Claude CLI spawn error:', error)
        reject(error)
      })
    })
  }

  /**
   * Send an answer to a pending AskUserQuestion from the CLI process.
   * Writes a tool_result message to the process stdin.
   * @param {string} toolUseId - The tool_use_id from the AskUserQuestion block
   * @param {object} answers - Answer data keyed by question index
   */
  sendAnswer(toolUseId, answers) {
    if (!this.currentProcess || !this.currentProcess.stdin || this.currentProcess.stdin.destroyed) {
      console.error('[CLAUDE-ANSWER] No active process or stdin closed')
      return false
    }

    // Format answers as the tool result content string
    const answerText = Object.entries(answers)
      .map(([, value]) => value)
      .join('\n')

    const resultMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: answerText
        }]
      }
    })

    console.log('[CLAUDE-ANSWER] Sending answer for tool_use_id:', toolUseId)
    this.currentProcess.stdin.write(resultMessage + '\n')
    return true
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

    // Enable bidirectional streaming for interactive question support
    args.push('--input-format', 'stream-json')

    // Limit turns to prevent runaway processes
    args.push('--max-turns', String(data.maxTurns || '40'))

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

    // Disallow specific tools (e.g., suppress AskUserQuestion in automated flows)
    if (data.disallowedTools?.length > 0) {
      args.push('--disallowedTools', ...data.disallowedTools)
    }

    // Prompt will be passed via stdin as stream-json
    args.push('-')

    return args
  }

  /**
   * Format response content to add line breaks between emoji sequences and text
   * @param {string} content - Raw response content
   * @returns {string} Formatted content with line breaks
   */
  formatResponseContent(content) {
    if (!content) return ''

    // Pattern to match tool emojis (including variants with skin tones, etc.)
    // This matches common tool emojis and emoji sequences
    const emojiPattern = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu

    // Add line break after emoji sequence before text starts
    // Match: one or more emojis (possibly with spaces between them) followed by a letter/word
    let formatted = content.replace(
      /((?:[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][\u{FE00}-\u{FE0F}]?\s*)+)([A-Za-z])/gu,
      '$1\n$2'
    )

    // Add line break before emoji sequence if preceded by text (letter/punctuation)
    formatted = formatted.replace(
      /([A-Za-z.!?:])(\s*)((?:[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][\u{FE00}-\u{FE0F}]?\s*)+)/gu,
      '$1\n$3'
    )

    return formatted
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
              // Show tool emoji with line break for readability
              onChunk('\n' + getToolEmoji(block.name))
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
  async buildPrompt(data) {
    let prompt = data.prompt
    const isResumingSession = !!data.sessionId

    // Track current branch for context update notifications
    if (data.branchId) {
      this._currentBranchId = data.branchId
    }

    // Check for pending context update (from plugin edits during conversation)
    const hasPendingUpdate = this._pendingContextUpdate &&
      this._pendingContextUpdate.branchId === data.branchId

    if (hasPendingUpdate) {
      // Fetch the updated branch context and notify Claude of the change
      const updatedContext = await this.getBranchContext(data.branchId, data.codeModificationAllowed)
      if (updatedContext) {
        const updateNotice = `<context-update>
The branch focus instructions have been updated. Please acknowledge and apply these updated instructions:

${updatedContext}
</context-update>

`
        prompt = updateNotice + prompt
        console.log(`[ClaudeService] Included pending context update for ${data.branchId}`)
      }

      // Clear the pending update
      this._pendingContextUpdate = null
    } else if (data.branchId) {
      // Normal branch context - include on first message or as reminder
      const branchContext = await this.getBranchContext(data.branchId, data.codeModificationAllowed)
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

    // Handoff context from another thread - include for new conversations
    if (data.handoffContext && !isResumingSession) {
      const handoffSection = this.buildHandoffContext(data.handoffContext)
      if (handoffSection) {
        prompt = handoffSection + '\n\n---\n\n' + prompt
      }
    }

    console.log('[PROMPT-DEBUG] Built prompt:', {
      isResumingSession,
      hasProject: !!data.project && !isResumingSession,
      hasUserStories: !isResumingSession && data.userStories?.length || 0,
      hasGuiDescription: !!data.guiDescription,
      hasBranchContext: !!data.branchId,
      hasHandoffContext: !!data.handoffContext && !isResumingSession,
      hasPendingContextUpdate: hasPendingUpdate,
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
   * Build handoff context string from another thread
   * @private
   */
  buildHandoffContext(handoffContext) {
    if (!handoffContext || !handoffContext.summary) return ''

    const lines = ['## Handoff Context']
    lines.push('')
    lines.push('This thread is receiving context from a previous development thread. Please review this summary to understand what was accomplished and continue the work appropriately.')
    lines.push('')
    lines.push(`**Source Thread:** ${handoffContext.sourceThreadName || 'Unknown'}`)
    lines.push(`**Source Branch:** ${handoffContext.sourceBranch || 'Unknown'}`)
    lines.push('')
    lines.push('### Handoff Summary')
    lines.push('')
    lines.push(handoffContext.summary)
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Get context/guidance based on the branch type
   * Retrieves from Claude Config plugin if available, falls back to defaults
   * @param {string} branchId - The branch identifier
   * @param {boolean} codeModificationAllowed - Whether code modifications are allowed
   * @returns {Promise<string|null>} Branch focus content
   * @private
   */
  async getBranchContext(branchId, codeModificationAllowed = true) {
    if (!branchId) return null

    // Try to get branch focus from plugin
    if (this._pluginManager) {
      try {
        const registry = this._pluginManager.getRegistry()
        const getBranchFocusAction = registry.getAction('claude-config:getBranchFocus')

        if (getBranchFocusAction) {
          const result = await getBranchFocusAction(branchId, { codeModificationAllowed })
          if (result && result.focus) {
            return result.focus
          }
        }
      } catch (err) {
        // Plugin unavailable or error - fall back to defaults
        console.warn(`Failed to get branch focus from plugin: ${err.message}`)
      }
    }

    // Fallback to defaults when plugin is unavailable
    const defaultFocus = getDefaultBranchFocus(branchId)
    if (defaultFocus) {
      return defaultFocus
    }

    // Custom branch fallback
    return getCustomBranchFallback(branchId, codeModificationAllowed)
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
    this._cancelRequested = true

    if (this.currentProcess) {
      console.log('[CLAUDE-GUARD] Cancelling CLI process, PID:', this.currentProcess.pid)
      this._killProcess(this.currentProcess)

      // Force kill after 3 seconds if still running
      setTimeout(() => {
        if (this.currentProcess) {
          console.log('[CLAUDE-GUARD] Force killing CLI process')
          try { this.currentProcess.kill('SIGKILL') } catch { /* already dead */ }
          this.currentProcess = null
          this._processLock = false
          this._cancelRequested = false
          console.log('[CLAUDE-GUARD] Process lock released (force kill)')
        }
      }, 3000)
    } else {
      // Ensure lock is released even if no process
      this._processLock = false
      this._cancelRequested = false
    }
  }

  /**
   * Get spawn options based on platform.
   * On Windows, shell: true is needed for .cmd files but breaks arguments
   * containing JSON (double quotes get mangled by cmd.exe). We detect at
   * first call whether `claude` is a native .exe and skip the shell if so.
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

    // On Windows, detect whether `claude` is a native .exe (no shell needed)
    // or a .cmd wrapper (shell required). Cache the result.
    let useShell = false
    if (process.platform === 'win32') {
      if (this._claudeIsExe === undefined) {
        try {
          const { execSync } = require('child_process')
          const claudePath = execSync('where claude', { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0].trim()
          this._claudeIsExe = claudePath.endsWith('.exe')
          console.log('[CLAUDE-SPAWN] claude resolved to:', claudePath, '(isExe:', this._claudeIsExe, ')')
        } catch {
          this._claudeIsExe = false
          console.log('[CLAUDE-SPAWN] Could not resolve claude path, using shell: true')
        }
      }
      useShell = !this._claudeIsExe
    }

    const options = {
      env,
      shell: useShell
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

    // Check if Claude asked for clarification instead of generating stories
    const clarificationPatterns = [
      /need more information/i,
      /could you (please )?(describe|specify|provide|clarify)/i,
      /what (feature|functionality|capability) (do you|would you)/i,
      /please (describe|specify|provide|clarify)/i,
      /what would you like/i,
      /can you (please )?(describe|specify|provide|tell me)/i
    ]

    for (const pattern of clarificationPatterns) {
      if (pattern.test(responseText)) {
        return {
          success: false,
          error: 'Claude asked for clarification instead of generating stories. Please provide a more specific description of the feature you want to implement.',
          clarificationRequest: true
        }
      }
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
  async deriveStories(prompt, projectPath, project = null, progressCallback = null, conversationContext = null, model = null) {
    console.log('[STORY-DERIVATION] Starting story derivation for prompt:', prompt.substring(0, 100) + '...')
    console.log('[STORY-DERIVATION] Conversation context length:', conversationContext?.length || 0)

    const progress = (msg) => {
      console.log('[STORY-DERIVATION]', msg)
      if (progressCallback) progressCallback(msg)
    }

    // CRITICAL: Prevent multiple CLI instances from being spawned
    if (this.isProcessRunning()) {
      console.error('[STORY-DERIVATION-GUARD] Attempted to spawn CLI while another process is running! Rejecting.')
      return {
        success: false,
        error: 'A Claude CLI process is already running. Please wait for it to complete or cancel it first.'
      }
    }

    // Acquire the process lock immediately
    this._processLock = true
    console.log('[STORY-DERIVATION-GUARD] Process lock acquired')

    progress('Initializing...')

    const systemPrompt = `You are a requirements analyst. Your ONLY task is to derive user stories from the request below.

CRITICAL INSTRUCTIONS:
1. You MUST output a valid JSON array - nothing else
2. Do NOT ask for clarification - use your best judgment to interpret the request
3. Do NOT include any text before or after the JSON array
4. Do NOT use markdown code blocks - output raw JSON only
5. If the request is vague, USE THE CONVERSATION CONTEXT to understand what the user is referring to
6. Make reasonable assumptions and create user stories based on the conversation
7. Do NOT use any tools - do NOT read files, do NOT analyze code, do NOT call any functions
8. Generate stories IMMEDIATELY based on the information provided in the prompt and context

Output format (ONLY this, no other text):
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
- You MUST output at least one user story, even if the request is unclear
- Use the conversation context to understand references like "Phase 1", "that feature", etc.
- Make your best interpretation of what the user wants
- RESPOND IMMEDIATELY with JSON - do not research or analyze first`

    // Build the full prompt with conversation context if available
    let fullPrompt = systemPrompt + '\n\n'

    if (project?.description) {
      fullPrompt += `Project Context: ${project.description}\n\n`
    }

    if (conversationContext) {
      fullPrompt += `Recent Conversation Context (use this to understand what the user is referring to):\n${conversationContext}\n\n`
    }

    fullPrompt += `Current Request to derive user stories from:\n${prompt}`

    return new Promise((resolve, reject) => {
      const cwd = projectPath || this.projectPath || process.cwd()
      const selectedModel = model || 'sonnet'
      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', '1',  // Single turn - no tool use, just output JSON
        '--model', selectedModel,
        '--tools', '',
        '--mcp-config', this._getEmptyMcpConfigPath(), '--strict-mcp-config',
        '-'
      ]

      progress(`Spawning claude with args: ${args.join(' ')}`)
      progress(`Working directory: ${cwd}`)
      progress(`Prompt length: ${fullPrompt.length} chars`)

      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']

      progress(`Spawn options - shell: ${spawnOptions.shell}, platform: ${process.platform}`)

      const proc = spawn('claude', args, spawnOptions)

      if (!proc.pid) {
        progress('ERROR: Failed to spawn process - no PID')
        resolve({ success: false, error: 'Failed to spawn Claude CLI process' })
        return
      } else {
        progress(`Process spawned with PID: ${proc.pid}`)
      }

      let buffer = ''
      let resultText = ''
      let allMessages = []
      let dataReceived = false
      let resolved = false  // Prevent double resolution

      proc.stdin.write(fullPrompt)
      proc.stdin.end()
      progress('Prompt written to stdin, waiting for response...')

      let stderrBuffer = ''

      proc.stdout.on('data', (chunk) => {
        if (!dataReceived) {
          dataReceived = true
          progress('First data chunk received from Claude')
        }
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            allMessages.push(json)
            progress(`Received JSON type: ${json.type}`)

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
        progress(`stderr: ${chunk.toString().trim()}`)
      })

      proc.on('close', (code) => {
        // Release the process lock
        this._processLock = false
        console.log('[STORY-DERIVATION-GUARD] Process lock released (close)')

        progress(`Process closed with exit code: ${code}`)
        progress(`Total JSON messages received: ${allMessages.length}`)
        progress(`Message types: ${allMessages.map(m => m.type).join(', ') || '(none)'}`)
        if (stderrBuffer) {
          progress(`Full stderr: ${stderrBuffer}`)
        }
        if (!dataReceived) {
          progress('WARNING: No data was received from Claude before process closed')
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

        if (resolved) {
          progress('WARNING: Already resolved, skipping close handler')
          return
        }
        resolved = true

        if (parseResult.success) {
          progress(`Successfully parsed ${parseResult.stories.length} stories, resolving promise...`)
          resolve(parseResult)
          progress('Promise resolved with success')
        } else {
          progress(`Parse failed: ${parseResult.error}`)
          resolve({
            success: false,
            error: parseResult.error,
            rawResponse: resultText.substring(0, 1000) // Include raw response for debugging
          })
          progress('Promise resolved with failure')
        }
      })

      proc.on('error', (error) => {
        // Release the process lock
        this._processLock = false
        console.log('[STORY-DERIVATION-GUARD] Process lock released (error)')

        if (resolved) return
        resolved = true
        progress(`Process error: ${error.message}`)
        resolve({ success: false, error: error.message })
      })

      // Timeout after 180 seconds (increased to handle slow responses)
      const timeoutId = setTimeout(() => {
        if (resolved) {
          progress('Timeout fired but already resolved, ignoring')
          return
        }
        resolved = true
        progress('TIMEOUT: 180 seconds elapsed, killing process')
        progress(`Data received before timeout: ${dataReceived}`)
        progress(`Messages received before timeout: ${allMessages.length}`)
        progress(`Result text length before timeout: ${resultText.length}`)
        this._killProcess(proc)
        // Release the process lock
        this._processLock = false
        console.log('[STORY-DERIVATION-GUARD] Process lock released (timeout)')
        resolve({
          success: false,
          error: 'Story derivation timed out',
          rawResponse: resultText.length > 0 ? resultText.substring(0, 500) : 'No response received'
        })
      }, 180000)
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
  async modifyStories(currentStories, feedback, projectPath, project = null, model = null) {
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

    return this.deriveStories(fullPrompt, projectPath, project, null, null, model)
  }

  /**
   * Generate a title for a prompt using Claude
   * @param {string} content - The prompt content
   * @returns {Promise<string>} - Generated title
   */
  async generateTitle(content) {
    // CRITICAL: Prevent multiple CLI instances from being spawned
    if (this.isProcessRunning()) {
      console.warn('[TITLE-GEN-GUARD] CLI process already running, using fallback title')
      return this.generateFallbackTitle(content)
    }

    // Acquire the process lock immediately
    this._processLock = true
    console.log('[TITLE-GEN-GUARD] Process lock acquired')

    return new Promise((resolve, reject) => {
      let resolved = false

      const releaseAndResolve = (value) => {
        if (resolved) return
        resolved = true
        this._processLock = false
        console.log('[TITLE-GEN-GUARD] Process lock released')
        resolve(value)
      }

      // Create a simple prompt for title generation
      const titlePrompt = `Generate a concise 2-5 word title for this user request. Respond with ONLY the title, no quotes or additional text:

${content}`

      // Use minimal options for title generation — disable all tools since we just need text output
      const args = [
        '--print', '--output-format', 'text', '--max-turns', '1', '--model', 'haiku',
        '--tools', '',
        '--mcp-config', this._getEmptyMcpConfigPath(), '--strict-mcp-config',
        '-'
      ]

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

          releaseAndResolve(cleanTitle || 'New Request')
        } else {
          console.warn('Title generation failed, using fallback')
          releaseAndResolve(this.generateFallbackTitle(content))
        }
      })

      titleProcess.on('error', (error) => {
        console.warn('Title generation process error:', error)
        releaseAndResolve(this.generateFallbackTitle(content))
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved && titleProcess) {
          this._killProcess(titleProcess)
          releaseAndResolve(this.generateFallbackTitle(content))
        }
      }, 10000)
    })
  }

  /**
   * Send a simple prompt and get a response (non-streaming)
   * Useful for simple tasks like generating commit messages
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Options for the request
   * @param {string} options.model - Model to use (default: 'haiku')
   * @param {number} options.maxTokens - Max tokens in response (informational only)
   * @param {number} options.maxTurns - Max turns (default: 1)
   * @param {number} options.timeout - Timeout in ms (default: 60000)
   * @returns {Promise<{success: boolean, response?: string, error?: string}>}
   */
  async sendPrompt(prompt, options = {}) {
    // CRITICAL: Prevent multiple CLI instances from being spawned
    // Check currentProcess (actual running process), not _processLock alone.
    // _processLock may be held by an external caller (e.g. CRE) that is
    // invoking sendPrompt as part of its locked session — that is allowed.
    if (this.currentProcess !== null) {
      console.error('[sendPrompt-GUARD] Attempted to spawn CLI while another process is running! Rejecting.')
      return { success: false, error: 'A Claude CLI process is already running. Please wait for it to complete.' }
    }

    // Track whether we own the lock or an external caller (CRE) already holds it.
    // If the lock is already held, we must NOT release it when the process finishes —
    // the external caller's withProcessLock.finally will handle that.
    const lockAlreadyHeld = this._processLock
    this._processLock = true
    if (!lockAlreadyHeld) {
      console.log('[sendPrompt-GUARD] Process lock acquired')
    } else {
      console.log('[sendPrompt-GUARD] Lock already held by external caller, proceeding')
    }

    return new Promise((resolve) => {
      const model = options.model || 'haiku'
      const jsonSchema = options.jsonSchema || null
      // When using --json-schema, the StructuredOutput tool-use cycle needs
      // multiple turns: text + tool_use call, tool_result, final text.
      // Use caller's maxTurns when provided, otherwise default to 4 minimum for jsonSchema.
      const maxTurns = options.maxTurns || (jsonSchema ? 4 : 1)
      const timeout = options.timeout || 60000 // Default 60 seconds

      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', String(maxTurns),
        '--model', model
      ]

      // Optional: disable tools for methods that should answer from prompt context
      // only (e.g., assertion generation). Plan generation, RIS, and refinement
      // NEED tools to explore the codebase. Caller can pass { disableTools: true }.
      // CRITICAL: If jsonSchema is provided, we MUST allow StructuredOutput tool,
      // so don't use --tools '' which disables ALL tools. Instead, just disable MCP.
      if (options.disableTools && !jsonSchema) {
        args.push('--tools', '')
        // --strict-mcp-config with an empty config disables MCP tools (e.g. hdsl_*)
        args.push('--mcp-config', this._getEmptyMcpConfigPath(), '--strict-mcp-config')
      } else if (options.disableTools && jsonSchema) {
        // When jsonSchema is used, we need StructuredOutput tool enabled,
        // but we can still disable MCP tools (Read, Grep, hdsl_*, etc.)
        args.push('--mcp-config', this._getEmptyMcpConfigPath(), '--strict-mcp-config')
        console.log('[sendPrompt] jsonSchema requires StructuredOutput tool, only disabling MCP tools')
        console.log('[sendPrompt] Claude args:', args.join(' '))
      }

      // Append --json-schema when a schema is provided
      if (jsonSchema) {
        const schemaStr = typeof jsonSchema === 'string'
          ? jsonSchema
          : JSON.stringify(jsonSchema)
        args.push('--json-schema', schemaStr)
        console.log('[sendPrompt] Using --json-schema, maxTurns bumped to:', maxTurns)
      }

      args.push('-') // stdin prompt (must be last)

      const cwd = this.projectPath || process.cwd()
      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']

      console.log('[sendPrompt] Sending prompt with model:', model, 'timeout:', timeout)
      console.log('[sendPrompt] Prompt length:', prompt.length, 'chars')

      const proc = spawn('claude', args, spawnOptions)

      if (!proc.pid) {
        console.error('[sendPrompt] Failed to spawn process - no PID')
        if (!lockAlreadyHeld) { this._processLock = false }
        console.log('[sendPrompt-GUARD] Process lock released (no PID)')
        resolve({ success: false, error: 'Failed to spawn Claude CLI process' })
        return
      }

      console.log('[sendPrompt] Process spawned with PID:', proc.pid)

      let buffer = ''
      let resultText = ''
      let structuredData = null // Extracted from StructuredOutput tool_use block
      let errorOutput = ''
      let resolved = false
      let dataReceived = false

      // Write prompt to stdin and close
      proc.stdin.write(prompt)
      proc.stdin.end()
      console.log('[sendPrompt] Prompt written to stdin')

      proc.stdout.on('data', (chunk) => {
        if (!dataReceived) {
          dataReceived = true
          console.log('[sendPrompt] First stdout data received')
        }
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            console.log('[sendPrompt] Received JSON type:', json.type)

            // Extract content from assistant messages
            if (json.type === 'assistant' && json.message?.content) {
              for (const block of json.message.content) {
                // Detect StructuredOutput tool_use blocks (from --json-schema)
                if (block.type === 'tool_use' && block.name === 'StructuredOutput') {
                  structuredData = block.input
                  console.log('[sendPrompt] StructuredOutput tool_use detected, keys:', Object.keys(block.input || {}).join(', '))
                } else if (block.type === 'text') {
                  resultText += block.text
                  console.log('[sendPrompt] Accumulated text, total length:', resultText.length)
                }
              }
            }

            // Also check for result type
            if (json.type === 'result') {
              console.log('[sendPrompt] Received result message, result length:', json.result?.length || 0)
              if (json.result) {
                resultText = json.result
              }
            }
          } catch (e) {
            // Non-JSON line, accumulate as plain text
            console.log('[sendPrompt] Non-JSON line:', line.substring(0, 100))
            resultText += line + '\n'
          }
        }
      })

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        errorOutput += text
        console.log('[sendPrompt] stderr:', text.substring(0, 200))
      })

      proc.on('close', (code) => {
        // Release the process lock only if we own it (not held by external caller)
        if (!lockAlreadyHeld) { this._processLock = false }
        console.log('[sendPrompt-GUARD] Process lock released (close), external:', lockAlreadyHeld)

        console.log('[sendPrompt] Process closed with code:', code)
        console.log('[sendPrompt] Data received:', dataReceived)
        console.log('[sendPrompt] Result text length:', resultText.length)
        console.log('[sendPrompt] StructuredOutput found:', structuredData !== null)

        if (resolved) {
          console.log('[sendPrompt] Already resolved, skipping close handler')
          return
        }
        resolved = true

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

        // When --json-schema was used, prefer the StructuredOutput tool_use data.
        // Serialize back to JSON string for backward compatibility with callers
        // that call JSON.parse() on the response.
        if (jsonSchema && structuredData !== null) {
          const responseStr = JSON.stringify(structuredData)
          console.log('[sendPrompt] Using StructuredOutput data, length:', responseStr.length)
          resolve({ success: true, response: responseStr })
        } else if (jsonSchema && structuredData === null && resultText.length > 0) {
          // Schema was provided but no StructuredOutput block found — fall back
          // to raw text so parseJsonResponse() heuristics can attempt extraction
          console.warn('[sendPrompt] --json-schema was used but no StructuredOutput tool_use found, falling back to text')
          resolve({ success: true, response: resultText.trim() })
        } else if (code === 0 || resultText.length > 0) {
          console.log('[sendPrompt] Success, response length:', resultText.trim().length)
          resolve({ success: true, response: resultText.trim() })
        } else {
          console.log('[sendPrompt] Failed, error:', errorOutput || `exit code ${code}`)
          resolve({
            success: false,
            error: errorOutput || `Process exited with code ${code}`
          })
        }
      })

      proc.on('error', (error) => {
        // Release the process lock only if we own it
        if (!lockAlreadyHeld) { this._processLock = false }
        console.log('[sendPrompt-GUARD] Process lock released (error), external:', lockAlreadyHeld)

        console.error('[sendPrompt] Process error:', error.message)
        if (resolved) return
        resolved = true
        resolve({ success: false, error: error.message })
      })

      // Timeout
      setTimeout(() => {
        if (resolved) return
        console.log('[sendPrompt] Timeout after', timeout, 'ms')
        console.log('[sendPrompt] Data received before timeout:', dataReceived)
        console.log('[sendPrompt] Result text length before timeout:', resultText.length)
        this._killProcess(proc)
        resolved = true
        // Release the process lock only if we own it
        if (!lockAlreadyHeld) { this._processLock = false }
        console.log('[sendPrompt-GUARD] Process lock released (timeout), external:', lockAlreadyHeld)
        if (structuredData !== null) {
          resolve({ success: true, response: JSON.stringify(structuredData) })
        } else if (resultText.length > 0) {
          resolve({ success: true, response: resultText.trim() })
        } else {
          resolve({ success: false, error: 'Request timed out' })
        }
      }, timeout)
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

  /**
   * Generate inspection assertions for sprint stories based on the approved plan
   *
   * @param {Array} stories - Array of user stories with id, title, description, acceptanceCriteria
   * @param {string} plan - The approved sprint plan
   * @param {string} codingStandard - Optional coding standard content to guide naming conventions
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<{success: boolean, assertions?: Object, error?: string}>}
   *          assertions is a map of storyId -> array of assertions
   */
  async generateInspectionAssertions(stories, plan, codingStandard = '', progressCallback = null, model = null) {
    const progress = (msg) => {
      console.log('[ASSERTION-GEN]', msg)
      if (progressCallback) progressCallback(msg)
    }

    // CRITICAL: Prevent multiple CLI instances from being spawned
    if (this.isProcessRunning()) {
      console.error('[ASSERTION-GEN-GUARD] Attempted to spawn CLI while another process is running! Rejecting.')
      return {
        success: false,
        error: 'A Claude CLI process is already running. Please wait for it to complete or cancel it first.'
      }
    }

    // Acquire the process lock immediately
    this._processLock = true
    console.log('[ASSERTION-GEN-GUARD] Process lock acquired')

    // Build coding standard context if provided
    const codingStandardContext = codingStandard
      ? `\nCODING STANDARDS TO FOLLOW:\nWhen generating assertions, ensure file names, function names, and class names align with these coding standards:\n\n${codingStandard}\n`
      : ''

    const systemPrompt = `You are generating inspection assertions for user stories. These assertions will be automatically evaluated against the codebase to verify implementation.
${codingStandardContext}

CRITICAL INSTRUCTIONS:
1. Output ONLY a valid JSON object - nothing else
2. Do NOT use markdown code blocks
3. Each assertion must be specific and testable against the actual codebase
4. Use the implementation plan to determine file paths and structures

ASSERTION TYPES:
- FILE_EXISTS: Verify a file/directory exists
  { type: "FILE_EXISTS", target: "path/to/file.js", message: "description", assertion: { type: "file" } }

- FILE_CONTAINS: Verify file contains specific content
  { type: "FILE_CONTAINS", target: "path/to/file.js", message: "description", assertion: { match: "literal"|"regex", content: "text to find" } }

- EXPORT_EXISTS: Verify module exports specific identifiers
  { type: "EXPORT_EXISTS", target: "path/to/file.js", message: "description", assertion: { exports: [{ name: "functionName", type: "function"|"class"|"const" }] } }

- FUNCTION_SIGNATURE: Verify function exists with expected parameters
  { type: "FUNCTION_SIGNATURE", target: "path/to/file.js", message: "description", assertion: { function_name: "myFunc", parameters: ["param1", "param2"] } }

- IPC_HANDLER_REGISTERED: Verify IPC handlers are registered
  { type: "IPC_HANDLER_REGISTERED", target: "src/main/ipc-handlers.js", message: "description", assertion: { handlers: ["channel:name"] } }

- PATTERN_MATCH: Verify presence/absence of patterns
  { type: "PATTERN_MATCH", target: "path/to/file.js", message: "description", assertion: { pattern: "regex pattern", operator: "present"|"absent" } }

OUTPUT FORMAT (JSON object mapping story IDs to assertion arrays):
{
  "story-id-1": [
    { "id": "IA001", "criterion": "AC text", "type": "FILE_EXISTS", "target": "...", "message": "...", "assertion": {...} },
    { "id": "IA002", "criterion": "AC text", "type": "EXPORT_EXISTS", "target": "...", "message": "...", "assertion": {...} }
  ],
  "story-id-2": [...]
}

GUIDELINES:
- Generate 2-5 assertions per story, focusing on the most critical verifications
- Each assertion ID should be unique (format: IA + 3 digits)
- The "criterion" field should reference which acceptance criterion this assertion verifies
- Use relative paths from project root
- Be specific about what to check (exact function names, file paths from the plan)`

    const storiesContext = stories.map(s => {
      return `Story ID: ${s.id}
Title: ${s.title}
Description: ${s.description}
Acceptance Criteria:
${(s.acceptanceCriteria || []).map((ac, i) => `  ${i + 1}. ${ac}`).join('\n')}`
    }).join('\n\n---\n\n')

    const fullPrompt = `${systemPrompt}

=== APPROVED IMPLEMENTATION PLAN ===
${plan}

=== USER STORIES TO GENERATE ASSERTIONS FOR ===
${storiesContext}

Generate inspection assertions for each story. Output ONLY the JSON object.`

    return new Promise((resolve) => {
      const selectedModel = model || 'sonnet'
      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', '1',
        '--model', selectedModel,
        '--tools', '',
        '--mcp-config', this._getEmptyMcpConfigPath(), '--strict-mcp-config',
        '-'
      ]

      const cwd = this.projectPath || process.cwd()
      const spawnOptions = this.getSpawnOptions(cwd)
      spawnOptions.stdio = ['pipe', 'pipe', 'pipe']

      progress(`Generating assertions for ${stories.length} stories with model ${selectedModel}...`)

      const proc = spawn('claude', args, spawnOptions)

      if (!proc.pid) {
        progress('ERROR: Failed to spawn process')
        this._processLock = false
        console.log('[ASSERTION-GEN-GUARD] Process lock released (no PID)')
        resolve({ success: false, error: 'Failed to spawn Claude CLI process' })
        return
      }

      progress(`Process spawned with PID: ${proc.pid}`)

      let buffer = ''
      let resultText = ''
      let resolved = false

      // Timeout after 5 minutes (multi-turn with tool use takes longer)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this._killProcess(proc)
          this._processLock = false
          console.log('[ASSERTION-GEN-GUARD] Process lock released (timeout)')
          progress('ERROR: Timeout')
          resolve({ success: false, error: 'Assertion generation timed out' })
        }
      }, 300000)

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

            // Extract text from assistant messages
            if (json.type === 'assistant' && json.message?.content) {
              const content = json.message.content
              const blocks = Array.isArray(content) ? content : [content]
              for (const block of blocks) {
                if (block.type === 'text' && block.text) {
                  resultText += block.text
                } else if (typeof block === 'string') {
                  resultText += block
                }
              }
            }
            // Handle result type message which contains the final response
            if (json.type === 'result' && json.result) {
              resultText = json.result
            }
            // Handle content_block_delta for streaming responses
            if (json.type === 'content_block_delta' && json.delta?.text) {
              resultText += json.delta.text
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      })

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        if (text.includes('error') || text.includes('Error')) {
          console.error('[ASSERTION-GEN] stderr:', text)
        }
      })

      proc.on('close', (code) => {
        clearTimeout(timeout)
        // Release the process lock
        this._processLock = false
        console.log('[ASSERTION-GEN-GUARD] Process lock released (close)')

        if (resolved) return
        resolved = true

        // Process remaining buffer (may contain the result message)
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer)
            if (json.type === 'result' && json.result) {
              resultText = json.result
            }
            if (json.type === 'assistant' && json.message?.content) {
              const blocks = Array.isArray(json.message.content) ? json.message.content : [json.message.content]
              for (const block of blocks) {
                if (block.type === 'text' && block.text) {
                  resultText += block.text
                }
              }
            }
          } catch (e) {
            // Buffer may not be valid JSON
          }
        }

        if (!resultText.trim()) {
          resolve({ success: false, error: 'No response received from Claude' })
          return
        }

        // Try to parse the JSON response
        try {
          // Clean up the response - extract JSON from markdown code blocks or raw text
          let cleanedResult = resultText.trim()

          // Try to extract JSON from markdown code block first
          const jsonBlockMatch = cleanedResult.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (jsonBlockMatch) {
            cleanedResult = jsonBlockMatch[1].trim()
          } else if (cleanedResult.startsWith('```')) {
            // Fallback: remove code block markers
            cleanedResult = cleanedResult.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
          } else {
            // Try to find JSON object in the text (starts with { ends with })
            const jsonMatch = cleanedResult.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              cleanedResult = jsonMatch[0]
            }
          }

          const assertions = JSON.parse(cleanedResult)

          // Validate structure - should be an object with story IDs as keys
          if (typeof assertions !== 'object' || Array.isArray(assertions)) {
            resolve({ success: false, error: 'Invalid response format: expected object with story IDs' })
            return
          }

          // Count total assertions generated
          let totalAssertions = 0
          for (const storyId of Object.keys(assertions)) {
            if (Array.isArray(assertions[storyId])) {
              totalAssertions += assertions[storyId].length
            }
          }

          progress(`Successfully generated ${totalAssertions} assertions for ${Object.keys(assertions).length} stories`)
          resolve({ success: true, assertions })
        } catch (parseError) {
          console.error('[ASSERTION-GEN] Parse error:', parseError.message)
          console.error('[ASSERTION-GEN] Raw result:', resultText.substring(0, 500))
          resolve({ success: false, error: `Failed to parse assertions: ${parseError.message}`, rawResponse: resultText })
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        // Release the process lock
        this._processLock = false
        console.log('[ASSERTION-GEN-GUARD] Process lock released (error)')

        if (resolved) return
        resolved = true
        progress(`ERROR: ${err.message}`)
        resolve({ success: false, error: err.message })
      })
    })
  }
}

module.exports = { ClaudeService }
