/**
 * RLM Document Plugin - Chunk Strategy
 *
 * Provides chunking algorithms for splitting large documents into
 * manageable pieces for analysis. Supports character-based and
 * line-based chunking with configurable overlap.
 */

const { CHUNKING } = require('./config')
const { createChunkMetadata } = require('./schemas')

/**
 * Split content into character-based chunks with overlap
 * @param {string} content - Document content to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.size - Chunk size in characters (default: 4000)
 * @param {number} options.overlap - Overlap between chunks (default: 200)
 * @returns {Array<Object>} Array of chunk objects
 */
function characterChunks(content, options = {}) {
  const {
    size = CHUNKING.DEFAULT_SIZE,
    overlap = CHUNKING.DEFAULT_OVERLAP
  } = options

  // Validate parameters
  if (size < CHUNKING.MIN_SIZE) {
    throw new Error(`Chunk size must be at least ${CHUNKING.MIN_SIZE}`)
  }
  if (size > CHUNKING.MAX_SIZE) {
    throw new Error(`Chunk size must be at most ${CHUNKING.MAX_SIZE}`)
  }
  if (overlap < 0) {
    throw new Error('Overlap must be non-negative')
  }
  if (overlap >= size) {
    throw new Error('Overlap must be less than chunk size')
  }

  const chunks = []
  let start = 0
  const step = size - overlap

  while (start < content.length) {
    const end = Math.min(start + size, content.length)
    const chunkContent = content.slice(start, end)

    // Calculate line numbers for this chunk
    const lineStart = countLines(content, 0, start) + 1
    const lineEnd = lineStart + countLines(chunkContent, 0, chunkContent.length) - 1

    chunks.push({
      ...createChunkMetadata({
        index: chunks.length,
        start,
        end,
        lineStart,
        lineEnd
      }),
      content: chunkContent
    })

    // Move to next chunk position
    start += step

    // Avoid creating tiny final chunks
    if (content.length - start < CHUNKING.MIN_SIZE / 2 && start < content.length) {
      // Extend previous chunk to include remainder
      if (chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1]
        lastChunk.end = content.length
        lastChunk.content = content.slice(lastChunk.start, content.length)
        lastChunk.length = lastChunk.end - lastChunk.start
        lastChunk.lineEnd = countLines(content, 0, content.length)
      }
      break
    }
  }

  return chunks
}

/**
 * Split content into line-based chunks
 * Each chunk contains complete lines, respecting size limits
 * @param {string} content - Document content to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.maxSize - Maximum chunk size in characters
 * @param {number} options.overlapLines - Number of lines to overlap
 * @returns {Array<Object>} Array of chunk objects
 */
function lineChunks(content, options = {}) {
  const {
    maxSize = CHUNKING.DEFAULT_SIZE,
    overlapLines = 5
  } = options

  const lines = content.split('\n')
  const chunks = []
  let currentChunk = []
  let currentSize = 0
  let startLine = 0
  let charStart = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineSize = line.length + 1 // +1 for newline

    // Check if adding this line would exceed max size
    if (currentSize + lineSize > maxSize && currentChunk.length > 0) {
      // Save current chunk
      const chunkContent = currentChunk.join('\n')
      const charEnd = charStart + chunkContent.length

      chunks.push({
        ...createChunkMetadata({
          index: chunks.length,
          start: charStart,
          end: charEnd,
          lineStart: startLine + 1,
          lineEnd: startLine + currentChunk.length
        }),
        content: chunkContent
      })

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - overlapLines)
      const overlapContent = currentChunk.slice(overlapStart)

      charStart = charEnd - overlapContent.join('\n').length
      startLine = startLine + overlapStart
      currentChunk = overlapContent
      currentSize = overlapContent.reduce((sum, l) => sum + l.length + 1, 0)
    }

    currentChunk.push(line)
    currentSize += lineSize
  }

  // Add final chunk if there's remaining content
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n')
    chunks.push({
      ...createChunkMetadata({
        index: chunks.length,
        start: charStart,
        end: charStart + chunkContent.length,
        lineStart: startLine + 1,
        lineEnd: startLine + currentChunk.length
      }),
      content: chunkContent
    })
  }

  return chunks
}

/**
 * Split content at natural boundaries (paragraphs, sections)
 * Tries to find logical break points near the target size
 * @param {string} content - Document content to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.targetSize - Target chunk size
 * @param {number} options.tolerance - Allowed deviation from target (0-1)
 * @returns {Array<Object>} Array of chunk objects
 */
