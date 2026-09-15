/**
 * plan-service - Plans on disk and on the board.
 *
 * Claude Code's plan mode writes a markdown plan to ~/.claude/plans/. Puffin
 * lets the user review it, keeps the approved copy under docs/plans/ (front
 * matter links it back), and turns its steps into tasks on the board.
 *
 * Everything here is plain file/DB work; no model is called.
 */

const fs = require('fs')
const fsp = require('fs').promises
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const PLANS_SUBDIR = path.join('docs', 'plans')
const HOME_PLAN_DIRS = [path.join('.claude', 'plans'), path.join('.claude', 'plan')]
const MAX_SLUG = 60
const NEWLINE_RE = /\r?\n/

/**
 * Kebab-case slug for a filename.
 * @param {string} title
 * @returns {string}
 */
function slugify(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[`*_#>]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '')
  return slug || 'plan'
}

/**
 * Split a leading YAML front matter block from markdown.
 * @param {string} markdown
 * @returns {{ frontMatter: Object<string,string>, body: string }}
 */
function splitFrontMatter(markdown) {
  const text = String(markdown || '')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { frontMatter: {}, body: text }
  const frontMatter = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv) frontMatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { frontMatter, body: text.slice(m[0].length) }
}

/**
 * First `# ` heading, else the first non-empty line.
 * @param {string} markdown
 * @returns {string}
 */
function titleOf(markdown) {
  const { body } = splitFrontMatter(markdown)
  const h = body.match(/^#\s+(.+)$/m)
  if (h) return h[1].trim()
  const first = body.split(/\r?\n/).map(l => l.trim()).find(Boolean)
  return first ? first.replace(/^#+\s*/, '').slice(0, 120) : 'Untitled plan'
}

/**
 * Serialize front matter + body.
 * @param {Object} fm
 * @param {string} body
 * @returns {string}
 */
function withFrontMatter(fm, body) {
  const lines = Object.entries(fm).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${String(v)}`)
  return `---\n${lines.join('\n')}\n---\n\n${String(body).replace(/^\s+/, '')}`
}

class PlanService {
  /**
   * @param {Object} options
   * @param {string} options.projectPath
   * @param {Function} options.getDatabase - () => DatabaseManager with `userStories` and `plans` repositories
   * @param {string} [options.homeDir]
   * @param {Object} [options.log]
   */
  constructor({ projectPath, getDatabase, homeDir, log } = {}) {
    this.projectPath = projectPath || null
    this.getDatabase = getDatabase
    this.homeDir = homeDir || os.homedir()
    this.log = log || console
  }

  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  _requireProject() {
    if (!this.projectPath) throw new Error('No project is open')
    return this.projectPath
  }

  _db() {
    const db = typeof this.getDatabase === 'function' ? this.getDatabase() : null
    if (!db || !db.userStories || !db.plans) throw new Error('Database not initialized')
    return db
  }

  _projectPlansDir() {
    return path.join(this._requireProject(), PLANS_SUBDIR)
  }

  _homePlanDirs() {
    return HOME_PLAN_DIRS.map(d => path.join(this.homeDir, d))
  }

  /**
   * Whether a path is inside one of the directories plans may be read from.
   * @param {string} candidate
   * @returns {boolean}
   */
  isReadablePlanPath(candidate) {
    const abs = path.resolve(String(candidate || ''))
    const roots = [...this._homePlanDirs(), this.projectPath ? this._projectPlansDir() : null].filter(Boolean).map(r => path.resolve(r))
    return roots.some(root => abs === root || abs.startsWith(root + path.sep))
  }

  async _listMarkdown(dir, source) {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const out = []
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue
      const full = path.join(dir, e.name)
      try {
        const [st, raw] = await Promise.all([fsp.stat(full), fsp.readFile(full, 'utf8')])
        const { frontMatter } = splitFrontMatter(raw)
        out.push({ path: full, name: e.name, title: titleOf(raw), mtime: st.mtimeMs, source, planId: frontMatter.puffin_plan_id || null })
      } catch { /* skip unreadable */ }
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  }

  /**
   * Plan files Puffin can import.
   * @returns {Promise<{ home: Object[], project: Object[] }>}
   */
  async listPlanFiles() {
    const home = (await Promise.all(this._homePlanDirs().map(d => this._listMarkdown(d, 'home')))).flat().sort((a, b) => b.mtime - a.mtime)
    const project = this.projectPath ? await this._listMarkdown(this._projectPlansDir(), 'project') : []
    return { home, project }
  }

  /**
   * @param {string} filePath
   * @returns {Promise<{ path: string, content: string, title: string, frontMatter: Object }>}
   */
  async readPlanFile(filePath) {
    if (!this.isReadablePlanPath(filePath)) throw new Error('Plan path is outside the allowed directories')
    const content = await fsp.readFile(filePath, 'utf8')
    const { frontMatter } = splitFrontMatter(content)
    return { path: filePath, content, title: titleOf(content), frontMatter }
  }

  /**
   * Save an approved plan under docs/plans and create its tasks.
   *
   * @param {Object} args
   * @param {string} args.title
   * @param {string} args.content - Plan markdown (front matter, if any, is replaced)
   * @param {string} [args.branchId] - Workspace the tasks belong to
   * @param {string} [args.sourcePromptId]
   * @param {string} [args.sourcePath] - Where the plan was imported from (docs/plans files are updated in place)
   * @param {string} [args.replacePlanId] - Re-plan: pending tasks of this plan are removed, others re-linked
   * @param {Object[]} [args.steps] - `[{ title, body, acceptanceCriteria[], dependsOn: [stepIndex], skill, files[] }]`; empty → plan saved without tasks
   * @returns {Promise<{ plan: Object, stories: Object[], filePath: string }>}
   */
  async createPlan({ title, content, branchId, sourcePromptId, sourcePath, replacePlanId, steps = [] } = {}) {
    const projectPath = this._requireProject()
    const db = this._db()
    const planTitle = String(title || titleOf(content) || 'Untitled plan').trim()
    const planId = crypto.randomUUID()
    const plansDir = this._projectPlansDir()
    await fsp.mkdir(plansDir, { recursive: true })

    // Where the markdown lives: update a docs/plans source in place, otherwise a new dated file
    let filePath
    const resolvedSource = sourcePath ? path.resolve(sourcePath) : null
    if (resolvedSource && resolvedSource.startsWith(path.resolve(plansDir) + path.sep)) {
      filePath = resolvedSource
    } else {
      const stamp = new Date().toISOString().slice(0, 10)
      let base = `${stamp}-${slugify(planTitle)}`
      let n = 1
      filePath = path.join(plansDir, `${base}.md`)
      while (fs.existsSync(filePath)) { n += 1; filePath = path.join(plansDir, `${base}-${n}.md`) }
    }

    const { body } = splitFrontMatter(content)
    const fm = {
      puffin_plan_id: planId,
      title: planTitle,
      workspace: branchId || '',
      source_prompt_id: sourcePromptId || '',
      created: new Date().toISOString(),
      replaces: replacePlanId || ''
    }
    await fsp.writeFile(filePath, withFrontMatter(fm, body), 'utf8')

    const plan = db.plans.create({ id: planId, title: planTitle, filePath: path.relative(projectPath, filePath).replace(/\\/g, '/'), branchId: branchId || null, sourcePromptId: sourcePromptId || null })

    // Re-plan: drop what was never started, keep what was
    if (replacePlanId) {
      const old = db.userStories.findAll()
        .filter(s => s.planId === replacePlanId)
      for (const s of old) {
        if (s.status === 'pending') db.userStories.deleteById(s.id)
        else db.userStories.update(s.id, { planId })
      }
      db.plans.update(replacePlanId, { status: 'archived' })
    }

    // Tasks, in order, with dependencies resolved to ids
    const ids = steps.map(() => crypto.randomUUID())
    const stories = []
    const now = Date.now()
    steps.forEach((step, i) => {
      const dependsOn = (step.dependsOn || [])
        .map(idx => (Number.isInteger(idx) && idx >= 0 && idx < i) ? ids[idx] : null)
        .filter(Boolean)
      const created = db.userStories.create({
        id: ids[i],
        branchId: branchId || null,
        title: String(step.title || `Step ${i + 1}`).slice(0, 200),
        description: String(step.body || ''),
        acceptanceCriteria: Array.isArray(step.acceptanceCriteria) ? step.acceptanceCriteria.filter(Boolean) : [],
        status: 'pending',
        sourcePromptId: sourcePromptId || null,
        planId,
        planStep: i + 1,
        dependsOn,
        skill: step.skill || null,
        runState: 'idle',
        runMeta: { files: Array.isArray(step.files) ? step.files : [] },
        createdAt: new Date(now + i).toISOString()
      })
      stories.push(created)
    })

    this.log.info?.(`[plan-service] Plan "${planTitle}" saved to ${filePath} with ${stories.length} task(s)`)
    return { plan, stories, filePath }
  }

  /**
   * Plans with task counts.
   * @param {Object} [options]
   * @param {string} [options.branchId]
   * @returns {Promise<Object[]>}
   */
  async listPlans({ branchId } = {}) {
    const db = this._db()
    const plans = db.plans.findAll({ branchId })
    const stories = db.userStories.findAll()
    return plans.map(p => {
      const tasks = stories.filter(s => s.planId === p.id).sort((a, b) => (a.planStep || 0) - (b.planStep || 0))
      return {
        ...p,
        total: tasks.length,
        done: tasks.filter(t => t.status === 'completed').length,
        taskIds: tasks.map(t => t.id)
      }
    })
  }

  /**
   * Remove a plan: pending tasks are deleted, others are unlinked; the markdown stays.
   * @param {string} planId
   * @returns {Promise<{ deletedTasks: number, unlinkedTasks: number }>}
   */
  async deletePlan(planId) {
    const db = this._db()
    let deletedTasks = 0
    let unlinkedTasks = 0
    for (const s of db.userStories.findAll().filter(s => s.planId === planId)) {
      if (s.status === 'pending') { db.userStories.deleteById(s.id); deletedTasks++ } else { db.userStories.update(s.id, { planId: null, planStep: null, dependsOn: [] }); unlinkedTasks++ }
    }
    db.plans.delete(planId)
    return { deletedTasks, unlinkedTasks }
  }

  /**
   * Skills a plan step may invoke: project skills and commands, user skills.
   * @returns {Promise<{ name: string, description: string, source: string }[]>}
   */
  async listSkills() {
    const out = []
    const seen = new Set()
    const add = (name, description, source) => {
      const key = name.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ name, description: String(description || '').trim().slice(0, 200), source })
    }
    const projectSkills = this.projectPath ? path.join(this.projectPath, '.claude', 'skills') : null
    const skillDirs = [projectSkills, path.join(this.homeDir, '.claude', 'skills')].filter(Boolean)
    for (const dir of skillDirs) {
      const source = dir === projectSkills ? 'project' : 'user'
      let entries = []
      try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
      for (const e of entries) {
        if (!e.isDirectory()) continue
        try {
          const raw = await fsp.readFile(path.join(dir, e.name, 'SKILL.md'), 'utf8')
          const { frontMatter, body } = splitFrontMatter(raw)
          const firstLine = body.split(NEWLINE_RE).find(l => l.trim()) || ''
          add(frontMatter.name || e.name, frontMatter.description || firstLine, source)
        } catch { /* no SKILL.md */ }
      }
    }
    if (this.projectPath) {
      const cmdDir = path.join(this.projectPath, '.claude', 'commands')
      let entries = []
      try { entries = await fsp.readdir(cmdDir, { withFileTypes: true }) } catch { entries = [] }
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue
        try {
          const raw = await fsp.readFile(path.join(cmdDir, e.name), 'utf8')
          const { frontMatter, body } = splitFrontMatter(raw)
          add(e.name.replace(/\.md$/, ''), frontMatter.description || body.split(/\r?\n/).find(l => l.trim()) || '', 'command')
        } catch { /* skip */ }
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Current git HEAD of the project, or null outside a repository.
   * @returns {Promise<string|null>}
   */
  gitHead() {
    return new Promise((resolve) => {
      let out = ''
      let child
      try {
        child = spawn('git', ['rev-parse', 'HEAD'], { cwd: this._requireProject(), windowsHide: true })
      } catch {
        return resolve(null)
      }
      child.stdout.on('data', d => { out += d })
      child.on('error', () => resolve(null))
      child.on('close', code => resolve(code === 0 ? out.trim() : null))
    })
  }
}

module.exports = { PlanService, slugify, splitFrontMatter, titleOf, withFrontMatter }
