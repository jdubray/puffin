/**
 * Migration: Add Metrics Events Table
 *
 * Creates the metrics_events table for tracking cognitive architecture instrumentation:
 * - Token consumption (input/output/total)
 * - Cost tracking (USD)
 * - Operation timing (duration_ms)
 * - Component/operation/event type tracking
 * - Session/branch/story/plan context
 *
 * @module database/migrations/010_add_metrics_events
 */

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  // Metrics Events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics_events (
      id TEXT PRIMARY KEY,
      component TEXT NOT NULL,
      operation TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT,
      branch_id TEXT,
      story_id TEXT,
      plan_id TEXT,
      sprint_id TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost_usd REAL,
      turns INTEGER,
      duration_ms INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Indexes for efficient querying
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_events_component
    ON metrics_events(component)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_events_operation
    ON metrics_events(operation)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_events_created
    ON metrics_events(created_at DESC)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_events_story_id
    ON metrics_events(story_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_events_component_type
    ON metrics_events(component, event_type, created_at DESC)
  `)

  console.log('[MIGRATION 010] Metrics events table created successfully')
}

/**
 * Rollback the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  db.exec('DROP TABLE IF EXISTS metrics_events')
  console.log('[MIGRATION 010] Metrics events table rolled back')
}

module.exports = { up, down }
