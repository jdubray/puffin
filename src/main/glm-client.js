/**
 * GLM Client
 *
 * Main-process client for the always-on GLM server (Generative Lifecycle
 * Management) — the spec-oriented backbone of Puffin 4.0.
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

/**
 * Read the solo-mode GLM config (~/.glm/config.json).
 *
 * Shared with glm-integration, which needs the same port and bearer token to
 * point spawned sessions at the server's /mcp endpoint. Missing or malformed
 * config is not an error — it means "GLM isn't set up here".
 *
 * @param {string} [configPath] - Override for tests
 * @returns {{port: number, token: string|null, workspace: string|null}}
 */
function readGlmConfig(configPath) {
  const file = configPath || path.join(os.homedir(), '.glm', 'config.json')
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return {
      port: raw.port || DEFAULT_PORT,
      token: raw.token || null,
      workspace: raw.workspace || null
    }
  } catch {
    return { port: DEFAULT_PORT, token: null, workspace: null }
  }
}

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
    if (!this._config) this._config = readGlmConfig(this._configPath)
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

  /**
   * Create a workspace (an empty sekkei).
   *
   * @param {{slug: string, name?: string}} params - slug must match ^[a-z][a-z0-9-]{0,63}$
   */
  async createWorkspace({ slug, name }) {
    return this._request('POST', '/workspaces', { slug, name: name || slug })
  }

  /**
   * Point a workspace at the code it governs (GLM's half of the binding —
   * generation writes there and acceptance verifiers run there).
   */
  async setSourceDir(workspaceId, sourceDir) {
    return this._request('PATCH', `/workspaces/${workspaceId}`, { sourceDir })
  }

  /** One-call dashboard payload: node/SCR/drift counts, recent activity. */
  async getSummary(workspaceId) {
    return this._request('GET', `/workspaces/${workspaceId}/summary`)
  }

  /**
   * All nodes of a workspace (the sekkei DAG, flat).
   *
   * Relationships come along because generation planning needs the `depends-on`
   * edges to layer components, and fetching them per node would be one round
   * trip per node on a sekkei with dozens of them.
   */
  async listNodes(workspaceId) {
    const data = await this._request('GET',
      `/workspaces/${workspaceId}/nodes?include=relationships`)
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

  /**
   * Update a node (partial: title, description, body — server defaults fill
   * the rest). The server appends change-log/audit entries and publishes
   * node.changed on the workspace channel.
   */
  async updateNode(workspaceId, glmId, input) {
    return this._request('PUT',
      `/workspaces/${workspaceId}/nodes/${encodeURIComponent(glmId)}`, input)
  }

  /** Acquire the node edit lock (423 with holder info when taken). */
  async acquireLock(workspaceId, glmId) {
    return this._request('POST',
      `/workspaces/${workspaceId}/nodes/${encodeURIComponent(glmId)}/lock`, {})
  }

  /** Heartbeat the held lock (keeps the TTL alive during long edits). */
  async heartbeatLock(workspaceId, glmId) {
    return this._request('PUT',
      `/workspaces/${workspaceId}/nodes/${encodeURIComponent(glmId)}/lock/heartbeat`, {})
  }

  /** Release the node edit lock. */
  async releaseLock(workspaceId, glmId) {
    return this._request('DELETE',
      `/workspaces/${workspaceId}/nodes/${encodeURIComponent(glmId)}/lock`)
  }

  /** Create an SCR (Sekkei Change Request) — starts in Draft. */
  async createScr(workspaceId, { title, problem, scrClass, targetNodes } = {}) {
    return this._request('POST', `/workspaces/${workspaceId}/scrs`, {
      title, problem, scrClass, targetNodes
    })
  }

  /**
   * Drive the SCR status FSM one legal event forward
   * (submit | startReview | approve | return | reject | reopen |
   *  implement | release). Illegal transitions come back as 409.
   */
  async scrStatus(workspaceId, scrId, event, reason) {
    return this._request('PUT',
      `/workspaces/${workspaceId}/scrs/${encodeURIComponent(scrId)}/status`,
      { event, reason })
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

module.exports = { GlmClient, readGlmConfig }
