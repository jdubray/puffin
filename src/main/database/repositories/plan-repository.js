/**
 * Plan Repository
 *
 * A plan is an approved Claude Code plan that produced tasks on the board.
 * The markdown lives in docs/plans/; the board_plans table links it to its tasks
 * (the name avoids CRE's legacy `plans` table in older databases).
 *
 * @module database/repositories/plan-repository
 */

const { BaseRepository } = require('./base-repository')

const PlanStatus = Object.freeze({
  APPROVED: 'approved',
  ARCHIVED: 'archived'
})

class PlanRepository extends BaseRepository {
  /**
   * @param {Object} connection - Database connection wrapper
   */
  constructor(connection) {
    super(connection, 'board_plans')
  }

  _rowToPlan(row) {
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      filePath: row.file_path,
      branchId: row.branch_id,
      sourcePromptId: row.source_prompt_id,
      status: row.status,
      createdAt: row.created_at,
      approvedAt: row.approved_at
    }
  }

  /**
   * @param {Object} plan - `{ id, title, filePath, branchId?, sourcePromptId?, status? }`
   * @returns {Object} Created plan
   */
  create(plan) {
    const db = this.getDb()
    const now = this.now()
    db.prepare(`
      INSERT INTO board_plans (id, title, file_path, branch_id, source_prompt_id, status, created_at, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plan.id,
      plan.title,
      plan.filePath,
      plan.branchId || null,
      plan.sourcePromptId || null,
      plan.status || PlanStatus.APPROVED,
      plan.createdAt || now,
      plan.approvedAt || now
    )
    return this.findById(plan.id)
  }

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  findById(id) {
    const row = this.getDb().prepare('SELECT * FROM board_plans WHERE id = ?').get(id)
    return this._rowToPlan(row)
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.branchId]
   * @param {string} [options.status]
   * @returns {Object[]} Newest first
   */
  findAll({ branchId, status } = {}) {
    const clauses = []
    const params = []
    if (branchId) { clauses.push('branch_id = ?'); params.push(branchId) }
    if (status) { clauses.push('status = ?'); params.push(status) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.getDb().prepare(`SELECT * FROM board_plans ${where} ORDER BY created_at DESC`).all(...params).map(r => this._rowToPlan(r))
  }

  /**
   * @param {string} id
   * @param {Object} updates - `{ title?, status?, filePath? }`
   * @returns {Object|null}
   */
  update(id, updates = {}) {
    const existing = this.findById(id)
    if (!existing) return null
    const merged = { ...existing, ...updates }
    this.getDb().prepare('UPDATE board_plans SET title = ?, file_path = ?, branch_id = ?, status = ? WHERE id = ?')
      .run(merged.title, merged.filePath, merged.branchId || null, merged.status, id)
    return this.findById(id)
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    return this.getDb().prepare('DELETE FROM board_plans WHERE id = ?').run(id).changes > 0
  }
}

module.exports = { PlanRepository, PlanStatus }
