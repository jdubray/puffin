require('../helpers/test-compat')
/**
 * Architecture Plugin Tests
 *
 * Behaviour of the analysis store, the archlens runner (without archlens),
 * the ask service, the diagram bridge, and the plugin's IPC handlers, all
 * against a small fixture analysis.
 */

const fsp = require('fs').promises
const os = require('os')
const path = require('path')

const { AnalysisStore, resolveInside } = require('../../plugins/architecture-plugin/lib/analysis-store')
const { ArchlensRunner, parseRenderOutput, parseValidateOutput, parseDoctorOutput, MIN_VERSION } = require('../../plugins/architecture-plugin/lib/archlens-runner')
const { AskService, buildAnswerPrompt, extractCitations, alreadyAnsweredThreshold } = require('../../plugins/architecture-plugin/lib/ask-service')
const { injectBridge, BRIDGE_MARKER } = require('../../plugins/architecture-plugin/lib/bridge-script')
const { DiagramServer } = require('../../plugins/architecture-plugin/lib/diagram-server')
const plugin = require('../../plugins/architecture-plugin/index')

const FIXTURES = path.join(__dirname, 'architecture-plugin', 'fixtures')

/**
 * Copy the fixture into a fresh temp project with docs/architecture/.
 * @returns {Promise<string>} project path
 */
async function makeProject() {
  const projectPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'arch-plugin-'))
  const dir = path.join(projectPath, 'docs', 'architecture')
  await fsp.mkdir(dir, { recursive: true })
  await fsp.copyFile(path.join(FIXTURES, 'notes.analysis.json'), path.join(dir, 'notes.analysis.json'))
  await fsp.copyFile(path.join(FIXTURES, 'q_save.architecture.html'), path.join(dir, 'q_save.architecture.html'))
  await fsp.mkdir(path.join(projectPath, 'src'), { recursive: true })
  await fsp.writeFile(path.join(projectPath, 'src', 'api.js'), '// api\n')
  return projectPath
}

/**
 * A fake archlens: a Node script that prints canned output per command.
 * @param {string} dir
 * @param {string} version
 * @returns {Promise<string>} bin path
 */
async function makeFakeArchlens(dir, version = '0.5.2') {
  const skill = path.join(dir, 'skills', 'archlens')
  await fsp.mkdir(path.join(skill, 'bin'), { recursive: true })
  await fsp.writeFile(path.join(skill, 'package.json'), JSON.stringify({ name: 'archlens', version }))
  const bin = path.join(skill, 'bin', 'archlens.mjs')
  await fsp.writeFile(bin, `
const args = process.argv.slice(2)
const cmd = args[0]
if (cmd === 'doctor') { console.log('archlens doctor\\n\\n[ok] Node.js ' + process.version + '\\n[ok] archify at /fake/archify\\n\\narchlens is ready.'); process.exit(0) }
if (cmd === 'ask') {
  const q = args[2]
  if (q.includes('zebra')) { console.log(JSON.stringify({ question: q, terms: ['zebra'], components: [], relations: [], facts: [], questions: [], boundaries: [], glossary: [], unmatched: ['zebra'], coverage: 0, empty: true })); process.exit(3) }
  console.log(JSON.stringify({ question: q, terms: ['note', 'save'], components: [{ id: 'api', score: 2, matched: ['note'] }, { id: 'store', score: 1, matched: ['note'] }], relations: [{ from: 'api', to: 'store', score: 1.5, matched: ['note'] }], facts: [{ id: 'f1', score: 1, matched: ['note'] }], questions: [{ id: 'q_save', score: 2.5, matched: ['note', 'save'] }, { id: 'q_read', score: 0.4, matched: ['note'] }], boundaries: [{ id: 'host', score: 1, matched: [] }], glossary: ['note', 'store'], unmatched: [], coverage: 1, empty: false }))
  process.exit(0)
}
if (cmd === 'check') { console.log(JSON.stringify({ code: { pinned: 'abc', head: 'abc', pinAvailable: true, ahead: 0, total: 3, gone: [], moved: [], built: [], fine: 3, ok: true }, documents: { gone: [], unverified: [], missing: [], mispaged: [], fine: 0, total: 0, ok: true } })); process.exit(0) }
if (cmd === 'enforce') { console.log(JSON.stringify({ model: [], code: { violations: [], undeclared: [] } })); process.exit(0) }
if (cmd === 'validate') { console.log('warning questions[1]: no context\\n        fix: write one\\n\\n0 error(s), 1 warning(s)\\n"Notes": 3 components, 2 relations, 2 questions.'); process.exit(0) }
if (cmd === 'questions') { console.log('q_save  How a note is saved\\n  asks     What happens?\\n  draws    3 components, 2 relations, 1 boundaries\\n  dropped  boundary "host" drawn around 2 of 2 members\\n\\nq_read  How a note is read\\n  asks     How?\\n  draws    a sequence: 2 participants, 1 messages, 0 phases\\n'); process.exit(0) }
if (cmd === 'render') { console.log('— q_save: How a note is saved\\n  dropped  something\\n  wrote    ' + args[2] + '/q_save.architecture.html\\n\\n1/1 diagram(s) delivered.'); console.log('ARGS ' + JSON.stringify(args)); process.exit(0) }
console.error('unknown command "' + cmd + '"'); process.exit(1)
`)
  return bin
}

