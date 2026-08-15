const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const { StoryRepository } = require('./lib/story-repository')
const { RunRepository } = require('./lib/run-repository')
const { ReviewRunner } = require('./lib/review-runner')

const CodeReviewPlugin = {
  name: 'code-review-plugin',
  context: null,
  activeRunners: new Map(),  // runId → ReviewRunner (for progress access)
  _repoCache: new Map(),     // projectPath → { storyRepo, RunRepository }

  /**
   * Returns per-project repositories, lazily creating them on first access.
   * Data is stored in <projectPath>/.puffin/code-reviews/ so each project
   * gets its own isolated set of stories and run history.
   */
  _getRepos() {
    const projectPath = this.context?.projectPath
    if (!projectPath) throw new Error('No project open — open a project first')
    if (!this._repoCache.has(projectPath)) {
      const storageDir = path.join(projectPath, '.puffin', 'code-reviews')
      this._repoCache.set(projectPath, {
        storyRepo: new StoryRepository(storageDir),
        runRepo: new RunRepository(storageDir)
      })
    }
    return this._repoCache.get(projectPath)
  },

  async activate(context) {
    this.context = context
    const log = context.log || console

    try {
      context.registerIpcHandler('listStories', async () => {
        return this._getRepos().storyRepo.load()
      })

      context.registerIpcHandler('saveStory', async ({ story } = {}) => {
        if (!story) throw new Error('story is required')
        return this._getRepos().storyRepo.upsert(story)
      })

      context.registerIpcHandler('deleteStory', async ({ storyId } = {}) => {
        if (!storyId) throw new Error('storyId is required')
        await this._getRepos().storyRepo.delete(storyId)
        return {}
      })

      context.registerIpcHandler('reorderStories', async ({ orderedIds } = {}) => {
        if (!Array.isArray(orderedIds)) throw new Error('orderedIds must be an array')
        return this._getRepos().storyRepo.reorder(orderedIds)
      })

      context.registerIpcHandler('getRunStatus', async ({ runId } = {}) => {
        const runs = await this._getRepos().runRepo.listRuns()
        return runs.find(r => r.id === runId) || null
      })

      context.registerIpcHandler('getProgress', async ({ runId } = {}) => {
        const runner = this.activeRunners.get(runId)
        return runner ? runner.getProgress() : {}
      })

      context.registerIpcHandler('getReviewDoc', async ({ storyId, runId } = {}) => {
        if (!storyId) throw new Error('storyId is required')
        const { runRepo } = this._getRepos()
        let run
        if (runId) {
          const runs = await runRepo.listRuns()
          run = runs.find(r => r.id === runId)
        } else {
          run = await runRepo.getLatestRunForStory(storyId)
        }
        if (!run) return { markdown: '', findingCount: 0 }

        const result = run.results?.[storyId]
        if (!result?.reportPath || !fs.existsSync(result.reportPath)) {
          return { markdown: '_No review report found._', findingCount: 0 }
        }

        const markdown = fs.readFileSync(result.reportPath, 'utf-8')
        const total = (result.findingCount?.critical || 0) +
                      (result.findingCount?.important || 0) +
                      (result.findingCount?.info || 0)
        return { markdown, findingCount: total }
      })

      context.registerIpcHandler('listBranches', async () => {
        const projectPath = context.projectPath
        if (!projectPath) return { branches: [], current: '' }
        try {
          const raw = execSync('git branch', { cwd: projectPath, encoding: 'utf-8' })
          const lines = raw.split('\n').map(b => b.trim()).filter(Boolean)
          const current = lines.find(b => b.startsWith('* '))?.replace('* ', '') || ''
          return { branches: lines.map(b => b.replace('* ', '')), current }
        } catch {
          return { branches: [], current: '' }
        }
      })

      context.registerIpcHandler('runStories', async ({ storyIds, branch } = {}) => {
        if (!Array.isArray(storyIds) || storyIds.length === 0) {
          throw new Error('storyIds must be a non-empty array')
        }
        const projectPath = context.projectPath
        if (!projectPath) throw new Error('projectPath not available on plugin context')
        if (branch) log.info(`[code-review-plugin] Running review in Puffin branch context: ${branch}`)

        const { storyRepo, runRepo } = this._getRepos()
        const stories = await storyRepo.load()
        // Preserve the caller's requested order (sorted by Claude before this call)
        const byId = new Map(stories.map(s => [s.id, s]))
        const selected = storyIds.map(id => byId.get(id)).filter(Boolean)
        const run = await runRepo.createRun(storyIds)

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const outputDir = path.join(projectPath, 'docs', 'code-reviews', timestamp)

        const runner = new ReviewRunner(projectPath, outputDir, null)
        this.activeRunners.set(run.id, runner)

        runner.run(run.id, selected).then(async results => {
          try {
            for (const [storyId, result] of results) {
              await runRepo.updateStoryResult(run.id, storyId, result)
              const story = await storyRepo.findById(storyId)
              if (story) await storyRepo.upsert({ ...story, lastRunId: run.id })
            }
            await runRepo.updateRun(run.id, {
              status: 'complete',
              completedAt: new Date().toISOString()
            })
          } catch (err) {
            log.error('[code-review-plugin] post-run update failed:', err.message)
            await runRepo.updateRun(run.id, {
              status: 'error',
              completedAt: new Date().toISOString()
            }).catch(() => {})
          } finally {
            this.activeRunners.delete(run.id)
          }
        }).catch(async err => {
          log.error('[code-review-plugin] run failed:', err.message)
          this.activeRunners.delete(run.id)
          await runRepo.updateRun(run.id, {
            status: 'error',
            completedAt: new Date().toISOString()
          }).catch(() => {})
        })

        return { runId: run.id }
      })

      log.info('[code-review-plugin] Activated')
    } catch (err) {
      log.error('[code-review-plugin] Activation failed:', err.message)
    }
  },

  async deactivate() {
    this._repoCache.clear()
    this.context = null
  }
}

module.exports = CodeReviewPlugin
