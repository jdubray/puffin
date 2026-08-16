/**
 * A verifier's output, made readable.
 *
 * It was being rendered as markdown, which is what a session's reply is and
 * what test output emphatically is not: markdown folds single newlines into
 * spaces, so 46 result lines arrived as one paragraph. Terminal output is
 * line-structured, and the lines are the information.
 *
 * The summary matters more than the log. What a reader wants first is "46 pass,
 * 0 fail" and, when something failed, the failures — not to scroll a wall of
 * green to find out there is nothing to find.
 *
 * @module renderer/lib/verifier-output
 */

/** ESC[…m and friends — a colour code is noise once the browser has CSS. */
const ANSI = /\[[0-9;?]*[a-zA-Z]/g

/** Runner-agnostic tallies. bun, vitest, jest and node --test all say this. */
const COUNTS = [
  { key: 'pass', re: /(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?\b/i },
  { key: 'fail', re: /(\d+)\s+(?:tests?\s+)?fail(?:ed|ing|ures?)?\b/i },
  { key: 'skip', re: /(\d+)\s+(?:tests?\s+)?(?:skipped|todo|pending)\b/i }
]

/**
 * Pull the tallies out of a run, if it stated any.
 *
 * Read from the END: a suite's own test names routinely contain the words
 * "fail" and "pass" ("refuses degenerate parameters", "0 failures expected"),
 * and the line that counts is the summary the runner prints last.
 *
 * @param {string} text
 * @returns {{pass: number|null, fail: number|null, skip: number|null}}
 */
export function summarise(text) {
  const lines = String(text || '').replace(ANSI, '').split('\n').reverse()
  const found = { pass: null, fail: null, skip: null }
  for (const line of lines) {
    for (const { key, re } of COUNTS) {
      if (found[key] === null) {
        const match = line.match(re)
        if (match) found[key] = Number(match[1])
      }
    }
    if (found.pass !== null && found.fail !== null) break
  }
  return found
}

/** How a single line should read. @private */
function classify(line) {
  if (/^\s*(\(fail\)|✗|×|FAIL\b|not ok\b)/i.test(line) || /\bfail(ed)?:/i.test(line)) return 'fail'
  if (/^\s*(\(pass\)|✓|√|ok\b|PASS\b)/i.test(line)) return 'pass'
  if (/^\s*\$/.test(line)) return 'cmd'
  if (/^\s*(at |\s+\^|Expected|Received|Diff)/.test(line)) return 'detail'
  return ''
}

/**
 * Split a run into the lines worth showing first and the rest.
 *
 * Passing lines are the bulk and the least informative; they collapse behind a
 * count. Failures, their surrounding context and anything unrecognised stay
 * out in the open.
 *
 * @param {string} text
 * @returns {{command: string, headline: Object, failures: string[], passes: number, rest: string[]}}
 */
export function splitOutput(text) {
  const lines = String(text || '').replace(ANSI, '').split('\n')
  const command = (lines.find(l => l.trim().startsWith('$')) || '').replace(/^\s*\$\s*/, '')
  const failures = []
  const rest = []
  let passes = 0

  for (const line of lines) {
    if (!line.trim()) continue
    const kind = classify(line)
    if (kind === 'cmd') continue
    if (kind === 'pass') { passes++; continue }
    if (kind === 'fail' || kind === 'detail') failures.push(line)
    else rest.push(line)
  }

  return { command, headline: summarise(text), failures, passes, rest }
}
