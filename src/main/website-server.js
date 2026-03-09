/**
 * WebsiteServer
 *
 * Zero-dependency static HTTP server for the Website Edition.
 * Uses only Node.js built-in modules (http, fs, path, url).
 *
 * Auto-starts when a project is opened with websiteEdition: true.
 * Serves the project directory as static files so the user can
 * preview changes at http://localhost:{port}/.
 *
 * @module website-server
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'text/xml; charset=utf-8'
}


class WebsiteServer {
  constructor() {
    this._server = null
    this._projectPath = null
    this._serveRoot = null
    this._port = 5000
  }

  /**
   * Start the server, serving `projectPath/servePath` on `port`.
   * If the server is already running on the same port, path, and servePath, this is a no-op.
   * If port is occupied, rejects with an EADDRINUSE error.
   *
   * @param {string} projectPath - Absolute path to the project root
   * @param {number} [port=5000]
   * @param {string} [servePath='dist'] - Subdirectory to serve (relative to projectPath)
   * @returns {Promise<{ port: number, url: string }>}
   */
  async start(projectPath, port = 5000, servePath = 'dist') {
    const serveRoot = servePath ? path.join(projectPath, servePath) : projectPath
    if (this._server) {
      if (this._port === port && this._serveRoot === serveRoot) {
        return { port: this._port, url: `http://localhost:${this._port}` }
      }
      await this.stop()
    }

    this._projectPath = projectPath
    this._serveRoot = serveRoot
    this._port = port

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this._handleRequest(req, res)
      })

      server.on('error', (err) => {
        reject(err)
      })

      server.listen(port, '127.0.0.1', () => {
        this._server = server
        resolve({ port, url: `http://localhost:${port}` })
      })
    })
  }

  /**
   * Stop the server.
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      if (!this._server) {
        resolve()
        return
      }
      this._server.close(() => {
        this._server = null
        resolve()
      })
    })
  }

  /** @returns {boolean} */
  isRunning() {
    return this._server !== null && this._server.listening
  }

  /** @returns {number} */
  getPort() {
    return this._port
  }

  /** @returns {string|null} */
  getUrl() {
    if (!this.isRunning()) return null
    return `http://localhost:${this._port}`
  }

  /**
   * Build a site map by reading the project's HTML files.
   *
   * Level 1: Parse `index.html` (or `dist/index.html`) for internal <a href> links
   *          to discover the main navigation pages.
   * Level 2: Parse each level-1 page to discover one more level of links.
   *
   * Returns a tree: `[ { url, label, children: [ { url, label } ] } ]`
   *
   * @param {string} projectPath
   * @returns {{ pages: Array<{ url: string, label: string, children: Array<{ url: string, label: string }> }> }}
   */
  buildSiteMap(projectPath) {
    const port = this._port
    const baseUrl = `http://localhost:${port}`

    // Find the index file (could be at root or inside dist/)
    const indexPath = this._findIndexHtml(projectPath)
    if (!indexPath) {
      return { pages: [] }
    }

    // The "serve root" — the directory that contains index.html
    // (e.g. projectPath itself, or projectPath/dist)
    const serveRoot = path.dirname(indexPath)

    // Level 1 — links in the home page
    const homeLinks = this._extractInternalLinks(indexPath, serveRoot)
    const seen = new Set()

    // Always add the home page as the first entry
    const homeEntry = { url: baseUrl + '/', label: 'Home', children: [] }
    seen.add('/')
    const pages = [homeEntry]

    for (const link of homeLinks) {
      if (seen.has(link.href)) continue
      seen.add(link.href)

      const entry = {
        url: baseUrl + link.href,
        label: link.label || link.href,
        children: []
      }

      // Level 2 — links inside each top-level page
      const childHtml = this._resolveHtmlFile(serveRoot, link.href)
      if (childHtml) {
        const childLinks = this._extractInternalLinks(childHtml, serveRoot)
        for (const cl of childLinks) {
          if (seen.has(cl.href)) continue
          seen.add(cl.href)
          entry.children.push({
            url: baseUrl + cl.href,
            label: cl.label || cl.href
          })
        }
      }

      pages.push(entry)
    }

    return { pages }
  }

  /**
   * Find `index.html` at project root, or inside `dist/`, `build/`, or `out/`.
   * @param {string} projectPath
   * @returns {string|null} Absolute path to index.html or null
   */
  _findIndexHtml(projectPath) {
    const candidates = [
      path.join(projectPath, 'index.html'),
      path.join(projectPath, 'dist', 'index.html'),
      path.join(projectPath, 'build', 'index.html'),
      path.join(projectPath, 'out', 'index.html')
    ]
    for (const c of candidates) {
      try {
        if (fs.statSync(c).isFile()) return c
      } catch (_) { /* skip */ }
    }
    return null
  }

  /**
   * Resolve an href like `/about` or `/exhibitions/` to an actual .html file on disk.
   * Tries: serveRoot + href, then +index.html, then +.html
   * @param {string} serveRoot
   * @param {string} href
   * @returns {string|null}
   */
  _resolveHtmlFile(serveRoot, href) {
    const clean = href.replace(/^\//, '').replace(/\/$/, '')
    const candidates = [
      path.join(serveRoot, clean, 'index.html'),
      path.join(serveRoot, clean + '.html'),
      path.join(serveRoot, clean)
    ]
    for (const c of candidates) {
      try {
        const s = fs.statSync(c)
        if (s.isFile() && path.extname(c).toLowerCase() === '.html') return c
      } catch (_) { /* skip */ }
    }
    return null
  }

  /**
   * Extract internal <a href="..."> links from an HTML file.
   * Only keeps links that start with "/" (site-internal) and aren't anchors or external.
   *
   * @param {string} htmlFilePath
   * @param {string} serveRoot
   * @returns {Array<{ href: string, label: string }>}
   */
  _extractInternalLinks(htmlFilePath, serveRoot) {
    let html
    try {
      html = fs.readFileSync(htmlFilePath, 'utf-8')
    } catch (_) {
      return []
    }

    const links = []
    // Simple regex to extract <a ...href="..."...>text</a>
    const re = /<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
    let match
    while ((match = re.exec(html)) !== null) {
      let href = match[1].trim()
      let label = match[2].replace(/<[^>]*>/g, '').trim() // strip nested tags

      // Only internal links (starting with /)
      if (!href.startsWith('/')) continue
      // Skip assets, anchors, and common non-page paths
      if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|xml|json|woff|woff2|ttf)$/i.test(href)) continue

      // Normalise: ensure trailing / for directory-style paths without extension
      if (!path.extname(href) && !href.endsWith('/')) href += '/'

      links.push({ href, label: label || href })
    }

    return links
  }

  // ── private ─────────────────────────────────────────────────────────────────

  /**
   * Handle an incoming HTTP request by serving static files.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _handleRequest(req, res) {
    try {
      const reqUrl = new URL(req.url, `http://localhost:${this._port}`)
      let urlPath = decodeURIComponent(reqUrl.pathname)

      // Strip leading slash
      if (urlPath.startsWith('/')) urlPath = urlPath.slice(1)

      // Prevent path traversal
      const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '')
      let filePath = path.join(this._serveRoot, safePath)

      // Directory → look for index.html
      let stat = null
      try {
        stat = fs.statSync(filePath)
      } catch (_) {
        // file not found
      }

      if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        try {
          stat = fs.statSync(filePath)
        } catch (_) {
          stat = null
        }
      }

      if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('404 Not Found')
        return
      }

      const ext = path.extname(filePath).toLowerCase()
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache'
      })

      const stream = fs.createReadStream(filePath)
      stream.on('error', () => {
        res.end()
      })
      stream.pipe(res)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('500 Internal Server Error')
    }
  }

  /**
   * Convert a relative path to a preview URL.
   * @param {string} relativePath
   * @param {number} port
   * @returns {string}
   */
  _toUrl(relativePath, port) {
    return `http://localhost:${port}/${relativePath.replace(/\\/g, '/')}`
  }

}

// Singleton for the main process
let _instance = null

/**
 * @returns {WebsiteServer}
 */
function getInstance() {
  if (!_instance) _instance = new WebsiteServer()
  return _instance
}

module.exports = { WebsiteServer, getInstance }
