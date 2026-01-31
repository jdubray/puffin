/**
 * IPC Handlers for Memory Plugin
 *
 * Registers Electron IPC handlers with the `memory-plugin:` channel prefix.
 * All handlers validate input and return structured responses.
 *
 * @module ipc-handlers
 */

const CHANNEL_PREFIX = 'plugin:memory-plugin'

/**
 * Register all IPC handlers for the memory plugin
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} deps
 * @param {import('./memory-manager.js').MemoryManager} deps.memoryManager
 * @param {import('./file-system-layer.js').FileSystemLayer} deps.fsLayer
 * @param {import('./maintenance.js')} [deps.maintenance]
 * @param {Object} [deps.logger=console]
 * @returns {string[]} Array of registered channel names (for cleanup)
 */
function register(ipcMain, { memoryManager, fsLayer, maintenance, logger }) {
  const log = logger || console
  const channels = []

  /**
   * Helper to register a handler with error wrapping
   * @param {string} action
   * @param {Function} handler
   */
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

  // memory-plugin:memorize — Trigger extraction for a branch
  handle('memorize', async (args) => {
    const branchId = args?.branchId
    if (!branchId || typeof branchId !== 'string') {
      return { success: false, error: 'branchId is required (string)' }
    }

    log.log(`[${CHANNEL_PREFIX}] Memorize requested for branch: ${branchId}`)
    const result = await memoryManager.memorize(branchId)
    return { success: result.status === 'success' || result.status === 'skipped', ...result }
  })

  // memory-plugin:get-branch-memory — Read a branch memory file
  handle('get-branch-memory', async (args) => {
    const branchId = args?.branchId
    if (!branchId || typeof branchId !== 'string') {
      return { success: false, error: 'branchId is required (string)' }
    }

    const { exists, parsed, raw } = await fsLayer.readBranch(branchId)
    if (!exists) {
      return { success: true, exists: false, data: null }
    }
    return { success: true, exists: true, data: { parsed, raw } }
  })

  // memory-plugin:clear-branch-memory — Delete a branch memory file
  handle('clear-branch-memory', async (args) => {
    const branchId = args?.branchId
    if (!branchId || typeof branchId !== 'string') {
      return { success: false, error: 'branchId is required (string)' }
    }

    const deleted = await fsLayer.deleteBranch(branchId)
    log.log(`[${CHANNEL_PREFIX}] Cleared memory for branch "${branchId}": ${deleted}`)
    return { success: true, deleted }
  })

  // memory-plugin:list-branches — List all branches with memory files
  handle('list-branches', async () => {
    const branches = await fsLayer.listBranches()
    return { success: true, branches }
  })

  // memory-plugin:run-maintenance — Trigger maintenance
  handle('run-maintenance', async (args) => {
    const type = args?.type || 'full'
    const validTypes = ['weekly', 'monthly', 'full']
    if (!validTypes.includes(type)) {
      return { success: false, error: `Invalid type: "${type}". Expected: ${validTypes.join(', ')}` }
    }

    if (!maintenance) {
      return { success: false, error: 'Maintenance module not available' }
    }

    log.log(`[${CHANNEL_PREFIX}] Running ${type} maintenance`)
    const result = await maintenance.run(type)
    return { success: true, ...result }
  })

  log.log(`[${CHANNEL_PREFIX}] Registered ${channels.length} IPC handlers`)
  return channels
}

/**
 * Unregister all IPC handlers
 * @param {Electron.IpcMain} ipcMain
 * @param {string[]} channels - Channel names returned from register()
 */
function unregister(ipcMain, channels) {
  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }
}

module.exports = { register, unregister, CHANNEL_PREFIX }
