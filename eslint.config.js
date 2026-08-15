/**
 * ESLint — the check that catches what the test suite cannot.
 *
 * This config exists for one rule. Three times now a free identifier has
 * shipped — `hasPendingUpdate`, `pluginManager`, `target` — each of which
 * parsed cleanly, passed 1500 tests, and threw ReferenceError the moment a
 * user clicked the thing. Renderer click handlers are exactly where unit tests
 * do not reach, so nothing but scope analysis was ever going to find them.
 *
 * Deliberately narrow: this is not a style pass. Style disagreements produce
 * noise, and a lint run people learn to ignore catches nothing. Everything
 * here is a rule about code that is wrong rather than code that is unfashionable.
 *
 * Puffin is three source dialects that need different globals, so they get
 * separate blocks rather than one permissive union that would let a renderer
 * file reference `require` unchallenged.
 */

'use strict'

/** Globals every dialect shares. */
const SHARED = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  crypto: 'readonly'
}

/** Node's CommonJS module scope — main process, tests, machine modules. */
const COMMONJS = {
  ...SHARED,
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly'
}

/** The browser surface the renderer actually uses. */
const BROWSER = {
  ...SHARED,
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
  MutationObserver: 'readonly',
  CSS: 'readonly',
  NodeFilter: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  MediaRecorder: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  Image: 'readonly',
  Audio: 'readonly',
  AudioContext: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  DOMParser: 'readonly',
  XMLSerializer: 'readonly',
  HTMLElement: 'readonly',
  Node: 'readonly',
  WebSocket: 'readonly',
  EventSource: 'readonly',
  performance: 'readonly',
  history: 'readonly',
  scrollTo: 'readonly',
  matchMedia: 'readonly'
}

/**
 * The rules. `no-undef` is the reason this file exists; the rest are the small
 * set of mistakes that are always mistakes.
 */
const RULES = {
  'no-undef': 'error',
  // A warning, not an error, and deliberately so: an unused variable is untidy
  // but it never breaks anything, and a gate that fails on tidiness is a gate
  // people start passing with --no-verify. Errors here are reserved for code
  // that is actually wrong, so `npx eslint .` clean means something.
  'no-unused-vars': ['warn', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
    ignoreRestSiblings: true
  }],
  'no-dupe-keys': 'error',
  'no-dupe-class-members': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
  // `catch {}` is intentional in this codebase and reads clearly; an empty
  // block anywhere else is a hole someone forgot to fill.
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-cond-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-obj-calls': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error'
}

module.exports = [
  {
    // Disable directives that name a rule this config does not enable are kept
    // on purpose: they document why the line is written the way it is, and
    // stripping them would leave the reasoning nowhere.
    linterOptions: { reportUnusedDisableDirectives: 'off' }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      '**/*.disabled/**',
      // Scratch checkouts that live in the tree but are not Puffin's source.
      'tmp/**',
      // A pre-built esbuild bundle — minified vendor output, not source.
      'plugins/excalidraw-plugin/renderer/excalidraw-bundle.js'
    ]
  },
  {
    // Main process, tests, scripts, machine modules: CommonJS.
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: COMMONJS
    },
    rules: RULES
  },
  {
    // Renderer and shared modules: ES modules in a browser.
    files: ['src/renderer/**/*.js', 'src/shared/**/*.js', 'plugins/**/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: BROWSER
    },
    rules: RULES
  },
  {
    // Preload straddles both: Node's require plus the browser it injects into.
    files: ['src/main/preload.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...COMMONJS, ...BROWSER }
    },
    rules: RULES
  },
  {
    // The older plugin tests are Jest-shaped: tests/helpers/test-compat
    // installs describe/it/expect/jest as globals at require time, so they are
    // genuinely defined - just not by anything a scope analyser can see.
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    }
  },
  {
    // Auxiliary tools that are ESM despite the .js extension.
    files: ['github-action-bot/**/*.js', 'test-dsl/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...COMMONJS, ...BROWSER }
    },
    rules: RULES
  },
  {
    // Invariants and scripts are ESM under Node.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: COMMONJS
    },
    rules: RULES
  }
]
