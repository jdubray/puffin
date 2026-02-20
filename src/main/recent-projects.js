'use strict'

/**
 * @module recent-projects
 * Manages the list of recently opened project directories.
 * Stored in ~/.puffin/recent-projects.json — max 10 entries.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const PUFFIN_DIR = path.join(os.homedir(), '.puffin')
const RECENT_FILE = path.join(PUFFIN_DIR, 'recent-projects.json')
const MAX_ENTRIES = 10

/**
 * Ensure ~/.puffin/ directory exists.
 */
function ensurePuffinDir() {
  if (!fs.existsSync(PUFFIN_DIR)) {
    fs.mkdirSync(PUFFIN_DIR, { recursive: true })
  }
}

/**
 * Read the recent projects list from disk.
 * @returns {Array<{ path: string, name: string, lastOpened: string }>}
 */
function readRecent() {
  try {
    if (!fs.existsSync(RECENT_FILE)) return []
    const raw = fs.readFileSync(RECENT_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Write the recent projects list to disk.
 * @param {Array} projects
 */
function writeRecent(projects) {
  ensurePuffinDir()
  fs.writeFileSync(RECENT_FILE, JSON.stringify(projects, null, 2), 'utf8')
}

/**
 * Get the current list of recent projects (most recent first).
 * @returns {Array<{ path: string, name: string, lastOpened: string }>}
 */
function getRecentProjects() {
  return readRecent()
}

/**
 * Record a project as recently opened.
 * Moves it to the top if already present; trims to MAX_ENTRIES.
 * @param {string} projectPath - Absolute path to the project directory.
 */
function addRecentProject(projectPath) {
  const name = path.basename(projectPath)
  const entry = {
    path: projectPath,
    name,
    lastOpened: new Date().toISOString()
  }

  let projects = readRecent()

  // Remove existing entry for this path (if any)
  projects = projects.filter(p => p.path !== projectPath)

  // Add to front
  projects.unshift(entry)

  // Trim to max
  if (projects.length > MAX_ENTRIES) {
    projects = projects.slice(0, MAX_ENTRIES)
  }

  writeRecent(projects)
}

/**
 * Remove a project from the recent list.
 * @param {string} projectPath - Absolute path to remove.
 */
function removeRecentProject(projectPath) {
  const projects = readRecent().filter(p => p.path !== projectPath)
  writeRecent(projects)
}

module.exports = {
  getRecentProjects,
  addRecentProject,
  removeRecentProject
}
