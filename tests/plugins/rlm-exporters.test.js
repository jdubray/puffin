/**
 * RLM Document Plugin - Exporters Tests
 *
 * Tests for JSON and Markdown export functionality.
 * Covers session export, format validation, and content integrity.
 */

const {
  exportJson,
  exportMarkdown,
  exportSession,
  getExportFormats
} = require('../../plugins/rlm-document-plugin/lib/exporters')

describe('RLM Exporters', () => {
  const mockSession = {
    id: 'ses_test123',
    documentPath: '/absolute/path/to/document.md',
    relativePath: 'docs/document.md',
    fileSize: 10240,
    createdAt: '2026-01-22T10:00:00Z',
    lastAccessedAt: '2026-01-22T11:00:00Z',
    config: {
      chunkSize: 4000,
      chunkOverlap: 200
    },
    stats: {
      totalChunks: 5,
      queriesRun: 3,
      evidenceCollected: 12
    },
    state: 'active'
  }

  const mockResults = [
    {
      id: 'qry_001',
      sessionId: 'ses_test123',
      query: 'What is the main topic?',
      timestamp: '2026-01-22T10:30:00Z',
      evidence: [
        {
          point: 'The document covers data structures',
          confidence: 'high',
          lineRange: [1, 50]
        }
      ],
      synthesis: 'The document is about data structures in JavaScript'
    },
    {
      id: 'qry_002',
      sessionId: 'ses_test123',
      query: 'Explain the algorithm',
      timestamp: '2026-01-22T10:45:00Z',
      evidence: [
        {
          point: 'Algorithm uses quicksort',
          confidence: 'high',
          lineRange: [100, 150]
        }
      ],
      synthesis: 'The algorithm implementation uses quicksort for efficiency'
    }
  ]

  describe('getExportFormats', () => {
    it('should return available export formats', () => {
      const formats = getExportFormats()

      expect(Array.isArray(formats)).toBe(true)
      expect(formats.length).toBeGreaterThan(0)
    })

    it('should include json format', () => {
      const formats = getExportFormats()

      expect(formats).toContain('json')
    })

    it('should include markdown format', () => {
      const formats = getExportFormats()

      expect(formats).toContain('markdown')
    })

    it('should only return supported formats', () => {
      const formats = getExportFormats()

      formats.forEach(fmt => {
        expect(['json', 'markdown']).toContain(fmt)
      })
    })
  })

  describe('exportJson', () => {
    it('should export session as JSON', () => {
      const result = exportJson(mockSession, mockResults)

      expect(result).toHaveProperty('format')
      expect(result.format).toBe('json')
      expect(result).toHaveProperty('content')
      expect(result).toHaveProperty('mimeType')
      expect(result.mimeType).toBe('application/json')
    })

    it('should include filename in export', () => {
      const result = exportJson(mockSession, mockResults)

      expect(result).toHaveProperty('filename')
      expect(result.filename).toContain('.json')
    })

    it('should produce valid JSON', () => {
      const result = exportJson(mockSession, mockResults)

      expect(() => JSON.parse(result.content)).not.toThrow()
    })

    it('should include session metadata in export', () => {
      const result = exportJson(mockSession, mockResults)
      const data = JSON.parse(result.content)

      expect(data).toHaveProperty('session')
      expect(data.session.id).toBe('ses_test123')
      expect(data.session.documentPath).toBe('/absolute/path/to/document.md')
      expect(data.session.fileSize).toBe(10240)
    })

    it('should include query results in export', () => {
      const result = exportJson(mockSession, mockResults)
      const data = JSON.parse(result.content)

      expect(data).toHaveProperty('results')
      expect(Array.isArray(data.results)).toBe(true)
      expect(data.results.length).toBe(2)
    })

    it('should include all query fields', () => {
      const result = exportJson(mockSession, mockResults)
      const data = JSON.parse(result.content)

      const firstResult = data.results[0]
      expect(firstResult).toHaveProperty('id')
      expect(firstResult).toHaveProperty('query')
      expect(firstResult).toHaveProperty('timestamp')
      expect(firstResult).toHaveProperty('evidence')
      expect(firstResult).toHaveProperty('synthesis')
    })

    it('should include metadata section', () => {
      const result = exportJson(mockSession, mockResults)
      const data = JSON.parse(result.content)

      expect(data).toHaveProperty('metadata')
      expect(data.metadata).toHaveProperty('exportedAt')
      expect(data.metadata).toHaveProperty('sessionCount')
      expect(data.metadata).toHaveProperty('resultCount')
    })

    it('should handle empty results', () => {
      const result = exportJson(mockSession, [])

      expect(() => JSON.parse(result.content)).not.toThrow()
      const data = JSON.parse(result.content)
      expect(data.results.length).toBe(0)
    })

    it('should handle large content gracefully', () => {
      const largeResults = Array.from({ length: 100 }, (_, i) => ({
        id: `qry_${i}`,
        sessionId: 'ses_test123',
        query: `Query ${i}`,
        timestamp: '2026-01-22T10:00:00Z',
        evidence: [],
        synthesis: 'Result ' + i
      }))

      const result = exportJson(mockSession, largeResults)

      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(0)
    })

    it('should include export options if provided', () => {
      const options = { includeBuffers: true }
      const result = exportJson(mockSession, mockResults, options)

      expect(result.content).toBeDefined()
      const data = JSON.parse(result.content)
      expect(data.metadata.exportOptions).toEqual(options)
    })
  })

  describe('exportMarkdown', () => {
    it('should export session as Markdown', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result).toHaveProperty('format')
      expect(result.format).toBe('markdown')
      expect(result).toHaveProperty('content')
      expect(result).toHaveProperty('mimeType')
      expect(result.mimeType).toBe('text/markdown')
    })

    it('should include filename in export', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result).toHaveProperty('filename')
      expect(result.filename).toContain('.md')
    })

    it('should produce valid Markdown', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(0)
      // Markdown should contain headers
      expect(result.content).toContain('#')
    })

    it('should include session header', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toContain('Document Analyzer Export')
      expect(result.content).toContain(mockSession.relativePath)
    })

    it('should include session information section', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toContain('Document')
      expect(result.content).toContain(mockSession.relativePath)
      expect(result.content).toContain('Active')
    })

    it('should include query results section', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toContain('Analysis Results')
      expect(result.content).toContain('What is the main topic?')
      expect(result.content).toContain('Explain the algorithm')
    })

    it('should include evidence in results', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toContain('Evidence')
      expect(result.content).toContain('The document covers data structures')
    })

    it('should include synthesis summary', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toContain('Synthesis')
      expect(result.content).toContain('data structures')
    })

    it('should escape special Markdown characters', () => {
      const resultWithSpecial = [
        {
          id: 'qry_special',
          sessionId: 'ses_test123',
          query: 'Query with [brackets] and *asterisks*',
          timestamp: '2026-01-22T10:00:00Z',
          evidence: [],
          synthesis: 'Result with `code` and _underscore_'
        }
      ]

      const result = exportMarkdown(mockSession, resultWithSpecial)

      // Should handle special characters without breaking Markdown
      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(0)
    })

    it('should handle empty results', () => {
      const result = exportMarkdown(mockSession, [])

      expect(result.content).toBeDefined()
      expect(result.content).toContain('Analysis Results')
    })

    it('should include metadata footer', () => {
      const result = exportMarkdown(mockSession, mockResults)

      expect(result.content).toContain('Exported')
      expect(result.content).toContain('RLM Document Analyzer')
    })

    it('should format large content readably', () => {
      const largeResults = Array.from({ length: 50 }, (_, i) => ({
        id: `qry_${i}`,
        sessionId: 'ses_test123',
        query: `Query ${i}`,
        timestamp: '2026-01-22T10:00:00Z',
        evidence: [{ point: `Evidence ${i}`, confidence: 'high' }],
        synthesis: `Summary of query ${i}`
      }))

      const result = exportMarkdown(mockSession, largeResults)

      expect(result.content).toBeDefined()
      // Should still be readable
      expect(result.content.includes('\n')).toBe(true)
    })
  })

  describe('exportSession', () => {
    it('should export to JSON format', () => {
      const result = exportSession(mockSession, mockResults, 'json')

      expect(result.format).toBe('json')
      expect(result.mimeType).toBe('application/json')
    })

    it('should export to Markdown format', () => {
      const result = exportSession(mockSession, mockResults, 'markdown')

      expect(result.format).toBe('markdown')
      expect(result.mimeType).toBe('text/markdown')
    })

    it('should throw error for unsupported format', () => {
      expect(() => {
        exportSession(mockSession, mockResults, 'pdf')
      }).toThrow()
    })

    it('should pass through export options', () => {
      const options = { includeBuffers: false, pretty: true }
      const result = exportSession(mockSession, mockResults, 'json', options)

      expect(() => JSON.parse(result.content)).not.toThrow()
    })

    it('should include proper headers for content download', () => {
      const result = exportSession(mockSession, mockResults, 'json')

      expect(result).toHaveProperty('filename')
      expect(result).toHaveProperty('mimeType')
      expect(result.filename).toMatch(/\d{4}-\d{2}-\d{2}/)
    })

    it('should use session ID in filename', () => {
      const result = exportSession(mockSession, mockResults, 'json')

      expect(result.filename).toContain('ses_test123')
    })

    it('should use format extension in filename', () => {
      const jsonResult = exportSession(mockSession, mockResults, 'json')
      const mdResult = exportSession(mockSession, mockResults, 'markdown')

      expect(jsonResult.filename).toContain('.json')
      expect(mdResult.filename).toContain('.md')
    })
  })

  describe('Content Integrity', () => {
    it('should preserve query text in both formats', () => {
      const jsonResult = exportJson(mockSession, mockResults)
      const mdResult = exportMarkdown(mockSession, mockResults)

      const jsonContent = JSON.parse(jsonResult.content)
      expect(jsonContent.results[0].query).toBe('What is the main topic?')
      expect(mdResult.content).toContain('What is the main topic?')
    })

    it('should preserve evidence in both formats', () => {
      const jsonResult = exportJson(mockSession, mockResults)
      const mdResult = exportMarkdown(mockSession, mockResults)

      const jsonContent = JSON.parse(jsonResult.content)
      expect(jsonContent.results[0].evidence[0].point).toBe('The document covers data structures')
      expect(mdResult.content).toContain('The document covers data structures')
    })

    it('should preserve synthesis in both formats', () => {
      const jsonResult = exportJson(mockSession, mockResults)
      const mdResult = exportMarkdown(mockSession, mockResults)

      const jsonContent = JSON.parse(jsonResult.content)
      expect(jsonContent.results[0].synthesis).toContain('data structures')
      expect(mdResult.content).toContain('data structures')
    })

    it('should handle special characters in queries', () => {
      const specialResults = [
        {
          id: 'qry_special',
          sessionId: 'ses_test123',
          query: 'Query with "quotes" and \'apostrophes\' and \\ backslash',
          timestamp: '2026-01-22T10:00:00Z',
          evidence: [],
          synthesis: 'Result'
        }
      ]

      const jsonResult = exportJson(mockSession, specialResults)
      const mdResult = exportMarkdown(mockSession, specialResults)

      // JSON should parse correctly
      expect(() => JSON.parse(jsonResult.content)).not.toThrow()
      const parsed = JSON.parse(jsonResult.content)
      expect(parsed.results[0].query).toContain('quotes')

      // Markdown should render
      expect(mdResult.content).toBeDefined()
    })

    it('should handle unicode in content', () => {
      const unicodeResults = [
        {
          id: 'qry_unicode',
          sessionId: 'ses_test123',
          query: '你好世界 émojis 🚀 and special chars',
          timestamp: '2026-01-22T10:00:00Z',
          evidence: [],
          synthesis: 'Unicode test'
        }
      ]

      const jsonResult = exportJson(mockSession, unicodeResults)
      const mdResult = exportMarkdown(mockSession, unicodeResults)

      const parsed = JSON.parse(jsonResult.content)
      expect(parsed.results[0].query).toContain('你好')
      expect(mdResult.content).toContain('🚀')
    })
  })

  describe('Export Performance', () => {
    it('should handle large result sets efficiently', () => {
      const largeResults = Array.from({ length: 1000 }, (_, i) => ({
        id: `qry_${i}`,
        sessionId: 'ses_test123',
        query: `Query ${i}`,
        timestamp: '2026-01-22T10:00:00Z',
        evidence: Array.from({ length: 5 }, (_, j) => ({
          point: `Evidence ${j}`,
          confidence: 'high'
        })),
        synthesis: `Result ${i}`
      }))

      const startJson = Date.now()
      const jsonResult = exportJson(mockSession, largeResults)
      const jsonTime = Date.now() - startJson

      const startMd = Date.now()
      const mdResult = exportMarkdown(mockSession, largeResults)
      const mdTime = Date.now() - startMd

      // Should complete in reasonable time (< 5 seconds)
      expect(jsonTime).toBeLessThan(5000)
      expect(mdTime).toBeLessThan(5000)

      expect(jsonResult.content.length).toBeGreaterThan(0)
      expect(mdResult.content.length).toBeGreaterThan(0)
    })

    it('should not truncate content unnecessarily', () => {
      const longResult = [
        {
          id: 'qry_long',
          sessionId: 'ses_test123',
          query: 'Query',
          timestamp: '2026-01-22T10:00:00Z',
          evidence: [
            {
              point: 'A'.repeat(10000),
              confidence: 'high'
            }
          ],
          synthesis: 'B'.repeat(5000)
        }
      ]

      const result = exportJson(mockSession, longResult)
      const parsed = JSON.parse(result.content)

      expect(parsed.results[0].evidence[0].point.length).toBe(10000)
      expect(parsed.results[0].synthesis.length).toBe(5000)
    })
  })

  describe('Error Handling', () => {
    it('should handle null session gracefully', () => {
      expect(() => {
        exportJson(null, mockResults)
      }).toThrow()
    })

    it('should handle null results gracefully', () => {
      const result = exportJson(mockSession, null)

      expect(result).toBeDefined()
    })

    it('should handle malformed session data', () => {
      const malformedSession = { id: 'ses_test' }

      const result = exportJson(malformedSession, [])
      const parsed = JSON.parse(result.content)

      expect(parsed).toHaveProperty('session')
    })
  })
})
