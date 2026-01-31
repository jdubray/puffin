/**
 * Tests for Status Engine
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { computeStatus, COMPLETED_STATUS } = require('../../../plugins/outcome-lifecycle-plugin/lib/status-engine')

describe('computeStatus', () => {
  // --- Empty / no stories ---

  it('should return not_started for empty array', () => {
    assert.strictEqual(computeStatus([]), 'not_started')
  })

  it('should return not_started for null', () => {
    assert.strictEqual(computeStatus(null), 'not_started')
  })

  it('should return not_started for undefined', () => {
    assert.strictEqual(computeStatus(undefined), 'not_started')
  })

  it('should return not_started for non-array', () => {
    assert.strictEqual(computeStatus('completed'), 'not_started')
  })

  // --- All not completed ---

  it('should return not_started when no stories are completed', () => {
    assert.strictEqual(computeStatus(['not_started', 'not_started']), 'not_started')
  })

  it('should return not_started for single non-completed story', () => {
    assert.strictEqual(computeStatus(['in_progress']), 'not_started')
  })

  it('should return not_started for mixed non-completed statuses', () => {
    assert.strictEqual(computeStatus(['not_started', 'in_progress', 'blocked']), 'not_started')
  })

  // --- All completed ---

  it('should return achieved when all stories are completed', () => {
    assert.strictEqual(computeStatus(['completed', 'completed']), 'achieved')
  })

  it('should return achieved for single completed story', () => {
    assert.strictEqual(computeStatus(['completed']), 'achieved')
  })

  it('should return achieved for many completed stories', () => {
    assert.strictEqual(computeStatus(Array(10).fill('completed')), 'achieved')
  })

  // --- Mixed ---

  it('should return in_progress when some stories are completed', () => {
    assert.strictEqual(computeStatus(['completed', 'not_started']), 'in_progress')
  })

  it('should return in_progress for one completed among many', () => {
    assert.strictEqual(computeStatus(['completed', 'not_started', 'in_progress']), 'in_progress')
  })

  it('should return in_progress for most completed but not all', () => {
    assert.strictEqual(computeStatus(['completed', 'completed', 'not_started']), 'in_progress')
  })
})

describe('COMPLETED_STATUS', () => {
  it('should equal "completed"', () => {
    assert.strictEqual(COMPLETED_STATUS, 'completed')
  })
})
