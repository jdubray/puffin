/**
 * Tests for SyncInboxWatcher
 *
 * Verifies the watcher fires (debounced) when sync-inbox.json changes and stays
 * quiet for unrelated files, and that stop() prevents further callbacks.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { SyncInboxWatcher } = require('../src/main/sync-watcher')

const INBOX_FILE = 'sync-inbox.json'

/** Wait until predicate() is true or timeout elapses. */
function waitFor(predicate, timeoutMs = 3000, stepMs = 25) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(tick, stepMs)
    }
    tick()
  })
}

describe('SyncInboxWatcher', () => {
  let dir
  let watcher

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-watch-'))
    watcher = new SyncInboxWatcher()
  })

  afterEach(() => {
    watcher.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('fires when sync-inbox.json is written', async () => {
    let fired = 0
    watcher.start(dir, () => { fired++ })

    fs.writeFileSync(path.join(dir, INBOX_FILE), '[]')
    await waitFor(() => fired > 0)

    assert.ok(fired > 0, 'callback should fire for inbox writes')
  })

  it('ignores changes to unrelated files', async () => {
    let fired = 0
    watcher.start(dir, () => { fired++ })

    fs.writeFileSync(path.join(dir, 'history.json'), '{}')
    // Give the watcher a chance to (incorrectly) react
    await new Promise((r) => setTimeout(r, 500))

    assert.strictEqual(fired, 0, 'callback should not fire for other files')
  })

  it('does not fire after stop()', async () => {
    let fired = 0
    watcher.start(dir, () => { fired++ })
    watcher.stop()

    fs.writeFileSync(path.join(dir, INBOX_FILE), '[]')
    await new Promise((r) => setTimeout(r, 500))

    assert.strictEqual(fired, 0, 'callback should not fire once stopped')
  })
})
