/**
 * Memory Plugin - Main Process Entry Point
 *
 * Displays the Claude Code memory sections stored in each
 * .claude/CLAUDE_{branch}.md file.
 *
 * Claude Code's native /memory command appends entries to the bottom of
 * CLAUDE.md.  Puffin's ClaudeMdGenerator detects those additions via the
 * <!-- puffin:generated-end --> sentinel and saves them back into the
 * branch file on every branch switch or regeneration.  This plugin reads
 * those saved sections and surfaces them in the UI — no LLM extraction
 * pipeline is needed here.
 */

const path = require('path')
const { ClaudeMemoryReader } = require('./lib/claude-memory-reader.js')
const ipcHandlers = require('./lib/ipc-handlers.js')

const MemoryPlugin = {
  name: 'memory-plugin',
  context: null,
  reader: null,
  registeredChannels: [],

  async activate(context) {
    this.context = context
    const log = context.log || console

    try {
      const projectPath = context.projectPath || process.cwd()
      const claudeDir = path.join(projectPath, '.claude')

      this.reader = new ClaudeMemoryReader(claudeDir)

      const ipcMain = context.ipcMain
      if (ipcMain) {
        this.registeredChannels = ipcHandlers.register(ipcMain, {
          reader: this.reader,
          logger: log
        })
      }

      log.info('[memory-plugin] Activated (Claude Code memory reader mode)')
    } catch (error) {
      log.error('[memory-plugin] Activation failed (degraded mode):', error.message)
    }
  },

  async deactivate() {
    const log = (this.context && this.context.log) || console

    if (this.context && this.context.ipcMain && this.registeredChannels.length > 0) {
      ipcHandlers.unregister(this.context.ipcMain, this.registeredChannels)
      this.registeredChannels = []
    }

    this.reader = null
    this.context = null
    log.info('[memory-plugin] Deactivated')
  }
}

module.exports = MemoryPlugin
