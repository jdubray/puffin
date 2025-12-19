/**
 * Developer Profile Manager
 *
 * Manages developer profile data stored globally in Electron's app data directory.
 * This allows the profile to persist across different projects.
 *
 * Storage location:
 *   - Windows: %APPDATA%/puffin/developer-profile.json
 *   - macOS: ~/Library/Application Support/puffin/developer-profile.json
 *   - Linux: ~/.config/puffin/developer-profile.json
 *
 * GitHub Integration:
 *   - OAuth authentication using Device Flow (no server required)
 *   - Profile data sync with GitHub profile
 *   - Repository and activity fetching
 */

const { app, shell, safeStorage } = require('electron')
const fs = require('fs').promises
const path = require('path')
const https = require('https')

const PROFILE_FILE = 'developer-profile.json'
const GITHUB_CREDENTIALS_FILE = 'github-credentials.json'

// GitHub OAuth Configuration
// Client ID is intentionally public - OAuth Device Flow does not use a client secret.
// This is the standard approach for desktop/CLI apps (used by VS Code, GitHub Desktop, etc.)
const GITHUB_CONFIG = {
  clientId: 'Ov23liUkVBHmYgqhqfnP', // Puffin GitHub OAuth App (registered at github.com/settings/developers)
  scope: 'read:user user:email repo',
  deviceAuthUrl: 'https://github.com/login/device/code',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  apiBaseUrl: 'https://api.github.com'
}

/**
 * Default profile structure
 */
const DEFAULT_PROFILE = {
  name: '',
  email: '',
  avatar: '',
  bio: '',
  preferredCodingStyle: 'HYBRID',
  preferences: {
    programmingStyle: 'HYBRID',
    testingApproach: 'TDD',
    documentationLevel: 'STANDARD',
    errorHandling: 'EXCEPTIONS',
    codeStyle: {
      naming: 'CAMEL',
      comments: 'JSDoc'
    }
  },
  // GitHub integration fields
  github: {
    connected: false,
    id: null,
    login: null,
    name: null,
    email: null,
    avatarUrl: null,
    company: null,
    location: null,
    bio: null,
    publicRepos: 0,
    followers: 0,
    following: 0,
    createdAt: null,
    htmlUrl: null
  },
  createdAt: null,
  updatedAt: null
}

/**
 * Coding style options for validation
 */
const CODING_STYLE_OPTIONS = {
  programmingStyle: ['FUNCTIONAL', 'OOP', 'HYBRID', 'PROCEDURAL'],
  testingApproach: ['TDD', 'BDD', 'INTEGRATION', 'MINIMAL', 'NONE'],
  documentationLevel: ['MINIMAL', 'STANDARD', 'COMPREHENSIVE'],
  errorHandling: ['EXCEPTIONS', 'RESULT_TYPES', 'ERROR_CODES', 'CALLBACKS'],
  naming: ['CAMEL', 'SNAKE', 'PASCAL', 'KEBAB'],
  comments: ['JSDoc', 'INLINE', 'MINIMAL', 'NONE']
}

class DeveloperProfileManager {
  constructor() {
    this.profilePath = null
    this.profile = null
  }

  /**
   * Get the app data directory path
   * @returns {string} Path to app data directory
   */
  getAppDataPath() {
    return path.join(app.getPath('userData'))
  }

  /**
   * Get the full path to the profile file
   * @returns {string} Path to profile file
   */
  getProfilePath() {
    if (!this.profilePath) {
      this.profilePath = path.join(this.getAppDataPath(), PROFILE_FILE)
    }
    return this.profilePath
  }

