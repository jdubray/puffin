/**
 * GLM Client
 *
 * Main-process client for the always-on GLM server (Generative Lifecycle
 * Management) — the spec-oriented backbone of Puffin 2.0 / VSSpecs.
 *
 * Speaks the same REST API as the GLM web UI (solo-mode spec §3.3), with
 * the bearer token from ~/.glm/config.json. Puffin never talks LLMs
 * server-side (GLM ADR-0006): generation always runs client-side through
 * Claude Code sessions.
 *
 * @module glm-client
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_PORT = 3300

class GlmClient {
  constructor(options = {}) {
    this._configPath = options.configPath ||
      path.join(os.homedir(), '.glm', 'config.json')
    this._config = null
  }

  /**
   * @private
   * Read (and cache) ~/.glm/config.json.
   */
  _readConfig() {
    if (this._config) return this._config
    try {
      const raw = JSON.parse(fs.readFileSync(this._configPath, 'utf-8'))
      this._config = {
        port: raw.port || DEFAULT_PORT,
        token: raw.token || null,
        workspace: raw.workspace || null
      }
    } catch {
      this._config = { port: DEFAULT_PORT, token: null, workspace: null }
    }
    return this._config
  }

  /** Drop the cached config (e.g. after the user edits ~/.glm). */
  reloadConfig() {
    this._config = null
  }

  get baseUrl() {
    return `http://127.0.0.1:${this._readConfig().port}/api/v1`
  }

  /**
   * @private
   * Perform one API request. Returns parsed JSON or throws.
   */
  async _request(method, apiPath, body) {
    const { token } = this._readConfig()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    const text = await response.text()
    let parsed
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = { raw: text }
    }
    if (!response.ok) {
      const message = parsed?.error?.message || parsed?.error || `HTTP ${response.status}`
      const error = new Error(`GLM ${method} ${apiPath}: ${message}`)
      error.status = response.status
      throw error
    }
    return parsed
  }

  /**
   * Server availability + version. Never throws.
   *
   * @returns {Promise<{available: boolean, version?: string, hasToken: boolean, port: number}>}
   */
  async getStatus() {
    const { token, port } = this._readConfig()
    try {
      const health = await this._request('GET', '/health')
      return {
        available: !!health?.ok,
        version: health?.version,
        hasToken: !!token,
        port
      }
    } catch {
      return { available: false, hasToken: !!token, port }
    }
  }

  /** @returns {Promise<Object[]>} All workspaces */
  async listWorkspaces() {
    const data = await this._request('GET', '/workspaces')
    return data.workspaces || []
  }

  /** One-call dashboard payload: node/SCR/drift counts, recent activity. */
  async getSummary(workspaceId) {
    return this._request('GET', `/workspaces/${workspaceId}/summary`)
  }

  /** All nodes of a workspace (the sekkei DAG, flat). */
  async listNodes(workspaceId) {
    const data = await this._request('GET', `/workspaces/${workspaceId}/nodes`)
    return data.nodes || []
  }

  /** One node by its glm id. */
  async getNode(workspaceId, glmId) {
    return this._request('GET',
      `/workspaces/${workspaceId}/nodes/${encodeURIComponent(glmId)}`)
  }

  /** SCRs (Sekkei Change Requests) of a workspace. */
  async listScrs(workspaceId) {
    const data = await this._request('GET', `/workspaces/${workspaceId}/scrs`)
    return data.scrs || data || []
  }

  /** Run the 7-gate sekkei verifier. */
  async verify(workspaceId) {
    return this._request('POST', `/workspaces/${workspaceId}/verify`, {})
  }

  /** Latest verifier run (if any). */
  async getLatestVerifierRun(workspaceId) {
    return this._request('GET', `/workspaces/${workspaceId}/verifier/runs/latest`)
  }
}

module.exports = { GlmClient }
