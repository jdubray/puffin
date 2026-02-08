/**
 * RLM Document Plugin - Cross-platform Python Detection
 *
 * Automatically detects a working Python installation across Windows, macOS, and Linux.
 * Provides fallback mechanisms and clear error messaging.
 */

const { spawn } = require('child_process')

/**
 * Platform-specific Python executable candidates
 * Ordered by preference (most likely to work first)
 */
const PYTHON_CANDIDATES = {
  win32: ['python', 'python3', 'py'],
  darwin: ['python3', 'python'],
  linux: ['python3', 'python']
}

/**
 * Minimum required Python version
 */
const MIN_PYTHON_VERSION = { major: 3, minor: 7 }

/**
 * Cache for detected Python path (avoid repeated detection)
 */
let cachedPythonPath = null
let cachedPythonVersion = null

/**
 * Test if a Python executable is available and meets version requirements
 * @param {string} executable - Python executable name or path
 * @returns {Promise<Object>} Result with success, path, and version info
 */
async function testPythonExecutable(executable) {
  return new Promise((resolve) => {
    // Track if already resolved to prevent race conditions between timeout and close/error events
    let resolved = false
    const safeResolve = (result) => {
      if (resolved) return
      resolved = true
      resolve(result)
    }

    try {
      const proc = spawn(executable, ['--version'], {
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('error', () => {
        safeResolve({ success: false, executable, error: 'spawn failed' })
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          safeResolve({ success: false, executable, error: `exit code ${code}` })
          return
        }

        // Parse version from output (handles both stdout and stderr)
        const output = stdout || stderr
        const versionMatch = output.match(/Python (\d+)\.(\d+)\.(\d+)/)

        if (!versionMatch) {
          safeResolve({ success: false, executable, error: 'version parse failed' })
          return
        }

        const version = {
          major: parseInt(versionMatch[1], 10),
          minor: parseInt(versionMatch[2], 10),
          patch: parseInt(versionMatch[3], 10),
          string: `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`
        }

        // Check minimum version requirement
        if (version.major < MIN_PYTHON_VERSION.major ||
            (version.major === MIN_PYTHON_VERSION.major && version.minor < MIN_PYTHON_VERSION.minor)) {
          safeResolve({
            success: false,
            executable,
            version,
            error: `version ${version.string} is below minimum ${MIN_PYTHON_VERSION.major}.${MIN_PYTHON_VERSION.minor}`
          })
          return
        }

        safeResolve({
          success: true,
          executable,
          path: executable,
          version
        })
      })

      // Handle timeout
      setTimeout(() => {
        proc.kill()
        safeResolve({ success: false, executable, error: 'timeout' })
      }, 5000)
    } catch (error) {
      safeResolve({ success: false, executable, error: error.message })
    }
  })
}

/**
 * Detect a working Python installation
 * Tests platform-specific candidates in order of preference
 * @param {Object} options - Detection options
 * @param {boolean} options.forceRefresh - Skip cache and re-detect
 * @param {string} options.customPath - Custom Python path to test first
 * @returns {Promise<Object>} Detection result
 */
async function detectPython(options = {}) {
  const { forceRefresh = false, customPath = null } = options

  // Return cached result if available and not forcing refresh
  if (!forceRefresh && cachedPythonPath) {
    return {
      success: true,
      path: cachedPythonPath,
      version: cachedPythonVersion,
      cached: true
    }
  }

  // Build candidate list
  const platform = process.platform
  const platformCandidates = PYTHON_CANDIDATES[platform] || PYTHON_CANDIDATES.linux
  const candidates = customPath
    ? [customPath, ...platformCandidates]
    : platformCandidates

  // Test each candidate
  const results = []
  for (const candidate of candidates) {
    const result = await testPythonExecutable(candidate)
    results.push(result)

    if (result.success) {
      // Cache successful result
      cachedPythonPath = result.path
      cachedPythonVersion = result.version
      return {
        success: true,
        path: result.path,
        version: result.version,
        cached: false
      }
    }
  }

  // No working Python found
  return {
    success: false,
    error: `No suitable Python installation found. Tested: ${candidates.join(', ')}`,
    details: results,
    requirements: `Python ${MIN_PYTHON_VERSION.major}.${MIN_PYTHON_VERSION.minor}+ is required`
  }
}

/**
 * Clear the cached Python detection result
 * Useful when user installs Python or changes PATH
 */
function clearCache() {
  cachedPythonPath = null
  cachedPythonVersion = null
}

/**
 * Get the cached Python path without re-detecting
 * @returns {string|null} Cached path or null if not detected
 */
function getCachedPath() {
  return cachedPythonPath
}

/**
 * Get the cached Python version without re-detecting
 * @returns {Object|null} Cached version object or null if not detected
 */
function getCachedVersion() {
  return cachedPythonVersion
}

module.exports = {
  detectPython,
  testPythonExecutable,
  clearCache,
  getCachedPath,
  getCachedVersion,
  MIN_PYTHON_VERSION,
  PYTHON_CANDIDATES
}
