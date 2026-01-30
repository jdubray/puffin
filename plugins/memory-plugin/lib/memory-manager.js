/**
 * Core MemoryManager
 *
 * Orchestrates the memorize workflow: reads thread history, checks fallbacks,
 * runs LLM extraction, validates the response, evolves existing memory,
 * and writes the result to disk.
 *
 * @module memory-manager
 */

const { buildExtractionPrompt } = require('./prompts/extraction.js')
const { buildEvolutionPrompt } = require('./prompts/evolution.js')
const { checkFallback } = require('./prompts/fallbacks.js')
const { validateExtractionResponse, validateEvolutionResponse, extractJson } = require('./validation.js')

/** Maximum extraction retries on validation failure */
const MAX_RETRIES = 1

class MemoryManager {
  /**
   * @param {Object} deps
   * @param {import('./file-system-layer.js').FileSystemLayer} deps.fsLayer
   * @param {import('./claude-client.js').ClaudeClient} deps.claudeClient
   * @param {Object} deps.historyService - Must have getBranchPrompts(branchId) => Promise<Array>
   * @param {Object} [deps.logger=console]
   */
  constructor({ fsLayer, claudeClient, historyService, logger }) {
    this.fsLayer = fsLayer
    this.claudeClient = claudeClient
    this.historyService = historyService
    this.logger = logger || console
  }

  /**
   * Run the full memorize pipeline for a branch
   * @param {string} branchId
   * @returns {Promise<{ status: string, extractions: number, evolved: boolean, error?: string }>}
   */
  async memorize(branchId) {
    this.logger.log(`[memory-manager] Starting memorize for branch: ${branchId}`)

    // Step 1: Read thread history
    let prompts
    try {
      prompts = await this.historyService.getBranchPrompts(branchId)
      this.logger.log(`[memory-manager] Read ${prompts.length} prompts from branch "${branchId}"`)
    } catch (err) {
      this.logger.error(`[memory-manager] Failed to read history for branch "${branchId}":`, err.message)
      return { status: 'error', extractions: 0, evolved: false, error: `History read failed: ${err.message}` }
    }

    // Step 2: Check fallbacks (empty/trivial conversations)
    const fallback = checkFallback(prompts, this.logger)
    if (fallback) {
      this.logger.log(`[memory-manager] Fallback triggered: ${fallback.reason}`)
      return { status: 'skipped', extractions: 0, evolved: false, error: fallback.reason }
    }

    // Step 3: Run extraction
    let extractions
    try {
      extractions = await this._extract(prompts, branchId)
      this.logger.log(`[memory-manager] Extracted ${extractions.length} items`)
    } catch (err) {
      this.logger.error(`[memory-manager] Extraction failed:`, err.message)
      return { status: 'error', extractions: 0, evolved: false, error: `Extraction failed: ${err.message}` }
    }

    if (extractions.length === 0) {
      this.logger.log(`[memory-manager] No knowledge extracted — nothing to store`)
      return { status: 'empty', extractions: 0, evolved: false }
    }

    // Step 4: Read existing memory (if any)
    const existing = await this.fsLayer.readBranch(branchId)

    // Step 5: Evolve or create
    let sections
    try {
      if (existing.exists && existing.parsed) {
        sections = await this._evolve(existing.parsed.sections, extractions, branchId)
        this.logger.log(`[memory-manager] Evolved existing memory for "${branchId}"`)
      } else {
        sections = this._extractionsToSections(extractions)
        this.logger.log(`[memory-manager] Creating new memory for "${branchId}"`)
      }
    } catch (err) {
      this.logger.error(`[memory-manager] Evolution failed:`, err.message)
      // Fall back to simple merge on evolution failure
      sections = this._extractionsToSections(extractions)
      this.logger.log(`[memory-manager] Fell back to simple extraction-to-sections`)
    }

    // Step 6: Write to disk
    try {
      await this.fsLayer.writeBranchSections(branchId, sections)
      this.logger.log(`[memory-manager] Wrote memory file for "${branchId}"`)
    } catch (err) {
      this.logger.error(`[memory-manager] Failed to write memory file:`, err.message)
      return { status: 'error', extractions: extractions.length, evolved: false, error: `Write failed: ${err.message}` }
    }

    return {
      status: 'success',
      extractions: extractions.length,
      evolved: existing.exists
    }
  }

  /**
   * Run LLM extraction with validation and retry
   * @param {Array} prompts - Conversation prompts
   * @param {string} branchId
   * @returns {Promise<Array>} Validated extractions
   * @private
   */
  async _extract(prompts, branchId) {
    const prompt = buildExtractionPrompt(prompts, branchId)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const raw = await this.claudeClient.invoke(prompt)
      const json = extractJson(raw)
      const result = validateExtractionResponse(json)

      if (result.valid) {
        return result.data.extractions
      }

      this.logger.warn(
        `[memory-manager] Extraction validation failed (attempt ${attempt + 1}):`,
        result.errors.join('; ')
      )
    }

    throw new Error('Extraction failed validation after retries')
  }

  /**
   * Run LLM evolution to merge new extractions into existing memory
   * @param {Object} existingSections
   * @param {Array} newExtractions
   * @param {string} branchId
   * @returns {Promise<Object>} Merged sections
   * @private
   */
  async _evolve(existingSections, newExtractions, branchId) {
    const prompt = buildEvolutionPrompt(existingSections, newExtractions, branchId)
    const raw = await this.claudeClient.invoke(prompt)
    const json = extractJson(raw)
    const result = validateEvolutionResponse(json)

    if (!result.valid) {
      throw new Error(`Evolution validation failed: ${result.errors.join('; ')}`)
    }

    return result.data.sections
  }

  /**
   * Convert raw extractions to sections (simple grouping, no LLM needed)
   * @param {Array<{ section: string, content: string }>} extractions
   * @returns {Object} Sections map
   * @private
   */
  _extractionsToSections(extractions) {
    const sections = {
      'facts': [],
      'architectural-decisions': [],
      'conventions': [],
      'bug-patterns': []
    }

    for (const item of extractions) {
      if (sections[item.section]) {
        sections[item.section].push(item.content)
      }
    }

    return sections
  }
}

module.exports = { MemoryManager, MAX_RETRIES }
