/**
 * Plugin Services Index
 *
 * Exports all services available to plugins via context.getService()
 */

const { HistoryService } = require('./history-service')

module.exports = {
  HistoryService
}
