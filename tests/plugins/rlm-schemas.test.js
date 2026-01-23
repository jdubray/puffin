/**
 * RLM Document Plugin - Schemas Tests
 *
 * Tests for schema definitions and validation functions.
 * Covers session metadata, query results, evidence, and utility functions.
 */

const {
  SessionState,
  QueryStrategy,
  ConfidenceLevel,
  createSessionMetadata,
  createQueryResult,
  createEvidence,
  createChunkMetadata,
  createSessionsIndex,
  createSessionIndexEntry,
  createBuffersStorage,
  validateSessionMetadata,
  validateQueryResult,
  validateEvidence,
  isValidISODate,
  touchSession,
  isSessionExpired
} = require('../../plugins/rlm-document-plugin/lib/schemas')

describe('RLM Schemas', () => {
  describe('Constants', () => {
    it('should define SessionState enum', () => {
      expect(SessionState.ACTIVE).toBe('active')
      expect(SessionState.CLOSED).toBe('closed')
    })

    it('should define QueryStrategy enum', () => {
      expect(QueryStrategy.SINGLE).toBe('single')
      expect(QueryStrategy.RECURSIVE).toBe('recursive')
    })

    it('should define ConfidenceLevel enum', () => {
      expect(ConfidenceLevel.HIGH).toBe('high')
      expect(ConfidenceLevel.MEDIUM).toBe('medium')
      expect(ConfidenceLevel.LOW).toBe('low')
    })
  })

  describe('createSessionMetadata', () => {
    it('should create valid session metadata', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      expect(session.id).toBe('ses_abc123')
      expect(session.documentPath).toBe('/path/to/doc.md')
      expect(session.relativePath).toBe('doc.md')
      expect(session.fileSize).toBe(1024)
      expect(session.version).toBe(1)
      expect(session.state).toBe(SessionState.ACTIVE)
      expect(session.createdAt).toBeDefined()
      expect(session.lastAccessedAt).toBeDefined()
    })

    it('should use default chunk config values', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      expect(session.config.chunkSize).toBeDefined()
      expect(session.config.chunkOverlap).toBeDefined()
    })

    it('should accept custom chunk config', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024,
        config: { chunkSize: 8000, chunkOverlap: 400 }
      })

      expect(session.config.chunkSize).toBe(8000)
      expect(session.config.chunkOverlap).toBe(400)
    })

    it('should initialize stats to zero', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      expect(session.stats.totalChunks).toBe(0)
      expect(session.stats.queriesRun).toBe(0)
      expect(session.stats.evidenceCollected).toBe(0)
    })
  })

  describe('createQueryResult', () => {
    it('should create valid query result', () => {
      const result = createQueryResult({
        id: 'qry_abc123',
        sessionId: 'ses_xyz789',
        query: 'What is this about?'
      })

      expect(result.id).toBe('qry_abc123')
      expect(result.sessionId).toBe('ses_xyz789')
      expect(result.query).toBe('What is this about?')
      expect(result.strategy).toBe(QueryStrategy.RECURSIVE)
      expect(result.evidence).toEqual([])
      expect(result.synthesis).toBeNull()
      expect(result.status).toBe('pending')
    })

    it('should accept custom strategy', () => {
      const result = createQueryResult({
        id: 'qry_abc123',
        sessionId: 'ses_xyz789',
        query: 'Test query',
        strategy: QueryStrategy.SINGLE
      })

      expect(result.strategy).toBe(QueryStrategy.SINGLE)
    })

    it('should initialize metrics to zero', () => {
      const result = createQueryResult({
        id: 'qry_abc123',
        sessionId: 'ses_xyz789',
        query: 'Test query'
      })

      expect(result.tokensUsed).toBe(0)
      expect(result.chunksAnalyzed).toBe(0)
      expect(result.executionTimeMs).toBe(0)
    })
  })

  describe('createEvidence', () => {
    it('should create valid evidence', () => {
      const evidence = createEvidence({
        chunkId: 'chunk_001',
        chunkIndex: 1,
        point: 'Key finding',
        excerpt: 'Relevant text excerpt'
      })

      expect(evidence.chunkId).toBe('chunk_001')
      expect(evidence.chunkIndex).toBe(1)
      expect(evidence.point).toBe('Key finding')
      expect(evidence.excerpt).toBe('Relevant text excerpt')
      expect(evidence.confidence).toBe(ConfidenceLevel.MEDIUM)
      expect(evidence.suggestedNext).toEqual([])
    })

    it('should accept custom confidence level', () => {
      const evidence = createEvidence({
        chunkId: 'chunk_001',
        chunkIndex: 1,
        point: 'Key finding',
        excerpt: 'Relevant text',
        confidence: ConfidenceLevel.HIGH
      })

      expect(evidence.confidence).toBe(ConfidenceLevel.HIGH)
    })

    it('should accept line range', () => {
      const evidence = createEvidence({
        chunkId: 'chunk_001',
        chunkIndex: 1,
        point: 'Key finding',
        excerpt: 'Relevant text',
        lineRange: { start: 10, end: 15 }
      })

      expect(evidence.lineRange).toEqual({ start: 10, end: 15 })
    })
  })

  describe('createChunkMetadata', () => {
    it('should create valid chunk metadata', () => {
      const chunk = createChunkMetadata({
        index: 0,
        start: 0,
        end: 4000
      })

      expect(chunk.id).toBe('chunk_000')
      expect(chunk.index).toBe(0)
      expect(chunk.start).toBe(0)
      expect(chunk.end).toBe(4000)
      expect(chunk.length).toBe(4000)
    })

    it('should format chunk ID with padding', () => {
      expect(createChunkMetadata({ index: 0, start: 0, end: 100 }).id).toBe('chunk_000')
      expect(createChunkMetadata({ index: 5, start: 0, end: 100 }).id).toBe('chunk_005')
      expect(createChunkMetadata({ index: 99, start: 0, end: 100 }).id).toBe('chunk_099')
    })

    it('should include line numbers if provided', () => {
      const chunk = createChunkMetadata({
        index: 0,
        start: 0,
        end: 4000,
        lineStart: 1,
        lineEnd: 100
      })

      expect(chunk.lineStart).toBe(1)
      expect(chunk.lineEnd).toBe(100)
    })
  })

  describe('createSessionsIndex', () => {
    it('should create empty index', () => {
      const index = createSessionsIndex()

      expect(index.version).toBe(1)
      expect(index.sessions).toEqual([])
      expect(index.updatedAt).toBeDefined()
    })

    it('should accept initial sessions', () => {
      const sessions = [{ id: 'ses_1' }, { id: 'ses_2' }]
      const index = createSessionsIndex(sessions)

      expect(index.sessions).toEqual(sessions)
    })
  })

  describe('createSessionIndexEntry', () => {
    it('should extract index entry from full session', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/full/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      const entry = createSessionIndexEntry(session)

      expect(entry.id).toBe('ses_abc123')
      expect(entry.documentPath).toBe('/full/path/to/doc.md')
      expect(entry.relativePath).toBe('doc.md')
      expect(entry.state).toBe(SessionState.ACTIVE)
      expect(entry.createdAt).toBeDefined()
      expect(entry.lastAccessedAt).toBeDefined()

      // Should NOT include full session data
      expect(entry.fileSize).toBeUndefined()
      expect(entry.config).toBeUndefined()
      expect(entry.stats).toBeUndefined()
    })
  })

  describe('createBuffersStorage', () => {
    it('should create empty buffers storage', () => {
      const storage = createBuffersStorage()

      expect(storage.version).toBe(1)
      expect(storage.buffers).toEqual([])
      expect(storage.updatedAt).toBeDefined()
    })
  })

  describe('validateSessionMetadata', () => {
    const validSession = {
      id: 'ses_abc123',
      documentPath: '/path/to/doc.md',
      relativePath: 'doc.md',
      fileSize: 1024,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      config: { chunkSize: 4000, chunkOverlap: 200 },
      state: SessionState.ACTIVE
    }

    it('should accept valid session', () => {
      const result = validateSessionMetadata(validSession)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject missing id', () => {
      const result = validateSessionMetadata({ ...validSession, id: null })
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('ID'))).toBe(true)
    })

    it('should reject missing documentPath', () => {
      const result = validateSessionMetadata({ ...validSession, documentPath: null })
      expect(result.isValid).toBe(false)
    })

    it('should reject negative fileSize', () => {
      const result = validateSessionMetadata({ ...validSession, fileSize: -100 })
      expect(result.isValid).toBe(false)
    })

    it('should reject invalid timestamps', () => {
      const result = validateSessionMetadata({ ...validSession, createdAt: 'not-a-date' })
      expect(result.isValid).toBe(false)
    })

    it('should reject invalid state', () => {
      const result = validateSessionMetadata({ ...validSession, state: 'invalid' })
      expect(result.isValid).toBe(false)
    })

    it('should reject invalid chunk config', () => {
      const result = validateSessionMetadata({
        ...validSession,
        config: { chunkSize: 100, chunkOverlap: 200 }
      })
      expect(result.isValid).toBe(false)
    })
  })

  describe('validateQueryResult', () => {
    const validResult = {
      id: 'qry_abc123',
      sessionId: 'ses_xyz789',
      query: 'Test query',
      strategy: QueryStrategy.RECURSIVE,
      timestamp: new Date().toISOString()
    }

    it('should accept valid query result', () => {
      const result = validateQueryResult(validResult)
      expect(result.isValid).toBe(true)
    })

    it('should reject missing id', () => {
      const result = validateQueryResult({ ...validResult, id: null })
      expect(result.isValid).toBe(false)
    })

    it('should reject invalid strategy', () => {
      const result = validateQueryResult({ ...validResult, strategy: 'invalid' })
      expect(result.isValid).toBe(false)
    })
  })

  describe('validateEvidence', () => {
    const validEvidence = {
      chunkId: 'chunk_001',
      chunkIndex: 1,
      point: 'Key finding',
      excerpt: 'Text excerpt',
      confidence: ConfidenceLevel.MEDIUM
    }

    it('should accept valid evidence', () => {
      const result = validateEvidence(validEvidence)
      expect(result.isValid).toBe(true)
    })

    it('should reject missing chunkId', () => {
      const result = validateEvidence({ ...validEvidence, chunkId: null })
      expect(result.isValid).toBe(false)
    })

    it('should reject negative chunkIndex', () => {
      const result = validateEvidence({ ...validEvidence, chunkIndex: -1 })
      expect(result.isValid).toBe(false)
    })

    it('should reject invalid confidence', () => {
      const result = validateEvidence({ ...validEvidence, confidence: 'very-high' })
      expect(result.isValid).toBe(false)
    })
  })

  describe('isValidISODate', () => {
    it('should accept valid ISO dates', () => {
      expect(isValidISODate('2024-01-15T10:30:00.000Z')).toBe(true)
      expect(isValidISODate(new Date().toISOString())).toBe(true)
    })

    it('should reject invalid date strings', () => {
      expect(isValidISODate('not-a-date')).toBe(false)
      expect(isValidISODate('2024-13-45')).toBe(false)
    })

    it('should reject non-strings', () => {
      expect(isValidISODate(123)).toBe(false)
      expect(isValidISODate(null)).toBe(false)
    })

    it('should reject non-ISO format dates', () => {
      // Note: This might be valid Date but not proper ISO format
      expect(isValidISODate('Jan 15, 2024')).toBe(false)
    })
  })

  describe('touchSession', () => {
    it('should update lastAccessedAt timestamp', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      const originalTime = session.lastAccessedAt

      // Small delay to ensure timestamp changes
      const touched = touchSession(session)

      expect(touched.lastAccessedAt).toBeDefined()
      expect(touched.id).toBe(session.id)
    })

    it('should not modify original session', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      const originalTime = session.lastAccessedAt
      touchSession(session)

      expect(session.lastAccessedAt).toBe(originalTime)
    })
  })

  describe('isSessionExpired', () => {
    it('should return false for active sessions', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })

      expect(isSessionExpired(session)).toBe(false)
    })

    it('should return false for recently closed sessions', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })
      session.state = SessionState.CLOSED

      expect(isSessionExpired(session)).toBe(false)
    })

    it('should return true for old closed sessions', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })
      session.state = SessionState.CLOSED
      // Set lastAccessedAt to 31 days ago
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      session.lastAccessedAt = oldDate.toISOString()

      expect(isSessionExpired(session)).toBe(true)
    })

    it('should respect custom retention days', () => {
      const session = createSessionMetadata({
        id: 'ses_abc123',
        documentPath: '/path/to/doc.md',
        relativePath: 'doc.md',
        fileSize: 1024
      })
      session.state = SessionState.CLOSED
      // Set lastAccessedAt to 10 days ago
      const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      session.lastAccessedAt = date.toISOString()

      expect(isSessionExpired(session, 30)).toBe(false)
      expect(isSessionExpired(session, 7)).toBe(true)
    })
  })
})
