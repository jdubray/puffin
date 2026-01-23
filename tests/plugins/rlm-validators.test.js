/**
 * RLM Document Plugin - Validators Tests
 *
 * Tests for input validation functions used by IPC handlers.
 * Covers path traversal prevention, session ID validation, and data integrity checks.
 */

const path = require('path')

// Import validators
const {
  validateDocumentPath,
  validateSessionId,
  validateChunkConfig,
  validateGrepPattern,
  sanitizeGrepPattern,
  validatePeekRange,
  validateChunkIndex,
  validateExportFormat,
  validateFileSize,
  validateQuery,
  validateBufferContent,
  formatBytes
} = require('../../plugins/rlm-document-plugin/lib/validators')

describe('RLM Validators', () => {
  describe('validateDocumentPath', () => {
    const projectRoot = '/home/user/project'

    it('should accept valid paths within project', () => {
      const result = validateDocumentPath('docs/readme.md', projectRoot)
      expect(result.isValid).toBe(true)
      expect(result.resolvedPath).toBe(path.resolve(projectRoot, 'docs/readme.md'))
    })

    it('should accept nested paths within project', () => {
      const result = validateDocumentPath('src/lib/utils/helper.js', projectRoot)
      expect(result.isValid).toBe(true)
    })

    it('should reject null or undefined paths', () => {
      expect(validateDocumentPath(null, projectRoot).isValid).toBe(false)
      expect(validateDocumentPath(undefined, projectRoot).isValid).toBe(false)
    })

    it('should reject non-string paths', () => {
      expect(validateDocumentPath(123, projectRoot).isValid).toBe(false)
      expect(validateDocumentPath({}, projectRoot).isValid).toBe(false)
    })

    it('should reject paths with null bytes', () => {
      const result = validateDocumentPath('docs/file\x00.md', projectRoot)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Invalid characters')
    })

    it('should reject path traversal attempts', () => {
      const result = validateDocumentPath('../../../etc/passwd', projectRoot)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('within project')
    })

    it('should reject absolute paths outside project', () => {
      const result = validateDocumentPath('/etc/passwd', projectRoot)
      expect(result.isValid).toBe(false)
    })
  })

  describe('validateSessionId', () => {
    it('should accept valid session IDs', () => {
      expect(validateSessionId('ses_abc123def').isValid).toBe(true)
      expect(validateSessionId('ses_1234567890').isValid).toBe(true)
    })

    it('should reject null or undefined', () => {
      expect(validateSessionId(null).isValid).toBe(false)
      expect(validateSessionId(undefined).isValid).toBe(false)
    })

    it('should reject non-string session IDs', () => {
      expect(validateSessionId(123).isValid).toBe(false)
    })

    it('should reject IDs without ses_ prefix', () => {
      expect(validateSessionId('abc123def456').isValid).toBe(false)
    })

    it('should reject too short session IDs', () => {
      expect(validateSessionId('ses_abc').isValid).toBe(false)
    })

    it('should reject IDs with special characters', () => {
      expect(validateSessionId('ses_abc!@#$%').isValid).toBe(false)
      expect(validateSessionId('ses_abc/def').isValid).toBe(false)
      expect(validateSessionId('ses_abc..def').isValid).toBe(false)
    })
  })

  describe('validateChunkConfig', () => {
    it('should accept valid chunk configuration', () => {
      const result = validateChunkConfig({ chunkSize: 4000, chunkOverlap: 200 })
      expect(result.isValid).toBe(true)
      expect(result.config.chunkSize).toBe(4000)
      expect(result.config.chunkOverlap).toBe(200)
    })

    it('should use defaults when not specified', () => {
      const result = validateChunkConfig({})
      expect(result.isValid).toBe(true)
      expect(result.config.chunkSize).toBeDefined()
      expect(result.config.chunkOverlap).toBeDefined()
    })

    it('should reject chunk size below minimum', () => {
      const result = validateChunkConfig({ chunkSize: 100 })
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('at least')
    })

    it('should reject chunk size above maximum', () => {
      const result = validateChunkConfig({ chunkSize: 100000 })
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('at most')
    })

    it('should reject negative overlap', () => {
      const result = validateChunkConfig({ chunkOverlap: -100 })
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('non-negative')
    })

    it('should reject overlap >= chunk size', () => {
      const result = validateChunkConfig({ chunkSize: 1000, chunkOverlap: 1000 })
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('less than chunk size')
    })

    it('should reject non-integer values', () => {
      expect(validateChunkConfig({ chunkSize: 4000.5 }).isValid).toBe(false)
      expect(validateChunkConfig({ chunkOverlap: 200.5 }).isValid).toBe(false)
    })
  })

  describe('validateGrepPattern', () => {
    it('should accept valid string patterns', () => {
      expect(validateGrepPattern('hello').isValid).toBe(true)
      expect(validateGrepPattern('function\\s+\\w+').isValid).toBe(true)
    })

    it('should accept valid regex patterns', () => {
      expect(validateGrepPattern('[a-z]+').isValid).toBe(true)
      expect(validateGrepPattern('\\d{3}-\\d{4}').isValid).toBe(true)
    })

    it('should reject empty patterns', () => {
      expect(validateGrepPattern('').isValid).toBe(false)
    })

    it('should reject null or undefined', () => {
      expect(validateGrepPattern(null).isValid).toBe(false)
      expect(validateGrepPattern(undefined).isValid).toBe(false)
    })

    it('should reject patterns exceeding max length', () => {
      const longPattern = 'a'.repeat(1001)
      expect(validateGrepPattern(longPattern).isValid).toBe(false)
    })

    it('should reject invalid regex patterns', () => {
      const result = validateGrepPattern('[invalid(')
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Invalid regex')
    })

    it('should accept custom max length', () => {
      const pattern = 'a'.repeat(50)
      expect(validateGrepPattern(pattern, { maxLength: 100 }).isValid).toBe(true)
      expect(validateGrepPattern(pattern, { maxLength: 30 }).isValid).toBe(false)
    })
  })

  describe('sanitizeGrepPattern', () => {
    it('should escape regex metacharacters', () => {
      expect(sanitizeGrepPattern('hello.world')).toBe('hello\\.world')
      expect(sanitizeGrepPattern('price: $100')).toBe('price: \\$100')
      expect(sanitizeGrepPattern('a*b+c?')).toBe('a\\*b\\+c\\?')
    })

    it('should escape brackets and braces', () => {
      expect(sanitizeGrepPattern('[array]')).toBe('\\[array\\]')
      expect(sanitizeGrepPattern('{object}')).toBe('\\{object\\}')
      expect(sanitizeGrepPattern('(group)')).toBe('\\(group\\)')
    })

    it('should escape backslashes', () => {
      expect(sanitizeGrepPattern('path\\to\\file')).toBe('path\\\\to\\\\file')
    })

    it('should leave alphanumeric characters unchanged', () => {
      expect(sanitizeGrepPattern('hello123')).toBe('hello123')
    })
  })

  describe('validatePeekRange', () => {
    it('should accept valid ranges', () => {
      const result = validatePeekRange(0, 100)
      expect(result.isValid).toBe(true)
      expect(result.start).toBe(0)
      expect(result.end).toBe(100)
    })

    it('should default start to 0 if not provided', () => {
      const result = validatePeekRange(undefined, 100)
      expect(result.isValid).toBe(true)
      expect(result.start).toBe(0)
    })

    it('should reject negative start', () => {
      const result = validatePeekRange(-10, 100)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('non-negative')
    })

    it('should reject end <= start', () => {
      expect(validatePeekRange(100, 50).isValid).toBe(false)
      expect(validatePeekRange(100, 100).isValid).toBe(false)
    })

    it('should reject non-integer values', () => {
      expect(validatePeekRange(10.5, 100).isValid).toBe(false)
      expect(validatePeekRange(0, 100.5).isValid).toBe(false)
    })

    it('should validate against content length if provided', () => {
      expect(validatePeekRange(200, 300, 100).isValid).toBe(false)
    })
  })

  describe('validateChunkIndex', () => {
    it('should accept valid indices', () => {
      expect(validateChunkIndex(0).isValid).toBe(true)
      expect(validateChunkIndex(5).isValid).toBe(true)
    })

    it('should reject null or undefined', () => {
      expect(validateChunkIndex(null).isValid).toBe(false)
      expect(validateChunkIndex(undefined).isValid).toBe(false)
    })

    it('should reject negative indices', () => {
      expect(validateChunkIndex(-1).isValid).toBe(false)
    })

    it('should reject non-integer indices', () => {
      expect(validateChunkIndex(1.5).isValid).toBe(false)
    })

    it('should reject indices out of range when total is provided', () => {
      expect(validateChunkIndex(10, 5).isValid).toBe(false)
      expect(validateChunkIndex(5, 5).isValid).toBe(false)
      expect(validateChunkIndex(4, 5).isValid).toBe(true)
    })
  })

  describe('validateExportFormat', () => {
    it('should accept json format', () => {
      const result = validateExportFormat('json')
      expect(result.isValid).toBe(true)
      expect(result.format).toBe('json')
    })

    it('should accept markdown format', () => {
      const result = validateExportFormat('markdown')
      expect(result.isValid).toBe(true)
      expect(result.format).toBe('markdown')
    })

    it('should normalize case', () => {
      expect(validateExportFormat('JSON').format).toBe('json')
      expect(validateExportFormat('MARKDOWN').format).toBe('markdown')
    })

    it('should reject invalid formats', () => {
      expect(validateExportFormat('pdf').isValid).toBe(false)
      expect(validateExportFormat('html').isValid).toBe(false)
    })

    it('should reject null or undefined', () => {
      expect(validateExportFormat(null).isValid).toBe(false)
      expect(validateExportFormat(undefined).isValid).toBe(false)
    })
  })

  describe('validateFileSize', () => {
    it('should accept files under limit', () => {
      const result = validateFileSize(1024 * 1024) // 1MB
      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    it('should warn for large files', () => {
      const result = validateFileSize(15 * 1024 * 1024) // 15MB
      expect(result.isValid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should reject files over maximum', () => {
      const result = validateFileSize(100 * 1024 * 1024) // 100MB
      expect(result.isValid).toBe(false)
    })

    it('should reject negative file sizes', () => {
      expect(validateFileSize(-100).isValid).toBe(false)
    })

    it('should reject non-numeric values', () => {
      expect(validateFileSize('1024').isValid).toBe(false)
    })
  })

  describe('validateQuery', () => {
    it('should accept valid queries', () => {
      const result = validateQuery('What is the main purpose of this document?')
      expect(result.isValid).toBe(true)
      expect(result.query).toBe('What is the main purpose of this document?')
    })

    it('should trim whitespace', () => {
      const result = validateQuery('  query text  ')
      expect(result.query).toBe('query text')
    })

    it('should reject empty queries', () => {
      expect(validateQuery('').isValid).toBe(false)
      expect(validateQuery('   ').isValid).toBe(false)
    })

    it('should reject null or undefined', () => {
      expect(validateQuery(null).isValid).toBe(false)
      expect(validateQuery(undefined).isValid).toBe(false)
    })

    it('should reject queries exceeding max length', () => {
      const longQuery = 'a'.repeat(11000)
      expect(validateQuery(longQuery).isValid).toBe(false)
    })

    it('should accept custom max length', () => {
      const query = 'a'.repeat(100)
      expect(validateQuery(query, { maxLength: 200 }).isValid).toBe(true)
      expect(validateQuery(query, { maxLength: 50 }).isValid).toBe(false)
    })
  })

  describe('validateBufferContent', () => {
    it('should accept valid buffer content', () => {
      const result = validateBufferContent('Some extracted text')
      expect(result.isValid).toBe(true)
    })

    it('should accept empty string', () => {
      const result = validateBufferContent('')
      expect(result.isValid).toBe(true)
    })

    it('should reject null or undefined', () => {
      expect(validateBufferContent(null).isValid).toBe(false)
      expect(validateBufferContent(undefined).isValid).toBe(false)
    })

    it('should reject non-string content', () => {
      expect(validateBufferContent(123).isValid).toBe(false)
      expect(validateBufferContent({}).isValid).toBe(false)
    })

    it('should reject content exceeding max length', () => {
      const longContent = 'a'.repeat(2000000) // 2MB
      expect(validateBufferContent(longContent).isValid).toBe(false)
    })
  })

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(1048576)).toBe('1 MB')
      expect(formatBytes(1073741824)).toBe('1 GB')
    })
  })
})