function semanticChunks(content, options = {}) {
  const {
    targetSize = CHUNKING.DEFAULT_SIZE,
    tolerance = 0.2
  } = options

  const minSize = targetSize * (1 - tolerance)
  const maxSize = targetSize * (1 + tolerance)

  // Find potential break points (blank lines, markdown headers, etc.)
  const breakPoints = findBreakPoints(content)

  const chunks = []
  let start = 0

  while (start < content.length) {
    // Find the best break point near target size
    const targetEnd = start + targetSize
    let bestBreak = null

    for (const bp of breakPoints) {
      if (bp <= start) continue
      if (bp > start + maxSize) break

      const chunkSize = bp - start
      if (chunkSize >= minSize && chunkSize <= maxSize) {
        // Prefer breaks closer to target
        if (!bestBreak || Math.abs(bp - targetEnd) < Math.abs(bestBreak - targetEnd)) {
          bestBreak = bp
        }
      }
    }

    // Use best break or fall back to character boundary
    const end = bestBreak || Math.min(start + targetSize, content.length)
    const chunkContent = content.slice(start, end)

    const lineStart = countLines(content, 0, start) + 1
    const lineEnd = lineStart + countLines(chunkContent, 0, chunkContent.length) - 1

    chunks.push({
      ...createChunkMetadata({
        index: chunks.length,
        start,
        end,
        lineStart,
        lineEnd
      }),
      content: chunkContent
    })

    start = end
  }

  return chunks
}

/**
 * Find natural break points in content
 * @param {string} content - Document content
 * @returns {Array<number>} Array of character positions
 */
function findBreakPoints(content) {
  const breakPoints = []

  // Blank lines (paragraph breaks)
  const blankLineRegex = /\n\s*\n/g
  let match
  while ((match = blankLineRegex.exec(content)) !== null) {
    breakPoints.push(match.index + match[0].length)
  }

  // Markdown headers
  const headerRegex = /^#{1,6}\s/gm
  while ((match = headerRegex.exec(content)) !== null) {
    if (match.index > 0) {
      breakPoints.push(match.index)
    }
  }

  // Horizontal rules
  const hrRegex = /^[-*_]{3,}\s*$/gm
  while ((match = hrRegex.exec(content)) !== null) {
    breakPoints.push(match.index + match[0].length)
  }

  // Sort and deduplicate
  return [...new Set(breakPoints)].sort((a, b) => a - b)
}

/**
 * Count newlines in a string within a range
 * @param {string} str - String to search
 * @param {number} start - Start position
 * @param {number} end - End position
 * @returns {number} Number of newlines
 */
function countLines(str, start, end) {
  let count = 1
  for (let i = start; i < end && i < str.length; i++) {
    if (str[i] === '\n') count++
  }
  return count
}

/**
 * Calculate chunk indices without content (for planning)
 * @param {number} contentLength - Total content length
 * @param {Object} options - Chunking options
 * @returns {Array<Object>} Array of chunk metadata (without content)
 */
function calculateChunkIndices(contentLength, options = {}) {
  const {
    size = CHUNKING.DEFAULT_SIZE,
    overlap = CHUNKING.DEFAULT_OVERLAP
  } = options

  const indices = []
  let start = 0
  const step = size - overlap

  while (start < contentLength) {
    const end = Math.min(start + size, contentLength)
    indices.push(
      createChunkMetadata({
        index: indices.length,
        start,
        end
      })
    )
    start += step

    if (contentLength - start < CHUNKING.MIN_SIZE / 2 && start < contentLength) {
      // Extend last chunk
      if (indices.length > 0) {
        indices[indices.length - 1].end = contentLength
        indices[indices.length - 1].length = contentLength - indices[indices.length - 1].start
      }
      break
    }
  }

  return indices
}

/**
 * Get chunk by index from content
 * @param {string} content - Full document content
 * @param {number} index - Chunk index
 * @param {Object} options - Chunking options
 * @returns {Object|null} Chunk object or null if index out of bounds
 */
function getChunk(content, index, options = {}) {
  const chunks = characterChunks(content, options)
  return chunks[index] || null
}

/**
 * Estimate number of chunks for given content length
 * @param {number} contentLength - Content length in characters
 * @param {Object} options - Chunking options
 * @returns {number} Estimated number of chunks
 */
function estimateChunkCount(contentLength, options = {}) {
  const {
    size = CHUNKING.DEFAULT_SIZE,
    overlap = CHUNKING.DEFAULT_OVERLAP
  } = options

  if (contentLength <= size) return 1

  const step = size - overlap
  return Math.ceil((contentLength - overlap) / step)
}

module.exports = {
  characterChunks,
  lineChunks,
  semanticChunks,
  calculateChunkIndices,
  getChunk,
  estimateChunkCount,
  findBreakPoints,
  countLines
}
