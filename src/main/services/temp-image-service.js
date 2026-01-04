/**
 * Temp Image Service
 *
 * Manages temporary image files for prompt attachments.
 * Images are saved to .puffin/temp/img/ with unique IDs and
 * cleaned up immediately after prompt processing.
 *
 * @module services/temp-image-service
 */

const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')

const TEMP_IMG_DIR = 'temp/img'
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

class TempImageService {
  /**
   * Create a TempImageService
   * @param {string} puffinPath - Path to .puffin directory
   */
  constructor(puffinPath) {
    this.puffinPath = puffinPath
    this.tempImgPath = puffinPath ? path.join(puffinPath, TEMP_IMG_DIR) : null
  }

  /**
   * Set the puffin path (called when project is loaded)
   * @param {string} puffinPath - Path to .puffin directory
   */
  setPuffinPath(puffinPath) {
    this.puffinPath = puffinPath
    this.tempImgPath = puffinPath ? path.join(puffinPath, TEMP_IMG_DIR) : null
  }

  /**
   * Ensure the temp image directory exists
   */
  async ensureDirectory() {
    if (!this.tempImgPath) {
      throw new Error('Puffin path not set')
    }

    try {
      await fs.mkdir(this.tempImgPath, { recursive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }
    }
  }

  /**
   * Validate file extension
   * @param {string} extension - File extension (with dot)
   * @returns {boolean}
   */
  isValidExtension(extension) {
    return SUPPORTED_EXTENSIONS.includes(extension.toLowerCase())
  }

  /**
   * Generate a unique ID for an image
   * @returns {string}
   */
  generateId() {
    return crypto.randomUUID()
  }

  /**
   * Check if a file path is safely within the temp directory
   * Prevents path traversal attacks (e.g., ../../../etc/passwd)
   * @param {string} filePath - Path to validate
   * @returns {boolean} True if path is within temp directory
   */
  isPathWithinTempDir(filePath) {
    if (!this.tempImgPath || !filePath) {
      return false
    }

    // Resolve both paths to absolute, normalized form
    const resolvedPath = path.resolve(filePath)
    const resolvedTempDir = path.resolve(this.tempImgPath)

    // Check that the resolved path starts with the temp directory
    // Add path.sep to ensure we match the full directory (not just prefix)
    return resolvedPath.startsWith(resolvedTempDir + path.sep) ||
           resolvedPath === resolvedTempDir
  }

  /**
   * Save an image buffer to temp directory
   * @param {Buffer} buffer - Image data as Buffer
   * @param {string} extension - File extension (e.g., '.png')
   * @param {string} [originalName] - Original filename for reference
   * @returns {Promise<Object>} Result with id, filePath, fileName
   */
  async saveImage(buffer, extension, originalName = null) {
    if (!this.tempImgPath) {
      throw new Error('Puffin path not set')
    }

    // Normalize extension
    const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`

    if (!this.isValidExtension(ext)) {
      throw new Error(`Unsupported image format: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`)
    }

    await this.ensureDirectory()

    const id = this.generateId()
    const fileName = `${id}${ext}`
    const filePath = path.join(this.tempImgPath, fileName)

    await fs.writeFile(filePath, buffer)

    console.log(`[TempImageService] Saved image: ${fileName}`)

    return {
      id,
      filePath,
      fileName,
      originalName: originalName || fileName,
      extension: ext
    }
  }

  /**
   * Delete a single image by file path
   * @param {string} filePath - Absolute path to the image
   * @returns {Promise<boolean>} True if deleted successfully, false if invalid or failed
   */
  async deleteImage(filePath) {
    // Validate path is within temp directory (security: prevent path traversal)
    if (!this.isPathWithinTempDir(filePath)) {
      console.warn(`[TempImageService] SECURITY: Rejected path traversal attempt: ${filePath}`)
      return false
    }

    try {
      await fs.unlink(filePath)
      console.log(`[TempImageService] Deleted image: ${path.basename(filePath)}`)
      return true
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File already deleted, not an error
        return true
      }
      console.error(`[TempImageService] Failed to delete ${filePath}:`, error.message)
      return false
    }
  }

  /**
   * Delete multiple images by file paths
   * @param {string[]} filePaths - Array of absolute paths
   * @returns {Promise<Object>} Result with deleted count and errors
   */
  async deleteImages(filePaths) {
    const results = {
      deleted: 0,
      failed: 0,
      errors: []
    }

    for (const filePath of filePaths) {
      const success = await this.deleteImage(filePath)
      if (success) {
        results.deleted++
      } else {
        results.failed++
        results.errors.push(filePath)
      }
    }

    return results
  }

  /**
   * Clear all images in the temp directory
   * @returns {Promise<Object>} Result with deleted count
   */
  async clearAll() {
    if (!this.tempImgPath) {
      return { deleted: 0 }
    }

    try {
      const files = await fs.readdir(this.tempImgPath)
      const imageFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase()
        return SUPPORTED_EXTENSIONS.includes(ext)
      })

      let deleted = 0
      for (const file of imageFiles) {
        const success = await this.deleteImage(path.join(this.tempImgPath, file))
        if (success) deleted++
      }

      console.log(`[TempImageService] Cleared ${deleted} images`)
      return { deleted }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, nothing to clear
        return { deleted: 0 }
      }
      throw error
    }
  }

  /**
   * Cleanup old temp files (older than specified hours)
   * Called at startup to remove orphaned temp files
   * @param {number} maxAgeHours - Maximum age in hours (default: 24)
   * @returns {Promise<Object>} Result with deleted count
   */
  async cleanupOldFiles(maxAgeHours = 24) {
    if (!this.tempImgPath) {
      return { deleted: 0 }
    }

    try {
      const files = await fs.readdir(this.tempImgPath)
      const now = Date.now()
      const maxAge = maxAgeHours * 60 * 60 * 1000 // Convert to ms

      let deleted = 0
      for (const file of files) {
        const filePath = path.join(this.tempImgPath, file)
        try {
          const stats = await fs.stat(filePath)
          if (now - stats.mtimeMs > maxAge) {
            await this.deleteImage(filePath)
            deleted++
          }
        } catch {
          // Skip files that can't be stat'd
        }
      }

      if (deleted > 0) {
        console.log(`[TempImageService] Cleaned up ${deleted} old temp files`)
      }
      return { deleted }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { deleted: 0 }
      }
      console.error('[TempImageService] Cleanup error:', error.message)
      return { deleted: 0 }
    }
  }

  /**
   * Get list of all temp images
   * @returns {Promise<Object[]>} Array of image info objects
   */
  async listImages() {
    if (!this.tempImgPath) {
      return []
    }

    try {
      const files = await fs.readdir(this.tempImgPath)
      const images = []

      for (const file of files) {
        const ext = path.extname(file).toLowerCase()
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const filePath = path.join(this.tempImgPath, file)
          try {
            const stats = await fs.stat(filePath)
            images.push({
              fileName: file,
              filePath,
              extension: ext,
              size: stats.size,
              createdAt: stats.birthtime
            })
          } catch {
            // Skip files that can't be stat'd
          }
        }
      }

      return images
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * Format image paths for prompt inclusion
   * @param {string[]} filePaths - Array of image file paths
   * @returns {string} Formatted string for prompt
   */
  formatForPrompt(filePaths) {
    if (!filePaths || filePaths.length === 0) {
      return ''
    }

    return filePaths
      .map(p => `[image: ${p}]`)
      .join('\n')
  }
}

// Singleton instance
let instance = null

/**
 * Get the TempImageService singleton
 * @param {string} [puffinPath] - Optional puffin path to set
 * @returns {TempImageService}
 */
function getTempImageService(puffinPath = null) {
  if (!instance) {
    instance = new TempImageService(puffinPath)
  } else if (puffinPath) {
    instance.setPuffinPath(puffinPath)
  }
  return instance
}

module.exports = {
  TempImageService,
  getTempImageService,
  SUPPORTED_EXTENSIONS
}
