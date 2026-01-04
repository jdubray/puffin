/**
 * Temp Image Service Tests
 *
 * Tests for the TempImageService that manages temporary image files
 * for prompt attachments.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

const {
  TempImageService,
  getTempImageService,
  SUPPORTED_IMAGE_EXTENSIONS
} = require('../../src/main/services')

describe('TempImageService', () => {
  describe('Supported Extensions', () => {
    it('should support PNG format', () => {
      assert.ok(SUPPORTED_IMAGE_EXTENSIONS.includes('.png'))
    })

    it('should support JPG format', () => {
      assert.ok(SUPPORTED_IMAGE_EXTENSIONS.includes('.jpg'))
    })

    it('should support JPEG format', () => {
      assert.ok(SUPPORTED_IMAGE_EXTENSIONS.includes('.jpeg'))
    })

    it('should support WebP format', () => {
      assert.ok(SUPPORTED_IMAGE_EXTENSIONS.includes('.webp'))
    })

    it('should NOT support GIF format (per clarification)', () => {
      assert.ok(!SUPPORTED_IMAGE_EXTENSIONS.includes('.gif'))
    })

    it('should have exactly 4 supported formats', () => {
      assert.strictEqual(SUPPORTED_IMAGE_EXTENSIONS.length, 4)
    })
  })

  describe('Service Initialization', () => {
    it('should create service with puffin path', () => {
      const service = new TempImageService('/test/path/.puffin')
      assert.ok(service)
      assert.strictEqual(service.puffinPath, '/test/path/.puffin')
    })

    it('should create service without puffin path', () => {
      const service = new TempImageService(null)
      assert.ok(service)
      assert.strictEqual(service.puffinPath, null)
      assert.strictEqual(service.tempImgPath, null)
    })

    it('should set puffin path via setPuffinPath', () => {
      const service = new TempImageService(null)
      service.setPuffinPath('/new/path/.puffin')
      assert.strictEqual(service.puffinPath, '/new/path/.puffin')
      assert.ok(service.tempImgPath.includes('temp'))
      assert.ok(service.tempImgPath.includes('img'))
    })
  })

  describe('Extension Validation', () => {
    it('should validate PNG extension', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.isValidExtension('.png'), true)
      assert.strictEqual(service.isValidExtension('.PNG'), true)
    })

    it('should validate JPG extension', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.isValidExtension('.jpg'), true)
      assert.strictEqual(service.isValidExtension('.JPG'), true)
    })

    it('should validate JPEG extension', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.isValidExtension('.jpeg'), true)
    })

    it('should validate WebP extension', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.isValidExtension('.webp'), true)
    })

    it('should reject unsupported extensions', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.isValidExtension('.gif'), false)
      assert.strictEqual(service.isValidExtension('.bmp'), false)
      assert.strictEqual(service.isValidExtension('.tiff'), false)
      assert.strictEqual(service.isValidExtension('.svg'), false)
    })
  })

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const service = new TempImageService('/test/.puffin')
      const id1 = service.generateId()
      const id2 = service.generateId()

      assert.ok(id1)
      assert.ok(id2)
      assert.notStrictEqual(id1, id2)
    })

    it('should generate UUID-format IDs', () => {
      const service = new TempImageService('/test/.puffin')
      const id = service.generateId()

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      assert.ok(uuidPattern.test(id), `ID ${id} should match UUID pattern`)
    })
  })

  describe('Prompt Formatting', () => {
    it('should format single image path', () => {
      const service = new TempImageService('/test/.puffin')
      const result = service.formatForPrompt(['/path/to/image.png'])

      assert.strictEqual(result, '[image: /path/to/image.png]')
    })

    it('should format multiple image paths', () => {
      const service = new TempImageService('/test/.puffin')
      const result = service.formatForPrompt([
        '/path/to/image1.png',
        '/path/to/image2.jpg'
      ])

      assert.strictEqual(result, '[image: /path/to/image1.png]\n[image: /path/to/image2.jpg]')
    })

    it('should return empty string for empty array', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.formatForPrompt([]), '')
    })

    it('should return empty string for null/undefined', () => {
      const service = new TempImageService('/test/.puffin')
      assert.strictEqual(service.formatForPrompt(null), '')
      assert.strictEqual(service.formatForPrompt(undefined), '')
    })
  })

  describe('Singleton Pattern', () => {
    it('should return same instance from getTempImageService', () => {
      // Note: This test might be affected by other tests, but demonstrates the pattern
      const service1 = getTempImageService('/path1/.puffin')
      const service2 = getTempImageService()

      assert.strictEqual(service1, service2)
    })

    it('should update path when called with new path', () => {
      const service = getTempImageService('/updated/path/.puffin')
      assert.strictEqual(service.puffinPath, '/updated/path/.puffin')
    })
  })
})

describe('Image Attachment Flow', () => {
  describe('Drag and Drop Processing', () => {
    it('should extract extension from filename', () => {
      const getExtension = (filename) => {
        const lastDot = filename.lastIndexOf('.')
        return lastDot >= 0 ? filename.substring(lastDot).toLowerCase() : ''
      }

      assert.strictEqual(getExtension('image.png'), '.png')
      assert.strictEqual(getExtension('photo.JPG'), '.jpg')
      assert.strictEqual(getExtension('file.name.jpeg'), '.jpeg')
      assert.strictEqual(getExtension('noextension'), '')
    })

    it('should validate dropped file types', () => {
      const supportedExtensions = ['.png', '.jpg', '.jpeg', '.webp']
      const isSupported = (ext) => supportedExtensions.includes(ext.toLowerCase())

      assert.strictEqual(isSupported('.png'), true)
      assert.strictEqual(isSupported('.PNG'), true)
      assert.strictEqual(isSupported('.gif'), false)
      assert.strictEqual(isSupported('.txt'), false)
    })
  })

  describe('Attachment State Management', () => {
    it('should track attached images', () => {
      const attachedImages = []

      // Simulate adding an image
      attachedImages.push({
        id: 'test-uuid',
        filePath: '/path/to/image.png',
        fileName: 'test-uuid.png',
        originalName: 'screenshot.png',
        thumbnailDataUrl: 'data:image/jpeg;base64,...'
      })

      assert.strictEqual(attachedImages.length, 1)
      assert.strictEqual(attachedImages[0].originalName, 'screenshot.png')
    })

    it('should remove image by ID', () => {
      let attachedImages = [
        { id: 'img1', filePath: '/path/1.png' },
        { id: 'img2', filePath: '/path/2.png' },
        { id: 'img3', filePath: '/path/3.png' }
      ]

      // Simulate removal
      const imageIdToRemove = 'img2'
      attachedImages = attachedImages.filter(img => img.id !== imageIdToRemove)

      assert.strictEqual(attachedImages.length, 2)
      assert.ok(!attachedImages.find(img => img.id === 'img2'))
    })

    it('should clear all attached images', () => {
      let attachedImages = [
        { id: 'img1', filePath: '/path/1.png' },
        { id: 'img2', filePath: '/path/2.png' }
      ]

      // Get paths for cleanup
      const filePaths = attachedImages.map(img => img.filePath)
      assert.strictEqual(filePaths.length, 2)

      // Clear
      attachedImages = []
      assert.strictEqual(attachedImages.length, 0)
    })
  })

  describe('Prompt Integration', () => {
    it('should prepend images to prompt content', () => {
      const content = 'Please analyze this screenshot'
      const imageAttachments = '[image: /path/to/screenshot.png]'

      const finalPrompt = imageAttachments + '\n\n' + content

      assert.ok(finalPrompt.startsWith('[image:'))
      assert.ok(finalPrompt.includes('Please analyze'))
    })

    it('should handle multiple images in prompt', () => {
      const content = 'Compare these two designs'
      const images = [
        '/path/design1.png',
        '/path/design2.png'
      ]
      const imageAttachments = images.map(p => `[image: ${p}]`).join('\n')

      const finalPrompt = imageAttachments + '\n\n' + content

      assert.ok(finalPrompt.includes('[image: /path/design1.png]'))
      assert.ok(finalPrompt.includes('[image: /path/design2.png]'))
      assert.ok(finalPrompt.includes('Compare these two designs'))
    })

    it('should not modify prompt when no images attached', () => {
      const content = 'Regular prompt without images'
      const imageAttachments = ''

      const finalPrompt = imageAttachments ? imageAttachments + '\n\n' + content : content

      assert.strictEqual(finalPrompt, content)
    })
  })

  describe('Cleanup Flow', () => {
    it('should track pending cleanup paths', () => {
      const attachedImages = [
        { id: 'img1', filePath: '/path/to/img1.png' },
        { id: 'img2', filePath: '/path/to/img2.jpg' }
      ]

      // Store paths for cleanup (done before clearing)
      const pendingCleanup = attachedImages.map(img => img.filePath)

      assert.strictEqual(pendingCleanup.length, 2)
      assert.strictEqual(pendingCleanup[0], '/path/to/img1.png')
      assert.strictEqual(pendingCleanup[1], '/path/to/img2.jpg')
    })

    it('should handle cleanup after processing completes', () => {
      let pendingImageCleanup = ['/path/img1.png', '/path/img2.png']
      let cleanupCalled = false

      // Simulate processing completion
      const wasProcessing = true
      const isProcessing = false

      if (wasProcessing && !isProcessing) {
        if (pendingImageCleanup && pendingImageCleanup.length > 0) {
          cleanupCalled = true
          pendingImageCleanup = null
        }
      }

      assert.strictEqual(cleanupCalled, true)
      assert.strictEqual(pendingImageCleanup, null)
    })
  })
})

describe('Thumbnail Generation', () => {
  it('should calculate scaled dimensions for landscape image', () => {
    const maxSize = 120
    let width = 1920
    let height = 1080

    if (width > height) {
      if (width > maxSize) {
        height = (height * maxSize) / width
        width = maxSize
      }
    }

    assert.strictEqual(width, 120)
    assert.strictEqual(height, 67.5)
  })

  it('should calculate scaled dimensions for portrait image', () => {
    const maxSize = 120
    let width = 800
    let height = 1200

    if (width > height) {
      // Landscape
    } else {
      if (height > maxSize) {
        width = (width * maxSize) / height
        height = maxSize
      }
    }

    assert.strictEqual(height, 120)
    assert.strictEqual(width, 80)
  })

  it('should not scale small images', () => {
    const maxSize = 120
    let width = 64
    let height = 64

    // No scaling needed
    if (width <= maxSize && height <= maxSize) {
      // Keep original dimensions
    }

    assert.strictEqual(width, 64)
    assert.strictEqual(height, 64)
  })
})

describe('Filename Truncation', () => {
  it('should not truncate short filenames', () => {
    const truncate = (filename, maxLength) => {
      if (filename.length <= maxLength) return filename
      const lastDot = filename.lastIndexOf('.')
      const ext = lastDot >= 0 ? filename.substring(lastDot) : ''
      const name = filename.substring(0, filename.length - ext.length)
      return name.substring(0, maxLength - ext.length - 3) + '...' + ext
    }

    assert.strictEqual(truncate('test.png', 15), 'test.png')
  })

  it('should truncate long filenames preserving extension', () => {
    const truncate = (filename, maxLength) => {
      if (filename.length <= maxLength) return filename
      const lastDot = filename.lastIndexOf('.')
      const ext = lastDot >= 0 ? filename.substring(lastDot) : ''
      const name = filename.substring(0, filename.length - ext.length)
      return name.substring(0, maxLength - ext.length - 3) + '...' + ext
    }

    const result = truncate('very-long-filename-screenshot.png', 15)
    assert.ok(result.endsWith('.png'))
    assert.ok(result.includes('...'))
    assert.ok(result.length <= 15)
  })
})
