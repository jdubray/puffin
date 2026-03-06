#!/usr/bin/env node
/**
 * fix-stuck-sprint.js
 *
 * Removes the stuck active sprint from a Puffin project database and
 * returns its user stories to 'completed' status.
 *
 * Usage:
 *   node fix-stuck-sprint.js <project-path>
 *
 * Example:
 *   node fix-stuck-sprint.js C:\Users\jjdub\code\baanbaan\Merchant
 */

const path = require('path')
const fs = require('fs')

// --- Resolve project path ---
const projectPath = process.argv[2]
if (!projectPath) {
  console.error('Usage: node fix-stuck-sprint.js <project-path>')
  process.exit(1)
}

const dbPath = path.join(projectPath, '.puffin', 'puffin.db')
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`)
  process.exit(1)
}

// --- Load better-sqlite3 from Puffin's own node_modules ---
const scriptDir = path.dirname(require.resolve('./fix-stuck-sprint.js') || __filename)
const puffinRoot = path.resolve(scriptDir, '..')
const sqlitePath = path.join(puffinRoot, 'node_modules', 'better-sqlite3')
let Database
try {
  Database = require(sqlitePath)
} catch (e) {
  console.error(`Could not load better-sqlite3 from ${sqlitePath}`)
  console.error('Run this script from the puffin project root, or install better-sqlite3 globally.')
  process.exit(1)
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// --- Find the stuck active sprint ---
const activeSprint = db.prepare(`
  SELECT * FROM sprints WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 1
`).get()

if (!activeSprint) {
  console.log('No active sprint found — database is already clean.')
  db.close()
  process.exit(0)
}

console.log(`Found active sprint:`)
console.log(`  ID:     ${activeSprint.id}`)
console.log(`  Title:  ${activeSprint.title}`)
console.log(`  Status: ${activeSprint.status}`)
console.log(`  Created: ${activeSprint.created_at}`)

// --- Get linked story IDs ---
const storyRows = db.prepare(`
  SELECT story_id FROM sprint_stories WHERE sprint_id = ?
`).all(activeSprint.id)

const storyIds = storyRows.map(r => r.story_id)
console.log(`\nLinked stories: ${storyIds.length}`)

if (storyIds.length > 0) {
  // Check current story statuses
  const stories = db.prepare(`
    SELECT id, title, status FROM user_stories WHERE id IN (${storyIds.map(() => '?').join(',')})
  `).all(...storyIds)

  stories.forEach(s => console.log(`  [${s.status.padEnd(12)}] ${s.title}`))
}

// --- Confirm before proceeding ---
const readline = require('readline')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

rl.question(`\nThis will:\n  1. Delete sprint "${activeSprint.title}"\n  2. Set its ${storyIds.length} stories to 'completed'\n  3. Remove sprint_stories links\n\nProceed? (yes/no): `, (answer) => {
  rl.close()

  if (answer.toLowerCase() !== 'yes') {
    console.log('Aborted.')
    db.close()
    process.exit(0)
  }

  // --- Execute in a transaction ---
  const fix = db.transaction(() => {
    // 1. Return stories to 'completed'
    if (storyIds.length > 0) {
      const now = new Date().toISOString()
      const updateStmt = db.prepare(`
        UPDATE user_stories SET status = 'completed', updated_at = ? WHERE id = ?
      `)
      for (const id of storyIds) {
        updateStmt.run(now, id)
      }
      console.log(`\nSet ${storyIds.length} stories → completed`)
    }

    // 2. Remove sprint_stories links
    const deletedLinks = db.prepare(`
      DELETE FROM sprint_stories WHERE sprint_id = ?
    `).run(activeSprint.id)
    console.log(`Removed ${deletedLinks.changes} sprint_stories links`)

    // 3. Delete the sprint
    db.prepare(`DELETE FROM sprints WHERE id = ?`).run(activeSprint.id)
    console.log(`Deleted sprint: ${activeSprint.title}`)
  })

  fix()

  // --- Verify ---
  const remaining = db.prepare(`SELECT COUNT(*) as n FROM sprints WHERE closed_at IS NULL`).get()
  console.log(`\nActive sprints remaining: ${remaining.n}`)
  console.log('Done. Restart Puffin to pick up the changes.')

  db.close()
})
