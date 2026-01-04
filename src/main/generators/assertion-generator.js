/**
 * Assertion Generator
 *
 * Generates inspection assertions from user story acceptance criteria.
 * Uses heuristic pattern matching to derive appropriate assertion types.
 *
 * @module generators/assertion-generator
 */

/**
 * Assertion types - must match shared/inspection-assertions.js
 */
const AssertionType = {
  FILE_EXISTS: 'FILE_EXISTS',
  FILE_CONTAINS: 'FILE_CONTAINS',
  JSON_PROPERTY: 'JSON_PROPERTY',
  EXPORT_EXISTS: 'EXPORT_EXISTS',
  CLASS_STRUCTURE: 'CLASS_STRUCTURE',
  FUNCTION_SIGNATURE: 'FUNCTION_SIGNATURE',
  IMPORT_EXISTS: 'IMPORT_EXISTS',
  IPC_HANDLER_REGISTERED: 'IPC_HANDLER_REGISTERED',
  CSS_SELECTOR_EXISTS: 'CSS_SELECTOR_EXISTS',
  PATTERN_MATCH: 'PATTERN_MATCH'
}

/**
 * Pattern definitions for deriving assertions from acceptance criteria
 * Each pattern has:
 * - regex: Pattern to match in the criterion text
 * - type: Assertion type to generate
 * - extract: Function to extract assertion parameters from the match
 */