function mockContext(projectPath, extra = {}) {
  const store = new Map()
  const handlers = {}
  const events = []
  return {
    projectPath,
    log: { debug() {}, info() {}, warn() {}, error() {} },
    storage: { get: async (k) => store.get(k) ?? null, set: async (k, v) => { store.set(k, v) } },
    services: { getConfig: () => ({ promptProvider: 'cli' }) },
    getService: () => null,
    registerIpcHandler: (name, fn) => { handlers[name] = fn },
    registerAction() {},
    sendToRenderer: (event, data) => { events.push({ event, data }) },
    handlers,
    events,
    ...extra
  }
}

describe('architecture-plugin', () => {
  let projectPath

  beforeEach(async () => {
    projectPath = await makeProject()
  })

  afterEach(async () => {
    try { await plugin.deactivate() } catch { /* not active */ }
    await fsp.rm(projectPath, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  describe('AnalysisStore', () => {
    it('discovers the analysis under docs/architecture and loads it', async () => {
      const store = new AnalysisStore({ projectPath })
      const { analysisPath } = await store.discover()
      expect(analysisPath).toBe(path.join(projectPath, 'docs', 'architecture', 'notes.analysis.json'))
      await store.load()
      expect(store.counts()).toEqual({ components: 3, relations: 2, boundaries: 1, facts: 2, glossary: 3, questions: 2 })
    })

    it('prefers a configured analysis file and falls back to a scan', async () => {
      await fsp.mkdir(path.join(projectPath, 'design'), { recursive: true })
      await fsp.copyFile(path.join(FIXTURES, 'notes.analysis.json'), path.join(projectPath, 'design', 'other.analysis.json'))
      const store = new AnalysisStore({ projectPath })
      const configured = await store.discover('design/other.analysis.json')
      expect(configured.analysisPath).toBe(path.join(projectPath, 'design', 'other.analysis.json'))
      expect(configured.candidates.length).toBe(2)

      await fsp.rm(path.join(projectPath, 'docs'), { recursive: true, force: true })
      const scanned = await new AnalysisStore({ projectPath }).discover()
      expect(scanned.analysisPath).toBe(path.join(projectPath, 'design', 'other.analysis.json'))
    })

    it('finds the glossary terms a question uses, by term or alias, word-bounded', async () => {
      const store = new AnalysisStore({ projectPath })
      await store.discover(); await store.load()
      const terms = store.termsForQuestion(store.getQuestion('q_save')).map(t => t.term)
      expect(terms).toEqual(['note', 'store'])
      const glossary = store.describeGlossary()
      expect(glossary.find(g => g.term === 'unused term').questions).toEqual([])
      expect(glossary.find(g => g.term === 'store').questions.map(q => q.id)).toEqual(['q_save', 'q_read'])
    })

    it('hydrates questions and records with back-references', async () => {
      const store = new AnalysisStore({ projectPath })
      await store.discover(); await store.load()
      const q = store.describeQuestion('q_save')
      expect(q.involves.map(c => c.name)).toEqual(['Browser client', 'Notes API', 'Note store'])
      expect(q.facts[0].id).toBe('f1')
      expect(q.shape).toBe('architecture')
      expect(store.describeQuestion('q_read').shape).toBe('sequence')

      const api = store.describeComponent('api')
      expect(api.boundary.id).toBe('host')
      expect(api.relations.map(r => `${r.direction}:${r.other.id}`)).toEqual(['in:client', 'out:store'])
      expect(api.questions.map(x => x.id)).toEqual(['q_save', 'q_read'])

      const host = store.describeBoundary('host')
      expect(host.crossing.map(r => r.id)).toEqual(['r1'])
      expect(store.describeFact('f1').questions.map(x => x.id)).toEqual(['q_save'])
      expect(store.describeTerm('Note Store').term).toBe('store')
    })

    it('reports render state per question, stale when the analysis is newer', async () => {
      const store = new AnalysisStore({ projectPath })
      await store.discover(); await store.load()
      let state = await store.renderState()
      expect(state.q_save.rendered).toBe(true)
      expect(state.q_read.rendered).toBe(false)
      expect(state.q_read.shape).toBe('sequence')

      const future = new Date(Date.now() + 60000)
      await fsp.utimes(store.analysisPath, future, future)
      state = await store.renderState()
      expect(state.q_save.stale).toBe(true)
    })

    it('refuses paths outside the project', () => {
      expect(() => resolveInside(projectPath, '../elsewhere.json')).toThrow(/outside/)
      expect(resolveInside(projectPath, 'docs/x.json')).toBe(path.join(projectPath, 'docs', 'x.json'))
    })
  })

  // ---------------------------------------------------------------------------
  describe('ArchlensRunner', () => {
    it('parses render, questions, validate and doctor output', () => {
      const r = parseRenderOutput('— q_a: Title A\n  dropped  x\n  fixed    y\n  wrote    /out/q_a.architecture.html\n\n— q_b: Title B\n  FAILED   2 unresolved\n\n1/2 diagram(s) delivered.\n')
      expect(r.delivered).toBe('1/2')
      expect(r.questions.q_a.dropped).toEqual(['x'])
      expect(r.questions.q_a.fixed).toEqual(['y'])
      expect(r.questions.q_b.failed).toBe('2 unresolved')

      const qs = parseRenderOutput('q_save  How a note is saved\n  asks     What?\n  dropped  boundary "host"\n\nq_read  How read\n').questions
      expect(Object.keys(qs)).toEqual(['q_save', 'q_read'])
      expect(qs.q_save.dropped).toEqual(['boundary "host"'])

      const v = parseValidateOutput('error components[0]: bad\n        fix: do this\nwarning questions[1]: thin\n\n1 error(s), 1 warning(s)')
      expect(v.errors).toEqual([{ where: 'components[0]', message: 'bad', fix: 'do this' }])
      expect(v.warnings[0].where).toBe('questions[1]')

      const d = parseDoctorOutput('archlens doctor\n\n[ok] Node.js v24.0.0\n[!!] archify not found\n', 1)
      expect(d.ok).toBe(false)
      expect(d.node).toBe('v24.0.0')
      expect(d.problems).toEqual(['archify not found'])
    })

    it('resolves the newest install unless a path is configured, and flags old versions', async () => {
      const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'arch-home-'))
      const oldBin = await makeFakeArchlens(path.join(home, '.claude', 'plugins', 'cache', 'arch-lens', 'archlens', '0.1.1'), '0.1.1')
      const newBin = await makeFakeArchlens(path.join(home, 'elsewhere'), '0.6.0')
      await fsp.writeFile(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'archlens@arch-lens': [{ installPath: path.join(home, '.claude', 'plugins', 'cache', 'arch-lens', 'archlens', '0.1.1') }] } }))

      const onlyOld = new ArchlensRunner({ projectPath, homeDir: home })
      expect(onlyOld.resolve().binPath).toBe(oldBin)
      expect(onlyOld.resolve().tooOld).toBe(true)

      const sibling = await makeFakeArchlens(path.join(path.dirname(projectPath), 'archlens'), '0.5.2')
      try {
        const auto = new ArchlensRunner({ projectPath, homeDir: home })
        expect(auto.resolve().binPath).toBe(sibling)
        expect(auto.resolve().tooOld).toBe(false)

        const configured = new ArchlensRunner({ projectPath, homeDir: home, configuredPath: newBin })
        expect(configured.resolve().source).toBe('settings')
        expect(configured.resolve().version).toBe('0.6.0')
        expect(MIN_VERSION).toBe('0.5.0')
      } finally {
        await fsp.rm(path.join(path.dirname(projectPath), 'archlens'), { recursive: true, force: true })
        await fsp.rm(home, { recursive: true, force: true })
      }
    })

    it('runs the CLI without a shell, one argv element per argument, --no-check by default', async () => {
      const bin = await makeFakeArchlens(path.join(projectPath, 'tools'))
      const runner = new ArchlensRunner({ projectPath, configuredPath: bin, execPath: process.execPath })
      const lines = []
      const r = await runner.render(path.join(projectPath, 'a.json'), path.join(projectPath, 'out dir'), { repoRoot: projectPath, onLine: (l) => lines.push(l) })
      expect(r.ok).toBe(true)
      expect(r.delivered).toBe('1/1')
      expect(r.questions.q_save.dropped).toEqual(['something'])
      const argsLine = lines.find(l => l.startsWith('ARGS '))
      const args = JSON.parse(argsLine.slice(5))
      expect(args[2]).toBe(path.join(projectPath, 'out dir'))
      expect(args.includes('--no-check')).toBe(true)

      const withCheck = await runner.render(path.join(projectPath, 'a.json'), path.join(projectPath, 'out'), { browserCheck: true, onLine: (l) => lines.push(l) })
      const args2 = JSON.parse(lines.filter(l => l.startsWith('ARGS ')).pop().slice(5))
      expect(args2.includes('--no-check')).toBe(false)
      expect(withCheck.ok).toBe(true)
    })

    it('treats ask exit 3 as an empty slice, not an error', async () => {
      const bin = await makeFakeArchlens(path.join(projectPath, 'tools'))
      const runner = new ArchlensRunner({ projectPath, configuredPath: bin })
      const empty = await runner.ask('x.json', 'zebra question with "quotes" and spaces')
      expect(empty.empty).toBe(true)
      expect(empty.unmatched).toEqual(['zebra'])
      const full = await runner.ask('x.json', 'how is a note saved?')
      expect(full.coverage).toBe(1)
      const doctor = await runner.doctor()
      expect(doctor.ok).toBe(true)
      expect(doctor.version).toBe('0.5.2')
      const check = await runner.check('x.json', projectPath)
      expect(check.code.ok).toBe(true)
      const v = await runner.validate('x.json')
      expect(v.warnings).toEqual([{ where: 'questions[1]', message: 'no context', fix: 'write one' }])
    })
  })

  // ---------------------------------------------------------------------------
  describe('AskService', () => {
    it('hydrates the slice, flags already-answered questions, and caps the prompt', async () => {
      const bin = await makeFakeArchlens(path.join(projectPath, 'tools'))
      const store = new AnalysisStore({ projectPath }); await store.discover(); await store.load()
      const runner = new ArchlensRunner({ projectPath, configuredPath: bin })
      const calls = []
      const svc = new AskService({
        store, runner,
        storage: { get: async () => null, set: async () => {} },
        editDocument: async (args) => { calls.push(args); return { success: true, response: 'The **Notes API** writes via `api -> store`. **Ghost** is not here.\nNot covered: nothing', provider: 'cli' } },
        getConfig: () => ({ promptProvider: 'cli' }),
        getClaudeService: () => null
      })
      const slice = await svc.slice('how is a note saved?')
      expect(slice.components[0].name).toBe('Notes API')
      expect(slice.relations[0].what_crosses).toBe('Rows for notes.')
      expect(slice.alreadyAnswered.map(q => q.id)).toEqual(['q_save'])
      expect(slice.glossary.map(t => t.term)).toEqual(['note', 'store'])
      expect(alreadyAnsweredThreshold([{ score: 2.5 }, { score: 0.4 }])).toBe(1.5)

      const answer = await svc.answer('how is a note saved?', slice)
      expect(answer.success).toBe(true)
      expect(calls[0].prompt).toContain('--- BEGIN SLICE ---')
      expect(calls[0].prompt).toContain('api -> store')
      expect(calls[0].config.promptProvider).toBe('cli')
      expect(answer.citations.components).toEqual(['api'])
      expect(answer.citations.relations).toEqual([{ from: 'api', to: 'store', known: true }])
      expect(answer.citations.unknown).toEqual(['Ghost'])
    })

    it('lists unmatched words in the prompt and keeps history per project', async () => {
      const prompt = buildAnswerPrompt('q?', { components: [], relations: [], boundaries: [], facts: [], questions: [], terms: [], unmatched: ['zebra', 'lattice'] })
      expect(prompt).toContain('zebra, lattice')
      const cites = extractCitations('nothing cited', { components: [], relations: [] })
      expect(cites).toEqual({ components: [], relations: [], unknown: [] })

      const mem = new Map()
      const svc = new AskService({ store: null, runner: null, storage: { get: async (k) => mem.get(k) ?? null, set: async (k, v) => mem.set(k, v) }, projectKey: 'p1' })
      await svc.recordHistory({ question: 'a', stage: 'sliced' })
      await svc.recordHistory({ question: 'b', stage: 'sliced' })
      await svc.recordHistory({ question: 'a', stage: 'answered' })
      const h = await svc.getHistory()
      expect(h.map(e => `${e.question}:${e.stage}`)).toEqual(['a:answered', 'b:sliced'])
    })
  })

  // ---------------------------------------------------------------------------
  describe('DiagramServer and bridge', () => {
    it('injects the bridge once and guards paths', async () => {
      const once = injectBridge('<html><body><p>x</p></body></html>', { repositoryUrl: 'https://github.com/example/notes' })
      expect(once.includes(BRIDGE_MARKER)).toBe(true)
      expect(once.indexOf('</body>') > once.indexOf(BRIDGE_MARKER)).toBe(true)
      expect(injectBridge(once)).toBe(once)

      const store = new AnalysisStore({ projectPath }); await store.discover(); await store.load()
      const server = new DiagramServer({ store, projectPath })
      const d = await server.getDiagram('q_save')
      expect(d.shape).toBe('architecture')
      expect(d.html).toContain('https://github.com/example/notes')
      await expect(server.getDiagram('q_read')).rejects.toThrow(/not rendered/i)
      await expect(server.resolveEvidence('../secret')).rejects.toThrow(/Invalid/)
      const ev = await server.resolveEvidence('src/api.js')
      expect(ev.exists).toBe(true)
      expect((await server.resolveEvidence('src/missing.js')).exists).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  describe('plugin handlers', () => {
    it('reports status, loads the analysis, and serves questions, records and diagrams', async () => {
      const bin = await makeFakeArchlens(path.join(projectPath, 'tools'))
      const ctx = mockContext(projectPath)
      await plugin.activate(ctx)
      await ctx.handlers.setSettings({ archlensPath: bin })

      const status = await ctx.handlers.status({})
      expect(status.state).toBe('ready')
      expect(status.analysisPath).toBe('docs/architecture/notes.analysis.json')
      expect(status.archlens.version).toBe('0.5.2')

      const load = await ctx.handlers.load({})
      expect(load.system.name).toBe('Notes')
      expect(load.questions.map(q => q.id)).toEqual(['q_save', 'q_read'])
      expect(load.questions[0].render.rendered).toBe(true)
      expect(load.questions[0].dropped).toEqual(['boundary "host" drawn around 2 of 2 members'])
      expect(load.model.glossary.length).toBe(3)

      const q = await ctx.handlers.getQuestion({ id: 'q_save' })
      expect(q.terms.map(t => t.term)).toEqual(['note', 'store'])
      const rec = await ctx.handlers.getRecord({ kind: 'component', id: 'api' })
      expect(rec.kind).toBe('component')
      await expect(ctx.handlers.getRecord({ kind: 'nope', id: 'x' })).rejects.toThrow(/Unknown record kind/)

      const diagram = await ctx.handlers.getDiagram({ id: 'q_save' })
      expect(diagram.html).toContain(BRIDGE_MARKER)
      expect(diagram.htmlPath).toBe('docs/architecture/q_save.architecture.html')

      const slice = await ctx.handlers.ask({ question: 'how is a note saved?' })
      expect(slice.canAnswer).toBe(true)
      expect((await ctx.handlers.getAskHistory()).length).toBe(1)

      const zebra = await ctx.handlers.ask({ question: 'zebra' })
      expect(zebra.empty).toBe(true)
      expect(zebra.canAnswer).toBe(false)

      const check = await ctx.handlers.check()
      expect(check.check.code.ok).toBe(true)
      expect(check.enforce.ok).toBe(true)

      const note = await ctx.handlers.saveNote({ question: 'why?', answer: 'because' })
      const md = await fsp.readFile(path.join(projectPath, note.path), 'utf8')
      expect(md).toContain('## why?')
      expect(md).toContain('because')

      await expect(ctx.handlers.openEvidence({ path: '../x' })).rejects.toThrow(/Invalid/)
      expect((await ctx.handlers.openEvidence({ path: 'src/api.js' })).exists).toBe(true)
    })

    it('reports no-analysis when the project has none, and no-archlens when the CLI is missing', async () => {
      await fsp.rm(path.join(projectPath, 'docs'), { recursive: true, force: true })
      const ctx = mockContext(projectPath)
      await plugin.activate(ctx)
      await ctx.handlers.setSettings({ archlensPath: path.join(projectPath, 'nowhere.mjs') })
      const s = await ctx.handlers.status({ rediscover: true })
      expect(s.hasAnalysis).toBe(false)
      expect(['no-analysis', 'no-archlens']).toContain(s.state)
      await expect(ctx.handlers.load({})).rejects.toThrow(/No architecture analysis/)
      await expect(ctx.handlers.ask({ question: 'x' })).rejects.toThrow(/No architecture analysis/)
    })

    it('notifies the renderer when the analysis or a diagram changes on disk', async () => {
      const ctx = mockContext(projectPath)
      await plugin.activate(ctx)
      await ctx.handlers.load({})
      const dir = path.join(projectPath, 'docs', 'architecture')
      await new Promise(r => setTimeout(r, 50))
      await fsp.writeFile(path.join(dir, 'q_read.sequence.html'), '<html><body>new</body></html>')
      const raw = JSON.parse(await fsp.readFile(path.join(dir, 'notes.analysis.json'), 'utf8'))
      raw.questions.push({ id: 'q_new', title: 'New', ask: 'New?', involves: ['api'] })
      await new Promise(r => setTimeout(r, 20))
      await fsp.writeFile(path.join(dir, 'notes.analysis.json'), JSON.stringify(raw))
      const deadline = Date.now() + 3000
      while (Date.now() < deadline && !(ctx.events.some(e => e.data?.kind === 'analysis') && ctx.events.some(e => e.data?.kind === 'diagram'))) {
        await new Promise(r => setTimeout(r, 50))
      }
      expect(ctx.events.some(e => e.event === 'changed' && e.data.kind === 'diagram' && e.data.questionId === 'q_read')).toBe(true)
      expect(ctx.events.some(e => e.event === 'changed' && e.data.kind === 'analysis')).toBe(true)
      const load = await ctx.handlers.load({})
      expect(load.questions.map(q => q.id)).toContain('q_new')
    })
  })
})
