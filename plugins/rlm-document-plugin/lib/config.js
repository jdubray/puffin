/**
 * RLM Document Plugin - Configuration Constants
 *
 * Centralized configuration for the RLM Document Analyzer plugin.
 * These values are derived from the design review and implementation decisions.
 */

/**
 * Session management configuration
 */
const SESSION = {
  /** Days to retain inactive sessions before auto-cleanup */
  RETENTION_DAYS: 30,

  /** Maximum sessions allowed per project */
  MAX_PER_PROJECT: 50,

  /** Session ID prefix for identification */
  ID_PREFIX: 'ses_',

  /** Session states */
  STATE: {
    ACTIVE: 'active',
    CLOSED: 'closed'
  }
}

/**
 * Chunking configuration
 */
const CHUNKING = {
  /** Default chunk size in characters */
  DEFAULT_SIZE: 4000,

  /** Default overlap between chunks in characters */
  DEFAULT_OVERLAP: 200,

  /** Maximum chunk size allowed */
  MAX_SIZE: 10000,

  /** Minimum chunk size allowed */
  MIN_SIZE: 500
}

/**
 * Query execution configuration
 */
const QUERY = {
  /** Maximum concurrent queries to the sub-agent */
  MAX_CONCURRENT: 3,

  /** Timeout for individual chunk queries in milliseconds */
  TIMEOUT_MS: 60000,

  /** Query ID prefix */
  ID_PREFIX: 'qry_'
}

/**
 * Sub-agent configuration
 */
const SUB_AGENT = {
  /** Fixed model for sub-agent chunk analysis */
  MODEL: 'haiku'
}

/**
 * Export format configuration
 */
const EXPORT = {
  /** Supported export formats */
  FORMATS: ['json', 'markdown'],

  /** Default export format */
  DEFAULT_FORMAT: 'json'
}

/**
 * File size limits for document analysis
 */
const FILE_LIMITS = {
  /** Warning threshold in bytes (10MB) */
  WARN_SIZE: 10 * 1024 * 1024,

  /** Maximum file size in bytes (50MB) */
  MAX_SIZE: 50 * 1024 * 1024
}

/**
 * Storage paths (relative to project root)
 */
const STORAGE = {
  /** Base directory for RLM sessions */
  BASE_DIR: '.puffin/rlm-sessions',

  /** Sessions index file */
  INDEX_FILE: 'sessions.json',

  /** Individual session directory */
  SESSIONS_DIR: 'sessions',

  /** Metadata file within session */
  METADATA_FILE: 'metadata.json',

  /** Buffers file within session */
  BUFFERS_FILE: 'buffers.json',

  /** Results directory within session */
  RESULTS_DIR: 'results',

  /** Chunks directory within session */
  CHUNKS_DIR: 'chunks'
}

/**
 * Python REPL configuration
 */
const REPL = {
  /** JSON-RPC protocol version */
  PROTOCOL_VERSION: '2.0',

  /** Process spawn timeout in milliseconds */
  SPAWN_TIMEOUT: 10000,

  /** Healthcheck interval in milliseconds */
  HEALTHCHECK_INTERVAL: 30000
}

/**
 * Supported file extensions for document analysis
 */
const SUPPORTED_EXTENSIONS = [
  '.md', '.txt', '.rst', '.asciidoc',
  '.json', '.yaml', '.yml', '.xml', '.toml',
  '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.html', '.css', '.scss',
  '.sql', '.graphql',
  '.sh', '.bash', '.zsh', '.ps1', '.bat',
  '.log', '.csv'
]

/**
 * Get all configuration as a single object
 * Useful for passing to renderer or external consumers
 */
function getConfig() {
  return {
    session: SESSION,
    chunking: CHUNKING,
    query: QUERY,
    subAgent: SUB_AGENT,
    export: EXPORT,
    fileLimits: FILE_LIMITS,
    storage: STORAGE,
    repl: REPL,
    supportedExtensions: SUPPORTED_EXTENSIONS
  }
}

module.exports = {
  SESSION,
  CHUNKING,
  QUERY,
  SUB_AGENT,
  EXPORT,
  FILE_LIMITS,
  STORAGE,
  REPL,
  SUPPORTED_EXTENSIONS,
  getConfig
}
