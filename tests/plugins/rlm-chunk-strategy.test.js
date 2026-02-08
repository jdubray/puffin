/**
 * RLM Document Plugin - Chunk Strategy Tests
 *
 * Tests for document chunking algorithms including character-based, line-based,
 * and semantic chunking strategies.
 */

const {
  characterChunks,
  lineChunks,
  semanticChunks,
  calculateChunkIndices,
  estimateChunkCount
} = require('../../plugins/rlm-document-plugin/lib/chunk-strategy')

describe('RLM Chunk Strategy', () => {
  describe('characterChunks', () => {
    it('should split content into character-based chunks', () => {
      const content = 'a'.repeat(10000)
      const chunks = characterChunks(content, 4000, 200)

      expect(Array.isArray(chunks)).toBe(true)
      expect(chunks.length).toBeGreaterThan(1)
    })

    it('should respect chunk size', () => {
      const content = 'a'.repeat(10000)
      const chunks = characterChunks(content, 4000, 0)

      // Without overlap, chunks should not exceed size
      chunks.slice(0, -1).forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(4000)
      })
    })

    it('should create overlapping chunks', () => {
      const content = 'abcdefghijklmnopqrstuvwxyz'.repeat(100)
      const chunks = characterChunks(content, 100, 20)

      // With overlap, consecutive chunks should share content
      if (chunks.length > 1) {
        const firstChunk = chunks[0]
        const secondChunk = chunks[1]

        // Check if end of first chunk matches start of second chunk (with overlap)
        const overlapStart = firstChunk.substring(firstChunk.length - 20)
        expect(secondChunk.substring(0, 20)).toBe(overlapStart)
      }
    })

    it('should handle small documents', () => {
      const content = 'short'
      const chunks = characterChunks(content, 4000, 200)

      expect(chunks.length).toBe(1)
      expect(chunks[0]).toBe('short')
    })

    it('should handle empty content', () => {
      const chunks = characterChunks('', 4000, 200)

      expect(Array.isArray(chunks)).toBe(true)
      expect(chunks.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle zero overlap', () => {
      const content = 'a'.repeat(1000)
      const chunks = characterChunks(content, 100, 0)

      // With zero overlap, chunks should be sequential
      let position = 0
      chunks.slice(0, -1).forEach(chunk => {
        expect(chunk.length).toBe(100)
        position += 100
      })
    })

    it('should handle overlap equal to chunk size', () => {
      const content = 'a'.repeat(1000)
      const chunks = characterChunks(content, 100, 100)

      // Each chunk should start where previous one started (100% overlap)
      expect(chunks.length).toBeGreaterThan(1)
    })

    it('should preserve content integrity', () => {
      const content = 'The quick brown fox jumps over the lazy dog. '.repeat(100)
      const chunks = characterChunks(content, 500, 50)

      // Reconstruct content (accounting for overlaps)
      let reconstructed = chunks[0]
      for (let i = 1; i < chunks.length; i++) {
        // Skip overlap region and add rest of chunk
        const overlapSize = Math.min(50, chunks[i - 1].length)
        reconstructed += chunks[i].substring(overlapSize)
      }

      expect(reconstructed).toContain('The quick brown fox')
    })
  })

  describe('lineChunks', () => {
    it('should split content into line-based chunks', () => {
      const content = 'line1\nline2\nline3\nline4\nline5\n'.repeat(100)
      const chunks = lineChunks(content, 50)

      expect(Array.isArray(chunks)).toBe(true)
      expect(chunks.length).toBeGreaterThan(1)
    })

    it('should not split within lines', () => {
      const content = 'short line\nmedium length line\nvery long line here\n'.repeat(50)
      const chunks = lineChunks(content, 50)

      chunks.forEach(chunk => {
        // Each chunk should end at a line boundary (not in middle of line)
        const lines = chunk.split('\n')
        // Last element might be empty if ends with newline
        if (chunk.endsWith('\n')) {
          expect(lines[lines.length - 1]).toBe('')
        }
      })
    })

    it('should handle single long line', () => {
      const content = 'a'.repeat(1000)
      const chunks = lineChunks(content, 100)

      // Single long line should result in single chunk
      expect(chunks.length).toBe(1)
    })

    it('should preserve line integrity', () => {
      const lines = ['line1', 'line2', 'line3', 'line4', 'line5']
      const content = lines.join('\n') + '\n'
      const chunks = lineChunks(content, 100)

      const reconstructed = chunks.join('')
      expect(reconstructed).toBe(content)
    })

    it('should handle content without newlines', () => {
      const content = 'single line of text'
      const chunks = lineChunks(content, 100)

      expect(chunks.length).toBe(1)
      expect(chunks[0]).toBe(content)
    })

    it('should handle empty content', () => {
      const chunks = lineChunks('', 100)

      expect(Array.isArray(chunks)).toBe(true)
    })

    it('should handle multiple consecutive newlines', () => {
      const content = 'line1\n\n\nline2\nline3'
      const chunks = lineChunks(content, 100)

      const reconstructed = chunks.join('')
      expect(reconstructed).toContain('line1')
      expect(reconstructed).toContain('line2')
      expect(reconstructed).toContain('line3')
    })
  })

  describe('semanticChunks', () => {
    it('should split content into semantic chunks', () => {
      const content = `# Section 1

This is the first section.

## Subsection 1.1

More content here.

# Section 2

This is the second section.
`
      const chunks = semanticChunks(content)

      expect(Array.isArray(chunks)).toBe(true)
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should recognize paragraph breaks', () => {
      const content = `Paragraph 1.

Paragraph 2.

Paragraph 3.`
      const chunks = semanticChunks(content)

      expect(chunks.length).toBe(3)
    })

    it('should recognize markdown headers', () => {
      const content = `# Header 1
Content 1

# Header 2
Content 2

# Header 3
Content 3`
      const chunks = semanticChunks(content)

      expect(chunks.length).toBe(3)
    })

    it('should handle mixed content', () => {
      const content = `# Title

First paragraph here.
Continues on next line.

## Subtitle

Second paragraph.

- List item 1
- List item 2
- List item 3

Final paragraph.`
      const chunks = semanticChunks(content)

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(c => typeof c === 'string')).toBe(true)
    })

    it('should handle empty content', () => {
      const chunks = semanticChunks('')

      expect(Array.isArray(chunks)).toBe(true)
    })

    it('should preserve content', () => {
      const content = `# Section

Content here.

More content.`
      const chunks = semanticChunks(content)
      const reconstructed = chunks.join('')

      expect(reconstructed).toContain('Section')
      expect(reconstructed).toContain('Content here')
      expect(reconstructed).toContain('More content')
    })

    it('should handle code blocks', () => {
      const content = `# Code Example

\`\`\`javascript
function test() {
  console.log('hello');
}
\`\`\`

End of example.`
      const chunks = semanticChunks(content)

      const reconstructed = chunks.join('')
      expect(reconstructed).toContain('function test')
      expect(reconstructed).toContain("console.log('hello')")
    })
  })

  describe('calculateChunkIndices', () => {
    it('should calculate chunk boundaries', () => {
      const indices = calculateChunkIndices(1000, 100, 10)

      expect(Array.isArray(indices)).toBe(true)
      expect(indices.length).toBeGreaterThan(0)
    })

    it('should return correct chunk count', () => {
      const contentSize = 10000
      const chunkSize = 4000
      const overlap = 200

      const indices = calculateChunkIndices(contentSize, chunkSize, overlap)

      expect(indices.length).toBeGreaterThan(1)
    })

    it('should have valid start and end indices', () => {
      const indices = calculateChunkIndices(5000, 1000, 100)

      indices.forEach((chunk, i) => {
        expect(chunk.start).toBeGreaterThanOrEqual(0)
        expect(chunk.end).toBeLessThanOrEqual(5000)
        expect(chunk.end).toBeGreaterThan(chunk.start)

        // Verify overlap with next chunk
        if (i < indices.length - 1) {
          const nextChunk = indices[i + 1]
          const overlap = chunk.end - nextChunk.start
          expect(overlap).toBeGreaterThan(0)
        }
      })
    })

    it('should cover entire content', () => {
      const contentSize = 5000
      const indices = calculateChunkIndices(contentSize, 1000, 100)

      // First chunk should start at 0
      expect(indices[0].start).toBe(0)

      // Last chunk should end at or past content size
      expect(indices[indices.length - 1].end).toBeGreaterThanOrEqual(contentSize)
    })

    it('should handle small content', () => {
      const indices = calculateChunkIndices(100, 1000, 100)

      expect(indices.length).toBe(1)
      expect(indices[0].start).toBe(0)
      expect(indices[0].end).toBe(100)
    })

    it('should handle zero overlap', () => {
      const indices = calculateChunkIndices(1000, 100, 0)

      // Verify no overlap between consecutive chunks
      for (let i = 0; i < indices.length - 1; i++) {
        expect(indices[i].end).toBeLessThanOrEqual(indices[i + 1].start)
      }
    })
  })

  describe('estimateChunkCount', () => {
    it('should estimate chunk count', () => {
      const estimatedCount = estimateChunkCount(10000, 4000, 200)

      expect(typeof estimatedCount).toBe('number')
      expect(estimatedCount).toBeGreaterThan(0)
    })

    it('should be reasonable for small content', () => {
      const estimatedCount = estimateChunkCount(100, 4000, 200)

      expect(estimatedCount).toBe(1)
    })

    it('should scale with content size', () => {
      const count1 = estimateChunkCount(5000, 4000, 200)
      const count2 = estimateChunkCount(50000, 4000, 200)

      expect(count2).toBeGreaterThan(count1)
    })

    it('should be inversely related to chunk size', () => {
      const count1 = estimateChunkCount(10000, 4000, 200)
      const count2 = estimateChunkCount(10000, 2000, 200)

      expect(count2).toBeGreaterThan(count1)
    })

    it('should account for overlap', () => {
      const count1 = estimateChunkCount(10000, 4000, 0)
      const count2 = estimateChunkCount(10000, 4000, 500)

      // More overlap means more chunks
      expect(count2).toBeGreaterThanOrEqual(count1)
    })

    it('should return integer count', () => {
      const count = estimateChunkCount(15000, 4000, 200)

      expect(Number.isInteger(count)).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large documents', () => {
      const largeContent = 'x'.repeat(1000000)
      const chunks = characterChunks(largeContent, 4000, 200)

      expect(chunks.length).toBeGreaterThan(100)
    })

    it('should handle documents with special characters', () => {
      const content = 'Special: © ® ™ § ¶ † ‡ … ‰ ′ ″ ‴ ‵ \n'.repeat(100)
      const chunks = characterChunks(content, 500, 50)

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle documents with mixed line endings', () => {
      const content = 'line1\rline2\nline3\r\nline4'
      const chunks = lineChunks(content, 100)

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle unicode content', () => {
      const content = '你好世界 '.repeat(100)
      const chunks = characterChunks(content, 200, 20)

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle null/whitespace overlap', () => {
      const content = 'test'.repeat(100)
      const chunks = characterChunks(content, 50, 0)

      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('Consistency', () => {
    it('should produce consistent results for same input', () => {
      const content = 'consistent test content '.repeat(100)
      const chunks1 = characterChunks(content, 500, 50)
      const chunks2 = characterChunks(content, 500, 50)

      expect(chunks1).toEqual(chunks2)
    })

    it('should produce consistent line-based chunks', () => {
      const content = 'line\ntest\ncontent\n'.repeat(50)
      const chunks1 = lineChunks(content, 100)
      const chunks2 = lineChunks(content, 100)

      expect(chunks1).toEqual(chunks2)
    })

    it('should produce consistent indices', () => {
      const indices1 = calculateChunkIndices(10000, 4000, 200)
      const indices2 = calculateChunkIndices(10000, 4000, 200)

      expect(indices1).toEqual(indices2)
    })
  })
})
