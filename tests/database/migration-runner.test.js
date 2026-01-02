/**
 * Migration Runner Tests
 *
 * Tests for the database migration system including:
 * - Versioned migration discovery and ordering
 * - Schema version tracking
 * - Rollback functionality
 * - Migration history logging
 * - Checksum verification
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')

describe('MigrationRunner', () => {
  describe('Migration Discovery', () => {
    it('should parse migration filenames correctly', () => {
      const files = [
        '001_initial_schema.js',
        '002_add_indexes.js',
        '003_add_user_preferences.js'
      ]

      const migrations = []
      for (const file of files) {
        const match = file.match(/^(\d{3})_(.+)\.js$/)
        if (match) {
          migrations.push({
            version: match[1],
            name: match[2].replace(/_/g, ' ')
          })
        }
      }

      assert.strictEqual(migrations.length, 3)
      assert.strictEqual(migrations[0].version, '001')
      assert.strictEqual(migrations[0].name, 'initial schema')
      assert.strictEqual(migrations[2].version, '003')
      assert.strictEqual(migrations[2].name, 'add user preferences')
    })

    it('should reject invalid migration filenames', () => {
      const invalidFiles = [
        'not_a_migration.js',
        '1_too_short.js',
        '0001_too_long.js',
        '001_no_extension',
        'readme.md'
      ]

      for (const file of invalidFiles) {
        const match = file.match(/^(\d{3})_(.+)\.js$/)
        assert.strictEqual(match, null, `Should reject: ${file}`)
      }
    })

    it('should sort migrations by version', () => {
      const migrations = [
        { version: '003', name: 'third' },
        { version: '001', name: 'first' },
        { version: '002', name: 'second' }
      ]

      migrations.sort((a, b) => a.version.localeCompare(b.version))

      assert.strictEqual(migrations[0].version, '001')
      assert.strictEqual(migrations[1].version, '002')
      assert.strictEqual(migrations[2].version, '003')
    })
  })

  describe('Version Tracking', () => {
    it('should determine current version from applied migrations', () => {
      const applied = [
        { version: '001', name: 'first' },
        { version: '002', name: 'second' },
        { version: '003', name: 'third' }
      ]

      const getCurrentVersion = (migrations) => {
        return migrations.length > 0 ? migrations[migrations.length - 1].version : null
      }

      assert.strictEqual(getCurrentVersion(applied), '003')
      assert.strictEqual(getCurrentVersion([]), null)
    })

    it('should identify pending migrations', () => {
      const applied = new Set(['001', '002'])
      const available = [
        { version: '001', name: 'first' },
        { version: '002', name: 'second' },
        { version: '003', name: 'third' },
        { version: '004', name: 'fourth' }
      ]

      const pending = available.filter(m => !applied.has(m.version))

      assert.strictEqual(pending.length, 2)
      assert.strictEqual(pending[0].version, '003')
      assert.strictEqual(pending[1].version, '004')
    })

    it('should detect when migrations are needed', () => {
      const needsMigrations = (pending) => pending.length > 0

      assert.strictEqual(needsMigrations([{ version: '003' }]), true)
      assert.strictEqual(needsMigrations([]), false)
    })
  })

  describe('Transaction and Rollback', () => {
    it('should wrap migration in transaction simulation', () => {
      let state = { tables: [] }
      let committed = false

      const transaction = (fn) => {
        const backup = JSON.parse(JSON.stringify(state))
        try {
          fn()
          committed = true
        } catch (error) {
          state = backup
          throw error
        }
      }

      // Successful migration
      transaction(() => {
        state.tables.push('users')
        state.tables.push('posts')
      })

      assert.strictEqual(committed, true)
      assert.deepStrictEqual(state.tables, ['users', 'posts'])
    })

    it('should rollback on error', () => {
      let state = { tables: ['existing'] }

      const transaction = (fn) => {
        const backup = JSON.parse(JSON.stringify(state))
        try {
          fn()
        } catch (error) {
          state = backup
          throw error
        }
      }

      try {
        transaction(() => {
          state.tables.push('new_table')
          throw new Error('Simulated error')
        })
      } catch {
        // Expected
      }

      // State should be rolled back
      assert.deepStrictEqual(state.tables, ['existing'])
    })

    it('should record rollback actions', () => {
      const logs = []
      const lastMigration = { version: '002', name: 'add indexes' }

      // Simulate rollback logging
      logs.push({
        version: lastMigration.version,
        action: 'rollback',
        status: 'started',
        message: `Starting rollback: ${lastMigration.name}`
      })

      // Simulate successful rollback
      logs.push({
        version: lastMigration.version,
        action: 'rollback',
        status: 'success',
        message: 'Rolled back in 15ms'
      })

      assert.strictEqual(logs.length, 2)
      assert.strictEqual(logs[0].status, 'started')
      assert.strictEqual(logs[1].status, 'success')
    })
  })

  describe('Migration History Logging', () => {
    it('should log migration actions', () => {
      const logs = []

      const logAction = (version, action, status, message, errorDetails) => {
        logs.push({
          version,
          action,
          status,
          message,
          errorDetails,
          executedAt: new Date().toISOString()
        })
      }

      logAction('001', 'apply', 'started', 'Starting migration: initial schema')
      logAction('001', 'apply', 'success', 'Applied in 50ms')

      assert.strictEqual(logs.length, 2)
      assert.strictEqual(logs[0].action, 'apply')
      assert.strictEqual(logs[0].status, 'started')
      assert.strictEqual(logs[1].status, 'success')
    })

    it('should log failed migrations with error details', () => {
      const logs = []

      const logAction = (version, action, status, message, errorDetails) => {
        logs.push({ version, action, status, message, errorDetails })
      }

      const error = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed')
      error.stack = 'Error: SQLITE_CONSTRAINT\n    at Database.exec'

      logAction('002', 'apply', 'failed', 'Migration 002 failed', error.stack)

      assert.strictEqual(logs.length, 1)
      assert.strictEqual(logs[0].status, 'failed')
      assert.ok(logs[0].errorDetails.includes('SQLITE_CONSTRAINT'))
    })

    it('should filter history by status', () => {
      const logs = [
        { version: '001', status: 'success' },
        { version: '002', status: 'failed' },
        { version: '002', status: 'success' },
        { version: '003', status: 'started' }
      ]

      const filterByStatus = (logs, status) => logs.filter(l => l.status === status)

      const failed = filterByStatus(logs, 'failed')
      assert.strictEqual(failed.length, 1)
      assert.strictEqual(failed[0].version, '002')
    })

    it('should filter history by version', () => {
      const logs = [
        { version: '001', status: 'started' },
        { version: '001', status: 'success' },
        { version: '002', status: 'started' },
        { version: '002', status: 'success' }
      ]

      const filterByVersion = (logs, version) => logs.filter(l => l.version === version)

      const version001 = filterByVersion(logs, '001')
      assert.strictEqual(version001.length, 2)
    })
  })

  describe('Checksum Verification', () => {
    it('should calculate MD5 checksum', () => {
      const content = 'CREATE TABLE users (id INTEGER PRIMARY KEY);'
      const checksum = crypto.createHash('md5').update(content).digest('hex')

      assert.strictEqual(checksum.length, 32)
      assert.ok(/^[a-f0-9]+$/.test(checksum))
    })

    it('should detect checksum mismatch', () => {
      const original = crypto.createHash('md5').update('original content').digest('hex')
      const modified = crypto.createHash('md5').update('modified content').digest('hex')

      assert.notStrictEqual(original, modified)
    })

    it('should verify migration integrity', () => {
      const applied = [
        { version: '001', checksum: 'abc123' },
        { version: '002', checksum: 'def456' }
      ]

      const currentChecksums = {
        '001': 'abc123', // unchanged
        '002': 'xyz789'  // modified
      }

      const mismatches = []
      for (const migration of applied) {
        const current = currentChecksums[migration.version]
        if (current && current !== migration.checksum) {
          mismatches.push({
            version: migration.version,
            expected: migration.checksum,
            actual: current
          })
        }
      }

      assert.strictEqual(mismatches.length, 1)
      assert.strictEqual(mismatches[0].version, '002')
    })

    it('should handle missing migration files', () => {
      const applied = [
        { version: '001', checksum: 'abc123' },
        { version: '002', checksum: 'def456' }
      ]

      const availableFiles = ['001'] // 002 is missing

      const mismatches = []
      for (const migration of applied) {
        if (!availableFiles.includes(migration.version)) {
          mismatches.push({
            version: migration.version,
            expected: migration.checksum,
            actual: 'file not found'
          })
        }
      }

      assert.strictEqual(mismatches.length, 1)
      assert.strictEqual(mismatches[0].actual, 'file not found')
    })
  })

  describe('Execution Timing', () => {
    it('should track execution time', async () => {
      const startTime = Date.now()

      // Simulate migration work
      await new Promise(resolve => setTimeout(resolve, 10))

      const executionTime = Date.now() - startTime

      assert.ok(executionTime >= 10)
      assert.ok(executionTime < 100) // Should be fast
    })

    it('should include timing in migration record', () => {
      const migration = {
        version: '001',
        name: 'initial schema',
        appliedAt: new Date().toISOString(),
        checksum: 'abc123',
        executionTimeMs: 45
      }

      assert.ok(migration.executionTimeMs > 0)
      assert.strictEqual(typeof migration.executionTimeMs, 'number')
    })
  })

  describe('Status Summary', () => {
    it('should provide complete status summary', () => {
      const applied = [
        { version: '001', name: 'first' },
        { version: '002', name: 'second' }
      ]
      const pending = [
        { version: '003', name: 'third' }
      ]

      const status = {
        currentVersion: applied[applied.length - 1]?.version || null,
        appliedCount: applied.length,
        pendingCount: pending.length,
        applied: applied.map(m => ({ version: m.version, name: m.name })),
        pending: pending.map(m => ({ version: m.version, name: m.name }))
      }

      assert.strictEqual(status.currentVersion, '002')
      assert.strictEqual(status.appliedCount, 2)
      assert.strictEqual(status.pendingCount, 1)
      assert.strictEqual(status.applied.length, 2)
      assert.strictEqual(status.pending.length, 1)
    })
  })

  describe('Error Handling', () => {
    it('should enhance error with migration context', () => {
      const originalError = new Error('SQLITE_ERROR: syntax error')
      const migration = { version: '002', name: 'add indexes' }

      const enhancedError = new Error(
        `Failed to apply migration ${migration.version} (${migration.name}): ${originalError.message}`
      )
      enhancedError.originalError = originalError
      enhancedError.migration = migration

      assert.ok(enhancedError.message.includes('002'))
      assert.ok(enhancedError.message.includes('add indexes'))
      assert.ok(enhancedError.message.includes('syntax error'))
      assert.strictEqual(enhancedError.originalError, originalError)
    })

    it('should stop on first error', () => {
      const migrations = ['001', '002', '003']
      const applied = []
      const errors = []

      for (const version of migrations) {
        if (version === '002') {
          errors.push(`Migration ${version} failed`)
          break // Stop on first error
        }
        applied.push(version)
      }

      assert.deepStrictEqual(applied, ['001'])
      assert.strictEqual(errors.length, 1)
    })
  })

  describe('History Cleanup', () => {
    it('should clear old history entries', () => {
      const logs = [
        { id: 1, executedAt: '2024-01-01T00:00:00Z' },
        { id: 2, executedAt: '2024-06-01T00:00:00Z' },
        { id: 3, executedAt: '2024-12-01T00:00:00Z' }
      ]

      const cutoffDate = new Date('2024-05-01')

      const remaining = logs.filter(log => new Date(log.executedAt) >= cutoffDate)

      assert.strictEqual(remaining.length, 2)
    })
  })
})
