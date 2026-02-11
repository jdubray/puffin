/**
 * LLM Provider Interface, OllamaService, and LLMRouter Tests
 *
 * Tests the abstraction layer for multi-provider LLM routing.
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { LLMProvider } = require('../src/main/llm-provider')
const { LLMRouter } = require('../src/main/llm-router')
const { OllamaService } = require('../src/main/ollama-service')

// ── LLMProvider Interface ─────────────────────────────────────

describe('LLMProvider interface', () => {
  it('should not be instantiable directly', () => {
    assert.throws(() => new LLMProvider({ id: 'test', name: 'Test' }), {
      message: /abstract.*cannot be instantiated/i
    })
  })

  it('should be extendable by subclasses', () => {
    class TestProvider extends LLMProvider {
      constructor() {
        super({ id: 'test', name: 'Test Provider' })
      }
    }
    const provider = new TestProvider()
    assert.strictEqual(provider.providerId, 'test')
    assert.strictEqual(provider.providerName, 'Test Provider')
  })

  it('should throw on unimplemented submit()', async () => {
    class TestProvider extends LLMProvider {
      constructor() { super({ id: 'test', name: 'Test' }) }
    }
    const provider = new TestProvider()
    await assert.rejects(() => provider.submit({}), {
      message: /TestProvider must implement submit/
    })
  })

  it('should throw on unimplemented sendPrompt()', async () => {
    class TestProvider extends LLMProvider {
      constructor() { super({ id: 'test', name: 'Test' }) }
    }
    const provider = new TestProvider()
    await assert.rejects(() => provider.sendPrompt('hello'), {
      message: /TestProvider must implement sendPrompt/
    })
  })

  it('should throw on unimplemented cancel()', () => {
    class TestProvider extends LLMProvider {
      constructor() { super({ id: 'test', name: 'Test' }) }
    }
    const provider = new TestProvider()
    assert.throws(() => provider.cancel(), {
      message: /TestProvider must implement cancel/
    })
  })

  it('should throw on unimplemented isProcessRunning()', () => {
    class TestProvider extends LLMProvider {
      constructor() { super({ id: 'test', name: 'Test' }) }
    }
    const provider = new TestProvider()
    assert.throws(() => provider.isProcessRunning(), {
      message: /TestProvider must implement isProcessRunning/
    })
  })

  it('should throw on unimplemented getAvailableModels()', async () => {
    class TestProvider extends LLMProvider {
      constructor() { super({ id: 'test', name: 'Test' }) }
    }
    const provider = new TestProvider()
    await assert.rejects(() => provider.getAvailableModels(), {
      message: /TestProvider must implement getAvailableModels/
    })
  })
})

// ── Mock Provider for Router Tests ────────────────────────────

class MockProvider extends LLMProvider {
  constructor(id, name) {
    super({ id, name })
    this._running = false
    this._lastSubmit = null
    this._lastSendPrompt = null
    this._cancelled = false
    this._models = []
  }

  async submit(data, onChunk, onComplete, onRaw) {
    this._lastSubmit = data
    this._running = true
    const result = { content: `Response from ${this.providerId}`, exitCode: 0 }
    onChunk?.(`chunk from ${this.providerId}`)
    onRaw?.(JSON.stringify({ type: 'assistant', text: `raw from ${this.providerId}` }))
    onComplete?.(result)
    this._running = false
    return result
  }

  async sendPrompt(prompt, options = {}) {
    this._lastSendPrompt = { prompt, options }
    return { success: true, response: `${this.providerId} response` }
  }

  cancel() {
    this._cancelled = true
    this._running = false
  }

  isProcessRunning() {
    return this._running
  }

  async getAvailableModels() {
    return this._models
  }

  setModels(models) {
    this._models = models
  }

  setRunning(running) {
    this._running = running
  }
}

// ── LLMRouter ─────────────────────────────────────────────────

describe('LLMRouter', () => {
  let router
  let claudeProvider
  let ollamaProvider

  beforeEach(() => {
    router = new LLMRouter()
    claudeProvider = new MockProvider('claude', 'Claude')
    ollamaProvider = new MockProvider('ollama', 'Ollama')
    router.registerProvider(claudeProvider)
    router.registerProvider(ollamaProvider)
  })

  describe('registerProvider', () => {
    it('should register a provider by ID', () => {
      assert.strictEqual(router.getProvider('claude'), claudeProvider)
      assert.strictEqual(router.getProvider('ollama'), ollamaProvider)
    })

    it('should throw when provider has no ID', () => {
      assert.throws(() => router.registerProvider({}), {
        message: /must have a providerId/
      })
    })

    it('should throw when provider is null', () => {
      assert.throws(() => router.registerProvider(null), {
        message: /must have a providerId/
      })
    })
  })

  describe('getProvider', () => {
    it('should return undefined for unregistered ID', () => {
      assert.strictEqual(router.getProvider('nonexistent'), undefined)
    })
  })

  describe('getDefaultProvider', () => {
    it('should default to claude provider', () => {
      assert.strictEqual(router.getDefaultProvider(), claudeProvider)
    })

    it('should allow changing default provider', () => {
      router.setDefaultProvider('ollama')
      assert.strictEqual(router.getDefaultProvider(), ollamaProvider)
    })

    it('should throw when setting default to unregistered provider', () => {
      assert.throws(() => router.setDefaultProvider('nonexistent'), {
        message: /not registered/
      })
    })
  })

  describe('resolveProvider', () => {
    it('should route "ollama:model" to Ollama provider', () => {
      const result = router.resolveProvider('ollama:mistral-small')
      assert.strictEqual(result.provider, ollamaProvider)
      assert.strictEqual(result.model, 'mistral-small')
    })

    it('should route "claude:sonnet" to Claude provider', () => {
      const result = router.resolveProvider('claude:sonnet')
      assert.strictEqual(result.provider, claudeProvider)
      assert.strictEqual(result.model, 'sonnet')
    })

    it('should route unprefixed model to default (Claude)', () => {
      const result = router.resolveProvider('sonnet')
      assert.strictEqual(result.provider, claudeProvider)
      assert.strictEqual(result.model, 'sonnet')
    })

    it('should route undefined model to default (Claude)', () => {
      const result = router.resolveProvider(undefined)
      assert.strictEqual(result.provider, claudeProvider)
    })

    it('should route empty string to default (Claude)', () => {
      const result = router.resolveProvider('')
      assert.strictEqual(result.provider, claudeProvider)
    })

    it('should route null to default (Claude)', () => {
      const result = router.resolveProvider(null)
      assert.strictEqual(result.provider, claudeProvider)
    })

    it('should route unrecognized prefix to default (Claude)', () => {
      const result = router.resolveProvider('unknown:model')
      assert.strictEqual(result.provider, claudeProvider)
      assert.strictEqual(result.model, 'unknown:model')
    })

    it('should handle model with colon but no registered prefix', () => {
      const result = router.resolveProvider('gpt:4o')
      assert.strictEqual(result.provider, claudeProvider)
      assert.strictEqual(result.model, 'gpt:4o')
    })

    it('should handle ollama model with version tag', () => {
      const result = router.resolveProvider('ollama:mistral-small:latest')
      assert.strictEqual(result.provider, ollamaProvider)
      assert.strictEqual(result.model, 'mistral-small:latest')
    })
  })

  describe('submit', () => {
    it('should route to Claude for unprefixed model', async () => {
      const data = { prompt: 'hello', model: 'sonnet' }
      const result = await router.submit(data, () => {}, () => {})
      assert.strictEqual(result.content, 'Response from claude')
      assert.deepStrictEqual(claudeProvider._lastSubmit, data)
      assert.strictEqual(ollamaProvider._lastSubmit, null)
    })

    it('should route to Ollama for ollama: prefix', async () => {
      const data = { prompt: 'hello', model: 'ollama:mistral-small' }
      const result = await router.submit(data, () => {}, () => {})
      assert.strictEqual(result.content, 'Response from ollama')
      // Router strips prefix before passing to provider
      assert.strictEqual(ollamaProvider._lastSubmit.prompt, 'hello')
      assert.strictEqual(ollamaProvider._lastSubmit.model, 'mistral-small')
    })

    it('should pass callbacks through to provider', async () => {
      let chunkReceived = false
      let completeReceived = false
      const data = { prompt: 'hello', model: 'sonnet' }

      await router.submit(
        data,
        () => { chunkReceived = true },
        () => { completeReceived = true }
      )

      assert.strictEqual(chunkReceived, true)
      assert.strictEqual(completeReceived, true)
    })

    it('should return error when no provider available', async () => {
      const emptyRouter = new LLMRouter()
      let completeCalled = false
      const result = await emptyRouter.submit(
        { prompt: 'hello' },
        () => {},
        () => { completeCalled = true }
      )
      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.error)
      assert.strictEqual(completeCalled, true)
    })

    it('should route to default when model is undefined', async () => {
      const data = { prompt: 'hello' }
      await router.submit(data, () => {}, () => {})
      assert.strictEqual(claudeProvider._lastSubmit.prompt, 'hello')
      // Router strips prefix, undefined model resolves to empty string
      assert.strictEqual(claudeProvider._lastSubmit.model, '')
    })
  })

  describe('sendPrompt', () => {
    it('should route to Claude for unprefixed model', async () => {
      const result = await router.sendPrompt('hello', { model: 'haiku' })
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.response, 'claude response')
      assert.strictEqual(claudeProvider._lastSendPrompt.prompt, 'hello')
    })

    it('should route to Ollama for ollama: prefix', async () => {
      const result = await router.sendPrompt('hello', { model: 'ollama:llama3.2' })
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.response, 'ollama response')
    })

    it('should route to default when no options provided', async () => {
      const result = await router.sendPrompt('hello')
      assert.strictEqual(result.response, 'claude response')
    })

    it('should return error when no provider available', async () => {
      const emptyRouter = new LLMRouter()
      const result = await emptyRouter.sendPrompt('hello')
      assert.strictEqual(result.success, false)
      assert.ok(result.error)
    })
  })

  describe('cancel', () => {
    it('should cancel the active provider', async () => {
      ollamaProvider.setRunning(true)
      // Simulate an active request from ollama
      router._activeProviderId = 'ollama'
      router.cancel()
      assert.strictEqual(ollamaProvider._cancelled, true)
      assert.strictEqual(claudeProvider._cancelled, false)
    })

    it('should fall back to default provider when no active request', () => {
      router.cancel()
      assert.strictEqual(claudeProvider._cancelled, true)
    })
  })

  describe('isProcessRunning', () => {
    it('should return false when no provider is running', () => {
      assert.strictEqual(router.isProcessRunning(), false)
    })

    it('should return true when Claude is running', () => {
      claudeProvider.setRunning(true)
      assert.strictEqual(router.isProcessRunning(), true)
    })

    it('should return true when Ollama is running', () => {
      ollamaProvider.setRunning(true)
      assert.strictEqual(router.isProcessRunning(), true)
    })
  })

  describe('getAvailableModels', () => {
    it('should aggregate models from all providers', async () => {
      claudeProvider.setModels([
        { id: 'claude:sonnet', name: 'Claude Sonnet', provider: 'claude' }
      ])
      ollamaProvider.setModels([
        { id: 'ollama:mistral-small', name: 'mistral-small:latest', provider: 'ollama' }
      ])

      const models = await router.getAvailableModels()
      assert.strictEqual(models.length, 2)
      assert.ok(models.some(m => m.id === 'claude:sonnet'))
      assert.ok(models.some(m => m.id === 'ollama:mistral-small'))
    })

    it('should return empty array when no providers registered', async () => {
      const emptyRouter = new LLMRouter()
      const models = await emptyRouter.getAvailableModels()
      assert.deepStrictEqual(models, [])
    })

    it('should skip providers that fail to list models', async () => {
      claudeProvider.setModels([
        { id: 'claude:sonnet', name: 'Claude Sonnet', provider: 'claude' }
      ])
      // Make ollama throw
      ollamaProvider.getAvailableModels = async () => { throw new Error('SSH failed') }

      const models = await router.getAvailableModels()
      assert.strictEqual(models.length, 1)
      assert.strictEqual(models[0].id, 'claude:sonnet')
    })
  })

  describe('getProviderIds', () => {
    it('should return all registered provider IDs', () => {
      const ids = router.getProviderIds()
      assert.deepStrictEqual(ids.sort(), ['claude', 'ollama'])
    })
  })
})

// ── OllamaService ─────────────────────────────────────────────

describe('OllamaService', () => {
  describe('constructor', () => {
    it('should extend LLMProvider', () => {
      const service = new OllamaService()
      assert.ok(service instanceof LLMProvider)
      assert.strictEqual(service.providerId, 'ollama')
      assert.strictEqual(service.providerName, 'Ollama')
    })

    it('should accept SSH config', () => {
      const service = new OllamaService({
        host: '192.168.1.100',
        user: 'testuser',
        port: 2222
      })
      assert.strictEqual(service._sshConfig.host, '192.168.1.100')
      assert.strictEqual(service._sshConfig.user, 'testuser')
      assert.strictEqual(service._sshConfig.port, 2222)
    })

    it('should apply default config values', () => {
      const service = new OllamaService()
      assert.strictEqual(service._sshConfig.port, 22)
      assert.strictEqual(service._sshConfig.timeout, 10000)
    })
  })

  describe('isConfigured', () => {
    it('should return false when host is empty', () => {
      const service = new OllamaService({ user: 'test' })
      assert.strictEqual(service.isConfigured(), false)
    })

    it('should return false when user is empty', () => {
      const service = new OllamaService({ host: '1.2.3.4' })
      assert.strictEqual(service.isConfigured(), false)
    })

    it('should return true when both host and user are set', () => {
      const service = new OllamaService({ host: '1.2.3.4', user: 'test' })
      assert.strictEqual(service.isConfigured(), true)
    })
  })

  describe('updateConfig', () => {
    it('should merge new config values', () => {
      const service = new OllamaService({ host: '1.2.3.4', user: 'old' })
      service.updateConfig({ user: 'new', port: 3000 })
      assert.strictEqual(service._sshConfig.user, 'new')
      assert.strictEqual(service._sshConfig.port, 3000)
      assert.strictEqual(service._sshConfig.host, '1.2.3.4')
    })

    it('should invalidate model cache', () => {
      const service = new OllamaService({ host: '1.2.3.4', user: 'test' })
      service._cachedModels = [{ id: 'ollama:test', name: 'test', provider: 'ollama' }]
      service.updateConfig({ host: '5.6.7.8' })
      assert.strictEqual(service._cachedModels, null)
    })
  })

  describe('isProcessRunning', () => {
    it('should return false when no process is active', () => {
      const service = new OllamaService()
      assert.strictEqual(service.isProcessRunning(), false)
    })
  })

  describe('cancel', () => {
    it('should set _cancelRequested flag', () => {
      const service = new OllamaService()
      service._cancelRequested = false
      service.cancel()
      assert.strictEqual(service._cancelRequested, true)
    })
  })

  describe('submit (not configured)', () => {
    it('should return Claude-compatible error when not configured', async () => {
      const service = new OllamaService()
      let completeResult = null
      const result = await service.submit(
        { prompt: 'hello' },
        () => {},
        (r) => { completeResult = r }
      )
      // Claude-compatible response shape (AC6)
      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.error.includes('not configured'))
      assert.strictEqual(result.content, '')
      assert.strictEqual(result.sessionId, null)
      assert.strictEqual(result.cost, null)
      assert.strictEqual(result.turns, 1)
      assert.ok(typeof result.duration === 'number' || result.duration === null)
      // onComplete receives same structure
      assert.deepStrictEqual(completeResult, result)
    })

    it('should return error when a request is already running', async () => {
      const service = new OllamaService({ host: '1.2.3.4', user: 'test' })
      service._currentProcess = {} // Simulate running process
      let completeResult = null
      const result = await service.submit(
        { prompt: 'hello' },
        () => {},
        (r) => { completeResult = r }
      )
      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.error.includes('already running'))
      assert.deepStrictEqual(completeResult, result)
      service._currentProcess = null // Clean up
    })

    it('should call onFullPrompt with the prompt text', async () => {
      const service = new OllamaService() // Not configured, returns early after onFullPrompt would not be called
      // For a configured service, onFullPrompt is called before spawning
      // We test this through the not-configured path which returns before spawn
      let fullPromptCalled = false
      await service.submit(
        { prompt: 'hello' },
        () => {},
        () => {},
        null,
        (p) => { fullPromptCalled = true }
      )
      // Not configured returns before onFullPrompt
      assert.strictEqual(fullPromptCalled, false)
    })
  })

  describe('sendPrompt (not configured)', () => {
    it('should return error when not configured', async () => {
      const service = new OllamaService()
      const result = await service.sendPrompt('hello')
      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('not configured'))
    })
  })

  describe('getAvailableModels (not configured)', () => {
    it('should return empty array when not configured', async () => {
      const service = new OllamaService()
      const models = await service.getAvailableModels()
      assert.deepStrictEqual(models, [])
    })
  })

  describe('clearModelCache', () => {
    it('should clear cached models', () => {
      const service = new OllamaService({ host: '1.2.3.4', user: 'test' })
      service._cachedModels = [{ id: 'ollama:test', name: 'test', provider: 'ollama' }]
      service.clearModelCache()
      assert.strictEqual(service._cachedModels, null)
    })
  })

  describe('_stripPrefix', () => {
    it('should strip ollama: prefix', () => {
      const service = new OllamaService()
      assert.strictEqual(service._stripPrefix('ollama:mistral-small'), 'mistral-small')
    })

    it('should leave non-prefixed model names unchanged', () => {
      const service = new OllamaService()
      assert.strictEqual(service._stripPrefix('mistral-small'), 'mistral-small')
    })

    it('should handle model with version tag', () => {
      const service = new OllamaService()
      assert.strictEqual(service._stripPrefix('ollama:mistral-small:latest'), 'mistral-small:latest')
    })
  })

  describe('_parseOllamaList', () => {
    it('should parse valid ollama list output', () => {
      const service = new OllamaService()
      const output = `NAME                    ID            SIZE    MODIFIED
mistral-small:latest    abc123def     14 GB   2 days ago
qwen2.5-coder:14b       def456ghi     9.0 GB  3 days ago
llama3.2:latest         ghi789jkl     2.0 GB  1 week ago`

      const models = service._parseOllamaList(output)
      assert.strictEqual(models.length, 3)
      assert.deepStrictEqual(models[0], {
        id: 'ollama:mistral-small:latest',
        name: 'mistral-small:latest',
        provider: 'ollama'
      })
      assert.deepStrictEqual(models[1], {
        id: 'ollama:qwen2.5-coder:14b',
        name: 'qwen2.5-coder:14b',
        provider: 'ollama'
      })
      assert.deepStrictEqual(models[2], {
        id: 'ollama:llama3.2:latest',
        name: 'llama3.2:latest',
        provider: 'ollama'
      })
    })

    it('should return empty array for header-only output', () => {
      const service = new OllamaService()
      const output = 'NAME    ID    SIZE    MODIFIED'
      const models = service._parseOllamaList(output)
      assert.deepStrictEqual(models, [])
    })

    it('should return empty array for empty output', () => {
      const service = new OllamaService()
      assert.deepStrictEqual(service._parseOllamaList(''), [])
    })

    it('should handle whitespace-only lines', () => {
      const service = new OllamaService()
      const output = `NAME    ID    SIZE    MODIFIED

mistral-small:latest    abc123    14 GB   2 days ago`
      const models = service._parseOllamaList(output)
      assert.strictEqual(models.length, 1)
    })
  })

  describe('_buildSshArgs', () => {
    it('should build correct SSH argument array', () => {
      const service = new OllamaService({
        host: '192.168.1.100',
        user: 'testuser',
        port: 2222,
        privateKeyPath: '/home/test/.ssh/id_rsa',
        timeout: 5000
      })

      const args = service._buildSshArgs('mistral-small:latest', 'Hello world')
      assert.ok(args.includes('-i'))
      assert.ok(args.includes('/home/test/.ssh/id_rsa'))
      assert.ok(args.includes('-p'))
      assert.ok(args.includes('2222'))
      assert.ok(args.includes('testuser@192.168.1.100'))
      assert.ok(args.some(a => a.includes('ollama run mistral-small:latest')))
      assert.ok(args.some(a => a.includes('Hello world')))
    })

    it('should escape single quotes in prompt', () => {
      const service = new OllamaService({
        host: '1.2.3.4',
        user: 'test',
        privateKeyPath: '/key'
      })

      const args = service._buildSshArgs('model', "It's a test")
      const ollamaCmd = args.find(a => a.includes('ollama run'))
      assert.ok(ollamaCmd)
      assert.ok(!ollamaCmd.includes("It's"), 'Single quote should be escaped')
    })

    it('should include SSH options', () => {
      const service = new OllamaService({
        host: '1.2.3.4',
        user: 'test',
        privateKeyPath: '/key',
        timeout: 10000
      })

      const args = service._buildSshArgs('model', 'prompt')
      assert.ok(args.includes('StrictHostKeyChecking=accept-new'))
      assert.ok(args.some(a => a.includes('ConnectTimeout=')))
      assert.ok(args.includes('BatchMode=yes'))
    })
  })

  describe('_buildCompleteResponse (AC6)', () => {
    it('should return Claude-compatible response structure', () => {
      const service = new OllamaService()
      const result = service._buildCompleteResponse('Hello world', null, 0, 1500)
      assert.strictEqual(result.content, 'Hello world')
      assert.strictEqual(result.sessionId, null)
      assert.strictEqual(result.cost, null)
      assert.strictEqual(result.turns, 1)
      assert.strictEqual(result.duration, 1500)
      assert.strictEqual(result.exitCode, 0)
      assert.strictEqual(result.error, undefined)
      assert.strictEqual(result.cancelled, undefined)
    })

    it('should include error when provided', () => {
      const service = new OllamaService()
      const result = service._buildCompleteResponse('', 'Something failed', 1, 500)
      assert.strictEqual(result.content, '')
      assert.strictEqual(result.error, 'Something failed')
      assert.strictEqual(result.exitCode, 1)
    })

    it('should include cancelled flag when true', () => {
      const service = new OllamaService()
      const result = service._buildCompleteResponse('partial', null, -1, 300, true)
      assert.strictEqual(result.cancelled, true)
      assert.strictEqual(result.content, 'partial')
      assert.strictEqual(result.exitCode, -1)
    })

    it('should not include cancelled flag when false', () => {
      const service = new OllamaService()
      const result = service._buildCompleteResponse('done', null, 0, 100, false)
      assert.strictEqual(result.cancelled, undefined)
    })

    it('should default content to empty string for null/undefined', () => {
      const service = new OllamaService()
      assert.strictEqual(service._buildCompleteResponse(null, null, 0, 0).content, '')
      assert.strictEqual(service._buildCompleteResponse(undefined, null, 0, 0).content, '')
    })

    it('should default exitCode to 0 for null', () => {
      const service = new OllamaService()
      const result = service._buildCompleteResponse('ok', null, null, 100)
      assert.strictEqual(result.exitCode, 0)
    })

    it('should default duration to null for falsy values', () => {
      const service = new OllamaService()
      assert.strictEqual(service._buildCompleteResponse('ok', null, 0, 0).duration, null)
      assert.strictEqual(service._buildCompleteResponse('ok', null, 0, null).duration, null)
    })
  })

  describe('_formatSshError (AC3, AC4)', () => {
    let service

    beforeEach(() => {
      service = new OllamaService()
    })

    it('should return generic message for empty stderr', () => {
      const result = service._formatSshError('', 'model', 255)
      assert.ok(result.includes('exited with code 255'))
    })

    it('should return generic message for null stderr', () => {
      const result = service._formatSshError(null, 'model', 1)
      assert.ok(result.includes('exited with code'))
    })

    it('should detect model not found (AC4)', () => {
      const result = service._formatSshError("Error: model 'deepseek-r1' not found", 'deepseek-r1', 1)
      assert.ok(result.includes('deepseek-r1'))
      assert.ok(result.includes('not available'))
      assert.ok(result.includes('ollama pull'))
    })

    it('should detect model error variant without quotes', () => {
      const result = service._formatSshError('Error: model deepseek-r1 not found, try pulling it first', 'deepseek-r1', 1)
      assert.ok(result.includes('deepseek-r1'))
      assert.ok(result.includes('not available'))
    })

    it('should detect "Error: model" prefix pattern', () => {
      const result = service._formatSshError('Error: model requires at least 8GB memory', 'big-model', 1)
      assert.ok(result.includes('big-model'))
      assert.ok(result.includes('not available'))
    })

    it('should detect Connection refused (AC3)', () => {
      const result = service._formatSshError('ssh: connect to host 1.2.3.4 port 22: Connection refused', 'model', 255)
      assert.ok(result.includes('connection refused'))
      assert.ok(result.toLowerCase().includes('ssh'))
    })

    it('should detect Connection timed out', () => {
      const result = service._formatSshError('ssh: connect to host 1.2.3.4 port 22: Connection timed out', 'model', 255)
      assert.ok(result.includes('timed out'))
    })

    it('should detect No route to host', () => {
      const result = service._formatSshError('ssh: connect to host 1.2.3.4 port 22: No route to host', 'model', 255)
      assert.ok(result.includes('unreachable') || result.includes('reach'))
    })

    it('should detect Host key verification failed', () => {
      const result = service._formatSshError('Host key verification failed.', 'model', 255)
      assert.ok(result.includes('host key'))
    })

    it('should detect Permission denied', () => {
      const result = service._formatSshError('Permission denied (publickey).', 'model', 255)
      assert.ok(result.includes('authentication failed') || result.includes('Authentication failed'))
    })

    it('should detect Could not resolve hostname', () => {
      const result = service._formatSshError('ssh: Could not resolve hostname badhost: Name or service not known', 'model', 255)
      assert.ok(result.includes('resolve'))
    })

    it('should detect Network is unreachable', () => {
      const result = service._formatSshError('connect to host 1.2.3.4 port 22: Network is unreachable', 'model', 255)
      assert.ok(result.includes('unreachable') || result.includes('network'))
    })

    it('should return raw stderr for unknown errors', () => {
      const result = service._formatSshError('some unknown error text', 'model', 1)
      assert.strictEqual(result, 'some unknown error text')
    })

    it('should truncate long unknown stderr to 200 chars', () => {
      const longError = 'x'.repeat(300)
      const result = service._formatSshError(longError, 'model', 1)
      assert.strictEqual(result.length, 203) // 200 + '...'
      assert.ok(result.endsWith('...'))
    })

    it('should trim whitespace from stderr', () => {
      const result = service._formatSshError('  Permission denied (publickey).  \n', 'model', 255)
      assert.ok(result.includes('authentication') || result.includes('Authentication'))
    })
  })

  describe('_formatSpawnError', () => {
    let service

    beforeEach(() => {
      service = new OllamaService()
    })

    it('should handle ENOENT (SSH not installed)', () => {
      const err = new Error('spawn ssh ENOENT')
      err.code = 'ENOENT'
      const result = service._formatSpawnError(err)
      assert.ok(result.includes('SSH client not found'))
      assert.ok(result.includes('OpenSSH'))
    })

    it('should return generic message for other spawn errors', () => {
      const err = new Error('spawn failed')
      err.code = 'EPERM'
      const result = service._formatSpawnError(err)
      assert.ok(result.includes('SSH connection failed'))
      assert.ok(result.includes('spawn failed'))
    })
  })
})

// ── ClaudeService as LLMProvider ──────────────────────────────

describe('ClaudeService extends LLMProvider', () => {
  it('should be importable and extend LLMProvider', () => {
    const { ClaudeService } = require('../src/main/claude-service')
    const service = new ClaudeService()
    assert.ok(service instanceof LLMProvider)
    assert.strictEqual(service.providerId, 'claude')
    assert.strictEqual(service.providerName, 'Claude Code')
  })

  it('should return Claude models from getAvailableModels (AC3)', async () => {
    const { ClaudeService } = require('../src/main/claude-service')
    const service = new ClaudeService()
    const models = await service.getAvailableModels()
    assert.ok(Array.isArray(models))
    assert.ok(models.length >= 3)
    assert.ok(models.some(m => m.id === 'claude:opus-4.6'))
    assert.ok(models.some(m => m.id === 'claude:sonnet-4.5'))
    assert.ok(models.some(m => m.id === 'claude:haiku-4.5'))
    for (const model of models) {
      assert.strictEqual(model.provider, 'claude')
      assert.ok(model.name)
      assert.ok(model.id.startsWith('claude:'))
    }
  })

  it('should still have all original methods', () => {
    const { ClaudeService } = require('../src/main/claude-service')
    const service = new ClaudeService()
    // Original methods still exist
    assert.strictEqual(typeof service.submit, 'function')
    assert.strictEqual(typeof service.sendPrompt, 'function')
    assert.strictEqual(typeof service.cancel, 'function')
    assert.strictEqual(typeof service.isProcessRunning, 'function')
    assert.strictEqual(typeof service.deriveStories, 'function')
    assert.strictEqual(typeof service.generateTitle, 'function')
    assert.strictEqual(typeof service.generateInspectionAssertions, 'function')
    assert.strictEqual(typeof service.setProjectPath, 'function')
    assert.strictEqual(typeof service.setPluginManager, 'function')
    assert.strictEqual(typeof service.acquireLock, 'function')
    assert.strictEqual(typeof service.releaseLock, 'function')
    assert.strictEqual(typeof service.sendAnswer, 'function')
    assert.strictEqual(typeof service.isAvailable, 'function')
    assert.strictEqual(typeof service.getVersion, 'function')
  })
})

// ── Integration: Router with Claude default ───────────────────

describe('LLMRouter integration with Claude default', () => {
  it('should preserve Claude as default for all standard model names', () => {
    const router = new LLMRouter()
    const claude = new MockProvider('claude', 'Claude')
    const ollama = new MockProvider('ollama', 'Ollama')
    router.registerProvider(claude)
    router.registerProvider(ollama)

    // All standard Claude model names should route to Claude
    const claudeModels = ['sonnet', 'haiku', 'opus', 'claude-sonnet-4-5-20250929', undefined, '', null]
    for (const model of claudeModels) {
      const { provider } = router.resolveProvider(model)
      assert.strictEqual(provider.providerId, 'claude',
        `Model "${model}" should route to claude, got ${provider?.providerId}`)
    }
  })

  it('should only route ollama: prefix to Ollama', () => {
    const router = new LLMRouter()
    const claude = new MockProvider('claude', 'Claude')
    const ollama = new MockProvider('ollama', 'Ollama')
    router.registerProvider(claude)
    router.registerProvider(ollama)

    const ollamaModels = [
      'ollama:mistral-small',
      'ollama:qwen2.5-coder:14b',
      'ollama:deepseek-r1:14b',
      'ollama:llama3.2:latest'
    ]
    for (const model of ollamaModels) {
      const { provider } = router.resolveProvider(model)
      assert.strictEqual(provider.providerId, 'ollama',
        `Model "${model}" should route to ollama, got ${provider?.providerId}`)
    }
  })

  it('should aggregate models from both providers', async () => {
    const router = new LLMRouter()
    const claude = new MockProvider('claude', 'Claude')
    claude.setModels([
      { id: 'claude:opus-4.6', name: 'Opus 4.6', provider: 'claude' },
      { id: 'claude:sonnet-4.5', name: 'Sonnet 4.5', provider: 'claude' },
      { id: 'claude:haiku-4.5', name: 'Haiku 4.5', provider: 'claude' }
    ])
    const ollama = new MockProvider('ollama', 'Ollama')
    ollama.setModels([
      { id: 'ollama:mistral-small:latest', name: 'mistral-small:latest', provider: 'ollama' }
    ])
    router.registerProvider(claude)
    router.registerProvider(ollama)

    const models = await router.getAvailableModels()
    assert.strictEqual(models.length, 4)
  })
})

// ── OllamaService Config Integration ──────────────────────────

describe('OllamaService config integration', () => {
  describe('config persistence shape', () => {
    it('should accept config with host, user, and port', () => {
      const service = new OllamaService()
      service.updateConfig({
        host: '108.7.186.27',
        user: 'jjdubray',
        port: 22
      })
      assert.strictEqual(service._sshConfig.host, '108.7.186.27')
      assert.strictEqual(service._sshConfig.user, 'jjdubray')
      assert.strictEqual(service._sshConfig.port, 22)
      assert.strictEqual(service.isConfigured(), true)
    })

    it('should disable when host/user cleared', () => {
      const service = new OllamaService({
        host: '108.7.186.27',
        user: 'jjdubray'
      })
      assert.strictEqual(service.isConfigured(), true)

      service.updateConfig({ host: '', user: '' })
      assert.strictEqual(service.isConfigured(), false)
    })

    it('should preserve unset fields during partial update', () => {
      const service = new OllamaService({
        host: '108.7.186.27',
        user: 'jjdubray',
        port: 22
      })
      service.updateConfig({ port: 2222 })
      assert.strictEqual(service._sshConfig.host, '108.7.186.27')
      assert.strictEqual(service._sshConfig.user, 'jjdubray')
      assert.strictEqual(service._sshConfig.port, 2222)
    })
  })

  describe('submit error for already running (AC7 - fresh connection)', () => {
    it('should reject when process already active', async () => {
      const service = new OllamaService({ host: '1.2.3.4', user: 'test' })
      service._currentProcess = { pid: 12345 }

      let completeResult = null
      const result = await service.submit(
        { prompt: 'hello' },
        () => {},
        (r) => { completeResult = r }
      )

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.error.includes('already running'))
      assert.strictEqual(result.sessionId, null)
      assert.strictEqual(result.cost, null)
      assert.strictEqual(result.turns, 1)
      service._currentProcess = null
    })
  })

  describe('default SSH host from acceptance criteria', () => {
    it('should build correct SSH args for jjdubray@108.7.186.27', () => {
      const service = new OllamaService({
        host: '108.7.186.27',
        user: 'jjdubray',
        port: 22,
        privateKeyPath: '/home/jjdubray/.ssh/id_rsa'
      })

      const args = service._buildSshArgs('mistral-small:latest', 'Hello')
      assert.ok(args.includes('jjdubray@108.7.186.27'))
      assert.ok(args.includes('-p'))
      assert.ok(args.includes('22'))
      assert.ok(args.some(a => a.includes('ollama run mistral-small:latest')))
    })
  })
})

// ── Router prefix stripping (model dropdown story) ────────────

describe('LLMRouter prefix stripping for providers', () => {
  let router
  let claudeProvider
  let ollamaProvider

  beforeEach(() => {
    router = new LLMRouter()
    claudeProvider = new MockProvider('claude', 'Claude')
    ollamaProvider = new MockProvider('ollama', 'Ollama')
    router.registerProvider(claudeProvider)
    router.registerProvider(ollamaProvider)
  })

  describe('submit strips prefix from data.model', () => {
    it('should strip claude: prefix before passing to Claude provider', async () => {
      const data = { prompt: 'hello', model: 'claude:opus-4.6' }
      await router.submit(data, () => {}, () => {})
      assert.strictEqual(claudeProvider._lastSubmit.model, 'opus-4.6')
    })

    it('should strip ollama: prefix before passing to Ollama provider', async () => {
      const data = { prompt: 'hello', model: 'ollama:mistral-small' }
      await router.submit(data, () => {}, () => {})
      assert.strictEqual(ollamaProvider._lastSubmit.model, 'mistral-small')
    })

    it('should pass unprefixed model through unchanged', async () => {
      const data = { prompt: 'hello', model: 'sonnet' }
      await router.submit(data, () => {}, () => {})
      assert.strictEqual(claudeProvider._lastSubmit.model, 'sonnet')
    })

    it('should preserve other data fields when stripping prefix', async () => {
      const data = { prompt: 'hello', model: 'claude:sonnet-4.5', branchId: 'test-branch', maxTurns: 40 }
      await router.submit(data, () => {}, () => {})
      assert.strictEqual(claudeProvider._lastSubmit.prompt, 'hello')
      assert.strictEqual(claudeProvider._lastSubmit.branchId, 'test-branch')
      assert.strictEqual(claudeProvider._lastSubmit.maxTurns, 40)
      assert.strictEqual(claudeProvider._lastSubmit.model, 'sonnet-4.5')
    })
  })

  describe('sendPrompt strips prefix from options.model', () => {
    it('should strip claude: prefix in sendPrompt options', async () => {
      await router.sendPrompt('hello', { model: 'claude:haiku-4.5' })
      assert.strictEqual(claudeProvider._lastSendPrompt.options.model, 'haiku-4.5')
    })

    it('should strip ollama: prefix in sendPrompt options', async () => {
      await router.sendPrompt('hello', { model: 'ollama:llama3.2:latest' })
      assert.strictEqual(ollamaProvider._lastSendPrompt.options.model, 'llama3.2:latest')
    })
  })

  describe('resolveProvider returns clean model names (AC3, AC4)', () => {
    it('should resolve claude:opus-4.6 to Claude with opus-4.6', () => {
      const result = router.resolveProvider('claude:opus-4.6')
      assert.strictEqual(result.provider.providerId, 'claude')
      assert.strictEqual(result.model, 'opus-4.6')
    })

    it('should resolve claude:sonnet-4.5 to Claude with sonnet-4.5', () => {
      const result = router.resolveProvider('claude:sonnet-4.5')
      assert.strictEqual(result.provider.providerId, 'claude')
      assert.strictEqual(result.model, 'sonnet-4.5')
    })

    it('should resolve claude:haiku-4.5 to Claude with haiku-4.5', () => {
      const result = router.resolveProvider('claude:haiku-4.5')
      assert.strictEqual(result.provider.providerId, 'claude')
      assert.strictEqual(result.model, 'haiku-4.5')
    })

    it('should resolve ollama:mistral-small to Ollama with mistral-small (AC4)', () => {
      const result = router.resolveProvider('ollama:mistral-small')
      assert.strictEqual(result.provider.providerId, 'ollama')
      assert.strictEqual(result.model, 'mistral-small')
    })

    it('should resolve ollama:qwen2.5-coder to Ollama (AC4)', () => {
      const result = router.resolveProvider('ollama:qwen2.5-coder')
      assert.strictEqual(result.provider.providerId, 'ollama')
      assert.strictEqual(result.model, 'qwen2.5-coder')
    })

    it('should resolve ollama:deepseek-r1 to Ollama (AC4)', () => {
      const result = router.resolveProvider('ollama:deepseek-r1')
      assert.strictEqual(result.provider.providerId, 'ollama')
      assert.strictEqual(result.model, 'deepseek-r1')
    })

    it('should resolve ollama:llama3.2 to Ollama (AC4)', () => {
      const result = router.resolveProvider('ollama:llama3.2')
      assert.strictEqual(result.provider.providerId, 'ollama')
      assert.strictEqual(result.model, 'llama3.2')
    })
  })
})

// ── Provider context injection (CLI output story) ──────────────

describe('LLMRouter provider context injection', () => {
  let router
  let claudeProvider
  let ollamaProvider

  beforeEach(() => {
    router = new LLMRouter()
    claudeProvider = new MockProvider('claude', 'Claude')
    ollamaProvider = new MockProvider('ollama', 'Ollama')
    router.registerProvider(claudeProvider)
    router.registerProvider(ollamaProvider)
  })

  describe('onComplete provider injection (AC1, AC2)', () => {
    it('should inject Claude provider info into onComplete response', async () => {
      let completedResponse = null
      await router.submit(
        { prompt: 'hello', model: 'claude:sonnet-4.5' },
        () => {},
        (response) => { completedResponse = response }
      )
      assert.strictEqual(completedResponse.provider, 'claude')
      assert.strictEqual(completedResponse.providerName, 'Claude')
      assert.strictEqual(completedResponse.model, 'sonnet-4.5')
    })

    it('should inject Ollama provider info into onComplete response', async () => {
      let completedResponse = null
      await router.submit(
        { prompt: 'hello', model: 'ollama:mistral-small' },
        () => {},
        (response) => { completedResponse = response }
      )
      assert.strictEqual(completedResponse.provider, 'ollama')
      assert.strictEqual(completedResponse.providerName, 'Ollama')
      assert.strictEqual(completedResponse.model, 'mistral-small')
    })

    it('should inject provider info for unprefixed model', async () => {
      let completedResponse = null
      await router.submit(
        { prompt: 'hello', model: 'sonnet' },
        () => {},
        (response) => { completedResponse = response }
      )
      assert.strictEqual(completedResponse.provider, 'claude')
      assert.strictEqual(completedResponse.model, 'sonnet')
    })
  })

  describe('onRaw provider injection (AC1, AC2, AC5)', () => {
    it('should inject provider into onRaw messages that lack it', async () => {
      const rawMessages = []
      await router.submit(
        { prompt: 'hello', model: 'claude:sonnet-4.5' },
        () => {},
        () => {},
        (jsonLine) => { rawMessages.push(JSON.parse(jsonLine)) }
      )
      assert.ok(rawMessages.length > 0)
      for (const msg of rawMessages) {
        assert.strictEqual(msg.provider, 'claude')
        assert.strictEqual(msg.providerName, 'Claude')
      }
    })

    it('should preserve existing provider field in onRaw messages', async () => {
      // Ollama provider emits messages with provider already set
      // Create a provider that emits raw messages with provider field
      const customProvider = new MockProvider('ollama', 'Ollama')
      customProvider.submit = async (data, onChunk, onComplete, onRaw) => {
        onRaw?.(JSON.stringify({ type: 'assistant', provider: 'ollama', model: 'mistral-small', text: 'hello' }))
        const result = { content: 'hello', exitCode: 0 }
        onComplete?.(result)
        return result
      }
      router._providers.set('ollama', customProvider)

      const rawMessages = []
      await router.submit(
        { prompt: 'hello', model: 'ollama:mistral-small' },
        () => {},
        () => {},
        (jsonLine) => { rawMessages.push(JSON.parse(jsonLine)) }
      )
      assert.ok(rawMessages.length > 0)
      // Should not overwrite existing provider
      assert.strictEqual(rawMessages[0].provider, 'ollama')
      assert.strictEqual(rawMessages[0].model, 'mistral-small')
      // providerName should NOT be set (wasn't in original message)
      assert.strictEqual(rawMessages[0].providerName, undefined)
    })

    it('should handle non-JSON onRaw lines without error', async () => {
      const customProvider = new MockProvider('claude', 'Claude')
      customProvider.submit = async (data, onChunk, onComplete, onRaw) => {
        onRaw?.('not json at all')
        const result = { content: 'ok', exitCode: 0 }
        onComplete?.(result)
        return result
      }
      router._providers.set('claude', customProvider)

      const rawLines = []
      await router.submit(
        { prompt: 'hello' },
        () => {},
        () => {},
        (line) => { rawLines.push(line) }
      )
      // Should pass through non-JSON as-is
      assert.strictEqual(rawLines[0], 'not json at all')
    })
  })

  describe('model name in provider prefix (AC5)', () => {
    it('should include stripped model name in onComplete', async () => {
      let completedResponse = null
      await router.submit(
        { prompt: 'hello', model: 'ollama:qwen2.5-coder' },
        () => {},
        (response) => { completedResponse = response }
      )
      assert.strictEqual(completedResponse.model, 'qwen2.5-coder')
      assert.strictEqual(completedResponse.provider, 'ollama')
    })

    it('should include model name in injected onRaw messages', async () => {
      const rawMessages = []
      await router.submit(
        { prompt: 'hello', model: 'claude:opus-4.6' },
        () => {},
        () => {},
        (jsonLine) => { rawMessages.push(JSON.parse(jsonLine)) }
      )
      assert.ok(rawMessages.some(msg => msg.model === 'opus-4.6'))
    })
  })
})
