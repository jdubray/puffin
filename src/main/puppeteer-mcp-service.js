'use strict'

/**
 * PuppeteerMcpService
 *
 * Manages the Puppeteer MCP server configuration file for the Website Edition
 * visual feedback loop. Writes a project-scoped `.puffin/mcp-puppeteer.json`
 * that Claude Code reads via `--mcp-config` when the visual loop is active.
 *
 * The MCP config instructs Claude to start `@modelcontextprotocol/server-puppeteer`
 * as a stdio subprocess, giving it access to `puppeteer_navigate`,
 * `puppeteer_screenshot`, and related browser tools during a session.
 */

const fs = require('fs')
const path = require('path')

/** Filename written inside the project's .puffin directory. */
const MCP_CONFIG_FILENAME = 'mcp-puppeteer.json'

/**
 * Content written to the MCP config file.
 * npx -y ensures the package is downloaded on first use without a manual install step.
 */
const MCP_CONFIG_CONTENT = {
  mcpServers: {
    puppeteer: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      env: {}
    }
  }
}

class PuppeteerMcpService {
  /**
   * Write the Puppeteer MCP config to `<projectPath>/.puffin/mcp-puppeteer.json`.
   * Idempotent — safe to call multiple times.
   *
   * @param {string} projectPath - Absolute path to the project root
   * @returns {{ configPath: string }} Path of the written config file
   */
  setup(projectPath) {
    const puffinDir = path.join(projectPath, '.puffin')
    if (!fs.existsSync(puffinDir)) {
      fs.mkdirSync(puffinDir, { recursive: true })
    }
    const configPath = path.join(puffinDir, MCP_CONFIG_FILENAME)
    fs.writeFileSync(configPath, JSON.stringify(MCP_CONFIG_CONTENT, null, 2), 'utf8')
    console.log(`[Puppeteer] MCP config written to ${configPath}`)
    return { configPath }
  }

  /**
   * Return the expected path of the MCP config file for a project.
   * Does not create or verify the file.
   *
   * @param {string} projectPath - Absolute path to the project root
   * @returns {string}
   */
  getConfigPath(projectPath) {
    return path.join(projectPath, '.puffin', MCP_CONFIG_FILENAME)
  }

  /**
   * Check whether the MCP config file already exists for a project.
   *
   * @param {string} projectPath - Absolute path to the project root
   * @returns {boolean}
   */
  isSetup(projectPath) {
    return fs.existsSync(this.getConfigPath(projectPath))
  }
}

module.exports = new PuppeteerMcpService()
