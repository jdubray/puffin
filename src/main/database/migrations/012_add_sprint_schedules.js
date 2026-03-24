/**
 * Migration 012: Add sprint_schedules table for recurring nightly code review sprints
 */

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprint_schedules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Nightly Code Review',
      description TEXT NOT NULL DEFAULT '',
      scheduled_hour INTEGER NOT NULL DEFAULT 22,
      scheduled_minute INTEGER NOT NULL DEFAULT 0,
      timezone TEXT NOT NULL DEFAULT 'local',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

function down(db) {
  db.exec('DROP TABLE IF EXISTS sprint_schedules');
}

module.exports = { up, down };