  /**
   * Ensure the app data directory exists
   */
  async ensureAppDataDir() {
    const appDataPath = this.getAppDataPath()
    try {
      await fs.mkdir(appDataPath, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }

  /**
   * Load the developer profile from storage
   * @returns {Object|null} Profile object or null if not found
   */
  async load() {
    try {
      const profilePath = this.getProfilePath()
      const content = await fs.readFile(profilePath, 'utf-8')
      this.profile = JSON.parse(content)
      return this.profile
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Profile doesn't exist yet
        return null
      }
      throw err
    }
  }

  /**
   * Save the developer profile to storage
   * @param {Object} profile - Profile data to save
   * @returns {Object} Saved profile
   */
  async save(profile) {
    await this.ensureAppDataDir()

    const now = new Date().toISOString()
    const profileToSave = {
      ...DEFAULT_PROFILE,
      ...profile,
      updatedAt: now
    }

    // Set createdAt if this is a new profile
    if (!profileToSave.createdAt) {
      profileToSave.createdAt = now
    }

    const profilePath = this.getProfilePath()
    await fs.writeFile(profilePath, JSON.stringify(profileToSave, null, 2), 'utf-8')

    this.profile = profileToSave
    return this.profile
  }

  /**
   * Create a new developer profile
   * @param {Object} profileData - Profile data
   * @returns {Object} Created profile
   */
  async create(profileData) {
    // Validate required fields
    if (!profileData.name || profileData.name.trim() === '') {
      throw new Error('Name is required')
    }

    if (!profileData.preferredCodingStyle) {
      throw new Error('Preferred coding style is required')
    }

    // Validate coding style option
    if (!CODING_STYLE_OPTIONS.programmingStyle.includes(profileData.preferredCodingStyle)) {
      throw new Error(`Invalid coding style. Must be one of: ${CODING_STYLE_OPTIONS.programmingStyle.join(', ')}`)
    }

    const profile = {
      name: profileData.name.trim(),
      email: profileData.email?.trim() || '',
      avatar: profileData.avatar || '',
      bio: profileData.bio?.trim() || '',
      preferredCodingStyle: profileData.preferredCodingStyle,
      preferences: {
        ...DEFAULT_PROFILE.preferences,
        ...profileData.preferences,
        programmingStyle: profileData.preferredCodingStyle
      }
    }

    return await this.save(profile)
  }

  /**
   * Update the developer profile
   * @param {Object} updates - Partial updates to apply
   * @returns {Object} Updated profile
   */
  async update(updates) {
    const currentProfile = await this.load()
    if (!currentProfile) {
      throw new Error('No profile exists. Create a profile first.')
    }

    // Validate name if provided
    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new Error('Name cannot be empty')
    }

    // Validate coding style if provided
    if (updates.preferredCodingStyle) {
      if (!CODING_STYLE_OPTIONS.programmingStyle.includes(updates.preferredCodingStyle)) {
        throw new Error(`Invalid coding style. Must be one of: ${CODING_STYLE_OPTIONS.programmingStyle.join(', ')}`)
      }
    }

    // Merge updates
    const updatedProfile = {
      ...currentProfile,
      ...updates,
      preferences: {
        ...currentProfile.preferences,
        ...updates.preferences
      }
    }

    // Sync preferredCodingStyle with preferences.programmingStyle
    if (updates.preferredCodingStyle) {
      updatedProfile.preferences.programmingStyle = updates.preferredCodingStyle
    }

    return await this.save(updatedProfile)
  }

