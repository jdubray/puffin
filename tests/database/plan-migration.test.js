/**
 * Plan Migration Tests
 *
 * Tests for migration 014_add_board_plans: the plans table and the plan/run columns
 * on user_stories and archived_stories.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('Migration 014 - Board plans', () => {
  const migration = require('../../src/main/database/migrations/014_add_board_plans')

  /** A db mock that remembers exec'd SQL and answers PRAGMA table_info from a column list. */
  function mockDb(existingColumns = {}) {
    const executed = []
    return {
      executed,
      exec: (sql) => { executed.push(sql) },
      prepare: (sql) => ({
        all: () => {
          const m = sql.match(/PRAGMA table_info\((\w+)\)/)
          return (existingColumns[m?.[1]] || []).map(name => ({ name }))
        }
      })
    }
  }

  it('exports version, up and down', () => {
    assert.strictEqual(migration.version, 14)
    assert.strictEqual(typeof migration.up, 'function')
    assert.strictEqual(typeof migration.down, 'function')
  })

  it('creates the plans table and adds the seven columns to both story tables', () => {
    const db = mockDb()
    migration.up(db)
    const create = db.executed.find(s => s.includes('CREATE TABLE IF NOT EXISTS board_plans'))
    assert.ok(create, 'board_plans table created')
    for (const col of ['id TEXT PRIMARY KEY', 'title TEXT NOT NULL', 'file_path TEXT NOT NULL', 'branch_id TEXT', 'source_prompt_id TEXT', 'status TEXT', 'approved_at TEXT']) {
      assert.ok(create.includes(col), `plans has ${col}`)
    }
    const alters = db.executed.filter(s => s.startsWith('ALTER TABLE'))
    assert.strictEqual(alters.length, 14, 'seven columns on each of two tables')
    for (const table of ['user_stories', 'archived_stories']) {
      for (const name of ['plan_id', 'plan_step', 'depends_on', 'skill', 'thread_id', 'run_state', 'run_meta']) {
        assert.ok(alters.some(s => s.includes(`ALTER TABLE ${table} ADD COLUMN ${name} `)), `${table}.${name}`)
      }
    }
    assert.ok(db.executed.some(s => s.includes('idx_user_stories_plan_id')), 'plan_id index')
  })

  it('skips columns that already exist (re-runnable)', () => {
    const db = mockDb({ user_stories: ['plan_id', 'run_meta'], archived_stories: [] })
    migration.up(db)
    const alters = db.executed.filter(s => s.startsWith('ALTER TABLE'))
    assert.strictEqual(alters.length, 12)
    assert.ok(!alters.some(s => s.includes('ALTER TABLE user_stories ADD COLUMN plan_id')))
  })

  it('down drops the plans table and indexes only', () => {
    const db = mockDb()
    migration.down(db)
    assert.ok(db.executed.some(s => s.includes('DROP TABLE IF EXISTS board_plans')))
    assert.ok(!db.executed.some(s => s.includes('ALTER TABLE')))
  })
})
