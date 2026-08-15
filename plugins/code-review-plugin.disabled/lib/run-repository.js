const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

class RunRepository {
  constructor(storagePath) {
    this._filePath = path.join(storagePath, 'runs.json')
    this._storagePath = storagePath
  }

  async _load() {
    if (!fs.existsSync(this._filePath)) return []
    return JSON.parse(fs.readFileSync(this._filePath, 'utf-8'))
  }

  async _save(runs) {
    if (!fs.existsSync(this._storagePath)) {
      fs.mkdirSync(this._storagePath, { recursive: true })
    }
    fs.writeFileSync(this._filePath, JSON.stringify(runs, null, 2), 'utf-8')
  }

  async createRun(storyIds) {
    const runs = await this._load()
    const run = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      storyIds,
      status: 'running',
      results: Object.fromEntries(storyIds.map(id => [id, {
        status: 'running',
        reportPath: null,
        findingCount: { critical: 0, important: 0, info: 0 }
      }]))
    }
    runs.push(run)
    await this._save(runs)
    return run
  }

  async updateRun(runId, updates) {
    const runs = await this._load()
    const idx = runs.findIndex(r => r.id === runId)
    if (idx === -1) throw new Error(`Run not found: ${runId}`)
    runs[idx] = { ...runs[idx], ...updates }
    await this._save(runs)
    return runs[idx]
  }

  async updateStoryResult(runId, storyId, result) {
    const runs = await this._load()
    const idx = runs.findIndex(r => r.id === runId)
    if (idx === -1) throw new Error(`Run not found: ${runId}`)
    runs[idx].results[storyId] = { ...runs[idx].results[storyId], ...result }
    await this._save(runs)
    return runs[idx]
  }

  async getLatestRunForStory(storyId) {
    const runs = await this._load()
    const relevant = runs
      .filter(r => r.storyIds.includes(storyId) && r.status === 'complete')
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    return relevant[0] || null
  }

  async listRuns() {
    return this._load()
  }
}

module.exports = { RunRepository }