  /**
   * Delete the developer profile
   * @returns {boolean} True if deleted
   */
  async delete() {
    const profilePath = this.getProfilePath()
    try {
      await fs.unlink(profilePath)
      this.profile = null
      return true
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Profile doesn't exist, nothing to delete
        return false
      }
      throw err
    }
  }

  /**
   * Check if a profile exists
   * @returns {boolean} True if profile exists
   */
  async exists() {
    const profile = await this.load()
    return profile !== null
  }

  /**
   * Get the current profile
   * @returns {Object|null} Current profile or null
   */
  async get() {
    return await this.load()
  }

  /**
   * Export profile to JSON string
   * @returns {string} JSON string of profile
   */
  async exportProfile() {
    const profile = await this.load()
    if (!profile) {
      throw new Error('No profile exists to export')
    }

    return JSON.stringify(profile, null, 2)
  }

  /**
   * Import profile from JSON string
   * @param {string} jsonString - JSON string of profile data
   * @param {boolean} overwrite - Whether to overwrite existing profile
   * @returns {Object} Imported profile
   */
  async importProfile(jsonString, overwrite = false) {
    // Check if profile already exists
    const existingProfile = await this.load()
    if (existingProfile && !overwrite) {
      throw new Error('Profile already exists. Set overwrite to true to replace it.')
    }

    // Parse and validate the JSON
    let importedData
    try {
      importedData = JSON.parse(jsonString)
    } catch {
      throw new Error('Invalid JSON format')
    }

    // Validate required fields
    if (!importedData.name || importedData.name.trim() === '') {
      throw new Error('Imported profile must have a name')
    }

    if (!importedData.preferredCodingStyle) {
      throw new Error('Imported profile must have a preferred coding style')
    }

    // Create profile from imported data
    const profile = {
      name: importedData.name.trim(),
      email: importedData.email?.trim() || '',
      avatar: importedData.avatar || '',
      bio: importedData.bio?.trim() || '',
      preferredCodingStyle: importedData.preferredCodingStyle,
      preferences: {
        ...DEFAULT_PROFILE.preferences,
        ...importedData.preferences
      }
    }

    return await this.save(profile)
  }

  /**
   * Validate profile data
   * @param {Object} profileData - Profile data to validate
   * @returns {Object} Validation result with isValid and errors
   */
  validate(profileData) {
    const errors = []

    // Required fields
    if (!profileData.name || profileData.name.trim() === '') {
      errors.push({ field: 'name', message: 'Name is required' })
    }

    if (!profileData.preferredCodingStyle) {
      errors.push({ field: 'preferredCodingStyle', message: 'Preferred coding style is required' })
    } else if (!CODING_STYLE_OPTIONS.programmingStyle.includes(profileData.preferredCodingStyle)) {
      errors.push({
        field: 'preferredCodingStyle',
        message: `Must be one of: ${CODING_STYLE_OPTIONS.programmingStyle.join(', ')}`
      })
    }

    // Optional field validation
    if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' })
    }

    if (profileData.bio && profileData.bio.length > 500) {
      errors.push({ field: 'bio', message: 'Bio must be 500 characters or less' })
    }

    // Validate preferences if provided
    if (profileData.preferences) {
      const prefs = profileData.preferences

      if (prefs.programmingStyle && !CODING_STYLE_OPTIONS.programmingStyle.includes(prefs.programmingStyle)) {
        errors.push({
          field: 'preferences.programmingStyle',
          message: `Must be one of: ${CODING_STYLE_OPTIONS.programmingStyle.join(', ')}`
        })
      }

      if (prefs.testingApproach && !CODING_STYLE_OPTIONS.testingApproach.includes(prefs.testingApproach)) {
        errors.push({
          field: 'preferences.testingApproach',
          message: `Must be one of: ${CODING_STYLE_OPTIONS.testingApproach.join(', ')}`
        })
      }

      if (prefs.documentationLevel && !CODING_STYLE_OPTIONS.documentationLevel.includes(prefs.documentationLevel)) {
        errors.push({
          field: 'preferences.documentationLevel',
          message: `Must be one of: ${CODING_STYLE_OPTIONS.documentationLevel.join(', ')}`
        })
      }

      if (prefs.errorHandling && !CODING_STYLE_OPTIONS.errorHandling.includes(prefs.errorHandling)) {
        errors.push({
          field: 'preferences.errorHandling',
          message: `Must be one of: ${CODING_STYLE_OPTIONS.errorHandling.join(', ')}`
        })
      }

      if (prefs.codeStyle) {
        if (prefs.codeStyle.naming && !CODING_STYLE_OPTIONS.naming.includes(prefs.codeStyle.naming)) {
          errors.push({
            field: 'preferences.codeStyle.naming',
            message: `Must be one of: ${CODING_STYLE_OPTIONS.naming.join(', ')}`
          })
        }

        if (prefs.codeStyle.comments && !CODING_STYLE_OPTIONS.comments.includes(prefs.codeStyle.comments)) {
          errors.push({
            field: 'preferences.codeStyle.comments',
            message: `Must be one of: ${CODING_STYLE_OPTIONS.comments.join(', ')}`
          })
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Get available coding style options
   * @returns {Object} Available options for each preference
   */
  getOptions() {
    return { ...CODING_STYLE_OPTIONS }
  }

  // ============================================
  // GitHub Integration Methods
  // ============================================

  /**
   * Get the path to the GitHub credentials file
   * @returns {string} Path to credentials file
   */
  getCredentialsPath() {
    return path.join(this.getAppDataPath(), GITHUB_CREDENTIALS_FILE)
  }

  /**
   * Start GitHub OAuth Device Flow authentication
   * This opens a browser for the user to authorize the app
   * @returns {Object} Device code info including user_code and verification_uri
   */
  async startGithubAuth() {
    return new Promise((resolve, reject) => {
      const postData = `client_id=${GITHUB_CONFIG.clientId}&scope=${encodeURIComponent(GITHUB_CONFIG.scope)}`

      const req = https.request(GITHUB_CONFIG.deviceAuthUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const response = JSON.parse(data)
            if (response.error) {
              reject(new Error(response.error_description || response.error))
            } else {
              resolve({
                deviceCode: response.device_code,
                userCode: response.user_code,
                verificationUri: response.verification_uri,
                expiresIn: response.expires_in,
                interval: response.interval || 5
              })
            }
          } catch (err) {
            reject(new Error('Failed to parse GitHub response'))
          }
        })
      })

      req.on('error', reject)
      req.write(postData)
      req.end()
    })
  }

  /**
   * Open the GitHub verification URL in the default browser
   * @param {string} verificationUri - The URL to open
   */
  async openGithubAuth(verificationUri) {
    await shell.openExternal(verificationUri)
  }

  /**
   * Poll GitHub for the access token after user authorizes
   * @param {string} deviceCode - Device code from startGithubAuth
   * @param {number} interval - Polling interval in seconds
   * @param {number} expiresIn - Total expiration time in seconds
   * @returns {Object} Token info including access_token
   */
  async pollForGithubToken(deviceCode, interval = 5, expiresIn = 900) {
    const startTime = Date.now()
    const expirationMs = expiresIn * 1000

    return new Promise((resolve, reject) => {
      const poll = () => {
        if (Date.now() - startTime > expirationMs) {
          reject(new Error('GitHub authorization timed out'))
          return
        }

        const postData = `client_id=${GITHUB_CONFIG.clientId}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`

        const req = https.request(GITHUB_CONFIG.tokenUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            try {
              const response = JSON.parse(data)

              if (response.error === 'authorization_pending') {
                // User hasn't authorized yet, keep polling
                setTimeout(poll, interval * 1000)
              } else if (response.error === 'slow_down') {
                // Need to slow down polling
                setTimeout(poll, (interval + 5) * 1000)
              } else if (response.error) {
                reject(new Error(response.error_description || response.error))
              } else if (response.access_token) {
                resolve({
                  accessToken: response.access_token,
                  tokenType: response.token_type,
                  scope: response.scope
                })
              } else {
                reject(new Error('Unexpected response from GitHub'))
              }
            } catch (err) {
              reject(new Error('Failed to parse GitHub response'))
            }
          })
        })

        req.on('error', reject)
        req.write(postData)
        req.end()
      }

      poll()
    })
  }

  /**
   * Save GitHub credentials securely
   * @param {Object} credentials - Token data to save
   */
  async saveGithubCredentials(credentials) {
    await this.ensureAppDataDir()
    const credentialsPath = this.getCredentialsPath()

    // Encrypt the credentials if safeStorage is available
    let dataToSave
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(credentials))
      dataToSave = { encrypted: encrypted.toString('base64') }
    } else {
      // Fallback to plain storage (not recommended for production)
      dataToSave = { plain: credentials }
    }

    await fs.writeFile(credentialsPath, JSON.stringify(dataToSave), 'utf-8')
  }

  /**
   * Load GitHub credentials
   * @returns {Object|null} Credentials or null if not found
   */
  async loadGithubCredentials() {
    try {
      const credentialsPath = this.getCredentialsPath()
      const content = await fs.readFile(credentialsPath, 'utf-8')
      const data = JSON.parse(content)

      if (data.encrypted && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(data.encrypted, 'base64')
        const decrypted = safeStorage.decryptString(buffer)
        return JSON.parse(decrypted)
      } else if (data.plain) {
        return data.plain
      }

      return null
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  /**
   * Delete GitHub credentials
   */
  async deleteGithubCredentials() {
    try {
      await fs.unlink(this.getCredentialsPath())
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  /**
   * Make an authenticated GitHub API request
   * @param {string} endpoint - API endpoint (e.g., '/user')
   * @param {Object} options - Request options
   * @returns {Object} API response
   */
  async githubApiRequest(endpoint, options = {}) {
    const credentials = await this.loadGithubCredentials()
    if (!credentials?.accessToken) {
      throw new Error('Not authenticated with GitHub')
    }

    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, GITHUB_CONFIG.apiBaseUrl)

      const req = https.request(url, {
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'User-Agent': 'Puffin-App',
          ...options.headers
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const response = JSON.parse(data)

            // Include rate limit info
            const rateLimit = {
              remaining: parseInt(res.headers['x-ratelimit-remaining'], 10),
              reset: parseInt(res.headers['x-ratelimit-reset'], 10),
              limit: parseInt(res.headers['x-ratelimit-limit'], 10)
            }

            if (res.statusCode >= 400) {
              const error = new Error(response.message || 'GitHub API error')
              error.status = res.statusCode
              error.rateLimit = rateLimit
              reject(error)
            } else {
              resolve({ data: response, rateLimit })
            }
          } catch (err) {
            reject(new Error('Failed to parse GitHub API response'))
          }
        })
      })

      req.on('error', reject)
      req.end()
    })
  }

  /**
   * Fetch the authenticated GitHub user's profile
   * @returns {Object} GitHub user profile
   */
  async fetchGithubProfile() {
    const { data, rateLimit } = await this.githubApiRequest('/user')
    return { profile: data, rateLimit }
  }

  /**
   * Fetch the authenticated user's repositories
   * @param {Object} options - Query options
   * @returns {Array} List of repositories
   */
  async fetchGithubRepositories(options = {}) {
    const params = new URLSearchParams({
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
      per_page: String(options.perPage || 30),
      page: String(options.page || 1)
    })

    const { data, rateLimit } = await this.githubApiRequest(`/user/repos?${params}`)
    return { repositories: data, rateLimit }
  }

  /**
   * Fetch the authenticated user's recent activity
   * @param {number} perPage - Number of events per page
   * @returns {Array} List of activity events
   */
  async fetchGithubActivity(perPage = 30) {
    const credentials = await this.loadGithubCredentials()
    if (!credentials) throw new Error('Not authenticated with GitHub')

    // First get the username
    const { profile } = await this.fetchGithubProfile()

    const { data, rateLimit } = await this.githubApiRequest(
      `/users/${profile.login}/events?per_page=${perPage}`
    )
    return { events: data, rateLimit }
  }

  /**
   * Complete GitHub authentication and update profile
   * @param {Object} tokenInfo - Token info from pollForGithubToken
   * @returns {Object} Updated profile with GitHub data
   */
  async completeGithubAuth(tokenInfo) {
    // Save credentials
    await this.saveGithubCredentials(tokenInfo)

    // Fetch GitHub profile
    const { profile: githubProfile } = await this.fetchGithubProfile()

    // Load or create profile
    let profile = await this.load()
    if (!profile) {
      profile = { ...DEFAULT_PROFILE }
    }

    // Update profile with GitHub data
    profile.github = {
      connected: true,
      id: githubProfile.id,
      login: githubProfile.login,
      name: githubProfile.name,
      email: githubProfile.email,
      avatarUrl: githubProfile.avatar_url,
      company: githubProfile.company,
      location: githubProfile.location,
      bio: githubProfile.bio,
      publicRepos: githubProfile.public_repos,
      followers: githubProfile.followers,
      following: githubProfile.following,
      createdAt: githubProfile.created_at,
      htmlUrl: githubProfile.html_url
    }

    // Auto-fill profile fields if empty
    if (!profile.name && githubProfile.name) {
      profile.name = githubProfile.name
    }
    if (!profile.email && githubProfile.email) {
      profile.email = githubProfile.email
    }
    if (!profile.avatar && githubProfile.avatar_url) {
      profile.avatar = githubProfile.avatar_url
    }
    if (!profile.bio && githubProfile.bio) {
      profile.bio = githubProfile.bio
    }

    // Save updated profile
    await this.save(profile)

    return profile
  }

  /**
   * Connect to GitHub using a Personal Access Token (PAT)
   * @param {string} token - GitHub Personal Access Token
   * @returns {Object} Updated profile with GitHub data
   */
  async connectWithPAT(token) {
    if (!token || !token.trim()) {
      throw new Error('Token is required')
    }

    // Validate token format
    const trimmedToken = token.trim()
    if (!trimmedToken.startsWith('ghp_') && !trimmedToken.startsWith('github_pat_')) {
      throw new Error('Invalid token format. GitHub PATs start with ghp_ or github_pat_')
    }

    // Create token info object (similar to OAuth response)
    const tokenInfo = {
      accessToken: trimmedToken,
      tokenType: 'bearer',
      scope: 'repo read:user user:email'
    }

    // Use the same completion flow as OAuth
    return await this.completeGithubAuth(tokenInfo)
  }

  /**
   * Disconnect GitHub from profile
   * @returns {Object} Updated profile without GitHub connection
   */
  async disconnectGithub() {
    // Delete credentials
    await this.deleteGithubCredentials()

    // Update profile
    const profile = await this.load()
    if (profile) {
      profile.github = { ...DEFAULT_PROFILE.github }
      await this.save(profile)
      return profile
    }

    return null
  }

  /**
   * Check if GitHub is connected
   * @returns {boolean} True if connected
   */
  async isGithubConnected() {
    const credentials = await this.loadGithubCredentials()
    return !!credentials?.accessToken
  }

  /**
   * Refresh GitHub profile data
   * @returns {Object} Updated profile
   */
  async refreshGithubProfile() {
    const connected = await this.isGithubConnected()
    if (!connected) {
      throw new Error('GitHub is not connected')
    }

    const { profile: githubProfile } = await this.fetchGithubProfile()

    const profile = await this.load()
    if (profile) {
      profile.github = {
        ...profile.github,
        id: githubProfile.id,
        login: githubProfile.login,
        name: githubProfile.name,
        email: githubProfile.email,
        avatarUrl: githubProfile.avatar_url,
        company: githubProfile.company,
        location: githubProfile.location,
        bio: githubProfile.bio,
        publicRepos: githubProfile.public_repos,
        followers: githubProfile.followers,
        following: githubProfile.following
      }

      await this.save(profile)
      return profile
    }

    return null
  }
}

module.exports = { DeveloperProfileManager, CODING_STYLE_OPTIONS, DEFAULT_PROFILE, GITHUB_CONFIG }
