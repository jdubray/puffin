/**
 * Plugin Services Index
 *
 * Exports all services available to plugins via context.getService()
 */

const { HistoryService } = require('./history-service')
const { StoryService } = require('./story-service')

module.exports = {
  HistoryService,
  StoryService
}
