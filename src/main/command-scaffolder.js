/**
 * command-scaffolder - Installs Puffin's bundled Claude Code slash commands
 * into a target project's `.claude/` directory.
 *
 * This is the ONLY thing Puffin writes under `.claude/`. As of 4.0 Puffin no
 * longer generates or swaps CLAUDE.md — "whatever is there is there". The sole
 * exception is the `/puffin-sync` command + helper script, which is the
 * foundation of the documentation-sync workflow and is installed here.
 */

const fs = require('fs').promises
const path = require('path')

/**
 * Copy Puffin's bundled slash commands and helper scripts into the target
 * project's `.claude/` so they are available without manual installation.
 *
 * Files are written only when missing or when their content differs from the
 * bundled template, so user disk churn is minimal and updates still propagate.
 * Failures are non-fatal — a project should still work without the commands.
 *
 * @param {string} claudeDir - Absolute path to the target project's `.claude` dir
 * @returns {Promise<void>}
 */
async function scaffoldCommands(claudeDir) {
  if (!claudeDir) return

  const templatesDir = path.join(__dirname, 'templates', 'puffin-sync')
  // Script is written as .cjs so it runs as CommonJS even in projects whose
  // package.json declares "type": "module" (Node would otherwise reject the
  // require()-based script as ESM).
  const targets = [
    { src: path.join(templatesDir, 'command.md'), dest: path.join(claudeDir, 'commands', 'puffin-sync.md') },
    { src: path.join(templatesDir, 'script.js'), dest: path.join(claudeDir, 'scripts', 'puffin-sync.cjs') }
  ]

  // Remove a stale .js copy left by earlier versions that emitted CommonJS
  // under a .js extension (breaks in ESM projects).
  try {
    await fs.unlink(path.join(claudeDir, 'scripts', 'puffin-sync.js'))
  } catch {
    // Not present — nothing to clean up
  }

  for (const { src, dest } of targets) {
    try {
      const desired = await fs.readFile(src, 'utf-8')
      let current = null
      try {
        current = await fs.readFile(dest, 'utf-8')
      } catch {
        // Destination does not exist yet — will be created below
      }
      if (current === desired) continue

      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, desired, 'utf-8')
    } catch (err) {
      console.error(`[Scaffold] Failed to scaffold command ${path.basename(dest)} (non-fatal):`, err.message)
    }
  }
}

module.exports = { scaffoldCommands }
