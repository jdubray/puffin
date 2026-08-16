/**
 * Can this verifier even run here?
 *
 * A gate that refuses is evidence. A gate that never ran is not — and the two
 * are indistinguishable from an exit code, which is how eight cards can fail
 * their acceptance verifier at once and be sent back to implementing for a
 * defect none of them has.
 *
 * That is not hypothetical. A real spec store declared every verifier as
 * `bun test polysim/src/x.test.mjs` while the session runs INSIDE polysim, so
 * every command named a path one directory too high. Bun exits non-zero for a
 * missing file exactly as it does for a failing assertion, and the board read
 * eight structural mistakes as eight broken components.
 *
 * So the path arguments are checked before the command is spawned. This is
 * deliberately not a fixer: it does not strip the offending prefix and run the
 * command it thinks was meant. A verifier that names the wrong file is a defect
 * in the design of record, and quietly correcting it at the gate would leave
 * the sekkei wrong forever while every card went green.
 *
 * @module verifier-command
 */

'use strict'

const fs = require('fs')
const path = require('path')

/** Shell operators and redirections — not paths, whatever they contain. */
const OPERATORS = new Set(['&&', '||', ';', '|', '>', '>>', '<', '2>&1'])

/**
 * The arguments of a command that look like paths into the repository.
 *
 * Conservative on purpose: a token is a candidate only if it carries a
 * separator and no glob or variable, so `bun test` (a subcommand) and
 * `--reporter=dot` (a flag) are never mistaken for files. Anything unrecognised
 * is left alone rather than guessed at — the check may miss a bad path, but it
 * must never invent one.
 *
 * @param {string} command
 * @returns {string[]}
 */
function pathArguments(command) {
  return String(command || '')
    .split(/\s+/)
    .filter(token =>
      token &&
      !OPERATORS.has(token) &&
      !token.startsWith('-') &&
      /[/\\]/.test(token) &&
      !/[*?![\]{}$%]/.test(token) &&
      !/^[a-z]+:\/\//i.test(token))
    .map(token => token.replace(/^['"]|['"]$/g, ''))
}

/**
 * Check a verifier command against the project it will run in.
 *
 * @param {string} command
 * @param {string} projectPath
 * @returns {{runnable: boolean, missing: string[], checked: string[], reason?: string}}
 */
function inspectVerifier(command, projectPath) {
  const checked = pathArguments(command)
  if (!projectPath || checked.length === 0) {
    return { runnable: true, missing: [], checked }
  }

  const missing = checked.filter(target => {
    const resolved = path.isAbsolute(target) ? target : path.join(projectPath, target)
    return !fs.existsSync(resolved)
  })

  if (missing.length === 0) return { runnable: true, missing: [], checked }

  // Say what it probably meant, without acting on it. A path that exists one
  // level down is the root-prefix mistake, and naming it saves the reader the
  // hunt — but the fix belongs in the spec, not in the runner.
  const hints = missing
    .map(target => {
      const withoutFirst = target.split(/[/\\]/).slice(1).join('/')
      return withoutFirst && fs.existsSync(path.join(projectPath, withoutFirst))
        ? `${target} (but ${withoutFirst} exists — the spec is rooted one directory too high)`
        : target
    })

  return {
    runnable: false,
    missing,
    checked,
    reason: `the verifier names ${missing.length === 1 ? 'a path' : 'paths'} that ` +
      `${missing.length === 1 ? 'does' : 'do'} not exist here: ${hints.join('; ')}`
  }
}

module.exports = { inspectVerifier, pathArguments }
