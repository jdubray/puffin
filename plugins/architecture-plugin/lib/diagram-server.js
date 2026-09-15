/**
 * diagram-server - Reads rendered archify pages for display in the tab and
 * validates every path the renderer hands back.
 */

const fsp = require('fs').promises
const path = require('path')
const { injectBridge } = require('./bridge-script')
const { resolveInside } = require('./analysis-store')

const MAX_HTML_BYTES = 8 * 1024 * 1024

class DiagramServer {
  /**
   * @param {Object} options
   * @param {import('./analysis-store').AnalysisStore} options.store
   * @param {string} options.projectPath
   */
  constructor({ store, projectPath }) {
    this.store = store
    this.projectPath = projectPath
  }

  /**
   * The archify page for a question, with the bridge injected.
   * @param {string} questionId
   * @returns {Promise<{ html: string, shape: string, mtime: number, htmlPath: string }>}
   */
  async getDiagram(questionId) {
    const q = this.store.getQuestion(questionId)
    if (!q) throw new Error(`Unknown question: ${questionId}`)
    const files = this.store.diagramFilesFor(q)
    const htmlPath = resolveInside(this.projectPath, files.html)
    let st
    try {
      st = await fsp.stat(htmlPath)
    } catch {
      throw new Error(`Diagram not rendered: ${path.basename(htmlPath)}`)
    }
    if (st.size > MAX_HTML_BYTES) throw new Error(`Diagram too large to display (${(st.size / 1024 / 1024).toFixed(1)} MB)`)
    const raw = await fsp.readFile(htmlPath, 'utf8')
    const repositoryUrl = this.store.analysis?.system?.repository?.url
    return { html: injectBridge(raw, { repositoryUrl }), shape: files.shape, mtime: st.mtimeMs, htmlPath }
  }

  /**
   * Resolve an evidence path the diagram (or reading pane) refers to.
   * @param {string} relPath - Repository-relative path
   * @returns {Promise<{ absolutePath: string, exists: boolean }>}
   */
  async resolveEvidence(relPath) {
    const cleaned = String(relPath || '').replace(/\\/g, '/').replace(/^\.?\//, '')
    if (!cleaned || cleaned.includes('..')) throw new Error(`Invalid evidence path: ${relPath}`)
    const absolutePath = resolveInside(this.projectPath, cleaned)
    let exists = false
    try { await fsp.access(absolutePath); exists = true } catch { /* missing */ }
    return { absolutePath, exists }
  }
}

module.exports = { DiagramServer, MAX_HTML_BYTES }
