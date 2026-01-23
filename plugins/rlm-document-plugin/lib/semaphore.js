/**
 * RLM Document Plugin - Semaphore
 *
 * A counting semaphore implementation for concurrency control.
 * Used to limit the number of concurrent REPL queries.
 */

/**
 * Counting Semaphore for async concurrency control
 */
class Semaphore {
  /**
   * Create a new Semaphore
   * @param {number} permits - Maximum number of concurrent operations
   */
  constructor(permits) {
    if (typeof permits !== 'number' || permits < 1) {
      throw new Error('Semaphore permits must be a positive number')
    }
    this.permits = permits
    this.available = permits
    this.waitQueue = []
  }

  /**
   * Acquire a permit, waiting if none are available
   * @param {number} timeout - Optional timeout in milliseconds
   * @returns {Promise<void>} Resolves when permit is acquired
   * @throws {Error} If timeout expires before permit is acquired
   */
  async acquire(timeout = 0) {
    if (this.available > 0) {
      this.available--
      return Promise.resolve()
    }

    // Need to wait for a permit
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timeoutId: null }

      // Set up timeout if specified
      if (timeout > 0) {
        waiter.timeoutId = setTimeout(() => {
          // Remove from wait queue
          const index = this.waitQueue.indexOf(waiter)
          if (index !== -1) {
            this.waitQueue.splice(index, 1)
          }
          reject(new Error(`Semaphore acquire timed out after ${timeout}ms`))
        }, timeout)
      }

      this.waitQueue.push(waiter)
    })
  }

  /**
   * Try to acquire a permit without waiting
   * @returns {boolean} True if permit was acquired, false otherwise
   */
  tryAcquire() {
    if (this.available > 0) {
      this.available--
      return true
    }
    return false
  }

  /**
   * Release a permit, waking up a waiting task if any
   */
  release() {
    if (this.waitQueue.length > 0) {
      // Give permit to next waiter
      const waiter = this.waitQueue.shift()
      if (waiter.timeoutId) {
        clearTimeout(waiter.timeoutId)
      }
      waiter.resolve()
    } else {
      // Return permit to pool
      this.available++
      if (this.available > this.permits) {
        this.available = this.permits
      }
    }
  }

  /**
   * Execute a function with a permit, automatically releasing when done
   * @param {Function} fn - Async function to execute
   * @param {number} timeout - Optional acquire timeout
   * @returns {Promise<*>} Result of the function
   */
  async withPermit(fn, timeout = 0) {
    await this.acquire(timeout)
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Get the number of available permits
   * @returns {number} Available permits
   */
  getAvailable() {
    return this.available
  }

  /**
   * Get the number of waiters in the queue
   * @returns {number} Number of waiting tasks
   */
  getQueueLength() {
    return this.waitQueue.length
  }

  /**
   * Check if permits are available
   * @returns {boolean} True if at least one permit is available
   */
  isAvailable() {
    return this.available > 0
  }

  /**
   * Drain all waiters from the queue (for cleanup)
   * @param {Error} error - Error to reject waiters with
   */
  drain(error = new Error('Semaphore drained')) {
    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()
      if (waiter.timeoutId) {
        clearTimeout(waiter.timeoutId)
      }
      waiter.reject(error)
    }
  }
}

module.exports = Semaphore
