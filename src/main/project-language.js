/**
 * What language is this project, and does polygen apply?
 *
 * polygen authors SAM v2 modules in JavaScript. On a Python or Go project it
 * has nothing to emit, so a workflow that routes every component through it
 * would stall on the ones it cannot serve. Detection here lets the pipeline
 * choose a lane instead: generated-and-model-checked where polygen applies,
 * hand-written-and-acceptance-verified everywhere else.
 *
 * The verifier is a separate question. Polygraph's model checker reads a
 * machine's artifacts, so it applies wherever a machine exists — including one
 * a person wrote by hand. Losing polygen does not mean losing verification.
 *
 * @module project-language
 */

const fs = require('fs')
const path = require('path')

/**
 * Marker files, most specific first. TypeScript is checked before JavaScript
 * because a TS project also carries package.json.
 * @private
 */
const MARKERS = [
  { file: 'tsconfig.json', language: 'typescript' },
  { file: 'package.json', language: 'javascript' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'requirements.txt', language: 'python' },
  { file: 'setup.py', language: 'python' },
  { file: 'go.mod', language: 'go' },
  { file: 'Cargo.toml', language: 'rust' },
  { file: 'pom.xml', language: 'java' },
  { file: 'build.gradle', language: 'java' },
  { file: 'build.gradle.kts', language: 'kotlin' },
  { file: 'Gemfile', language: 'ruby' },
  { file: 'composer.json', language: 'php' },
  { file: 'mix.exs', language: 'elixir' }
]

/** Languages polygen can emit today. */
const POLYGEN_LANGUAGES = ['javascript', 'typescript']

/**
 * Detect a project's primary language from its build files.
 *
 * @param {string|null} projectPath
 * @returns {{language: string|null, evidence: string|null, polygenApplicable: boolean, verifierApplicable: boolean}}
 */
function detectProjectLanguage(projectPath) {
  if (!projectPath) {
    return { language: null, evidence: null, polygenApplicable: false, verifierApplicable: true }
  }

  for (const marker of MARKERS) {
    if (fs.existsSync(path.join(projectPath, marker.file))) {
      return {
        language: marker.language,
        evidence: marker.file,
        polygenApplicable: POLYGEN_LANGUAGES.includes(marker.language),
        // The model checker reads a machine's artifacts, not the host project's
        // build files — a hand-written machine verifies the same way.
        verifierApplicable: true
      }
    }
  }

  // Unknown is not the same as unsupported: say so rather than guessing JS.
  return { language: null, evidence: null, polygenApplicable: false, verifierApplicable: true }
}

/**
 * How a component should be built and proved, given the project and whether the
 * component is a state machine.
 *
 * Two lanes, and the split is deliberate: a model check is a proof over every
 * reachable state, an acceptance verifier is a set of examples. Where the
 * stronger one is available it should be used; where it isn't, saying so beats
 * pretending the weaker one is equivalent.
 *
 * @param {Object} params
 * @param {boolean} params.isStateMachine - Does this component hold state?
 * @param {string|null} params.language - From detectProjectLanguage
 * @returns {{lane: 'generated'|'authored'|'acceptance', generator: string|null, proof: string, why: string}}
 */
function validationLaneFor({ isStateMachine, language } = {}) {
  const polygen = POLYGEN_LANGUAGES.includes(language)

  if (!isStateMachine) {
    return {
      lane: 'acceptance',
      generator: null,
      proof: 'acceptance verifier',
      why: 'not a state machine — there is no state graph to check, so the acceptance spec\'s command is the proof'
    }
  }
  if (polygen) {
    return {
      lane: 'generated',
      generator: 'polygen',
      proof: 'model check over reachable states, then the acceptance verifier',
      why: 'a state machine in a language polygen emits — generated pre-verified, then proved exhaustively'
    }
  }
  return {
    lane: 'authored',
    generator: null,
    proof: 'model check over reachable states, then the acceptance verifier',
    why: `a state machine, but polygen does not emit ${language || 'this language'} — author the machine by hand; the checker still applies`
  }
}

module.exports = { detectProjectLanguage, validationLaneFor, POLYGEN_LANGUAGES }
