/**
 * Tests for Assertion Evaluator
 *
 * Tests the main assertion evaluator orchestrator and type-specific evaluators.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs').promises

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

describe('AssertionEvaluator', () => {
  let AssertionEvaluator, AssertionType, AssertionStatus

  beforeEach(async () => {
    // Dynamic import since evaluator uses CommonJS
    const mod = require('../../src/main/evaluators/assertion-evaluator')
    AssertionEvaluator = mod.AssertionEvaluator
    AssertionType = mod.AssertionType
    AssertionStatus = mod.AssertionStatus

    // Ensure fixtures directory exists
    await fs.mkdir(FIXTURES_DIR, { recursive: true })
  })

  afterEach(async () => {
    // Clean up fixtures directory
    try {
      const files = await fs.readdir(FIXTURES_DIR)
      for (const file of files) {
        await fs.unlink(path.join(FIXTURES_DIR, file))
      }
    } catch (e) {
      // Ignore errors
    }
  })

  describe('FILE_EXISTS', () => {
    it('should pass when file exists', async () => {
      // Create a test file
      const testFilePath = path.join(FIXTURES_DIR, 'test-file.txt')
      await fs.writeFile(testFilePath, 'test content')

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-1',
        type: AssertionType.FILE_EXISTS,
        target: 'test-file.txt',
        message: 'File should exist'
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
      assert.ok(result.message.includes('exists'))
    })

    it('should fail when file does not exist', async () => {
      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-2',
        type: AssertionType.FILE_EXISTS,
        target: 'nonexistent-file.txt',
        message: 'File should exist'
      })

      assert.strictEqual(result.status, AssertionStatus.FAILED)
      assert.ok(result.message.includes('does not exist'))
    })

    it('should check for directory when type is directory', async () => {
      const testDirPath = path.join(FIXTURES_DIR, 'test-dir')
      await fs.mkdir(testDirPath, { recursive: true })

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-3',
        type: AssertionType.FILE_EXISTS,
        target: 'test-dir',
        message: 'Directory should exist',
        assertion: { type: 'directory' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('FILE_CONTAINS', () => {
    it('should pass when file contains literal content', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'contains-test.txt')
      await fs.writeFile(testFilePath, 'Hello World\nThis is a test file.')

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-4',
        type: AssertionType.FILE_CONTAINS,
        target: 'contains-test.txt',
        message: 'File should contain Hello',
        assertion: { match: 'literal', content: 'Hello World' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should fail when file does not contain literal content', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'contains-test2.txt')
      await fs.writeFile(testFilePath, 'Goodbye World')

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-5',
        type: AssertionType.FILE_CONTAINS,
        target: 'contains-test2.txt',
        message: 'File should contain Hello',
        assertion: { match: 'literal', content: 'Hello' }
      })

      assert.strictEqual(result.status, AssertionStatus.FAILED)
    })

    it('should pass when file matches regex', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'regex-test.txt')
      await fs.writeFile(testFilePath, 'function myFunction(arg1, arg2) { }')

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-6',
        type: AssertionType.FILE_CONTAINS,
        target: 'regex-test.txt',
        message: 'File should contain function declaration',
        assertion: { match: 'regex', content: 'function\\s+\\w+\\(' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('JSON_PROPERTY', () => {
    it('should pass when JSON property exists', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'test.json')
      await fs.writeFile(testFilePath, JSON.stringify({ name: 'test', version: '1.0.0' }))

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-7',
        type: AssertionType.JSON_PROPERTY,
        target: 'test.json',
        message: 'Name property should exist',
        assertion: { path: 'name', operator: 'exists' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should pass when JSON property equals expected value', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'test2.json')
      await fs.writeFile(testFilePath, JSON.stringify({ name: 'myapp', version: '2.0.0' }))

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-8',
        type: AssertionType.JSON_PROPERTY,
        target: 'test2.json',
        message: 'Version should be 2.0.0',
        assertion: { path: 'version', operator: 'equals', value: '2.0.0' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should handle nested paths', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'nested.json')
      await fs.writeFile(testFilePath, JSON.stringify({
        config: { database: { host: 'localhost', port: 5432 } }
      }))

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-9',
        type: AssertionType.JSON_PROPERTY,
        target: 'nested.json',
        message: 'Database host should be localhost',
        assertion: { path: 'config.database.host', operator: 'equals', value: 'localhost' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('EXPORT_EXISTS', () => {
    it('should find CommonJS exports', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'module.js')
      await fs.writeFile(testFilePath, `
        class MyClass {}
        function myFunction() {}
        module.exports = { MyClass, myFunction }
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-10',
        type: AssertionType.EXPORT_EXISTS,
        target: 'module.js',
        message: 'Should export MyClass',
        assertion: { exports: [{ name: 'MyClass', type: 'class' }] }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should find ES module exports', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'esm.js')
      await fs.writeFile(testFilePath, `
        export class MyClass {}
        export function myFunction() {}
        export const MY_CONSTANT = 42
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-11',
        type: AssertionType.EXPORT_EXISTS,
        target: 'esm.js',
        message: 'Should export MyClass and myFunction',
        assertion: { exports: [
          { name: 'MyClass', type: 'class' },
          { name: 'myFunction', type: 'function' }
        ]}
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('CLASS_STRUCTURE', () => {
    it('should verify class methods exist', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'class.js')
      await fs.writeFile(testFilePath, `
        class UserService {
          constructor() {}
          getUser(id) {}
          createUser(data) {}
          updateUser(id, data) {}
        }
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-12',
        type: AssertionType.CLASS_STRUCTURE,
        target: 'class.js',
        message: 'UserService should have required methods',
        assertion: {
          class_name: 'UserService',
          methods: ['getUser', 'createUser', 'updateUser']
        }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should verify class extends', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'extends.js')
      await fs.writeFile(testFilePath, `
        class BaseRepository {}
        class UserRepository extends BaseRepository {
          findById(id) {}
        }
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-13',
        type: AssertionType.CLASS_STRUCTURE,
        target: 'extends.js',
        message: 'UserRepository should extend BaseRepository',
        assertion: {
          class_name: 'UserRepository',
          extends: 'BaseRepository'
        }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('FUNCTION_SIGNATURE', () => {
    it('should verify function parameters', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'functions.js')
      await fs.writeFile(testFilePath, `
        function processData(input, options, callback) {
          // implementation
        }
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-14',
        type: AssertionType.FUNCTION_SIGNATURE,
        target: 'functions.js',
        message: 'processData should have correct parameters',
        assertion: {
          function_name: 'processData',
          parameters: ['input', 'options', 'callback']
        }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should verify async functions', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'async.js')
      await fs.writeFile(testFilePath, `
        async function fetchData(url) {
          return await fetch(url)
        }
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-15',
        type: AssertionType.FUNCTION_SIGNATURE,
        target: 'async.js',
        message: 'fetchData should be async',
        assertion: {
          function_name: 'fetchData',
          async: true
        }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('IMPORT_EXISTS', () => {
    it('should find CommonJS requires', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'requires.js')
      await fs.writeFile(testFilePath, `
        const path = require('path')
        const { readFile } = require('fs/promises')
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-16',
        type: AssertionType.IMPORT_EXISTS,
        target: 'requires.js',
        message: 'Should import path and fs/promises',
        assertion: { imports: [
          { module: 'path' },
          { module: 'fs/promises', names: ['readFile'] }
        ]}
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should find ES imports', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'imports.js')
      await fs.writeFile(testFilePath, `
        import React from 'react'
        import { useState, useEffect } from 'react'
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-17',
        type: AssertionType.IMPORT_EXISTS,
        target: 'imports.js',
        message: 'Should import React hooks',
        assertion: { imports: [
          { module: 'react', names: ['useState', 'useEffect'] }
        ]}
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('IPC_HANDLER_REGISTERED', () => {
    it('should find ipcMain.handle registrations', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'ipc.js')
      await fs.writeFile(testFilePath, `
        const { ipcMain } = require('electron')

        ipcMain.handle('state:getData', async () => {})
        ipcMain.handle('state:saveData', async (event, data) => {})
        ipcMain.on('action:submit', (event, data) => {})
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-18',
        type: AssertionType.IPC_HANDLER_REGISTERED,
        target: 'ipc.js',
        message: 'Should register required IPC handlers',
        assertion: { handlers: ['state:getData', 'state:saveData', 'action:submit'] }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('CSS_SELECTOR_EXISTS', () => {
    it('should find CSS selectors', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'styles.css')
      await fs.writeFile(testFilePath, `
        .btn-primary {
          background: blue;
        }
        .btn-primary:hover {
          background: darkblue;
        }
        #main-container {
          width: 100%;
        }
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-19',
        type: AssertionType.CSS_SELECTOR_EXISTS,
        target: 'styles.css',
        message: 'Should define button styles',
        assertion: { selectors: ['.btn-primary', '#main-container'] }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('PATTERN_MATCH', () => {
    it('should pass when pattern is present', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'pattern.js')
      await fs.writeFile(testFilePath, `
        // TODO: Fix this later
        const x = 1
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-20',
        type: AssertionType.PATTERN_MATCH,
        target: 'pattern.js',
        message: 'Should contain TODO comment',
        assertion: { pattern: 'TODO:', operator: 'present' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })

    it('should pass when pattern is absent', async () => {
      const testFilePath = path.join(FIXTURES_DIR, 'clean.js')
      await fs.writeFile(testFilePath, `
        const x = 1
        const y = 2
      `)

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-21',
        type: AssertionType.PATTERN_MATCH,
        target: 'clean.js',
        message: 'Should not contain console.log',
        assertion: { pattern: 'console\\.log', operator: 'absent' }
      })

      assert.strictEqual(result.status, AssertionStatus.PASSED)
    })
  })

  describe('evaluateAll', () => {
    it('should evaluate multiple assertions with summary', async () => {
      // Create test files
      await fs.writeFile(path.join(FIXTURES_DIR, 'app.js'), 'const app = {}')
      await fs.writeFile(path.join(FIXTURES_DIR, 'config.json'), '{"name":"test"}')

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const results = await evaluator.evaluateAll([
        {
          id: 'a1',
          type: AssertionType.FILE_EXISTS,
          target: 'app.js',
          message: 'App should exist'
        },
        {
          id: 'a2',
          type: AssertionType.FILE_EXISTS,
          target: 'config.json',
          message: 'Config should exist'
        },
        {
          id: 'a3',
          type: AssertionType.FILE_EXISTS,
          target: 'missing.js',
          message: 'Should fail'
        }
      ])

      assert.strictEqual(results.summary.total, 3)
      assert.strictEqual(results.summary.passed, 2)
      assert.strictEqual(results.summary.failed, 1)
      assert.strictEqual(results.summary.error, 0)
    })

    it('should call progress callback', async () => {
      await fs.writeFile(path.join(FIXTURES_DIR, 'test.js'), '')

      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const progressCalls = []

      await evaluator.evaluateAll([
        { id: 'a1', type: AssertionType.FILE_EXISTS, target: 'test.js', message: 'Test' }
      ], (index, total, result) => {
        progressCalls.push({ index, total, result })
      })

      assert.strictEqual(progressCalls.length, 1)
      assert.strictEqual(progressCalls[0].index, 1)
      assert.strictEqual(progressCalls[0].total, 1)
    })

    it('should return empty summary for no assertions', async () => {
      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const results = await evaluator.evaluateAll([])

      assert.strictEqual(results.summary.total, 0)
      assert.strictEqual(results.summary.passed, 0)
      assert.strictEqual(results.summary.failed, 0)
      assert.strictEqual(results.results.length, 0)
    })
  })

  describe('error handling', () => {
    it('should return error status for unknown assertion type', async () => {
      const evaluator = new AssertionEvaluator(FIXTURES_DIR)
      const result = await evaluator.evaluateAssertion({
        id: 'test-err',
        type: 'UNKNOWN_TYPE',
        target: 'test.js',
        message: 'Test'
      })

      assert.strictEqual(result.status, AssertionStatus.ERROR)
      assert.ok(result.message.includes('Unknown assertion type'))
    })

    it('should handle file read errors gracefully', async () => {
      const evaluator = new AssertionEvaluator('/nonexistent/path')
      const result = await evaluator.evaluateAssertion({
        id: 'test-err2',
        type: AssertionType.FILE_CONTAINS,
        target: 'test.js',
        message: 'Test',
        assertion: { match: 'literal', content: 'test' }
      })

      assert.strictEqual(result.status, AssertionStatus.FAILED)
    })
  })
})
