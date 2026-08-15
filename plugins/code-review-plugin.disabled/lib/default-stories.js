/**
 * Seed data: 11 review stories from docs/pending-stories-2026-04-23.md
 */
module.exports = [
  {
    id: '140af3da-86be-4c9b-b632-af7fa7d18a98',
    title: 'Database Integrity Review',
    description: 'As a developer, I want the nightly review to audit database operations so that data loss and constraint violation bugs are detected automatically.',
    acceptanceCriteria: [
      'Review scans all migration files for foreign keys missing ON DELETE CASCADE or an explicit ON DELETE RESTRICT/cleanup comment',
      'Review detects DELETE FROM statements in repository files that lack a prior DELETE FROM on dependent tables (no cascade)',
      'Review flags multi-step DB operations that are not wrapped in a transaction',
      'Review detects repository methods that write to the DB but do not subsequently reload in-memory state or call a refresh IPC handler',
      'Review checks that INSERT operations into tables with a UNIQUE constraint do not reuse caller-supplied IDs (must generate with uuidv4())',
      'Every finding includes: rule ID, file path, line number, confidence score',
      'Findings written to docs/database-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'DatabaseIntegrityReview',
    lastRunId: null
  },
  {
    id: '322562ed-ab61-4a3a-ac78-c2ae5b611d81',
    title: 'SAM State Management Review',
    description: 'As a developer, I want the nightly review to audit SAM pattern compliance so that state corruption and persistence bugs are detected early.',
    acceptanceCriteria: [
      'Review detects direct mutation of this.state.* inside SAM action handlers',
      'Review verifies that every string in persistActions whitelist also appears in the handler condition block, and vice versa',
      'Review checks that async IPC handlers guarded by a pending or isLoading flag clear that flag on ALL exit paths',
      'Review flags setInterval/setTimeout bodies that dispatch SAM actions without verifying app is still in valid state',
      'Review detects ID fields in objects passed to INSERT that use caller-supplied values where uniqueness is assumed',
      'Every finding includes: rule ID, file path, line number, confidence score',
      'Findings written to docs/sam-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'SamStateReview',
    lastRunId: null
  },
  {
    id: '4bcc363b-fb34-49cf-884f-e562745018ec',
    title: 'Aggregate and Publish Nightly Review Report',
    description: 'As a developer, I want a consolidated summary report from all nightly review stories so that I can see overall code health at a glance.',
    acceptanceCriteria: [
      'ReviewRunner executes all enabled review services in parallel and collects their findings',
      'Summary report written to docs/review-summary-YYYY-MM-DD.md with total finding counts by severity',
      'Critical issues (confidence >= 90) are listed individually in the summary with file + line',
      'A Puffin toast notification fires when the run completes',
      'Sprint is marked complete only if zero critical findings exist across all areas',
      'ReviewRunner exposes a dry-run mode that returns findings without writing files'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'ReviewRunner',
    lastRunId: null
  },
  {
    id: '5175256a-03b0-408a-8d37-a4376e3a4cad',
    title: 'Security Review',
    description: 'As a developer, I want the nightly review to audit XSS, injection, and path traversal vulnerabilities so that security issues are caught before they reach production.',
    acceptanceCriteria: [
      'Review detects innerHTML = or innerHTML += without a preceding escapeHtml() or escapeAttr() call',
      'Review flags file path construction using string concatenation not wrapped in path.resolve() or path.join()',
      'Review detects spawn() or exec() calls with shell: true where the command string includes a variable',
      'Review checks IPC handler bodies for direct use of user-supplied args in file operations or DB queries without prior validation',
      'Review flags AI response content passed directly to updateScene(), innerHTML, or eval() without sanitization',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/security-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'SecurityReview',
    lastRunId: null
  },
  {
    id: '578f291c-610d-4836-8d85-f109c1a67ebc',
    title: 'Claude Service Integration Review',
    description: 'As a developer, I want the nightly review to audit Claude CLI integration so that process management and metrics instrumentation gaps are detected.',
    acceptanceCriteria: [
      'Review checks that every call site of process.kill() or proc.kill() is paired with a Windows taskkill /T /F path',
      'Review detects spawn() calls using --print or maxTurns: 1 that still pass --allowedTools',
      'Review verifies that every sendPrompt() call site passes metricsComponent and metricsOperation options',
      'Review checks that MetricsService shutdown is called in the before-quit or will-quit handler',
      'Review flags result.content access on objects returned by sendPrompt() — should be result.response',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/claude-service-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'ClaudeServiceReview',
    lastRunId: null
  },
  {
    id: '8a2736c1-dc5d-4d4f-8373-9767881b4a3b',
    title: 'IPC Communication Review',
    description: 'As a developer, I want the nightly review to audit IPC handler patterns so that communication bugs and silent failures are caught automatically.',
    acceptanceCriteria: [
      'Review checks all ipcMain.handle() channel names match namespace:actionName pattern',
      'Review verifies all ipcMain.handle() return values are { success: Boolean, ... } objects',
      'Review flags renderer-side invoke() call sites that access result.data or result.error without checking result.success',
      'Review detects ipcMain.handle() registrations that occur inside createWindow() or after the BrowserWindow construction line',
      'Review checks that fire-and-forget notifications use ipcMain.on() not ipcMain.handle()',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/ipc-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'IpcCommunicationReview',
    lastRunId: null
  },
  {
    id: 'bb038e8d-c838-491e-9192-1dc14213024b',
    title: 'Memory Management Review',
    description: 'As a developer, I want the nightly review to audit event listener and timer lifecycle so that memory leaks in plugins and host services are caught.',
    acceptanceCriteria: [
      'Review detects addEventListener() or ipcMain.on() calls inside init() without matching removal in destroy()',
      'Review flags setInterval() or setTimeout() calls that store the handle but destroy() does not clear it',
      'Review checks that MetricsService shutdown is called during app quit',
      'Review detects plugin files where destroy() method is absent entirely',
      'Review flags module-level variables that accumulate references with no clear/reset path',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/memory-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'MemoryManagementReview',
    lastRunId: null
  },
  {
    id: 'c854f39e-a51e-4b16-b847-946464255acb',
    title: 'UI Components Review',
    description: 'As a developer, I want the nightly review to audit UI component patterns so that state synchronization bugs and display errors are caught automatically.',
    acceptanceCriteria: [
      'Review detects truthy array checks where arr could be an empty array — should use arr.length > 0',
      'Review flags CSS rules that set width directly on .modal in a component stylesheet',
      'Review checks that all story status comparisons use === "completed" not === "implemented"',
      'Review detects sprint.risMap access used for feature visibility decisions',
      'Review flags assertion count displays that read from inspectionAssertions without a DB fallback when array is empty',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/ui-components-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'UiComponentsReview',
    lastRunId: null
  },
  {
    id: 'error-handling-review-001',
    title: 'Error Handling Review',
    description: 'As a developer, I want the nightly review to audit error handling patterns so that unhandled promise rejections, swallowed errors, and async anti-patterns are caught.',
    acceptanceCriteria: [
      'Review detects async functions (including ipcMain.handle bodies) with no top-level try-catch block',
      'Review flags .then() calls with no corresponding .catch() on the same promise chain',
      'Review detects catch blocks whose body is empty or contains only a comment',
      'Review flags await expressions used inside .forEach() callbacks',
      'Review detects Promise.all() calls with no .catch() or try-catch wrapping',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/error-handling-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'ErrorHandlingReview',
    lastRunId: null
  },
  {
    id: 'preload-bridge-review-001',
    title: 'Preload Bridge Completeness Review',
    description: 'As a developer, I want the nightly review to audit the preload bridge so that orphaned IPC handlers and missing preload exposures are detected.',
    acceptanceCriteria: [
      'Review collects all ipcMain.handle() registrations across all main-process files',
      'Review collects all channels exposed via contextBridge.exposeInMainWorld in preload.js',
      'Review flags any ipcMain.handle channel with no matching preload exposure (orphaned handler)',
      'Review flags any preload-exposed channel with no matching ipcMain.handle registration (missing handler)',
      'Review detects ipcRenderer.invoke() or ipcRenderer.on() used directly in renderer files outside preload.js',
      'Every finding includes rule ID, file, line, confidence',
      'Findings written to docs/preload-bridge-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'PreloadBridgeReview',
    lastRunId: null
  },
  {
    id: 'plugin-contract-review-001',
    title: 'Plugin Manifest & Sandbox Review',
    description: 'As a developer, I want the nightly review to audit plugin manifests and sandbox boundaries so that malformed plugins, IPC naming collisions, and sandbox violations are caught.',
    acceptanceCriteria: [
      'Review scans all plugins/*/puffin-plugin.json files and flags any missing required fields',
      'Review checks that every IPC channel in plugin files is prefixed with <plugin-name>:',
      'Review detects plugin source files that require() or import paths from ../../src/main/ or ../../src/renderer/',
      'Review flags plugin directories missing puffin-plugin.json, package.json, or index.js',
      'Review checks that plugin name fields in puffin-plugin.json are unique across all plugins',
      'Every finding includes rule ID, plugin name, file, line, confidence',
      'Findings written to docs/plugin-contract-YYYY-MM-DD.md'
    ],
    ris: '',
    assertions: [],
    reviewServiceClass: 'PluginContractReview',
    lastRunId: null
  }
]
