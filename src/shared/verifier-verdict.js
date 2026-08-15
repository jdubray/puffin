/**
 * Reading the DoRC verifier's answer.
 *
 * GLM replies to POST /verify with `{run: {gateResults: {gates: [...]},
 * overallPass}}`. Both readers in Puffin looked for `result.gates`, found
 * nothing, and drew opposite wrong conclusions from the same empty array: the
 * Sekkei view's `gates.every(...)` is vacuously TRUE, so it reported every gate
 * green while never showing one; the board's check required a non-empty list,
 * so no card could ever pass the Ready gate.
 *
 * Hence one reader, in one place, with the vacuous case named: an empty gate
 * list is not a pass. "The verifier returned nothing" and "everything is fine"
 * are different answers, and a gate that cannot tell them apart is not a gate.
 *
 * @module shared/verifier-verdict
 */

/** Whether one gate object passed, under either spelling. @private */
function gatePassed(gate) {
  return (gate?.passed ?? gate?.ok) === true
}

/**
 * Normalise a verifier response into a verdict.
 *
 * Tolerant about where the gates live because this payload has had three
 * shapes; strict about what counts as a pass.
 *
 * @param {Object} result - The `result` field of glm:verify
 * @returns {{gates: Array<Object>, passed: boolean, failed: Array<Object>,
 *            total: number, passedCount: number, empty: boolean}}
 */
export function readVerifierRun(result) {
  const run = result?.run || result || {}
  const gates =
    run.gateResults?.gates ||
    run.gates ||
    result?.gates ||
    result?.results ||
    []
  const list = Array.isArray(gates) ? gates : []
  const failed = list.filter(gate => !gatePassed(gate))

  // overallPass is the server's own verdict; trust it when it is there, but
  // never let a missing one turn an empty list into success.
  const declared = run.overallPass ?? result?.ok ?? result?.passed
  const passed = list.length > 0 && failed.length === 0 &&
    (declared === undefined || declared === true)

  return {
    gates: list,
    failed,
    passed,
    total: list.length,
    passedCount: list.length - failed.length,
    empty: list.length === 0
  }
}

/**
 * Name the gates that refused and what each one wants.
 *
 * A bare "the verifier said no" sends someone to run the verifier by hand to
 * learn the same thing. The issues a gate reports ARE the work item.
 *
 * @param {Object} verdict - From {@link readVerifierRun}
 * @returns {string}
 */
export function describeVerdict(verdict) {
  if (verdict.empty) {
    return 'the DoRC verifier returned no gates — treat that as unproven, not as a pass'
  }
  if (verdict.failed.length === 0) return 'all gates green'
  return verdict.failed
    .map(gate => {
      const issues = (gate.issues || []).filter(Boolean)
      const name = gate.name || gate.gate || '?'
      return issues.length > 0 ? `${name}: ${issues.join('; ')}` : name
    })
    .join(' · ')
}
