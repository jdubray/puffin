/**
 * Tests for document-edit-service — provider routing for 4.0 document editing.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')

const service = require('../src/main/document-edit-service')

describe('document-edit-service', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY })
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
  })

  it('buildEditPrompt includes the instruction and document', () => {
    const p = service.buildEditPrompt('make it formal', 'hello there')
    assert.match(p, /make it formal/)
    assert.match(p, /hello there/)
  })

  it('requires an instruction', async () => {
    const result = await service.editDocument({ instruction: '', content: 'doc' })
    assert.strictEqual(result.success, false)
    assert.match(result.error, /instruction/i)
  })

  it('routes to the CLI provider by default and forces tool-free one-shot', async () => {
    let captured = null
    const fakeClaude = {
      async sendPrompt(prompt, options) {
        captured = { prompt, options }
        return { success: true, response: 'edited via cli' }
      }
    }
    const result = await service.editDocument({
      instruction: 'fix typos',
      content: 'teh cat',
      claudeService: fakeClaude
    })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.provider, 'cli')
    assert.strictEqual(result.response, 'edited via cli')
    assert.strictEqual(captured.options.disableTools, true)
    assert.strictEqual(captured.options.allowConcurrent, true)
    assert.match(captured.prompt, /fix typos/)
  })

  it('routes to the API provider when configured (no network on missing key)', async () => {
    // No API key (env cleared in beforeEach, none in config) → the api client
    // returns early before any fetch. This proves routing to 'api' without a
    // network call, and that it does NOT fall through to the CLI provider.
    const result = await service.editDocument({
      instruction: 'summarize',
      content: 'long text',
      provider: 'api',
      config: { anthropic: { model: 'claude-haiku-4-5' } }
      // no claudeService passed — if it wrongly used CLI it would error differently
    })
    assert.strictEqual(result.provider, 'api')
    assert.strictEqual(result.success, false)
    assert.match(result.error, /API key/i)
  })

  it('honors config.promptProvider when no explicit provider is passed', async () => {
    let usedCli = false
    const fakeClaude = {
      async sendPrompt() { usedCli = true; return { success: true, response: 'x' } }
    }
    await service.editDocument({
      instruction: 'do it',
      content: 'c',
      config: { promptProvider: 'cli' },
      claudeService: fakeClaude
    })
    assert.strictEqual(usedCli, true)
  })

  it('errors gracefully when CLI provider is selected but unavailable', async () => {
    const result = await service.editDocument({
      instruction: 'do it',
      content: 'c',
      config: { promptProvider: 'cli' }
      // no claudeService
    })
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.provider, 'cli')
    assert.match(result.error, /unavailable/i)
  })
})
