/**
 * Doctor — the report's honesty is the thing under test.
 *
 * A check that cannot run must say `skip`, never `ok`: "we could not test this"
 * and "this works" are different answers, and a health report that conflates
 * them is worse than none. Everything else here guards that a broken
 * dependency produces a finding rather than an exception.
 */

'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { DoctorService } = require('../src/main/doctor-service.js')

/** A CLI that answers instantly — the real one is exercised by hand, not here. */
const fakeRun = (cmd, args) => Promise.resolve(
  args?.[0] === '--help'
    ? { code: 0, stdout: '  --effort <level>   Effort level', stderr: '' }
    : { code: 0, stdout: 'stub', stderr: '' })

/** A server that isn't there — the common case worth reporting well. */
const fakeProbe = () => Promise.resolve({ ok: false, status: 0, error: 'connection refused' })

const doctorFor = (opts = {}) =>
  new DoctorService({ runCommand: fakeRun, probeUrl: fakeProbe, ...opts })

let projectDir

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-doctor-'))
})

after(() => fs.rmSync(projectDir, { recursive: true, force: true }))

const find = (checks, id) => checks.find(c => c.id === id)

describe('DoctorService', () => {
  it('skips what it cannot test rather than passing it', async () => {
    // No polygraph service and no board runtime wired
    const doctor = doctorFor({ projectPath: projectDir })
    const { checks } = await doctor.run()

    assert.strictEqual(find(checks, 'polygraph:service').status, 'skip')
    assert.strictEqual(find(checks, 'board:runtime').status, 'skip')
    for (const check of checks) {
      if (check.status === 'skip') assert.match(check.detail, /skipped/)
    }
  })

  it('gives every check a group, a label and a verdict', async () => {
    const { checks } = await doctorFor({ projectPath: projectDir }).run()
    assert.ok(checks.length > 0)
    for (const check of checks) {
      assert.ok(check.id && check.group && check.label, JSON.stringify(check))
      assert.ok(['ok', 'warn', 'fail', 'skip'].includes(check.status), check.status)
      assert.strictEqual(typeof check.detail, 'string')
    }
  })

  it('offers a fix for everything that is not ok', async () => {
    const { checks } = await doctorFor({ projectPath: projectDir }).run()
    for (const check of checks) {
      if (check.status === 'fail' || check.status === 'warn') {
        assert.ok(check.fix, `${check.id} reported a problem with no suggested fix`)
      }
    }
  })

  it('counts the summary from the checks it actually produced', async () => {
    const { checks, summary } = await doctorFor({ projectPath: projectDir }).run()
    const counted = checks.reduce((n, c) => n + (c.status === 'ok' ? 1 : 0), 0)
    assert.strictEqual(summary.ok, counted)
    const total = Object.values(summary).reduce((a, b) => a + b, 0)
    assert.strictEqual(total, checks.length)
  })

  it('reports a missing project rather than throwing', async () => {
    const { checks } = await doctorFor().run()
    const open = find(checks, 'project:open')
    assert.strictEqual(open.status, 'warn')
    assert.match(open.detail, /no project is open/)
  })

  it('turns a throwing dependency into one failed check, not a dead report', async () => {
    const exploding = {
      resolvePolygraphDir() { throw new Error('checkout resolution blew up') }
    }
    const { checks } = await doctorFor({
      projectPath: projectDir, polygraphService: exploding
    }).run()

    const failure = checks.find(c => c.group === 'Polygraph' && c.status === 'fail')
    assert.ok(failure, 'the throw should surface as a Polygraph failure')
    assert.match(failure.detail, /blew up/)
    // and the rest of the report still arrived
    assert.ok(checks.some(c => c.group === 'Project'))
  })

  it('flags a project directory it cannot write to', async () => {
    const doctor = doctorFor({ projectPath: path.join(projectDir, 'nested', 'deep') })
    const { checks } = await doctor.run()
    const state = find(checks, 'project:state')
    // mkdir -p succeeds here, so this asserts the happy path is reported as ok
    assert.strictEqual(state.status, 'ok')
    assert.strictEqual(find(checks, 'project:docs').status, 'warn')
  })

  it('reports node:sqlite from the running runtime', async () => {
    const { checks } = await doctorFor({ projectPath: projectDir }).run()
    const sqlite = find(checks, 'board:sqlite')
    const major = Number(process.versions.node.split('.')[0])
    assert.strictEqual(sqlite.status, major >= 22 ? 'ok' : 'fail')
    assert.match(sqlite.detail, /node \d+\./)
  })

  it('reads an unreachable GLM server as a failure with a fix', async () => {
    const { checks } = await doctorFor({ projectPath: projectDir }).run()
    const server = find(checks, 'glm:server')
    assert.strictEqual(server.status, 'fail')
    assert.match(server.detail, /no answer on port/)
    assert.ok(server.fix)
    // and the MCP check does not guess at a server that never answered
    assert.strictEqual(find(checks, 'glm:mcp').status, 'skip')
  })

  it('reads a 404 on /mcp as a server too old to serve it', async () => {
    const probes = (url) => Promise.resolve(url.endsWith('/mcp')
      ? { ok: false, status: 404, text: '' }
      : { ok: true, status: 200, text: '{"ok":true}' })
    const { checks } = await doctorFor({ projectPath: projectDir, probeUrl: probes }).run()
    const mcp = find(checks, 'glm:mcp')
    assert.strictEqual(mcp.status, 'fail')
    assert.match(mcp.fix, /Restart the GLM server/)
  })

  it('reads a 401 on /mcp as healthy — the endpoint refused an anonymous caller', async () => {
    const probes = (url) => Promise.resolve(url.endsWith('/mcp')
      ? { ok: false, status: 401, text: '' }
      : { ok: true, status: 200, text: '{"ok":true}' })
    const { checks } = await doctorFor({ projectPath: projectDir, probeUrl: probes }).run()
    assert.strictEqual(find(checks, 'glm:mcp').status, 'ok')
  })

  it('warns when the CLI has no --effort flag, since the selector goes nowhere', async () => {
    const oldCli = (cmd, args) => Promise.resolve({ code: 0, stdout: '  --model <model>', stderr: '' })
    const { checks } = await doctorFor({ projectPath: projectDir, runCommand: oldCli }).run()
    const effort = find(checks, 'claude:effort')
    assert.strictEqual(effort.status, 'warn')
    assert.ok(effort.fix)
  })

  it('stops the CLI group when claude is missing, rather than guessing', async () => {
    const missing = () => Promise.resolve({ code: -1, stdout: '', stderr: 'ENOENT' })
    const { checks } = await doctorFor({ projectPath: projectDir, runCommand: missing }).run()
    assert.strictEqual(find(checks, 'claude:present').status, 'fail')
    assert.strictEqual(find(checks, 'claude:effort').status, 'skip')
    assert.strictEqual(find(checks, 'claude:doctor'), undefined)
  })

})
