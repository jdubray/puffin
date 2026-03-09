/**
 * IPC Handlers for Memory Plugin
 *
 * Thin handlers that expose ClaudeMemoryReader via the
 * `plugin:memory-plugin:` channel prefix.  Claude Code's native /memory
 * command writes directly to CLAUDE.md; Puffin's ClaudeMdGenerator
 * round-trips those additions back to each CLAUDE_{branch}.md file on
 * branch switch or regeneration.  This plugin simply reads and displays
 * that stored content — no LLM extraction pipeline required.
 *
 * @module ipc-handlers
 */

const CHANNEL_PREFIX = 'plugin:memory-plugin'

/**
 * Register all IPC handlers for the memory plugin
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} deps
 * @param {import('./claude-memory-reader.js').ClaudeMemoryReader} deps.reader
 * @param {Object} [deps.logger=console]
 * @returns {string[]} Registered channel names (for cleanup)
 */
function register(ipcMain, { reader, logger }) {
  const log = logger || console
  const channels = []

  function handle(action, handler) {
    const channel = `${CHANNEL_PREFIX}:${action}`
    ipcMain.handle(channel, async (event, args) => {
      try {
        return await handler(args)
      } catch (err) {
        log.error(`[${CHANNEL_PREFIX}] Error in ${action}:`, err.message)
        return { success: false, error: err.message }
      }
    })
    channels.push(channel)
  }

  // list-branches — branches that have Claude Code memory sections
  handle('list-branches', async () => {
    const branches = await reader.listBranches()
    return { success: true, branches }
  })

  // get-branch-memory — read the Claude Code section for a branch
  handle('get-branch-memory', async (args) => {
    const branch = args?.branchId
    if (!branch || typeof branch !== 'string') {
      return { success: false, error: 'branchId is required (string)' }
    }
    const { exists, content } = await reader.getMemory(branch)
    return { success: true, exists, content }
  })

  // clear-branch-memory — remove the Claude Code section for a branch
  handle('clear-branch-memory', async (args) => {
    const branch = args?.branchId
    if (!branch || typeof branch !== 'string') {
      return { success: false, error: 'branchId is required (string)' }
    }
    const cleared = await reader.clearMemory(branch)
    log.log(`[${CHANNEL_PREFIX}] Cleared Claude memory for "${branch}": ${cleared}`)
    return { success: true, cleared }
  })

  log.log(`[${CHANNEL_PREFIX}] Registered ${channels.length} IPC handlers`)
  return channels
}

/**
 * Unregister all IPC handlers
 * @param {Electron.IpcMain} ipcMain
 * @param {string[]} channels
 */
function unregister(ipcMain, channels) {
  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }
}

module.exports = { register, unregister, CHANNEL_PREFIX }
