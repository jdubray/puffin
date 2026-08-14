/**
 * Confirmed invariants as spec references.
 *
 * The point of these is what they DON'T carry: a sekkei spec links to the
 * ledger records, it never copies the predicate. A copied predicate is a
 * second home for the same fact, and the two diverge the moment one is edited.
 */

'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { PolygraphService } = require('../src/main/polygraph-service.js')

let projectDir
let machineDir

const LEDGER = {
  format: 'polynv-ledger/1',
  records: [
    {
      id: 'set-once:endedVia',
      target: 'transition',
      status: 'confirmed',
      question: "Once 'endedVia' is set, may it change again?",
      versions: [
        { js: '(pre, a, d, post) => pre.endedVia === ""', date: '2026-08-12T04:18:40.493Z', author: 'harvest' },
        { js: '(pre, a, d, post) => pre.endedVia === "" || post.endedVia === pre.endedVia', date: '2026-08-13T09:00:00.000Z', author: 'jj' }
      ]
    },
    { id: 'bounded:reworkCount', target: 'state', status: 'open', question: 'Can rework exceed 2?', versions: [] },
    { id: 'never:doneReopens', target: 'transition', status: 'rejected', question: 'Can done reopen?', versions: [] },
    { id: 'abandoned:one', target: 'state', status: 'abandoned', question: 'Stale idea', versions: [] }
  ]
}

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-inv-'))
  machineDir = path.join(projectDir, 'machines', 'task-card')
  fs.mkdirSync(machineDir, { recursive: true })
  fs.writeFileSync(path.join(machineDir, 'intent-ledger.json'), JSON.stringify(LEDGER))
})

after(() => fs.rmSync(projectDir, { recursive: true, force: true }))

function service() {
  const svc = new PolygraphService()
  svc.setProjectPath(projectDir)
  return svc
}

describe('getConfirmedInvariants', () => {
  it('returns only confirmed records', async () => {
    const res = await service().getConfirmedInvariants(machineDir)
    assert.strictEqual(res.success, true)
    assert.deepStrictEqual(res.invariants.map(i => i.id), ['set-once:endedVia'])
  })

  it('never carries the predicate — that stays in the ledger', async () => {
    const res = await service().getConfirmedInvariants(machineDir)
    const serialized = JSON.stringify(res.invariants)
    assert.ok(!serialized.includes('=>'), 'no predicate source may leak into the reference')
    assert.ok(!serialized.includes('js'), 'no js field on the reference')
    assert.ok(!('versions' in res.invariants[0]))
  })

  it('carries enough to find and judge the record', async () => {
    const [inv] = (await service().getConfirmedInvariants(machineDir)).invariants
    assert.strictEqual(inv.target, 'transition')
    assert.match(inv.question, /endedVia/)
    // Attribution comes from the LATEST version, not the first draft
    assert.strictEqual(inv.author, 'jj')
    assert.strictEqual(inv.confirmedAt, '2026-08-13T09:00:00.000Z')
  })

  it('reports an empty set rather than an error when no ledger exists', async () => {
    const bare = path.join(projectDir, 'machines', 'no-ledger')
    fs.mkdirSync(bare, { recursive: true })
    const res = await service().getConfirmedInvariants(bare)
    assert.strictEqual(res.success, true)
    assert.strictEqual(res.ledgerPath, null)
    assert.deepStrictEqual(res.invariants, [])
  })

  it('refuses a machine directory outside the project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-outside-'))
    try {
      const res = await service().getConfirmedInvariants(outside)
      assert.strictEqual(res.success, false)
      assert.match(res.error, /outside the project/)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('survives a malformed ledger without throwing', async () => {
    const broken = path.join(projectDir, 'machines', 'broken')
    fs.mkdirSync(broken, { recursive: true })
    fs.writeFileSync(path.join(broken, 'intent-ledger.json'), '{not json')
    const res = await service().getConfirmedInvariants(broken)
    assert.strictEqual(res.success, false)
    assert.ok(res.error)
  })
})
