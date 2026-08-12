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
      assert.deepStrictEqual(names, ['app-lifecycle', 'prompt-lifecycle'])
      for (const m of machines) {
        assert.strictEqual(m.moduleFile, 'next.cjs')
        assert.strictEqual(m.hasInvariants, true)
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

  describe('checkAll', () => {
    it('checks every repo machine green',
      { skip: !havePolygraph && 'polygraph checkout not found' }, async () => {
        const svc = new PolygraphService({ projectPath: repoRoot })
        const results = await svc.checkAll(path.join(repoRoot, 'machines'))
        assert.strictEqual(results.length, 2)
        for (const r of results) {
          assert.strictEqual(r.check.success, true, `${r.name}: ${r.check.output}`)
        }
      })
  })
})
