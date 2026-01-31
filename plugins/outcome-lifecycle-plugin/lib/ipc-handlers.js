/**
 * IPC Handlers for Outcome Lifecycle Plugin
 *
 * Registers handlers via context.registerIpcHandler() which auto-namespaces
 * channels as `plugin:outcome-lifecycle-plugin:<channel>` and wraps responses
 * in `{ success: true, data }` / `{ success: false, error }`.
 *
 * Handlers validate input and throw on invalid args (context catches and
 * returns error responses).
 *
 * @module ipc-handlers
 */

/**
 * Register all IPC handlers for the outcome lifecycle plugin.
 *
 * @param {Object} context - Plugin context with registerIpcHandler()
 * @param {Object} deps
 * @param {import('./lifecycle-repository').LifecycleRepository} deps.repository
 * @param {import('./dag-engine').DAGEngine} deps.dagEngine
 */
function register(context, { repository, dagEngine }) {
  // ── Lifecycle CRUD ──────────────────────────────────────────────

  context.registerIpcHandler('createLifecycle', async (args) => {
    requireString(args, 'title')
    return repository.create(args.title, args.description)
  })

  context.registerIpcHandler('getLifecycle', async (args) => {
    requireString(args, 'id')
    const lifecycle = await repository.get(args.id)
    if (!lifecycle) {
      throw new Error(`Lifecycle "${args.id}" not found`)
    }
    return lifecycle
  })

  context.registerIpcHandler('updateLifecycle', async (args) => {
    requireString(args, 'id')
    if (!args.fields || typeof args.fields !== 'object') {
      throw new Error('fields object is required')
    }
    const lifecycle = await repository.update(args.id, args.fields)
    if (!lifecycle) {
      throw new Error(`Lifecycle "${args.id}" not found`)
    }
    return lifecycle
  })

  context.registerIpcHandler('deleteLifecycle', async (args) => {
    requireString(args, 'id')
    const deleted = await repository.delete(args.id)
    return { deleted }
  })

  context.registerIpcHandler('listLifecycles', async (args) => {
    const filters = args || {}
    return repository.list(filters)
  })

  // ── Story Mapping ──────────────────────────────────────────────

  context.registerIpcHandler('mapStory', async (args) => {
    requireString(args, 'lifecycleId')
    requireString(args, 'storyId')
    const lifecycle = await repository.mapStory(args.lifecycleId, args.storyId)
    if (!lifecycle) {
      throw new Error(`Lifecycle "${args.lifecycleId}" not found`)
    }
    return lifecycle
  })

  context.registerIpcHandler('unmapStory', async (args) => {
    requireString(args, 'lifecycleId')
    requireString(args, 'storyId')
    const lifecycle = await repository.unmapStory(args.lifecycleId, args.storyId)
    if (!lifecycle) {
      throw new Error(`Lifecycle "${args.lifecycleId}" not found`)
    }
    return lifecycle
  })

  context.registerIpcHandler('getStoriesForLifecycle', async (args) => {
    requireString(args, 'lifecycleId')
    return repository.getStoriesForLifecycle(args.lifecycleId)
  })

  context.registerIpcHandler('getLifecyclesForStory', async (args) => {
    requireString(args, 'storyId')
    return repository.getLifecyclesForStory(args.storyId)
  })

  // ── DAG Operations ─────────────────────────────────────────────

  context.registerIpcHandler('addDependency', async (args) => {
    requireString(args, 'fromId')
    requireString(args, 'toId')
    return dagEngine.addDependency(args.fromId, args.toId)
  })

  context.registerIpcHandler('removeDependency', async (args) => {
    requireString(args, 'fromId')
    requireString(args, 'toId')
    const lifecycle = await dagEngine.removeDependency(args.fromId, args.toId)
    if (!lifecycle) {
      throw new Error(`Lifecycle "${args.fromId}" not found`)
    }
    return lifecycle
  })

  context.registerIpcHandler('getDag', async () => {
    return dagEngine.serialize()
  })
}

/**
 * Validate that args contains a non-empty string field.
 * @param {Object} args
 * @param {string} field
 * @throws {Error} If field is missing or not a non-empty string
 */
function requireString(args, field) {
  if (!args || typeof args[field] !== 'string' || args[field].trim().length === 0) {
    throw new Error(`${field} is required and must be a non-empty string`)
  }
}

module.exports = { register }
