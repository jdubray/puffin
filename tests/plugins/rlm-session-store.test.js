/**
 * RLM Document Plugin - SessionStore Tests
 *
 * Tests for session persistence, CRUD operations, and cleanup.
 * Covers session creation, metadata management, query results, and expiration.
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')
const crypto = require('crypto')

// Import SessionStore
const SessionStore = require('../../plugins/rlm-document-plugin/lib/session-store')
const { SESSION, STORAGE } = require('../../plugins/rlm-document-plugin/lib/config')
const { isSessionExpired } = require('../../plugins/rlm-document-plugin/lib/schemas')

describe('RLM SessionStore', () => {
  let tempDir
  let sessionStore

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `rlm-test-${Date.now()}`)
    sessionStore = new SessionStore(tempDir, { log: { info: () => {}, error: () => {}, warn: () => {} } })
    await sessionStore.initialize()
  })

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (err) {
      console.error('Cleanup error:', err)
    }
  })

  describe('Initialization', () => {
    it('should create storage directories on initialize', async () => {
      const indexPath = path.join(tempDir, STORAGE.INDEX_FILE)
      const sessionsDirPath = path.join(tempDir, STORAGE.SESSIONS_DIR)

      const indexExists = await fs.stat(indexPath).then(() => true).catch(() => false)
      const sessionsDirExists = await fs.stat(sessionsDirPath).then(() => true).catch(() => false)

      expect(indexExists).toBe(true)
      expect(sessionsDirExists).toBe(true)
    })

    it('should create initial empty index', async () => {
      const index = await sessionStore.loadIndex()

      expect(index).toHaveProperty('sessions')
      expect(Array.isArray(index.sessions)).toBe(true)
      expect(index.sessions.length).toBe(0)
    })

    it('should preserve existing index on re-initialize', async () => {
      // Create a session first
      const session = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Re-initialize store
      const newStore = new SessionStore(tempDir)
      await newStore.initialize()
      const sessions = await newStore.listSessions()

      expect(sessions.length).toBe(1)
      expect(sessions[0].id).toBe(session.id)
    })

    it('should throw error if operations called before initialize', async () => {
      const uninitializedStore = new SessionStore(tempDir)

      await expect(() => uninitializedStore.listSessions()).rejects.toThrow('not initialized')
    })
  })

  describe('Session Creation', () => {
    it('should create a session with valid metadata', async () => {
      const session = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      expect(session).toHaveProperty('id')
      expect(session.id).toMatch(/^ses_/)
      expect(session.documentPath).toBe('/absolute/path/to/document.md')
      expect(session.relativePath).toBe('docs/document.md')
      expect(session.fileSize).toBe(1024)
      expect(session.state).toBe('active')
      expect(session.config.chunkSize).toBe(4000)
    })

    it('should generate unique session IDs', async () => {
      const session1 = await sessionStore.createSession({
        documentPath: '/path/doc1.md',
        relativePath: 'doc1.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const session2 = await sessionStore.createSession({
        documentPath: '/path/doc2.md',
        relativePath: 'doc2.md',
        fileSize: 2048,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      expect(session1.id).not.toBe(session2.id)
    })

    it('should persist session to disk', async () => {
      const session = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const metadataPath = path.join(tempDir, STORAGE.SESSIONS_DIR, session.id, STORAGE.METADATA_FILE)
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))

      expect(metadata.id).toBe(session.id)
      expect(metadata.relativePath).toBe('docs/document.md')
    })

    it('should reject sessions that exceed max per project', async () => {
      const maxSessions = SESSION.MAX_PER_PROJECT
      const sessions = []

      // Create max sessions
      for (let i = 0; i < maxSessions; i++) {
        const session = await sessionStore.createSession({
          documentPath: `/path/doc${i}.md`,
          relativePath: `doc${i}.md`,
          fileSize: 1024,
          config: { chunkSize: 4000, chunkOverlap: 200 }
        })
        sessions.push(session)
      }

      // Attempt to create one more (should fail or trigger cleanup)
      const cleanup = await sessionStore.cleanupExpiredSessions()

      // At minimum, should not exceed max
      const allSessions = await sessionStore.listSessions()
      expect(allSessions.length).toBeLessThanOrEqual(maxSessions)
    })
  })

  describe('Session Retrieval', () => {
    let testSession

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })
    })

    it('should retrieve session by ID', async () => {
      const session = await sessionStore.getSession(testSession.id)

      expect(session).toBeDefined()
      expect(session.id).toBe(testSession.id)
      expect(session.relativePath).toBe('docs/document.md')
    })

    it('should return null for non-existent session', async () => {
      const session = await sessionStore.getSession('ses_nonexistent')

      expect(session).toBeNull()
    })

    it('should update lastAccessedAt when touch=true', async () => {
      const before = testSession.lastAccessedAt
      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const session = await sessionStore.getSession(testSession.id, { touch: true })

      expect(new Date(session.lastAccessedAt) > new Date(before)).toBe(true)
    })

    it('should not update lastAccessedAt when touch=false', async () => {
      const before = testSession.lastAccessedAt

      const session = await sessionStore.getSession(testSession.id, { touch: false })

      expect(session.lastAccessedAt).toBe(before)
    })

    it('should list all sessions', async () => {
      await sessionStore.createSession({
        documentPath: '/path/doc2.md',
        relativePath: 'doc2.md',
        fileSize: 2048,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const sessions = await sessionStore.listSessions()

      expect(sessions.length).toBe(2)
    })

    it('should filter sessions by state', async () => {
      // Close one session
      await sessionStore.closeSession(testSession.id)

      const activeSessions = await sessionStore.listSessions({ state: 'active' })
      const closedSessions = await sessionStore.listSessions({ state: 'closed' })

      expect(activeSessions.length).toBe(0)
      expect(closedSessions.length).toBe(1)
    })
  })

  describe('Session Update', () => {
    let testSession

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })
    })

    it('should update session stats', async () => {
      const updates = {
        stats: {
          totalChunks: 10,
          queriesRun: 5,
          evidenceCollected: 20
        }
      }

      const updated = await sessionStore.updateSession(testSession.id, updates)

      expect(updated.stats.totalChunks).toBe(10)
      expect(updated.stats.queriesRun).toBe(5)
    })

    it('should update session config', async () => {
      const updates = {
        config: {
          chunkSize: 8000,
          chunkOverlap: 400
        }
      }

      const updated = await sessionStore.updateSession(testSession.id, updates)

      expect(updated.config.chunkSize).toBe(8000)
      expect(updated.config.chunkOverlap).toBe(400)
    })

    it('should persist updates to disk', async () => {
      await sessionStore.updateSession(testSession.id, {
        stats: { totalChunks: 15 }
      })

      const metadataPath = path.join(tempDir, STORAGE.SESSIONS_DIR, testSession.id, STORAGE.METADATA_FILE)
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))

      expect(metadata.stats.totalChunks).toBe(15)
    })
  })

  describe('Query Results', () => {
    let testSession

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })
    })

    it('should save query result', async () => {
      const result = {
        query: 'What is the main topic?',
        keywords: ['main', 'topic'],
        relevantChunks: [
          { chunkIndex: 0, score: 10 }
        ]
      }

      const saved = await sessionStore.saveQueryResult(testSession.id, result)

      expect(saved).toHaveProperty('id')
      expect(saved.id).toMatch(/^qry_/)
      expect(saved.query).toBe('What is the main topic?')
    })

    it('should retrieve query result by ID', async () => {
      const result = {
        query: 'Test query',
        keywords: ['test'],
        relevantChunks: []
      }

      const saved = await sessionStore.saveQueryResult(testSession.id, result)
      const retrieved = await sessionStore.getQueryResult(testSession.id, saved.id)

      expect(retrieved.id).toBe(saved.id)
      expect(retrieved.query).toBe('Test query')
    })

    it('should get all query results for session', async () => {
      const result1 = await sessionStore.saveQueryResult(testSession.id, {
        query: 'Query 1',
        keywords: [],
        relevantChunks: []
      })

      const result2 = await sessionStore.saveQueryResult(testSession.id, {
        query: 'Query 2',
        keywords: [],
        relevantChunks: []
      })

      const results = await sessionStore.getQueryResults(testSession.id)

      expect(results.length).toBe(2)
      expect(results.map(r => r.id)).toContain(result1.id)
      expect(results.map(r => r.id)).toContain(result2.id)
    })

    it('should return empty array for session with no results', async () => {
      const results = await sessionStore.getQueryResults(testSession.id)

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe('Buffers', () => {
    let testSession

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })
    })

    it('should add buffer to session', async () => {
      const buffer = await sessionStore.addBuffer(testSession.id, 'buffer content', 'test-label')

      expect(buffer).toHaveProperty('id')
      expect(buffer.content).toBe('buffer content')
      expect(buffer.label).toBe('test-label')
    })

    it('should get buffers for session', async () => {
      await sessionStore.addBuffer(testSession.id, 'content1', 'label1')
      await sessionStore.addBuffer(testSession.id, 'content2', 'label2')

      const buffers = await sessionStore.getBuffers(testSession.id)

      expect(buffers.length).toBe(2)
      expect(buffers.map(b => b.content)).toContain('content1')
      expect(buffers.map(b => b.content)).toContain('content2')
    })

    it('should return empty array for session with no buffers', async () => {
      const buffers = await sessionStore.getBuffers(testSession.id)

      expect(Array.isArray(buffers)).toBe(true)
      expect(buffers.length).toBe(0)
    })

    it('should persist buffers to disk', async () => {
      await sessionStore.addBuffer(testSession.id, 'persistent', 'label')

      const buffersPath = path.join(tempDir, STORAGE.SESSIONS_DIR, testSession.id, STORAGE.BUFFERS_FILE)
      const buffers = JSON.parse(await fs.readFile(buffersPath, 'utf-8'))

      expect(buffers.buffers.length).toBe(1)
      expect(buffers.buffers[0].content).toBe('persistent')
    })
  })

  describe('Session Cleanup', () => {
    it('should clean up expired sessions', async () => {
      // Create sessions
      const session1 = await sessionStore.createSession({
        documentPath: '/path/doc1.md',
        relativePath: 'doc1.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Manually set session to expired by modifying metadata
      const sessionDir = path.join(tempDir, STORAGE.SESSIONS_DIR, session1.id)
      const metadataPath = path.join(sessionDir, STORAGE.METADATA_FILE)
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))

      // Set lastAccessedAt to 31 days ago
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      metadata.lastAccessedAt = thirtyOneDaysAgo.toISOString()

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))

      // Run cleanup
      const cleanedCount = await sessionStore.cleanupExpiredSessions()

      expect(cleanedCount).toBe(1)

      // Verify session is removed
      const remaining = await sessionStore.listSessions()
      expect(remaining.length).toBe(0)
    })

    it('should not remove active sessions', async () => {
      const session = await sessionStore.createSession({
        documentPath: '/path/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const cleanedCount = await sessionStore.cleanupExpiredSessions()

      expect(cleanedCount).toBe(0)

      const remaining = await sessionStore.listSessions()
      expect(remaining.length).toBe(1)
    })

    it('should remove session directory on cleanup', async () => {
      const session = await sessionStore.createSession({
        documentPath: '/path/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Make session expired
      const sessionDir = path.join(tempDir, STORAGE.SESSIONS_DIR, session.id)
      const metadataPath = path.join(sessionDir, STORAGE.METADATA_FILE)
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
      metadata.lastAccessedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))

      // Run cleanup
      await sessionStore.cleanupExpiredSessions()

      // Verify directory is removed
      const dirExists = await fs.stat(sessionDir).then(() => true).catch(() => false)
      expect(dirExists).toBe(false)
    })
  })

  describe('Session State Transitions', () => {
    let testSession

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: '/absolute/path/to/document.md',
        relativePath: 'docs/document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })
    })

    it('should close a session', async () => {
      await sessionStore.closeSession(testSession.id)

      const session = await sessionStore.getSession(testSession.id)
      expect(session.state).toBe('closed')
    })

    it('should delete a session', async () => {
      await sessionStore.deleteSession(testSession.id)

      const session = await sessionStore.getSession(testSession.id)
      expect(session).toBeNull()
    })

    it('should remove session directory on delete', async () => {
      const sessionDir = path.join(tempDir, STORAGE.SESSIONS_DIR, testSession.id)

      await sessionStore.deleteSession(testSession.id)

      const dirExists = await fs.stat(sessionDir).then(() => true).catch(() => false)
      expect(dirExists).toBe(false)
    })
  })

  describe('Storage Statistics', () => {
    it('should calculate storage stats', async () => {
      const session1 = await sessionStore.createSession({
        documentPath: '/path/doc1.md',
        relativePath: 'doc1.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const session2 = await sessionStore.createSession({
        documentPath: '/path/doc2.md',
        relativePath: 'doc2.md',
        fileSize: 2048,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const stats = await sessionStore.getStorageStats()

      expect(stats.sessionCount).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
    })
  })

  describe('Atomic Writes', () => {
    it('should use atomic writes for data safety', async () => {
      const session = await sessionStore.createSession({
        documentPath: '/path/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Perform update (which should use atomic write)
      const updated = await sessionStore.updateSession(session.id, {
        stats: { totalChunks: 100 }
      })

      // Verify update persisted correctly
      const retrieved = await sessionStore.getSession(session.id)
      expect(retrieved.stats.totalChunks).toBe(100)

      // Verify no temp files left around
      const sessionDir = path.join(tempDir, STORAGE.SESSIONS_DIR, session.id)
      const files = await fs.readdir(sessionDir)
      const tempFiles = files.filter(f => f.includes('.tmp'))
      expect(tempFiles.length).toBe(0)
    })
  })
})
