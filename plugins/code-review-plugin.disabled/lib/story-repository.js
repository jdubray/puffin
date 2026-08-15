const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const DEFAULT_STORIES = require('./default-stories')

class StoryRepository {
  constructor(storagePath) {
    this._filePath = path.join(storagePath, 'stories.json')
    this._storagePath = storagePath
  }

  async load() {
    if (!fs.existsSync(this._filePath)) {
      await this.seed(DEFAULT_STORIES)
    }
    const raw = fs.readFileSync(this._filePath, 'utf-8')
    return JSON.parse(raw)
  }

  async save(stories) {
    if (!fs.existsSync(this._storagePath)) {
      fs.mkdirSync(this._storagePath, { recursive: true })
    }
    fs.writeFileSync(this._filePath, JSON.stringify(stories, null, 2), 'utf-8')
  }

  async findById(id) {
    const stories = await this.load()
    return stories.find(s => s.id === id) || null
  }

  async upsert(story) {
    const stories = await this.load()
    const now = new Date().toISOString()
    const idx = stories.findIndex(s => s.id === story.id)
    const record = { ...story, updatedAt: now }
    if (idx === -1) {
      record.id = record.id || randomUUID()
      record.createdAt = now
      stories.push(record)
    } else {
      stories[idx] = { ...stories[idx], ...record }
    }
    await this.save(stories)
    return record
  }

  async delete(id) {
    const stories = await this.load()
    await this.save(stories.filter(s => s.id !== id))
  }

  async reorder(orderedIds) {
    const stories = await this.load()
    const byId = new Map(stories.map(s => [s.id, s]))
    const sorted = orderedIds.map(id => byId.get(id)).filter(Boolean)
    // Append any stories not in orderedIds at the end
    const inSet = new Set(orderedIds)
    for (const s of stories) {
      if (!inSet.has(s.id)) sorted.push(s)
    }
    await this.save(sorted)
    return sorted
  }

  async seed(defaultStories) {
    if (!fs.existsSync(this._storagePath)) {
      fs.mkdirSync(this._storagePath, { recursive: true })
    }
    const now = new Date().toISOString()
    const seeded = defaultStories.map(s => ({
      ...s,
      id: s.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
      lastRunId: null
    }))
    fs.writeFileSync(this._filePath, JSON.stringify(seeded, null, 2), 'utf-8')
  }
}

module.exports = { StoryRepository }
