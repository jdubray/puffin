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
const { WebSocket } = require('ws')

const DEFAULT_PORT = 3300
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

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

  /**
   * Subscribe to a workspace's live event channel
   * (ws://…/ws/<workspaceId>, bearer-authenticated upgrade).
   *
   * Reconnects with exponential backoff; on reconnect, replays events since
   * the last seen timestamp so nothing is missed (crash-safe catch-up).
   *
   * @param {string} workspaceId
   * @param {Object} handlers
   * @param {(event: Object) => void} handlers.onEvent
   * @param {(status: 'open'|'closed'|'error') => void} [handlers.onStatus]
   * @returns {{ close: () => void }}
   */
  subscribe(workspaceId, { onEvent, onStatus } = {}) {
    const { token, port } = this._readConfig()
    let socket = null
    let closed = false
    let attempts = 0
    let lastSeenTs = null
    let reconnectTimer = null

    const connect = () => {
      if (closed) return
      socket = new WebSocket(`ws://127.0.0.1:${port}/ws/${workspaceId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })

      socket.on('open', () => {
        attempts = 0
        onStatus?.('open')
        socket.send(JSON.stringify({ type: 'hello' }))
        if (lastSeenTs) {
          socket.send(JSON.stringify({ type: 'replay', since: lastSeenTs }))
        }
      })

      socket.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString())
          if (event?.ts) lastSeenTs = event.ts
          onEvent?.(event)
        } catch { /* non-JSON frame — ignore */ }
      })

      const scheduleReconnect = () => {
        if (closed || reconnectTimer) return
        onStatus?.('closed')
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS)
        attempts++
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, delay)
      }

      socket.on('close', scheduleReconnect)
      socket.on('error', () => {
        onStatus?.('error')
        try { socket.close() } catch { /* already closing */ }
        scheduleReconnect()
      })
    }

    connect()
    return {
      close: () => {
        closed = true
        if (reconnectTimer) clearTimeout(reconnectTimer)
        try { socket?.close() } catch { /* already closed */ }
      }
    }
  }
}

module.exports = { GlmClient }