const ASSERTION_PATTERNS = [
  // File/directory existence patterns
  {
    regex: /(?:create|add|new|exists?|have)\s+(?:a\s+)?(?:new\s+)?(?:file|module)\s+(?:called\s+|named\s+|at\s+)?["'`]?([^\s"'`]+\.(?:js|ts|jsx|tsx|css|json|md|html))["'`]?/i,
    type: AssertionType.FILE_EXISTS,
    extract: (match) => ({
      target: match[1],
      assertion: { type: 'file' },
      message: `File ${match[1]} should exist`
    })
  },
  {
    regex: /(?:create|add|new|exists?|have)\s+(?:a\s+)?(?:new\s+)?directory\s+(?:called\s+|named\s+|at\s+)?["'`]?([^\s"'`]+)["'`]?/i,
    type: AssertionType.FILE_EXISTS,
    extract: (match) => ({
      target: match[1],
      assertion: { type: 'directory' },
      message: `Directory ${match[1]} should exist`
    })
  },
  {
    regex: /(?:file|module)\s+["'`]?([^\s"'`]+\.(?:js|ts|jsx|tsx))["'`]?\s+(?:should\s+)?(?:exist|be\s+created)/i,
    type: AssertionType.FILE_EXISTS,
    extract: (match) => ({
      target: match[1],
      assertion: { type: 'file' },
      message: `File ${match[1]} should exist`
    })
  },

  // Class/component patterns
  {
    regex: /(?:create|add|implement|define|have)\s+(?:a\s+)?(?:new\s+)?(?:class|component)\s+(?:called\s+|named\s+)?["'`]?(\w+)["'`]?/i,
    type: AssertionType.CLASS_STRUCTURE,
    extract: (match) => ({
      target: 'src/**/*.{js,ts,jsx,tsx}',
      assertion: { class_name: match[1] },
      message: `Class ${match[1]} should be defined`
    })
  },
  {
    regex: /(?:class|component)\s+["'`]?(\w+)["'`]?\s+(?:should\s+)?(?:have|contain|include)\s+(?:method|function)s?\s+(?:called\s+|named\s+)?["'`]?(\w+)["'`]?/i,
    type: AssertionType.CLASS_STRUCTURE,
    extract: (match) => ({
      target: 'src/**/*.{js,ts,jsx,tsx}',
      assertion: { class_name: match[1], methods: [match[2]] },
      message: `Class ${match[1]} should have method ${match[2]}`
    })
  },
  {
    regex: /["'`]?(\w+)["'`]?\s+(?:class|component)\s+(?:should\s+)?(?:extends?|inherits?\s+from)\s+["'`]?(\w+)["'`]?/i,
    type: AssertionType.CLASS_STRUCTURE,
    extract: (match) => ({
      target: 'src/**/*.{js,ts,jsx,tsx}',
      assertion: { class_name: match[1], extends: match[2] },
      message: `Class ${match[1]} should extend ${match[2]}`
    })
  },

  // Function patterns
  {
    regex: /(?:create|add|implement|define|have)\s+(?:a\s+)?(?:new\s+)?(?:async\s+)?function\s+(?:called\s+|named\s+)?["'`]?(\w+)["'`]?/i,
    type: AssertionType.FUNCTION_SIGNATURE,
    extract: (match, fullText) => ({
      target: 'src/**/*.{js,ts}',
      assertion: {
        function_name: match[1],
        async: /async\s+function/i.test(fullText)
      },
      message: `Function ${match[1]} should be defined`
    })
  },
  {
    regex: /function\s+["'`]?(\w+)["'`]?\s+(?:should\s+)?(?:accept|take|have)\s+(?:parameter|argument)s?\s+["'`]?(\w+)["'`]?/i,
    type: AssertionType.FUNCTION_SIGNATURE,
    extract: (match) => ({
      target: 'src/**/*.{js,ts}',
      assertion: { function_name: match[1], parameters: [match[2]] },
      message: `Function ${match[1]} should have parameter ${match[2]}`
    })
  },

  // Export patterns
  {
    regex: /(?:module|file)\s+(?:should\s+)?exports?\s+["'`]?(\w+)["'`]?/i,
    type: AssertionType.EXPORT_EXISTS,
    extract: (match) => ({
      target: 'src/**/*.{js,ts}',
      assertion: { exports: [{ name: match[1], type: 'any' }] },
      message: `Module should export ${match[1]}`
    })
  },
  {
    regex: /exports?\s+(?:a\s+)?(?:class|function|const)\s+(?:called\s+|named\s+)?["'`]?(\w+)["'`]?/i,
    type: AssertionType.EXPORT_EXISTS,
    extract: (match, fullText) => {
      let type = 'any'
      if (/export.*class/i.test(fullText)) type = 'class'
      else if (/export.*function/i.test(fullText)) type = 'function'
      else if (/export.*const/i.test(fullText)) type = 'const'
      return {
        target: 'src/**/*.{js,ts}',
        assertion: { exports: [{ name: match[1], type }] },
        message: `Module should export ${type} ${match[1]}`
      }
    }
  },

  // IPC handler patterns (Electron-specific)
  {
    regex: /(?:register|add|create|handle)\s+(?:an?\s+)?IPC\s+(?:handler|channel)\s+(?:for\s+|called\s+|named\s+)?["'`]?([:\w-]+)["'`]?/i,
    type: AssertionType.IPC_HANDLER_REGISTERED,
    extract: (match) => ({
      target: 'src/main/ipc-handlers.js',
      assertion: { handlers: [match[1]] },
      message: `IPC handler ${match[1]} should be registered`
    })
  },
  {
    regex: /IPC\s+(?:handler|channel)\s+["'`]?([:\w-]+)["'`]?\s+(?:should\s+)?(?:be\s+)?(?:registered|available)/i,
    type: AssertionType.IPC_HANDLER_REGISTERED,
    extract: (match) => ({
      target: 'src/main/ipc-handlers.js',
      assertion: { handlers: [match[1]] },
      message: `IPC handler ${match[1]} should be registered`
    })
  },

  // CSS patterns
  {
    regex: /(?:add|create|define|have)\s+(?:a\s+)?CSS\s+(?:class|selector|style)\s+(?:for\s+|called\s+|named\s+)?["'`]?([.#]?[\w-]+)["'`]?/i,
    type: AssertionType.CSS_SELECTOR_EXISTS,
    extract: (match) => ({
      target: 'src/**/*.css',
      assertion: { selectors: [match[1].startsWith('.') || match[1].startsWith('#') ? match[1] : `.${match[1]}`] },
      message: `CSS selector ${match[1]} should be defined`
    })
  },
  {
    regex: /(?:styled?|button|input|form|modal|component)\s+(?:should\s+)?(?:have\s+)?(?:class|style)\s+["'`]?([.#]?[\w-]+)["'`]?/i,
    type: AssertionType.CSS_SELECTOR_EXISTS,
    extract: (match) => ({
      target: 'src/**/*.css',
      assertion: { selectors: [match[1].startsWith('.') || match[1].startsWith('#') ? match[1] : `.${match[1]}`] },
      message: `CSS selector ${match[1]} should be defined`
    })
  },

  // JSON property patterns
  {
    regex: /(?:package\.json|config|settings?)\s+(?:should\s+)?(?:have|contain|include)\s+(?:property\s+)?["'`]?([\w.]+)["'`]?/i,
    type: AssertionType.JSON_PROPERTY,
    extract: (match, fullText) => {
      let target = 'package.json'
      if (/config/i.test(fullText)) target = 'config.json'
      if (/settings/i.test(fullText)) target = 'settings.json'
      return {
        target,
        assertion: { path: match[1], operator: 'exists' },
        message: `${target} should have property ${match[1]}`
      }
    }
  },

  // File content patterns
  {
    regex: /file\s+["'`]?([^\s"'`]+)["'`]?\s+(?:should\s+)?(?:contain|include|have)\s+["'`]?([^"'`]+)["'`]?/i,
    type: AssertionType.FILE_CONTAINS,
    extract: (match) => ({
      target: match[1],
      assertion: { match: 'literal', content: match[2] },
      message: `File ${match[1]} should contain "${match[2]}"`
    })
  },

  // Import patterns
  {
    regex: /(?:file|module)\s+(?:should\s+)?imports?\s+["'`]?([^\s"'`]+)["'`]?\s+from\s+["'`]?([^\s"'`]+)["'`]?/i,
    type: AssertionType.IMPORT_EXISTS,
    extract: (match) => ({
      target: 'src/**/*.{js,ts}',
      assertion: { imports: [{ module: match[2], names: [match[1]] }] },
      message: `Module should import ${match[1]} from ${match[2]}`
    })
  },

  // Pattern matching for code quality
  {
    regex: /(?:should\s+)?(?:not\s+)?(?:contain|have|include)\s+(?:any\s+)?(?:console\.log|debugger|TODO)/i,
    type: AssertionType.PATTERN_MATCH,
    extract: (match, fullText) => {
      const patterns = {
        'console.log': 'console\\.log',
        'debugger': 'debugger',
        'TODO': 'TODO:'
      }
      const isNegative = /not\s+(?:contain|have)/i.test(fullText)
      let pattern = 'console\\.log'
      for (const [key, value] of Object.entries(patterns)) {
        if (fullText.toLowerCase().includes(key.toLowerCase())) {
          pattern = value
          break
        }
      }
      return {
        target: 'src/**/*.{js,ts}',
        assertion: { pattern, operator: isNegative ? 'absent' : 'present' },
        message: isNegative ? `Code should not contain ${pattern}` : `Code should contain ${pattern}`
      }
    }
  },

  // Database/migration patterns
  {
    regex: /(?:create|add)\s+(?:a\s+)?(?:database\s+)?migration\s+(?:for\s+|called\s+|named\s+)?["'`]?(\w+)["'`]?/i,
    type: AssertionType.FILE_EXISTS,
    extract: (match) => ({
      target: `src/main/database/migrations/*${match[1]}*.js`,
      assertion: { type: 'file' },
      message: `Migration for ${match[1]} should exist`
    })
  },

  // Test file patterns
  {
    regex: /(?:create|add|have)\s+(?:unit\s+)?tests?\s+(?:for\s+|in\s+)?["'`]?([^\s"'`]+)["'`]?/i,
    type: AssertionType.FILE_EXISTS,
    extract: (match) => {
      const name = match[1].replace(/\.(?:js|ts)$/, '')
      return {
        target: `tests/**/*${name}*.test.js`,
        assertion: { type: 'file' },
        message: `Tests for ${name} should exist`
      }
    }
  }
]

/**
 * Generate a unique assertion ID
 * @returns {string}
 */
function generateAssertionId() {
  return `IA${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
}

/**
 * Generate inspection assertions from a single acceptance criterion
 *
 * @param {string} criterion - The acceptance criterion text
 * @param {number} criterionIndex - Index of the criterion (for reference)
 * @returns {Object[]} Array of generated assertions
 */
function generateFromCriterion(criterion, criterionIndex) {
  const assertions = []

  for (const pattern of ASSERTION_PATTERNS) {
    const match = criterion.match(pattern.regex)
    if (match) {
      const extracted = pattern.extract(match, criterion)
      assertions.push({
        id: generateAssertionId(),
        type: pattern.type,
        criterion: `AC${criterionIndex + 1}`,
        target: extracted.target,
        assertion: extracted.assertion || {},
        message: extracted.message,
        generated: true
      })
    }
  }

  return assertions
}

/**
 * Generate inspection assertions from story title and description
 *
 * @param {string} title - Story title
 * @param {string} description - Story description
 * @returns {Object[]} Array of generated assertions
 */
function generateFromDescription(title, description) {
  const assertions = []
  const text = `${title} ${description}`

  for (const pattern of ASSERTION_PATTERNS) {
    const match = text.match(pattern.regex)
    if (match) {
      const extracted = pattern.extract(match, text)
      assertions.push({
        id: generateAssertionId(),
        type: pattern.type,
        criterion: 'description',
        target: extracted.target,
        assertion: extracted.assertion || {},
        message: extracted.message,
        generated: true
      })
    }
  }

  return assertions
}

/**
 * Deduplicate assertions based on type and target
 *
 * @param {Object[]} assertions - Array of assertions
 * @returns {Object[]} Deduplicated assertions
 */
function deduplicateAssertions(assertions) {
  const seen = new Map()

  for (const assertion of assertions) {
    const key = `${assertion.type}:${assertion.target}:${JSON.stringify(assertion.assertion)}`
    if (!seen.has(key)) {
      seen.set(key, assertion)
    }
  }

  return Array.from(seen.values())
}

/**
 * Generate inspection assertions from a user story
 *
 * @param {Object} story - The user story object
 * @param {string} story.title - Story title
 * @param {string} story.description - Story description
 * @param {string[]} story.acceptanceCriteria - Array of acceptance criteria
 * @returns {Object[]} Array of generated inspection assertions
 */
function generateAssertions(story) {
  const allAssertions = []

  // Generate from description
  if (story.title || story.description) {
    const descAssertions = generateFromDescription(
      story.title || '',
      story.description || ''
    )
    allAssertions.push(...descAssertions)
  }

  // Generate from each acceptance criterion
  if (story.acceptanceCriteria && Array.isArray(story.acceptanceCriteria)) {
    for (let i = 0; i < story.acceptanceCriteria.length; i++) {
      const criterion = story.acceptanceCriteria[i]
      if (typeof criterion === 'string' && criterion.trim()) {
        const criterionAssertions = generateFromCriterion(criterion, i)
        allAssertions.push(...criterionAssertions)
      }
    }
  }

  // Deduplicate
  return deduplicateAssertions(allAssertions)
}

/**
 * Suggest additional assertions based on story context
 *
 * @param {Object} story - The user story
 * @param {Object} projectContext - Optional project context (file patterns, etc.)
 * @returns {Object[]} Suggested assertions
 */
function suggestAssertions(story, projectContext = {}) {
  const suggestions = []
  const text = `${story.title} ${story.description} ${(story.acceptanceCriteria || []).join(' ')}`.toLowerCase()

  // Suggest test files for new features
  if (/(?:add|create|implement|new)\s+(?:feature|functionality|component)/i.test(text)) {
    suggestions.push({
      id: generateAssertionId(),
      type: AssertionType.FILE_EXISTS,
      criterion: 'suggested',
      target: 'tests/**/*.test.js',
      assertion: { type: 'file' },
      message: 'Feature should have associated tests',
      generated: true,
      suggested: true
    })
  }

  // Suggest documentation for public APIs
  if (/(?:api|endpoint|public|export)/i.test(text)) {
    suggestions.push({
      id: generateAssertionId(),
      type: AssertionType.PATTERN_MATCH,
      criterion: 'suggested',
      target: 'src/**/*.js',
      assertion: { pattern: '\\/\\*\\*', operator: 'present' },
      message: 'Public APIs should have JSDoc documentation',
      generated: true,
      suggested: true
    })
  }

  // Suggest IPC handlers for Electron features
  if (/(?:ipc|electron|main\s+process|renderer)/i.test(text)) {
    suggestions.push({
      id: generateAssertionId(),
      type: AssertionType.FILE_CONTAINS,
      criterion: 'suggested',
      target: 'src/main/preload.js',
      assertion: { match: 'regex', content: 'contextBridge\\.exposeInMainWorld' },
      message: 'IPC bridge should be configured in preload',
      generated: true,
      suggested: true
    })
  }

  return suggestions
}

/**
 * Assertion Generator class - main interface
 */
class AssertionGenerator {
  /**
   * Create an assertion generator
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = options
  }

  /**
   * Generate assertions for a story
   *
   * @param {Object} story - The user story
   * @param {Object} options - Generation options
   * @param {boolean} options.includeSuggestions - Include suggested assertions
   * @returns {Object} Generation result with assertions
   */
  generate(story, options = {}) {
    const assertions = generateAssertions(story)
    const result = {
      assertions,
      meta: {
        generatedAt: new Date().toISOString(),
        storyTitle: story.title,
        criteriaCount: story.acceptanceCriteria?.length || 0,
        assertionCount: assertions.length
      }
    }

    if (options.includeSuggestions) {
      result.suggestions = suggestAssertions(story, options.projectContext)
    }

    return result
  }

  /**
   * Get available assertion types
   * @returns {Object}
   */
  getAssertionTypes() {
    return AssertionType
  }

  /**
   * Get pattern descriptions for UI display
   * @returns {Object[]}
   */
  getPatternDescriptions() {
    return ASSERTION_PATTERNS.map(p => ({
      pattern: p.regex.source,
      type: p.type,
      example: this.getPatternExample(p.type)
    }))
  }

  /**
   * Get example text for a pattern type
   * @param {string} type
   * @returns {string}
   */
  getPatternExample(type) {
    const examples = {
      [AssertionType.FILE_EXISTS]: 'Create file "src/utils/helper.js"',
      [AssertionType.FILE_CONTAINS]: 'File should contain "export default"',
      [AssertionType.JSON_PROPERTY]: 'Package.json should have property "scripts.build"',
      [AssertionType.EXPORT_EXISTS]: 'Module should export "MyClass"',
      [AssertionType.CLASS_STRUCTURE]: 'Create class "UserService" with method "getUser"',
      [AssertionType.FUNCTION_SIGNATURE]: 'Add async function "fetchData" with parameter "url"',
      [AssertionType.IMPORT_EXISTS]: 'Module should import "useState" from "react"',
      [AssertionType.IPC_HANDLER_REGISTERED]: 'Register IPC handler "state:getData"',
      [AssertionType.CSS_SELECTOR_EXISTS]: 'Add CSS class ".btn-primary"',
      [AssertionType.PATTERN_MATCH]: 'Code should not contain console.log'
    }
    return examples[type] || ''
  }
}

module.exports = {
  AssertionGenerator,
  AssertionType,
  generateAssertions,
  generateFromCriterion,
  suggestAssertions
}
