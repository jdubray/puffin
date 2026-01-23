/**
 * RLM Document Plugin - Semaphore Tests
 *
 * Tests for the counting semaphore implementation used for concurrency control.
 * Covers acquire, release, timeout, and drain functionality.
 */

const Semaphore = require('../../plugins/rlm-document-plugin/lib/semaphore')

describe('RLM Semaphore', () => {
  describe('constructor', () => {
    it('should create semaphore with given permits', () => {
      const sem = new Semaphore(3)
      expect(sem.getAvailable()).toBe(3)
    })

    it('should throw for non-positive permits', () => {
      expect(() => new Semaphore(0)).toThrow()
      expect(() => new Semaphore(-1)).toThrow()
    })

    it('should throw for non-numeric permits', () => {
      expect(() => new Semaphore('3')).toThrow()
      expect(() => new Semaphore(null)).toThrow()
    })

    it('should start with empty wait queue', () => {
      const sem = new Semaphore(3)
      expect(sem.getQueueLength()).toBe(0)
    })
  })

  describe('tryAcquire', () => {
    it('should succeed when permits available', () => {
      const sem = new Semaphore(3)
      expect(sem.tryAcquire()).toBe(true)
      expect(sem.getAvailable()).toBe(2)
    })

    it('should fail when no permits available', () => {
      const sem = new Semaphore(1)
      sem.tryAcquire()
      expect(sem.tryAcquire()).toBe(false)
      expect(sem.getAvailable()).toBe(0)
    })

    it('should not block', () => {
      const sem = new Semaphore(1)
      sem.tryAcquire()
      const start = Date.now()
      sem.tryAcquire()
      expect(Date.now() - start).toBeLessThan(10)
    })
  })

  describe('acquire', () => {
    it('should immediately resolve when permits available', async () => {
      const sem = new Semaphore(3)
      await sem.acquire()
      expect(sem.getAvailable()).toBe(2)
    })

    it('should wait when no permits available', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      // Start waiting for a permit
      let acquired = false
      const waitPromise = sem.acquire().then(() => {
        acquired = true
      })

      // Should still be waiting
      expect(acquired).toBe(false)
      expect(sem.getQueueLength()).toBe(1)

      // Release permit
      sem.release()

      await waitPromise
      expect(acquired).toBe(true)
    })

    it('should queue multiple waiters', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      const order = []
      const p1 = sem.acquire().then(() => order.push(1))
      const p2 = sem.acquire().then(() => order.push(2))

      expect(sem.getQueueLength()).toBe(2)

      sem.release()
      sem.release()

      await Promise.all([p1, p2])
      expect(order).toEqual([1, 2]) // FIFO order
    })
  })

  describe('acquire with timeout', () => {
    it('should resolve within timeout when permit becomes available', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      // Release after short delay
      setTimeout(() => sem.release(), 50)

      const start = Date.now()
      await sem.acquire(1000)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(200)
    })

    it('should reject after timeout expires', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      await expect(sem.acquire(50)).rejects.toThrow('timed out')
    })

    it('should remove waiter from queue on timeout', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      try {
        await sem.acquire(50)
      } catch {
        // Expected
      }

      expect(sem.getQueueLength()).toBe(0)
    })
  })

  describe('release', () => {
    it('should increase available permits', () => {
      const sem = new Semaphore(3)
      sem.tryAcquire()
      expect(sem.getAvailable()).toBe(2)
      sem.release()
      expect(sem.getAvailable()).toBe(3)
    })

    it('should not exceed max permits', () => {
      const sem = new Semaphore(3)
      sem.release()
      sem.release()
      expect(sem.getAvailable()).toBe(3)
    })

    it('should give permit to waiter instead of pool', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      let waiterResolved = false
      sem.acquire().then(() => {
        waiterResolved = true
      })

      sem.release()
      await new Promise(r => setImmediate(r))

      expect(waiterResolved).toBe(true)
      expect(sem.getAvailable()).toBe(0) // Permit went to waiter
    })
  })

  describe('withPermit', () => {
    it('should acquire and release automatically', async () => {
      const sem = new Semaphore(1)

      await sem.withPermit(async () => {
        expect(sem.getAvailable()).toBe(0)
      })

      expect(sem.getAvailable()).toBe(1)
    })

    it('should release on error', async () => {
      const sem = new Semaphore(1)

      await expect(
        sem.withPermit(async () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      expect(sem.getAvailable()).toBe(1)
    })

    it('should return function result', async () => {
      const sem = new Semaphore(1)

      const result = await sem.withPermit(async () => {
        return 42
      })

      expect(result).toBe(42)
    })

    it('should respect timeout', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      await expect(
        sem.withPermit(async () => 'should not execute', 50)
      ).rejects.toThrow('timed out')
    })
  })

  describe('isAvailable', () => {
    it('should return true when permits available', () => {
      const sem = new Semaphore(3)
      expect(sem.isAvailable()).toBe(true)
    })

    it('should return false when no permits available', () => {
      const sem = new Semaphore(1)
      sem.tryAcquire()
      expect(sem.isAvailable()).toBe(false)
    })
  })

  describe('drain', () => {
    it('should reject all waiters', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      const errors = []
      sem.acquire().catch(e => errors.push(e))
      sem.acquire().catch(e => errors.push(e))

      expect(sem.getQueueLength()).toBe(2)

      sem.drain(new Error('shutting down'))

      await new Promise(r => setImmediate(r))

      expect(errors).toHaveLength(2)
      expect(errors[0].message).toBe('shutting down')
      expect(sem.getQueueLength()).toBe(0)
    })

    it('should clear timeouts for waiting acquires', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      const errors = []
      sem.acquire(10000).catch(e => errors.push(e))

      sem.drain()

      await new Promise(r => setImmediate(r))

      expect(errors).toHaveLength(1)
    })

    it('should use default error if none provided', async () => {
      const sem = new Semaphore(1)
      await sem.acquire()

      const errors = []
      sem.acquire().catch(e => errors.push(e))

      sem.drain()

      await new Promise(r => setImmediate(r))

      expect(errors[0].message).toContain('drained')
    })
  })

  describe('concurrency control', () => {
    it('should limit concurrent operations', async () => {
      const sem = new Semaphore(2)
      let concurrent = 0
      let maxConcurrent = 0

      const operation = async () => {
        await sem.acquire()
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(r => setTimeout(r, 10))
        concurrent--
        sem.release()
      }

      await Promise.all([
        operation(),
        operation(),
        operation(),
        operation(),
        operation()
      ])

      expect(maxConcurrent).toBe(2)
    })

    it('should maintain order with withPermit', async () => {
      const sem = new Semaphore(1)
      const order = []

      await Promise.all([
        sem.withPermit(async () => { order.push(1) }),
        sem.withPermit(async () => { order.push(2) }),
        sem.withPermit(async () => { order.push(3) })
      ])

      expect(order).toEqual([1, 2, 3])
    })
  })
})
