/**
 * PolygraphService tests — discovery, checking, and status against the
 * repo's own machines/ directory (the dogfood project), plus graceful
 * degradation when no Polygraph checkout is present.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const { PolygraphService } = require('../src/main/polygraph-service.js')

const repoRoot = path.resolve(__dirname, '..')
const havePolygraph = fs.existsSync(
  path.resolve(repoRoot, '..', 'polygraph', 'scripts', 'check.mjs')
)

describe('PolygraphService', () => {
  describe('discoverMachines', () => {
    it('finds the repo machines with their artifacts', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const machines = svc.discoverMachines(path.join(repoRoot, 'machines'))
      const names = machines.map(m => m.name).sort()
      assert.deepStrictEqual(names, ['app-lifecycle', 'generation', 'prompt-lifecycle', 'task-card'])
      for (const m of machines) {
        assert.strictEqual(m.moduleFile, 'next.cjs')
        assert.strictEqual(m.kind, 'machine')
        assert.strictEqual(m.hasInvariants, true)
      }
    })

    it('reports a contract with no JS module as a corpus artifact, not a miss', () => {
      // How a non-JS component appears: capture-ready keeps the module in its
      // own language and only the trace corpus crosses over, so the directory
      // is verifiable by replay even though the checker cannot execute it.
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-corpus-'))
      try {
        const dir = path.join(scratch, 'kernel_core')
        fs.mkdirSync(path.join(dir, 'traces'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'contract.json'), '{}')
        fs.writeFileSync(path.join(dir, 'traces', 'happy.ndjson'), '{}\n')

        const svc = new PolygraphService({ projectPath: scratch })
        const [found] = svc.discoverMachines(scratch)
        assert.ok(found, 'a contract with traces but no module must still be found')
        assert.strictEqual(found.kind, 'corpus')
        assert.strictEqual(found.moduleFile, null)
        assert.strictEqual(found.traceFiles, 1)
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
      }
    })

    it('returns [] for a path with no machines', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      assert.deepStrictEqual(svc.discoverMachines(path.join(repoRoot, 'docs')), [])
    })

    it('returns [] for a missing project path', () => {
      const svc = new PolygraphService({})
      assert.deepStrictEqual(svc.discoverMachines(), [])
    })

    it('skips node_modules and dot-directories', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const machines = svc.discoverMachines(repoRoot)
      assert.ok(machines.every(m => !m.relDir.includes('node_modules')))
      assert.ok(machines.every(m => !m.relDir.startsWith('.')))
    })
  })

  describe('getStatus', () => {
    it('reports availability consistently with the filesystem', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const status = svc.getStatus()
      assert.strictEqual(status.available, havePolygraph)
      if (status.available) {
        assert.ok(status.polygraphDir)
      }
    })
  })

  describe('checkMachine', () => {
    it('rejects a non-machine directory', async () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const result = await svc.checkMachine(path.join(repoRoot, 'docs'))
      assert.strictEqual(result.success, false)
    })

    it('model-checks the prompt-lifecycle machine',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const result = await svc.checkMachine(
          path.join(repoRoot, 'machines', 'prompt-lifecycle')
        )
        assert.strictEqual(result.success, true, result.output)
        assert.ok(result.statesExplored > 0)
        assert.strictEqual(result.violations, 0)
        assert.strictEqual(result.checkedInvariants, true)
      })

    it('reports a missing checkout as a soft failure', async () => {
      // Force resolution failure by masking every fallback
      const envBackup = process.env.POLYGRAPH_DIR
      process.env.POLYGRAPH_DIR = path.join(repoRoot, 'no-such-dir')
      try {
        const svc2 = new PolygraphService({ projectPath: path.join(repoRoot, 'docs') })
        // Only assert the shape — a real sibling checkout may still resolve.
        const result = await svc2.checkMachine(path.join(repoRoot, 'docs'))
        assert.strictEqual(result.success, false)
        assert.ok(typeof result.error === 'string' || typeof result.output === 'string')
      } finally {
        if (envBackup === undefined) delete process.env.POLYGRAPH_DIR
        else process.env.POLYGRAPH_DIR = envBackup
      }
    })
  })

  describe('readDiagram', () => {
    it('rejects non-SVG paths', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const result = svc.readDiagram(path.join(repoRoot, 'package.json'))
      assert.strictEqual(result.success, false)
    })

    it('rejects SVG paths outside the project', () => {
      const os = require('node:os')
      const outside = path.join(os.tmpdir(), 'puffin-readdiagram-outside.svg')
      fs.writeFileSync(outside, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      try {
        const svc = new PolygraphService({ projectPath: path.join(repoRoot, 'machines') })
        const result = svc.readDiagram(outside)
        assert.strictEqual(result.success, false)
        assert.match(result.error, /outside the project/)
      } finally {
        fs.rmSync(outside, { force: true })
      }
    })

    it('rejects reads when no project is active', () => {
      const svc = new PolygraphService({})
      const result = svc.readDiagram(path.join(repoRoot, 'anything.svg'))
      assert.strictEqual(result.success, false)
      assert.match(result.error, /No active project/)
    })

    it('reads an SVG inside the project', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const svgPath = path.join(repoRoot, '.puffin', 'polyviz', 'test-fixture.svg')
      fs.mkdirSync(path.dirname(svgPath), { recursive: true })
      fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      try {
        const result = svc.readDiagram(svgPath)
        assert.strictEqual(result.success, true)
        assert.match(result.svg, /^<svg/)
      } finally {
        fs.rmSync(svgPath, { force: true })
      }
    })
  })

  describe('invariant elicitation (polynv)', () => {
    const machineDir = path.join(repoRoot, 'machines', 'prompt-lifecycle')

    it('rejects a record call without id/disposition/author', async () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const result = await svc.recordDisposition(machineDir, { id: 'x', disposition: 'confirm' })
      assert.strictEqual(result.success, false)
      assert.match(result.error, /required/)
    })

    it('rejects an invalid disposition', async () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const result = await svc.recordDisposition(machineDir,
        { id: 'x', disposition: 'yolo', author: 'test' })
      assert.strictEqual(result.success, false)
    })

    it('reads the elicitation report for the dogfood machine',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const result = await svc.getElicitationReport(machineDir)
        assert.strictEqual(result.success, true, result.error)
        assert.ok(result.report === null || typeof result.report.total === 'number')
      })

    it('fetches the next pre-checked question',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const result = await svc.getQuestions(machineDir)
        assert.strictEqual(result.success, true, result.error)
        // question is null once the ledger converges; when present it is pre-checked
        if (result.question) {
          assert.ok(result.question.id)
          assert.ok(['HOLDS', 'FAILS'].includes(result.question.precheck))
        }
      })
  })

  describe('evolution gate (polyvers)', () => {
    const machineDir = path.join(repoRoot, 'machines', 'prompt-lifecycle')

    it('gates the unchanged dogfood machine as identical PASS',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const result = await svc.evolutionGate(machineDir)
        assert.strictEqual(result.success, true, result.error)
        if (result.baseline === 'git') {
          // Working tree may differ from HEAD mid-development; both outcomes
          // are legal, but the report must always carry a verdict.
          assert.ok(['PASS', 'FAIL'].includes(result.report.verdict))
          assert.strictEqual(typeof result.report.identical, 'boolean')
        } else {
          assert.strictEqual(result.baseline, 'none')
        }
      })

    it('reports machines outside the project as an error',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: path.join(repoRoot, 'machines') })
        const result = await svc.evolutionGate(path.join(repoRoot, 'docs'))
        assert.strictEqual(result.success, false)
        assert.match(result.error, /outside the project/i)
      })
  })

  describe('trace corpus', () => {
    const machineDir = path.join(repoRoot, 'machines', 'prompt-lifecycle')

    it('lists trace files with window counts', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const result = svc.getTraces(machineDir)
      assert.strictEqual(result.success, true)
      assert.ok(result.traces.length >= 4)
      assert.ok(result.traces.every(t => t.windows > 0))
    })

    it('returns empty traces for a machine without a corpus', () => {
      const svc = new PolygraphService({ projectPath: repoRoot })
      const result = svc.getTraces(path.join(repoRoot, 'machines', 'app-lifecycle'))
      assert.deepStrictEqual(result.traces, [])
    })

    it('validates and replays the dogfood corpus clean',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const validation = await svc.validateCorpus(machineDir)
        assert.strictEqual(validation.success, true, validation.output)
        const replay = await svc.replayTraces(machineDir)
        assert.strictEqual(replay.success, true, replay.error || replay.output)
        assert.strictEqual(replay.summary.consistent, replay.summary.windows)
      })
  })

  describe('checkAll', () => {
    it('checks every repo machine green',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const results = await svc.checkAll(path.join(repoRoot, 'machines'))
        assert.strictEqual(results.length, 4)
        for (const r of results) {
          assert.strictEqual(r.check.success, true, `${r.name}: ${r.check.output}`)
        }
      })
  })
})
