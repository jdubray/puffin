/**
 * Jest-to-Node test runner compatibility shim.
 *
 * Provides `describe`, `it`, `beforeEach`, `afterEach`, `expect`, and a
 * minimal `jest` object as globals so that tests written for Jest can run
 * under `node --test` without modification.
 *
 * Usage: add `require('../helpers/test-compat')` (adjust relative path) as
 * the first line of any test file that uses Jest-style APIs.
 */

const { describe, it, test, before, after, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

// Expose as globals so test files don't have to import them
global.describe = describe
global.it = it
global.test = test
global.before = before
global.after = after
global.beforeEach = beforeEach
global.afterEach = afterEach
// Jest aliases
global.beforeAll = before
global.afterAll = after

// ---------------------------------------------------------------------------
// Minimal expect() implementation
// ---------------------------------------------------------------------------

/**
 * Builds an async-aware assertion chain.  Supports `.resolves` and `.rejects`
 * for promise-returning expressions:
 *   await expect(asyncFn()).resolves.toBe(value)
 *   await expect(asyncFn()).rejects.toThrow(/message/)
 */
// Asymmetric matchers for expect.any(), expect.anything(), etc.
class AnyMatcher {
  constructor(cls) { this.cls = cls }
  matches(val) {
    if (this.cls === String) return typeof val === 'string' || val instanceof String
    if (this.cls === Number) return typeof val === 'number' || val instanceof Number
    if (this.cls === Boolean) return typeof val === 'boolean' || val instanceof Boolean
    if (this.cls === Function) return typeof val === 'function'
    if (this.cls === Object) return val !== null && typeof val === 'object'
    return val instanceof this.cls
  }
}
class AnythingMatcher {
  matches(val) { return val !== null && val !== undefined }
}
class ObjectContainingMatcher {
  constructor(obj) { this.obj = obj }
  matches(val) {
    if (typeof val !== 'object' || val === null) return false
    return Object.keys(this.obj).every(k => {
      const e = this.obj[k]
      if (e && typeof e.matches === 'function') return e.matches(val[k])
      try { assert.deepStrictEqual(val[k], e); return true } catch { return false }
    })
  }
}
class ArrayContainingMatcher {
  constructor(arr) { this.arr = arr }
  matches(val) {
    if (!Array.isArray(val)) return false
    return this.arr.every(exp => val.some(item => {
      if (exp && typeof exp.matches === 'function') return exp.matches(item)
      try { assert.deepStrictEqual(item, exp); return true } catch { return false }
    }))
  }
}
class StringContainingMatcher {
  constructor(str) { this.str = str }
  matches(val) { return typeof val === 'string' && val.includes(this.str) }
}
class StringMatchingMatcher {
  constructor(rx) { this.rx = typeof rx === 'string' ? new RegExp(rx) : rx }
  matches(val) { return typeof val === 'string' && this.rx.test(val) }
}

/**
 * Deep equality that handles asymmetric matchers (AnyMatcher etc.) at any nesting level.
 */
function asymmetricEquals(exp, got) {
  if (exp && typeof exp.matches === 'function') return exp.matches(got)
  if (exp === null || typeof exp !== 'object') return exp === got
  if (got === null || typeof got !== 'object') return false
  if (Array.isArray(exp)) {
    if (!Array.isArray(got) || got.length !== exp.length) return false
    return exp.every((e, i) => asymmetricEquals(e, got[i]))
  }
  // Plain object: check exp's keys exist and match in got
  return Object.keys(exp).every(k => asymmetricEquals(exp[k], got[k]))
}

function buildMatcher(actual, negate = false) {
  function check(pass, msg) {
    if (negate ? pass : !pass) {
      const err = new assert.AssertionError({ message: msg, actual, operator: 'expect' })
      throw err
    }
  }

  const matchers = {
    toBe(expected) {
      if (negate) assert.notStrictEqual(actual, expected)
      else assert.strictEqual(actual, expected)
    },
    toEqual(expected) {
      if (negate) assert.notDeepStrictEqual(actual, expected)
      else assert.deepStrictEqual(actual, expected)
    },
    toStrictEqual(expected) {
      if (negate) assert.notDeepStrictEqual(actual, expected)
      else assert.deepStrictEqual(actual, expected)
    },
    toBeTruthy() {
      check(Boolean(actual), `Expected ${actual} to be truthy`)
    },
    toBeFalsy() {
      check(!actual, `Expected ${actual} to be falsy`)
    },
    toBeNull() {
      if (negate) assert.notStrictEqual(actual, null)
      else assert.strictEqual(actual, null)
    },
    toBeUndefined() {
      if (negate) assert.notStrictEqual(actual, undefined)
      else assert.strictEqual(actual, undefined)
    },
    toBeDefined() {
      if (negate) assert.strictEqual(actual, undefined)
      else assert.notStrictEqual(actual, undefined)
    },
    toBeGreaterThan(n) {
      check(actual > n, `Expected ${actual} > ${n}`)
    },
    toBeGreaterThanOrEqual(n) {
      check(actual >= n, `Expected ${actual} >= ${n}`)
    },
    toBeLessThan(n) {
      check(actual < n, `Expected ${actual} < ${n}`)
    },
    toBeLessThanOrEqual(n) {
      check(actual <= n, `Expected ${actual} <= ${n}`)
    },
    toHaveLength(n) {
      check(actual.length === n, `Expected length ${actual.length} to equal ${n}`)
    },
    toContain(item) {
      const has = Array.isArray(actual) ? actual.includes(item) : String(actual).includes(item)
      check(has, `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`)
    },
    toContainEqual(item) {
      const has = Array.isArray(actual) && actual.some(el => {
        try { assert.deepStrictEqual(el, item); return true } catch { return false }
      })
      check(has, `Expected ${JSON.stringify(actual)} to contain equal ${JSON.stringify(item)}`)
    },
    toMatch(pattern) {
      const rx = typeof pattern === 'string' ? new RegExp(pattern) : pattern
      check(rx.test(String(actual)), `Expected "${actual}" to match ${rx}`)
    },
    toHaveProperty(keyPath, value) {
      const parts = String(keyPath).split('.')
      let obj = actual
      for (const part of parts) {
        if (obj == null || typeof obj !== 'object') {
          check(false, `Property path "${keyPath}" not reachable`)
          return
        }
        obj = obj[part]
      }
      if (value !== undefined) {
        check(
          JSON.stringify(obj) === JSON.stringify(value),
          `Expected property "${keyPath}" to equal ${JSON.stringify(value)}, got ${JSON.stringify(obj)}`
        )
      } else {
        check(obj !== undefined, `Expected property "${keyPath}" to exist`)
      }
    },
    toMatchObject(expected) {
      function deepContains(a, e) {
        if (e && typeof e.matches === 'function') return e.matches(a)
        if (e === null || typeof e !== 'object') return a === e
        if (Array.isArray(e)) {
          if (!Array.isArray(a) || a.length < e.length) return false
          return e.every((item, i) => deepContains(a[i], item))
        }
        if (typeof a !== 'object' || a === null) return false
        for (const key of Object.keys(e)) {
          if (!deepContains(a[key], e[key])) return false
        }
        return true
      }
      check(
        deepContains(actual, expected),
        `Expected ${JSON.stringify(actual)} to match object ${JSON.stringify(expected)}`
      )
    },
    toBeInstanceOf(cls) {
      check(actual instanceof cls, `Expected instance of ${cls.name || cls}`)
    },
    toHaveBeenCalled() {
      const callCount = actual?.mock?.calls?.length ?? 0
      check(callCount > 0, `Expected mock to have been called, but was called ${callCount} times`)
    },
    toHaveBeenCalledTimes(n) {
      const callCount = actual?.mock?.calls?.length ?? 0
      check(callCount === n, `Expected mock to have been called ${n} times, but was called ${callCount} times`)
    },
    toHaveBeenCalledWith(...expectedArgs) {
      const calls = actual?.mock?.calls ?? []
      const matched = calls.some(call => {
        const args = call.args ?? call
        if (args.length !== expectedArgs.length) return false
        return expectedArgs.every((exp, i) => asymmetricEquals(exp, args[i]))
      })
      check(matched, `Expected mock to have been called with ${JSON.stringify(expectedArgs)}, calls: ${JSON.stringify(calls.map(c => c.args ?? c))}`)
    },
    toHaveBeenLastCalledWith(...expectedArgs) {
      const calls = actual?.mock?.calls ?? []
      const lastCall = calls[calls.length - 1]
      const args = lastCall?.args ?? lastCall ?? []
      const matched = args.length === expectedArgs.length && expectedArgs.every((exp, i) => asymmetricEquals(exp, args[i]))
      check(matched, `Expected last call with ${JSON.stringify(expectedArgs)}, got ${JSON.stringify(args)}`)
    },
    toThrow(expected) {
      let threw = false
      let err = null
      try { if (typeof actual === 'function') actual(); else throw new Error('not a function') }
      catch (e) { threw = true; err = e }

      if (negate) {
        // .not.toThrow() — assert that function did NOT throw
        if (threw) {
          const ae = new assert.AssertionError({ message: `Expected function not to throw, but it threw: ${err?.message}`, actual: err?.message, operator: 'expect' })
          throw ae
        }
      } else {
        // .toThrow() — assert that function DID throw
        if (!threw) {
          const ae = new assert.AssertionError({ message: 'Expected function to throw', operator: 'expect' })
          throw ae
        }
        if (expected && err) {
          if (expected instanceof RegExp) {
            if (!expected.test(err.message)) {
              const ae = new assert.AssertionError({ message: `Expected error message to match ${expected}, got "${err.message}"`, operator: 'expect' })
              throw ae
            }
          } else if (typeof expected === 'string') {
            if (!err.message.includes(expected)) {
              const ae = new assert.AssertionError({ message: `Expected error message to include "${expected}", got "${err.message}"`, operator: 'expect' })
              throw ae
            }
          }
        }
      }
    },
  }

  // .not chain — use getter to avoid infinite recursion during construction
  Object.defineProperty(matchers, 'not', { get: () => buildMatcher(actual, !negate), configurable: true })

  // .resolves chain  (returns a Promise so tests must await)
  matchers.resolves = {
    async toBe(expected) { assert.strictEqual(await actual, expected) },
    async toEqual(expected) { assert.deepStrictEqual(await actual, expected) },
    async toBeTruthy() { assert.ok(await actual) },
    async toBeFalsy() { assert.ok(!(await actual)) },
    async toBeNull() { assert.strictEqual(await actual, null) },
    async toBeUndefined() { assert.strictEqual(await actual, undefined) },
  }

  // .rejects chain  (returns a Promise so tests must await)
  matchers.rejects = {
    async toThrow(expected) {
      let err = null
      try {
        // Support both expect(fn).rejects and expect(promise).rejects
        const val = typeof actual === 'function' ? actual() : actual
        await val
      } catch (e) { err = e }
      if (!err) {
        const ae = new assert.AssertionError({ message: 'Expected promise to reject, but it resolved', operator: 'expect' })
        throw ae
      }
      if (expected) {
        if (expected instanceof RegExp) assert.match(err.message, expected)
        else if (typeof expected === 'string') {
          if (!err.message.includes(expected)) {
            const ae = new assert.AssertionError({ message: `Expected rejection message to include "${expected}", got "${err.message}"`, operator: 'expect' })
            throw ae
          }
        }
      }
    },
  }

  return matchers
}

global.expect = function expect(actual) {
  return buildMatcher(actual)
}
global.expect.any = (cls) => new AnyMatcher(cls)
global.expect.anything = () => new AnythingMatcher()
global.expect.objectContaining = (obj) => new ObjectContainingMatcher(obj)
global.expect.arrayContaining = (arr) => new ArrayContainingMatcher(arr)
global.expect.stringContaining = (str) => new StringContainingMatcher(str)
global.expect.stringMatching = (rx) => new StringMatchingMatcher(rx)

// ---------------------------------------------------------------------------
// Minimal jest object
// ---------------------------------------------------------------------------

function createMockFn(impl) {
  const calls = []
  const instances = []
  let _impl = impl || null
  let _once = []

  function mockFn(...args) {
    calls.push({ args, this: this })
    instances.push(this)
    if (_once.length) {
      const fn = _once.shift()
      return fn(...args)
    }
    if (_impl) return _impl.call(this, ...args)
    return undefined
  }

  mockFn.mock = { calls, instances, results: calls }
  mockFn.mockClear = () => { calls.length = 0; instances.length = 0 }
  mockFn.mockReset = () => { mockFn.mockClear(); _impl = null; _once = [] }
  mockFn.mockReturnValue = (val) => { _impl = () => val; return mockFn }
  mockFn.mockReturnValueOnce = (val) => { _once.push(() => val); return mockFn }
  mockFn.mockResolvedValue = (val) => { _impl = () => Promise.resolve(val); return mockFn }
  mockFn.mockResolvedValueOnce = (val) => { _once.push(() => Promise.resolve(val)); return mockFn }
  mockFn.mockRejectedValue = (val) => { _impl = () => Promise.reject(val); return mockFn }
  mockFn.mockRejectedValueOnce = (val) => { _once.push(() => Promise.reject(val)); return mockFn }
  mockFn.mockImplementation = (fn) => { _impl = fn; return mockFn }
  mockFn.mockImplementationOnce = (fn) => { _once.push(fn); return mockFn }
  mockFn.mockName = (name) => { mockFn._mockName = name; return mockFn }

  return mockFn
}

global.jest = {
  fn: createMockFn,

  spyOn(obj, method) {
    const original = obj[method]
    const spy = createMockFn(typeof original === 'function' ? original.bind(obj) : null)
    obj[method] = spy
    spy.mockRestore = () => { obj[method] = original }
    return spy
  },

  clearAllMocks() {
    // no-op in this simplified version
  },

  resetAllMocks() {
    // no-op
  },

  mock() {
    // no-op stub for jest.mock() calls
  },
}
