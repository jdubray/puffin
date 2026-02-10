/**
 * Metrics Migration Tests
 *
 * Tests for migration 010_add_metrics_events.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('Migration 010 - Metrics Events', () => {
  const migration = require('../../src/main/database/migrations/010_add_metrics_events')

  it('should export up and down functions', () => {
    assert.strictEqual(typeof migration.up, 'function')
    assert.strictEqual(typeof migration.down, 'function')
  })

  it('should create metrics_events table with correct columns', () => {
    const executedSql = []
    const mockDb = {
      exec: (sql) => { executedSql.push(sql) }
    }

    migration.up(mockDb)

    // Should have at least 6 exec calls: CREATE TABLE + 5 indexes
    assert.ok(executedSql.length >= 6, `Expected at least 6 SQL statements, got ${executedSql.length}`)

    // First should be the CREATE TABLE
    const createTable = executedSql[0]
    assert.ok(createTable.includes('CREATE TABLE'), 'First SQL should create table')
    assert.ok(createTable.includes('metrics_events'), 'Should create metrics_events table')

    // Verify required columns
    const requiredColumns = [
      'id TEXT PRIMARY KEY',
      'component TEXT NOT NULL',
      'operation TEXT NOT NULL',
      'event_type TEXT NOT NULL',
      'session_id TEXT',
      'branch_id TEXT',
      'story_id TEXT',
      'plan_id TEXT',
      'sprint_id TEXT',
      'input_tokens INTEGER',
      'output_tokens INTEGER',
      'total_tokens INTEGER',
      'cost_usd REAL',
      'turns INTEGER',
      'duration_ms INTEGER',
      'metadata TEXT',
      'created_at TEXT NOT NULL'
    ]

    for (const col of requiredColumns) {
      assert.ok(createTable.includes(col), `Missing column: ${col}`)
    }

    // Verify indexes
    const indexSql = executedSql.slice(1).join('\n')
    assert.ok(indexSql.includes('idx_metrics_events_component'), 'Missing component index')
    assert.ok(indexSql.includes('idx_metrics_events_operation'), 'Missing operation index')
    assert.ok(indexSql.includes('idx_metrics_events_created'), 'Missing created_at index')
    assert.ok(indexSql.includes('idx_metrics_events_story_id'), 'Missing story_id index')
    assert.ok(indexSql.includes('idx_metrics_events_component_type'), 'Missing composite component/type index')
  })

  it('should drop table on rollback', () => {
    const executedSql = []
    const mockDb = {
      exec: (sql) => { executedSql.push(sql) }
    }

    migration.down(mockDb)

    assert.ok(executedSql.length >= 1)
    assert.ok(executedSql[0].includes('DROP TABLE IF EXISTS metrics_events'))
  })
})
