#!/usr/bin/env node
/**
 * migrate-memory.js
 *
 * One-time migration from Puffin's CLAUDE_{branch}.md sentinel-based memory
 * to Claude Code's native memory directory (~/.claude/projects/.../memory/).
 *
 * What it does:
 *   1. Reads every .claude/CLAUDE_*.md in the project
 *   2. Splits on the <!-- puffin:generated-end --> sentinel
 *   3. Saves all after-sentinel content to the native memory directory as
 *      a branch-by-branch archive (migrated-branch-notes.md)
 *   4. Rewrites each branch file to contain only the Puffin-generated part
 *      (up to and including the sentinel)
 *
 * Safe to re-run: already-stripped files have no after-sentinel content and
 * are left unchanged.
 *
 * Usage:
 *   node scripts/migrate-memory.js [--dry-run] [/path/to/project]
 *
 * Without a project path, defaults to the Puffin repo (parent of this script).
 * Provide an absolute path to migrate any other Puffin-managed project.
 *
 * After running, review ~/.claude/projects/.../memory/migrated-branch-notes.md
 * and use /memory in Claude Code to promote anything worth keeping into
 * properly named topic files.
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')

const SENTINEL = '<!-- puffin:generated-end -->'
const DRY_RUN = process.argv.includes('--dry-run')
// Optional positional argument: path to target project root.
// Defaults to the Puffin repo itself (one level above this script).
const PROJECT_ARG = process.argv.find(a => !a.startsWith('-') && a !== process.execPath && !a.endsWith('migrate-memory.js'))

// Resolve the native memory directory for this project.
// Claude Code uses the absolute path with path separators replaced by dashes.
function getNativeMemoryDir(projectRoot) {
  // Normalise to forward slashes, then encode as the Claude Code project ID format.
  // Claude Code replaces both ':' and '/' with '-', so C:/Users/... → C--Users-...
  const normalized = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  const projectId = normalized.replace(/[:/]/g, '-')
  return path.join(os.homedir(), '.claude', 'projects', projectId, 'memory')
}

async function main() {
  const projectRoot = PROJECT_ARG ? path.resolve(PROJECT_ARG) : path.resolve(__dirname, '..')
  const claudeDir = path.join(projectRoot, '.claude')
  const memoryDir = getNativeMemoryDir(projectRoot)

  console.log(`Project root : ${projectRoot}`)
  console.log(`Claude dir  : ${claudeDir}`)
  console.log(`Memory dir  : ${memoryDir}`)
  if (DRY_RUN) console.log('DRY RUN — no files will be written\n')

  // Find all CLAUDE_*.md branch files (exclude CLAUDE.md and CLAUDE_base.md)
  let entries
  try {
    entries = await fs.readdir(claudeDir)
  } catch (err) {
    console.error(`Cannot read ${claudeDir}:`, err.message)
    process.exit(1)
  }

  const branchFiles = entries.filter(
    f => f.startsWith('CLAUDE_') && f.endsWith('.md') && f !== 'CLAUDE_base.md'
  )

  if (branchFiles.length === 0) {
    console.log('No branch files found — nothing to migrate.')
    return
  }

  const migrationSections = []
  let totalStripped = 0
  let totalBytes = 0

  for (const filename of branchFiles.sort()) {
    const filePath = path.join(claudeDir, filename)
    let content
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      console.warn(`  SKIP ${filename}: ${err.message}`)
      continue
    }

    const sentinelIdx = content.indexOf(SENTINEL)
    if (sentinelIdx === -1) {
      console.log(`  OK   ${filename} (no sentinel, skipping)`)
      continue
    }

    const puffinPart = content.slice(0, sentinelIdx + SENTINEL.length)
    const afterSentinel = content.slice(sentinelIdx + SENTINEL.length).trim()

    if (!afterSentinel) {
      console.log(`  OK   ${filename} (already clean)`)
      continue
    }

    const byteCount = Buffer.byteLength(afterSentinel, 'utf-8')
    console.log(`  MIGRATE ${filename} — ${(byteCount / 1024).toFixed(1)} KB after sentinel`)
    totalBytes += byteCount
    totalStripped++

    // Collect for archive
    const branchName = filename.replace(/^CLAUDE_/, '').replace(/\.md$/, '')
    migrationSections.push(`## ${branchName}\n\n${afterSentinel}`)

    // Rewrite branch file to contain only the Puffin-generated part
    if (!DRY_RUN) {
      await fs.writeFile(filePath, puffinPart + '\n', 'utf-8')
    }
  }

  if (totalStripped === 0) {
    console.log('\nAll branch files are already clean — nothing to migrate.')
    return
  }

  // Write archive to native memory directory
  const archivePath = path.join(memoryDir, 'migrated-branch-notes.md')
  const archiveHeader = [
    '---',
    'name: Migrated Branch Notes',
    'description: After-sentinel content migrated from CLAUDE_*.md branch files (Memory 2.0 migration)',
    'type: project',
    '---',
    '',
    '# Migrated Branch Notes',
    '',
    `> Migrated ${new Date().toISOString()} from ${totalStripped} CLAUDE_*.md files (${(totalBytes / 1024).toFixed(1)} KB total).`,
    '> Review this file and use /memory to promote valuable items into topic files.',
    '> This file can be deleted once reviewed.',
    '',
  ].join('\n')

  const archiveContent = archiveHeader + migrationSections.join('\n\n---\n\n') + '\n'

  if (!DRY_RUN) {
    await fs.mkdir(memoryDir, { recursive: true })
    await fs.writeFile(archivePath, archiveContent, 'utf-8')
  }

  console.log(`\nMigrated ${totalStripped} files (${(totalBytes / 1024).toFixed(1)} KB) to:`)
  console.log(`  ${archivePath}`)
  console.log('\nNext steps:')
  console.log('  1. Review migrated-branch-notes.md for anything not yet in MEMORY.md')
  console.log('  2. Delete it once reviewed (or let AutoDream consolidate it)')
  console.log('  3. Run: node scripts/migrate-memory.js to verify all files are clean')
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
