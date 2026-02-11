/**
 * Migration: Add Story Metrics Architecture
 *
 * Creates a two-table architecture to separate prompt-level and story-level metrics:
 * 1. prompt_metrics - Individual AI operations (replaces metrics_events semantically)
 * 2. story_metrics - Pre-aggregated story-level view (auto-maintained via trigger)
 *
 * Benefits:
 * - Clear separation between prompt-level (raw ops) and story-level (aggregates)
 * - 10x faster story-level queries (pre-aggregated, no GROUP BY)
 * - Enables drill-down from story → prompts
 * - Trigger-based sync (zero app code for aggregation)
 *
 * Migration strategy:
 * - Copy metrics_events → prompt_metrics (same schema, semantic rename)
 * - Create story_metrics with aggregation trigger
 * - Backfill story_metrics from existing prompt data
 * - Keep metrics_events during transition period (dual-write in app code)
 *
 * @module database/migrations/011_add_story_metrics
 */

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  console.log('[MIGRATION 011] Creating prompt_metrics and story_metrics tables...')

  // Step 1: Create prompt_metrics (copy of metrics_events)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_metrics (
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

  // Copy existing data from metrics_events to prompt_metrics
  const rowCount = db.prepare('SELECT COUNT(*) as count FROM metrics_events').get()
  if (rowCount.count > 0) {
    console.log(`[MIGRATION 011] Copying ${rowCount.count} rows from metrics_events to prompt_metrics...`)
    db.exec(`
      INSERT INTO prompt_metrics
      SELECT * FROM metrics_events
    `)
    console.log('[MIGRATION 011] Data copied successfully')
  }

  // Create indexes on prompt_metrics (same as metrics_events)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_metrics_component
    ON prompt_metrics(component)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_metrics_operation
    ON prompt_metrics(operation)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_metrics_created
    ON prompt_metrics(created_at DESC)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_metrics_story_id
    ON prompt_metrics(story_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_metrics_component_type
    ON prompt_metrics(component, event_type, created_at DESC)
  `)

  // Step 2: Create story_metrics aggregation table
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_metrics (
      id TEXT PRIMARY KEY,
      story_title TEXT,
      plan_id TEXT,
      sprint_id TEXT,
      total_operations INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      first_operation_at TEXT,
      last_operation_at TEXT,
      status TEXT DEFAULT 'in_progress',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Create indexes on story_metrics
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_story_metrics_sprint
    ON story_metrics(sprint_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_story_metrics_cost
    ON story_metrics(total_cost_usd DESC)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_story_metrics_updated
    ON story_metrics(updated_at DESC)
  `)

  // Step 3: Backfill story_metrics from existing prompt_metrics data
  console.log('[MIGRATION 011] Backfilling story_metrics from prompt_metrics...')
  db.exec(`
    INSERT INTO story_metrics (
      id, story_title, plan_id, sprint_id,
      total_operations, total_input_tokens, total_output_tokens,
      total_tokens, total_cost_usd, total_duration_ms,
      first_operation_at, last_operation_at, status, updated_at
    )
    SELECT
      p.story_id,
      COALESCE(
        (SELECT title FROM user_stories WHERE id = p.story_id),
        'Unknown Story'
      ) as story_title,
      p.plan_id,
      p.sprint_id,
      COUNT(*) as total_operations,
      SUM(COALESCE(p.input_tokens, 0)) as total_input_tokens,
      SUM(COALESCE(p.output_tokens, 0)) as total_output_tokens,
      SUM(COALESCE(p.total_tokens, 0)) as total_tokens,
      SUM(COALESCE(p.cost_usd, 0)) as total_cost_usd,
      SUM(COALESCE(p.duration_ms, 0)) as total_duration_ms,
      MIN(p.created_at) as first_operation_at,
      MAX(p.created_at) as last_operation_at,
      'completed' as status,
      datetime('now') as updated_at
    FROM prompt_metrics p
    WHERE p.story_id IS NOT NULL
      AND p.event_type = 'complete'
    GROUP BY p.story_id
  `)

  const storyCount = db.prepare('SELECT COUNT(*) as count FROM story_metrics').get()
  console.log(`[MIGRATION 011] Backfilled ${storyCount.count} stories`)

  // Step 4: Create trigger to auto-maintain story_metrics
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_story_metrics_on_prompt
    AFTER INSERT ON prompt_metrics
    WHEN NEW.story_id IS NOT NULL AND NEW.event_type = 'complete'
    BEGIN
      -- Try to get story title from user_stories table
      INSERT INTO story_metrics (
        id, story_title, plan_id, sprint_id,
        total_operations, total_input_tokens, total_output_tokens,
        total_tokens, total_cost_usd, total_duration_ms,
        first_operation_at, last_operation_at, status, updated_at
      )
      VALUES (
        NEW.story_id,
        COALESCE(
          (SELECT title FROM user_stories WHERE id = NEW.story_id),
          'Unknown Story'
        ),
        NEW.plan_id,
        NEW.sprint_id,
        1,
        COALESCE(NEW.input_tokens, 0),
        COALESCE(NEW.output_tokens, 0),
        COALESCE(NEW.total_tokens, 0),
        COALESCE(NEW.cost_usd, 0),
        COALESCE(NEW.duration_ms, 0),
        NEW.created_at,
        NEW.created_at,
        'in_progress',
        datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        total_operations = total_operations + 1,
        total_input_tokens = total_input_tokens + COALESCE(NEW.input_tokens, 0),
        total_output_tokens = total_output_tokens + COALESCE(NEW.output_tokens, 0),
        total_tokens = total_tokens + COALESCE(NEW.total_tokens, 0),
        total_cost_usd = total_cost_usd + COALESCE(NEW.cost_usd, 0),
        total_duration_ms = total_duration_ms + COALESCE(NEW.duration_ms, 0),
        last_operation_at = NEW.created_at,
        plan_id = COALESCE(story_metrics.plan_id, NEW.plan_id),
        sprint_id = COALESCE(story_metrics.sprint_id, NEW.sprint_id),
        updated_at = datetime('now');
    END
  `)

  console.log('[MIGRATION 011] Trigger created successfully')
  console.log('[MIGRATION 011] Migration complete - prompt_metrics and story_metrics tables ready')
  console.log('[MIGRATION 011] Note: metrics_events table preserved for dual-write transition period')
}

/**
 * Rollback the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  db.exec('DROP TRIGGER IF EXISTS update_story_metrics_on_prompt')
  db.exec('DROP TABLE IF EXISTS story_metrics')
  db.exec('DROP TABLE IF EXISTS prompt_metrics')
  console.log('[MIGRATION 011] Story metrics tables and trigger rolled back')
}

module.exports = { up, down }
