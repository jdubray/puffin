/**
 * SyncInboxWatcher - Watches a project's .puffin/sync-inbox.json for changes
 *
 * The /puffin-sync CLI command writes summaries into sync-inbox.json. This
 * watcher lets Puffin react immediately (process + refresh the UI) instead of
 * requiring a manual refresh or app restart.
 *
 * The directory is watched rather than the file itself, because the inbox file
 * is repeatedly created (by the CLI) and deleted (by Puffin after processing),
 * and fs.watch on a path that disappears stops emitting events.
 */

const fs = require('fs')
const path = require('path')

const INBOX_FILE = 'sync-inbox.json'
const DEBOUNCE_MS = 250

class SyncInboxWatcher {
  constructor() {
    /** @type {fs.FSWatcher|null} */
    this._watcher = null
    /** @type {NodeJS.Timeout|null} */
    this._debounceTimer = null
  }

  /**
   * Start watching the given .puffin directory. Restarts cleanly if already running.
   * @param {string} puffinPath - Absolute path to the project's .puffin directory
   * @param {() => (void|Promise<void>)} onChange - Called (debounced) when the inbox changes
   */
  start(puffinPath, onChange) {
    this.stop()
    if (!puffinPath) return

    try {
      this._watcher = fs.watch(puffinPath, (_eventType, filename) => {
        if (!filename) return
        // filename can be a Buffer on some platforms
        if (filename.toString() !== INBOX_FILE) return

        if (this._debounceTimer) clearTimeout(this._debounceTimer)
        this._debounceTimer = setTimeout(() => {
          this._debounceTimer = null
          Promise.resolve()
            .then(() => onChange())
            .catch((err) => console.error('[SyncWatcher] onChange failed:', err.message))
        }, DEBOUNCE_MS)
      })

      this._watcher.on('error', (err) =>
        console.error('[SyncWatcher] watch error:', err.message))

      console.log(`[SyncWatcher] Watching ${path.join(puffinPath, INBOX_FILE)}`)
    } catch (err) {
      console.error('[SyncWatcher] Failed to start:', err.message)
      this._watcher = null
    }
  }

  /**
   * Stop watching and clear any pending debounce.
   */
  stop() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = null
    }
    if (this._watcher) {
      try {
        this._watcher.close()
      } catch {
        // Already closed
      }
      this._watcher = null
    }
  }
}

module.exports = { SyncInboxWatcher }
