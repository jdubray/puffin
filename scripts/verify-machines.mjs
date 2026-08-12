#!/usr/bin/env node
/**
 * Verify every managed state machine under machines/.
 *
 * Each machine is an artifact directory (contract.json + next.cjs +
 * invariants.mjs) model-checked exhaustively by the Polygraph checker —
 * local, deterministic, no API key.
 *
 * The Polygraph checkout is resolved from POLYGRAPH_DIR (default: a
 * sibling checkout at ../polygraph, same convention as PolySec).
 *
 * Usage: node scripts/verify-machines.mjs [machine-name ...]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const machinesDir = path.join(repoRoot, 'machines')
const polygraphDir = path.resolve(repoRoot, process.env.POLYGRAPH_DIR || '../polygraph')
const checker = path.join(polygraphDir, 'scripts', 'check.mjs')

if (!existsSync(checker)) {
  console.error(`[verify-machines] Polygraph checker not found at ${checker}`)
  console.error('[verify-machines] Set POLYGRAPH_DIR or clone polygraph as a sibling checkout.')
  process.exit(2)
}

const requested = process.argv.slice(2)
const all = existsSync(machinesDir)
  ? readdirSync(machinesDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  : []
const targets = requested.length > 0 ? requested : all

if (targets.length === 0) {
  console.error('[verify-machines] No machines found under machines/')
  process.exit(2)
}

let failed = 0
for (const name of targets) {
  const dir = path.join(machinesDir, name)
  const spec = path.join(dir, 'next.cjs')
  const contract = path.join(dir, 'contract.json')
  const invariants = path.join(dir, 'invariants.mjs')

  for (const f of [spec, contract, invariants]) {
    if (!existsSync(f)) {
      console.error(`✗ ${name}: missing ${path.basename(f)}`)
      failed++
      continue
    }
  }

  const args = [checker, '--spec', spec, '--contract', contract, '--invariants', invariants]
  const res = spawnSync(process.execPath, args, { encoding: 'utf-8' })
  const out = `${res.stdout}${res.stderr}`.trim()

  if (res.status === 0 && out.includes('no invariant violations reachable')) {
    const states = out.match(/states explored: (\d+)/)?.[1] ?? '?'
    console.log(`✓ ${name} — ${states} states explored, no invariant violations reachable`)
  } else {
    failed++
    console.error(`✗ ${name} — model check FAILED`)
    console.error(out.split('\n').map(l => `    ${l}`).join('\n'))
  }
}

process.exit(failed > 0 ? 1 : 0)
