/**
 * Tests for anthropic-api-client — the cost-controlled Messages API client
 * used by the 4.0 document-editing 'api' provider.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')

const apiClient = require('../src/main/anthropic-api-client')

/** Build a fake fetch that records the request and returns a canned response. */
function fakeFetch(response, capture) {
  return async (url, opts) => {
    if (capture) {
      capture.url = url
      capture.opts = opts
      capture.body = JSON.parse(opts.body)
    }
    return response
  }
}

function okResponse(text, usage) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text }],
      usage: usage || { input_tokens: 10, output_tokens: 20 },
      model: 'claude-haiku-4-5'
    })
  }
}

describe('anthropic-api-client.sendMessage', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
  })

  it('fails clearly when no API key is available', async () => {
    const result = await apiClient.sendMessage({ prompt: 'hi', fetchImpl: fakeFetch(okResponse('x')) })
    assert.strictEqual(result.success, false)
    assert.match(result.error, /API key/i)
  })

  it('requires a non-empty prompt', async () => {
    const result = await apiClient.sendMessage({ prompt: '   ', apiKey: 'sk-test', fetchImpl: fakeFetch(okResponse('x')) })
    assert.strictEqual(result.success, false)
    assert.match(result.error, /required/i)
  })

  it('reads the API key from ANTHROPIC_API_KEY env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'
    const cap = {}
    const result = await apiClient.sendMessage({ prompt: 'hi', fetchImpl: fakeFetch(okResponse('hello'), cap) })
    assert.strictEqual(result.success, true)
    assert.strictEqual(cap.opts.headers['x-api-key'], 'sk-env-key')
  })

  it('sends NO tools and defaults to the cheapest model', async () => {
    const cap = {}
    await apiClient.sendMessage({ prompt: 'edit this', apiKey: 'sk-test', fetchImpl: fakeFetch(okResponse('done'), cap) })
    assert.strictEqual(cap.body.model, 'claude-haiku-4-5')
    assert.ok(!('tools' in cap.body), 'must not send tools')
    assert.ok(!('thinking' in cap.body), 'must not send thinking')
    assert.ok(!('effort' in cap.body), 'must not send effort (Haiku rejects it)')
    assert.strictEqual(cap.opts.headers['anthropic-version'], '2023-06-01')
  })

  it('clamps max_tokens to the ceiling', async () => {
    const cap = {}
    await apiClient.sendMessage({ prompt: 'x', apiKey: 'sk-test', maxTokens: 999999, fetchImpl: fakeFetch(okResponse('y'), cap) })
    assert.strictEqual(cap.body.max_tokens, apiClient.MAX_TOKENS_CEILING)
  })

  it('joins text content blocks into the response', async () => {
    const resp = {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }], usage: {} })
    }
    const result = await apiClient.sendMessage({ prompt: 'x', apiKey: 'sk-test', fetchImpl: fakeFetch(resp) })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.response, 'Hello world')
  })

  it('surfaces API error messages with status', async () => {
    const resp = {
      ok: false,
      status: 401,
      json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    }
    const result = await apiClient.sendMessage({ prompt: 'x', apiKey: 'sk-bad', fetchImpl: fakeFetch(resp) })
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.status, 401)
    assert.match(result.error, /invalid x-api-key/)
  })

  it('passes a system prompt when provided', async () => {
    const cap = {}
    await apiClient.sendMessage({ prompt: 'x', system: 'be terse', apiKey: 'sk-test', fetchImpl: fakeFetch(okResponse('ok'), cap) })
    assert.strictEqual(cap.body.system, 'be terse')
  })

  it('returns an error if fetch throws', async () => {
    const throwingFetch = async () => { throw new Error('network down') }
    const result = await apiClient.sendMessage({ prompt: 'x', apiKey: 'sk-test', fetchImpl: throwingFetch })
    assert.strictEqual(result.success, false)
    assert.match(result.error, /network down/)
  })
})
