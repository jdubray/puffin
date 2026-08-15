/**
 * What a card's session actually touched.
 *
 * A prompt spec declares OUTPUTS: the files this component is allowed to
 * produce. A session that writes somewhere else may have a perfectly good
 * reason — but the one case that matters is the one that looks identical from
 * the outside: a session facing a red gate can fix the code, or it can edit
 * the test until the gate turns green. The second leaves the defect in place
 * and disables the alarm.
 *
 * Puffin cannot tell those apart, and should not try. What it can do is make
 * sure the question is asked. Before this existed, an out-of-scope edit was
 * visible only as prose partway down a transcript the reader scrolls past —
 * the session had said so plainly and it still went unnoticed, which is the
 * whole argument for surfacing it structurally.
 *
 * Comparison is by git working-tree status, taken before and after the turn,
 * because it is the one account of what changed that does not depend on the
 * session's own report of itself.
 *
 * @module session-scope
 */

'use strict'

/**
 * Parse `git status --porcelain -uall` into path → status code.
 *
 * @param {string} stdout
 * @returns {Map<string, string>}
 */
function parsePorcelain(stdout) {
  const entries = new Map()
  for (const line of String(stdout || '').split('\n')) {
    if (line.length < 4) continue
    const code = line.slice(0, 2)
    let filePath = line.slice(3).trim()
    // A rename reads "R  old -> new"; the new path is what exists now.
    const arrow = filePath.indexOf(' -> ')
    if (arrow >= 0) filePath = filePath.slice(arrow + 4)
    // Porcelain quotes paths containing spaces or non-ASCII.
    if (filePath.startsWith('"') && filePath.endsWith('"')) filePath = filePath.slice(1, -1)
    entries.set(normalise(filePath), code)
  }
  return entries
}

/** Forward slashes, no leading ./ — one spelling for comparisons. @private */
function normalise(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '').trim()
}

/**
 * Paths that appeared or changed between two snapshots.
 *
 * A path whose status code changed counts: ' M' → 'M ' is the same edit being
 * staged, but '??' → ' M' is not, and telling them apart is not worth being
 * wrong about. Disappearing paths are ignored — a file that went back to clean
 * was not left changed by this turn.
 *
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string[]} sorted
 */
function changedPaths(before, after) {
  const changed = []
  for (const [filePath, code] of after) {
    if (before.get(filePath) !== code) changed.push(filePath)
  }
  return changed.sort()
}

/**
 * Does a changed path answer to one of the card's declared outputs?
 *
 * Matched from the right, at a path boundary, because the two are rooted
 * differently in practice: a spec written as `polysim/src/kernel.mjs` names the
 * same file as `src/kernel.mjs` when the session runs inside `polysim`. Being
 * strict here would flag every legitimate output as out of scope, and a warning
 * that fires on everything gets read as noise — which is the failure this whole
 * module exists to avoid.
 *
 * @param {string} filePath
 * @param {string[]} outputs
 * @returns {boolean}
 */
function isDeclared(filePath, outputs) {
  const target = normalise(filePath)
  return outputs.map(normalise).filter(Boolean).some(output => {
    // A directory output declares its contents. Real specs name a component
    // that is a folder - `src/probes/` - and the session writes six modules
    // inside it; comparing strings reported all six as undeclared, which is a
    // warning firing on the design working exactly as written.
    if (output.endsWith('/')) {
      // Segment-wise, so the root tolerance above still applies: the spec's
      // `polysim/src/probes/` and the session's `src/probes/deep/x.mjs` line up
      // on the segments they share, and a sibling like `src/other/x.mjs` does not.
      const dir = output.slice(0, -1).split('/').filter(Boolean)
      const file = target.split('/').filter(Boolean)
      for (let n = Math.min(dir.length, file.length); n >= 1; n--) {
        if (dir.slice(-n).join('/') === file.slice(0, n).join('/')) return true
      }
      return false
    }
    return target === output ||
      target.endsWith(`/${output}`) ||
      output.endsWith(`/${target}`)
  })
}

/**
 * Compare a turn's file changes against the card's declared outputs.
 *
 * @param {Object} params
 * @param {string} params.before - porcelain stdout from before the turn
 * @param {string} params.after - porcelain stdout from after it
 * @param {string[]} [params.outputs] - the prompt spec's declared outputs
 * @returns {{changed: string[], declared: string[], outOfScope: string[]}}
 */
function compareScope({ before, after, outputs = [] }) {
  const changed = changedPaths(parsePorcelain(before), parsePorcelain(after))
  const declared = []
  const outOfScope = []
  for (const filePath of changed) {
    (isDeclared(filePath, outputs) ? declared : outOfScope).push(filePath)
  }
  return { changed, declared, outOfScope }
}

/**
 * Paths that deserve a sharper warning than the rest.
 *
 * An out-of-scope edit to a test or a fixture is the specific shape worth
 * stopping for: it is how a red gate becomes a green one without the code
 * changing. Everything else out of scope is worth seeing; this is worth
 * checking by hand.
 *
 * @param {string[]} paths
 * @returns {string[]}
 */
function gateAffecting(paths = []) {
  return paths.filter(p =>
    /(^|\/)(tests?|__tests__|spec)\//i.test(p) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p) ||
    /_test\.[a-z]+$/i.test(p) ||
    /(^|\/)test_[^/]+$/i.test(p) ||
    /(^|\/)fixtures?\//i.test(p) ||
    /(^|\/)conftest\.py$/i.test(p))
}

module.exports = { compareScope, parsePorcelain, changedPaths, isDeclared, gateAffecting }
