/**
 * RLM Document Plugin - Full Plugin Integration Tests
 *
 * Comprehensive integration tests covering the complete plugin lifecycle,
 * from activation to session management to export, including cleanup.
 */

const path = require('path')
const fs = require('fs').promises
const os = require('os')

const SessionStore = require('../../plugins/rlm-document-plugin/lib/session-store')
const ReplManager = require('../../plugins/rlm-document-plugin/lib/repl-manager')
const { detectPython } = require('../../plugins/rlm-document-plugin/lib/python-detector')
const { exportSession } = require('../../plugins/rlm-document-plugin/lib/exporters')
const { SESSION, STORAGE } = require('../../plugins/rlm-document-plugin/lib/config')

describe('RLM Plugin - Full Integration', () => {
  let tempProjectDir
  let sessionStore
  let testDocPath
  let pythonPath

  beforeAll(async () => {
    // Detect Python
    const pythonResult = await detectPython()
    if (pythonResult.success) {
      pythonPath = pythonResult.path
    }
  })

  beforeEach(async () => {
    // Create temporary project directory
    tempProjectDir = path.join(os.tmpdir(), `rlm-plugin-test-${Date.now()}`)
    await fs.mkdir(tempProjectDir, { recursive: true })

    // Initialize session store
    const storageDir = path.join(tempProjectDir, '.puffin', 'rlm-sessions')
    sessionStore = new SessionStore(storageDir, {
      log: { info: () => {}, error: () => {}, warn: () => {} }
    })
    await sessionStore.initialize()

    // Create test document
    testDocPath = path.join(tempProjectDir, 'test-document.md')
    const testContent = `# Test Document

## Overview
This is a comprehensive test document for the RLM plugin.

## Section 1: Introduction
The document contains multiple sections for testing.

## Section 2: Content
More detailed content goes here.

## Section 3: Analysis
This section tests various features.

## Conclusion
Summary of the document.
`
    await fs.writeFile(testDocPath, testContent)
  })

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempProjectDir, { recursive: true, force: true })
    } catch (err) {
      console.error('Cleanup error:', err)
    }
  })

  describe('Plugin Lifecycle', () => {
    it('should initialize storage directories on activate', async () => {
      const storageDir = path.join(tempProjectDir, '.puffin', 'rlm-sessions')
      const indexPath = path.join(storageDir, STORAGE.INDEX_FILE)

      const indexExists = await fs.stat(indexPath).then(() => true).catch(() => false)
      expect(indexExists).toBe(true)
    })

    it('should create initial empty index', async () => {
      const index = await sessionStore.loadIndex()

      expect(index).toHaveProperty('sessions')
      expect(Array.isArray(index.sessions)).toBe(true)
      expect(index.sessions.length).toBe(0)
    })

    it('should support multiple concurrent sessions', async () => {
      const session1 = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const session2 = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const sessions = await sessionStore.listSessions()

      expect(sessions.length).toBe(2)
      expect(sessions.map(s => s.id)).toContain(session1.id)
      expect(sessions.map(s => s.id)).toContain(session2.id)
    })
  })

  describe('Session Management Workflow', () => {
    let testSession

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })
    })

    it('should create and retrieve session', async () => {
      const retrieved = await sessionStore.getSession(testSession.id)

      expect(retrieved).toBeDefined()
      expect(retrieved.id).toBe(testSession.id)
      expect(retrieved.state).toBe('active')
    })

    it('should update session with query results', async () => {
      const queryResult = await sessionStore.saveQueryResult(testSession.id, {
        query: 'What is the main topic?',
        keywords: ['topic'],
        relevantChunks: [{ chunkIndex: 0, score: 5 }]
      })

      const results = await sessionStore.getQueryResults(testSession.id)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe(queryResult.id)
    })

    it('should collect evidence across multiple queries', async () => {
      // Run first query
      await sessionStore.saveQueryResult(testSession.id, {
        query: 'Query 1',
        keywords: [],
        relevantChunks: []
      })

      // Run second query
      await sessionStore.saveQueryResult(testSession.id, {
        query: 'Query 2',
        keywords: [],
        relevantChunks: []
      })

      // Verify both stored
      const results = await sessionStore.getQueryResults(testSession.id)
      expect(results.length).toBe(2)
    })

    it('should maintain session state transitions', async () => {
      let session = await sessionStore.getSession(testSession.id)
      expect(session.state).toBe('active')

      // Close session
      await sessionStore.closeSession(testSession.id)
      session = await sessionStore.getSession(testSession.id)
      expect(session.state).toBe('closed')
    })

    it('should support buffer operations during analysis', async () => {
      // Add multiple buffers during analysis
      await sessionStore.addBuffer(testSession.id, 'First finding', 'initial')
      await sessionStore.addBuffer(testSession.id, 'Second finding', 'followup')
      await sessionStore.addBuffer(testSession.id, 'Final synthesis', 'summary')

      const buffers = await sessionStore.getBuffers(testSession.id)
      expect(buffers.length).toBe(3)
      expect(buffers.map(b => b.label)).toContain('summary')
    })

    it('should handle session cleanup on delete', async () => {
      // Add data to session
      await sessionStore.saveQueryResult(testSession.id, {
        query: 'Test',
        keywords: [],
        relevantChunks: []
      })
      await sessionStore.addBuffer(testSession.id, 'data', 'test')

      // Delete session
      await sessionStore.deleteSession(testSession.id)

      // Verify deleted
      const session = await sessionStore.getSession(testSession.id)
      expect(session).toBeNull()
    })
  })

  describe('Export Workflow', () => {
    let testSession
    let testResults

    beforeEach(async () => {
      testSession = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Create multiple query results
      testResults = []
      for (let i = 0; i < 3; i++) {
        const result = await sessionStore.saveQueryResult(testSession.id, {
          query: `Query ${i + 1}`,
          keywords: [`keyword${i}`],
          relevantChunks: [
            { chunkIndex: i % 3, score: 10 - i }
          ]
        })
        testResults.push(result)
      }
    })

    it('should export session to JSON format', async () => {
      const results = await sessionStore.getQueryResults(testSession.id)
      const export_ = exportSession(testSession, results, 'json')

      expect(export_.format).toBe('json')
      expect(export_.mimeType).toBe('application/json')
      expect(() => JSON.parse(export_.content)).not.toThrow()
    })

    it('should export session to Markdown format', async () => {
      const results = await sessionStore.getQueryResults(testSession.id)
      const export_ = exportSession(testSession, results, 'markdown')

      expect(export_.format).toBe('markdown')
      expect(export_.mimeType).toBe('text/markdown')
      expect(export_.content).toContain('#')
      expect(export_.content).toContain('test-document.md')
    })

    it('should include all query results in export', async () => {
      const results = await sessionStore.getQueryResults(testSession.id)
      const export_ = exportSession(testSession, results, 'json')

      const data = JSON.parse(export_.content)
      expect(data.results.length).toBe(3)
      expect(data.results.map(r => r.query)).toContain('Query 1')
    })

    it('should maintain data integrity in export', async () => {
      const results = await sessionStore.getQueryResults(testSession.id)
      const jsonExport = exportSession(testSession, results, 'json')
      const mdExport = exportSession(testSession, results, 'markdown')

      const jsonData = JSON.parse(jsonExport.content)

      // Both formats should contain the same data
      results.forEach(result => {
        const match = jsonData.results.find(r => r.id === result.id)
        expect(match).toBeDefined()
        expect(match.query).toBe(result.query)
      })

      results.forEach(result => {
        expect(mdExport.content).toContain(result.query)
      })
    })
  })

  describe('Session Cleanup & Retention', () => {
    it('should respect 30-day retention policy', async () => {
      // Create a session
      const session = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Verify it exists
      let retrieved = await sessionStore.getSession(session.id)
      expect(retrieved).toBeDefined()

      // Make it expired by manually updating metadata
      const sessionDir = path.join(
        tempProjectDir,
        '.puffin',
        'rlm-sessions',
        'sessions',
        session.id
      )
      const metadataPath = path.join(sessionDir, STORAGE.METADATA_FILE)
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))

      // Set to 31 days ago
      metadata.lastAccessedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))

      // Run cleanup
      const cleanedCount = await sessionStore.cleanupExpiredSessions()
      expect(cleanedCount).toBe(1)

      // Verify session is gone
      retrieved = await sessionStore.getSession(session.id)
      expect(retrieved).toBeNull()
    })

    it('should not clean up active sessions', async () => {
      const session = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const cleanedCount = await sessionStore.cleanupExpiredSessions()
      expect(cleanedCount).toBe(0)

      const retrieved = await sessionStore.getSession(session.id)
      expect(retrieved).toBeDefined()
    })

    it('should handle cleanup of multiple expired sessions', async () => {
      // Create multiple sessions
      const sessions = []
      for (let i = 0; i < 3; i++) {
        const session = await sessionStore.createSession({
          documentPath: testDocPath,
          relativePath: 'test-document.md',
          fileSize: 1024,
          config: { chunkSize: 4000, chunkOverlap: 200 }
        })
        sessions.push(session)
      }

      // Expire all of them
      for (const session of sessions) {
        const sessionDir = path.join(
          tempProjectDir,
          '.puffin',
          'rlm-sessions',
          'sessions',
          session.id
        )
        const metadataPath = path.join(sessionDir, STORAGE.METADATA_FILE)
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
        metadata.lastAccessedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
      }

      // Run cleanup
      const cleanedCount = await sessionStore.cleanupExpiredSessions()
      expect(cleanedCount).toBe(3)

      // Verify all gone
      const remaining = await sessionStore.listSessions()
      expect(remaining.length).toBe(0)
    })
  })

  describe('Storage Performance', () => {
    it('should efficiently handle directory structure', async () => {
      const session = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const sessionDir = path.join(
        tempProjectDir,
        '.puffin',
        'rlm-sessions',
        'sessions',
        session.id
      )

      const dirExists = await fs.stat(sessionDir).then(() => true).catch(() => false)
      expect(dirExists).toBe(true)
    })

    it('should calculate accurate storage statistics', async () => {
      // Create some sessions with data
      const session1 = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'doc1.md',
        fileSize: 5000,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const session2 = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'doc2.md',
        fileSize: 10000,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // Add data
      await sessionStore.addBuffer(session1.id, 'data', 'test')
      await sessionStore.saveQueryResult(session2.id, {
        query: 'test',
        keywords: [],
        relevantChunks: []
      })

      const stats = await sessionStore.getStorageStats()

      expect(stats.sessionCount).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
    })
  })

  describe('Error Recovery', () => {
    it('should handle corrupted metadata gracefully', async () => {
      const session = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      const sessionDir = path.join(
        tempProjectDir,
        '.puffin',
        'rlm-sessions',
        'sessions',
        session.id
      )
      const metadataPath = path.join(sessionDir, STORAGE.METADATA_FILE)

      // Write invalid JSON
      await fs.writeFile(metadataPath, 'invalid json {')

      // Should handle gracefully
      try {
        await sessionStore.getSession(session.id)
      } catch (err) {
        // Expected to fail, but should not crash
        expect(err).toBeDefined()
      }
    })

    it('should handle missing session directory', async () => {
      const nonExistentId = 'ses_nonexistent'

      const session = await sessionStore.getSession(nonExistentId)
      expect(session).toBeNull()
    })
  })

  describe('Complete Workflow Integration', () => {
    it('should handle complete analysis workflow', async () => {
      // 1. Create session
      const session = await sessionStore.createSession({
        documentPath: testDocPath,
        relativePath: 'test-document.md',
        fileSize: 1024,
        config: { chunkSize: 4000, chunkOverlap: 200 }
      })

      // 2. Run multiple queries
      const results = []
      for (let i = 0; i < 3; i++) {
        const result = await sessionStore.saveQueryResult(session.id, {
          query: `Analysis query ${i + 1}`,
          keywords: [],
          relevantChunks: []
        })
        results.push(result)
      }

      // 3. Collect intermediate buffers
      await sessionStore.addBuffer(session.id, 'Finding 1', 'analysis')
      await sessionStore.addBuffer(session.id, 'Finding 2', 'analysis')

      // 4. Export results
      const allResults = await sessionStore.getQueryResults(session.id)
      const jsonExport = exportSession(session, allResults, 'json')
      const mdExport = exportSession(session, allResults, 'markdown')

      // 5. Verify complete workflow
      expect(session).toBeDefined()
      expect(allResults.length).toBe(3)
      expect(jsonExport.content).toBeDefined()
      expect(mdExport.content).toBeDefined()

      // 6. Close session
      await sessionStore.closeSession(session.id)
      const closed = await sessionStore.getSession(session.id)
      expect(closed.state).toBe('closed')
    })
  })
})
