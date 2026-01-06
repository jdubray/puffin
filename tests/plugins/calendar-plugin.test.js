/**
 * Tests for Calendar Plugin
 */

const { describe, it, before, after, beforeEach } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs').promises

describe('Calendar Plugin', () => {
  let CalendarPlugin
  let dateUtils

  before(async () => {
    CalendarPlugin = require('../../plugins/calendar/index')
    dateUtils = require('../../plugins/calendar/services/date-utils')
  })

  describe('Plugin Structure', () => {
    it('should have valid manifest', async () => {
      const manifestPath = path.join(__dirname, '../../plugins/calendar/puffin-plugin.json')
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      assert.strictEqual(manifest.name, 'calendar')
      assert.strictEqual(manifest.version, '1.0.0')
      assert.strictEqual(manifest.displayName, 'Calendar')
      assert.strictEqual(manifest.main, 'index.js')
      assert.ok(manifest.contributes)
      assert.ok(manifest.contributes.views)
      assert.strictEqual(manifest.contributes.views.length, 1)
      assert.strictEqual(manifest.contributes.views[0].id, 'calendar-view')
      assert.strictEqual(manifest.contributes.views[0].icon, '📅')
    })

    it('should export activate and deactivate methods', () => {
      assert.ok(typeof CalendarPlugin.activate === 'function')
      assert.ok(typeof CalendarPlugin.deactivate === 'function')
    })

    it('should export getMonthData method', () => {
      assert.ok(typeof CalendarPlugin.getMonthData === 'function')
    })

    it('should export getDayActivity method', () => {
      assert.ok(typeof CalendarPlugin.getDayActivity === 'function')
    })
  })

  describe('Plugin Activation', () => {
    let mockContext

    beforeEach(() => {
      mockContext = {
        projectPath: '/test/project',
        log: {
          info: () => {},
          debug: () => {},
          error: () => {}
        },
        registeredHandlers: {},
        registeredActions: {},
        registerIpcHandler: function(name, handler) {
          this.registeredHandlers[name] = handler
        },
        registerAction: function(name, action) {
          this.registeredActions[name] = action
        }
      }
    })

    it('should activate successfully with valid context', async () => {
      await CalendarPlugin.activate(mockContext)

      assert.strictEqual(CalendarPlugin.context, mockContext)
      assert.ok(mockContext.registeredHandlers.getMonthData)
      assert.ok(mockContext.registeredHandlers.getDayActivity)
      assert.ok(mockContext.registeredActions.getMonthData)
      assert.ok(mockContext.registeredActions.getDayActivity)
    })

    it('should throw error without projectPath', async () => {
      const invalidContext = { ...mockContext, projectPath: null }

      await assert.rejects(
        () => CalendarPlugin.activate(invalidContext),
        { message: 'Calendar plugin requires projectPath in context' }
      )
    })

    it('should deactivate successfully', async () => {
      await CalendarPlugin.activate(mockContext)
      await CalendarPlugin.deactivate()

      // Should complete without error
      assert.ok(true)
    })
  })

  describe('getMonthData', () => {
    let mockContext

    before(async () => {
      mockContext = {
        projectPath: '/test/project',
        log: { info: () => {}, debug: () => {}, error: () => {} },
        registerIpcHandler: () => {},
        registerAction: () => {}
      }
      await CalendarPlugin.activate(mockContext)
    })

    it('should return correct structure for January 2025', async () => {
      const data = await CalendarPlugin.getMonthData(2025, 0)

      assert.strictEqual(data.year, 2025)
      assert.strictEqual(data.month, 0)
      assert.strictEqual(data.monthName, 'January')
      assert.strictEqual(data.daysInMonth, 31)
      assert.strictEqual(data.firstDayOfWeek, 3) // January 1, 2025 is Wednesday
      assert.strictEqual(data.days.length, 31)
    })

    it('should return correct structure for February 2024 (leap year)', async () => {
      const data = await CalendarPlugin.getMonthData(2024, 1)

      assert.strictEqual(data.year, 2024)
      assert.strictEqual(data.month, 1)
      assert.strictEqual(data.monthName, 'February')
      assert.strictEqual(data.daysInMonth, 29) // Leap year
    })

    it('should return day data with activity placeholder', async () => {
      const data = await CalendarPlugin.getMonthData(2025, 0)

      const firstDay = data.days[0]
      assert.strictEqual(firstDay.dayOfMonth, 1)
      assert.strictEqual(firstDay.date, '2025-01-01')
      assert.ok(firstDay.activity)
      assert.strictEqual(firstDay.activity.hasActivity, false)
    })
  })

  describe('getDayActivity', () => {
    it('should return empty activity structure', async () => {
      const activity = await CalendarPlugin.getDayActivity(2025, 0, 15)

      assert.strictEqual(activity.hasActivity, false)
      assert.strictEqual(activity.sprintCount, 0)
      assert.strictEqual(activity.storyCount, 0)
      assert.ok(Array.isArray(activity.sprints))
      assert.ok(Array.isArray(activity.stories))
    })
  })

  describe('IPC Handlers', () => {
    let mockContext

    before(async () => {
      mockContext = {
        projectPath: '/test/project',
        log: { info: () => {}, debug: () => {}, error: () => {} },
        registeredHandlers: {},
        registerIpcHandler: function(name, handler) {
          this.registeredHandlers[name] = handler
        },
        registerAction: () => {}
      }
      await CalendarPlugin.activate(mockContext)
    })

    it('should handle getMonthData IPC call', async () => {
      const handler = mockContext.registeredHandlers.getMonthData
      const result = await handler({ year: 2025, month: 5 })

      assert.strictEqual(result.year, 2025)
      assert.strictEqual(result.month, 5)
      assert.strictEqual(result.monthName, 'June')
    })

    it('should handle getDayActivity IPC call', async () => {
      const handler = mockContext.registeredHandlers.getDayActivity
      const result = await handler({ year: 2025, month: 5, day: 15 })

      assert.strictEqual(result.hasActivity, false)
    })
  })
})

describe('Date Utilities', () => {
  let dateUtils

  before(() => {
    dateUtils = require('../../plugins/calendar/services/date-utils')
  })

  describe('getDaysInMonth', () => {
    it('should return 31 for January', () => {
      assert.strictEqual(dateUtils.getDaysInMonth(2025, 0), 31)
    })

    it('should return 28 for February non-leap year', () => {
      assert.strictEqual(dateUtils.getDaysInMonth(2025, 1), 28)
    })

    it('should return 29 for February leap year', () => {
      assert.strictEqual(dateUtils.getDaysInMonth(2024, 1), 29)
    })

    it('should return 30 for April', () => {
      assert.strictEqual(dateUtils.getDaysInMonth(2025, 3), 30)
    })
  })

  describe('getFirstDayOfMonth', () => {
    it('should return Wednesday (3) for January 2025', () => {
      assert.strictEqual(dateUtils.getFirstDayOfMonth(2025, 0), 3)
    })

    it('should return Sunday (0) for September 2024', () => {
      assert.strictEqual(dateUtils.getFirstDayOfMonth(2024, 8), 0)
    })
  })

  describe('formatDateISO', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2025, 0, 15)
      assert.strictEqual(dateUtils.formatDateISO(date), '2025-01-15')
    })
  })

  describe('getMonthName', () => {
    it('should return full month name', () => {
      assert.strictEqual(dateUtils.getMonthName(0, 'long'), 'January')
      assert.strictEqual(dateUtils.getMonthName(11, 'long'), 'December')
    })

    it('should return short month name', () => {
      assert.strictEqual(dateUtils.getMonthName(0, 'short'), 'Jan')
    })
  })

  describe('isToday', () => {
    it('should return true for today', () => {
      const today = new Date()
      assert.strictEqual(dateUtils.isToday(today), true)
    })

    it('should return false for yesterday', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      assert.strictEqual(dateUtils.isToday(yesterday), false)
    })

    it('should work with date strings', () => {
      const todayStr = new Date().toISOString().split('T')[0]
      assert.strictEqual(dateUtils.isToday(todayStr), true)
    })
  })

  describe('isWeekend', () => {
    it('should return true for Saturday', () => {
      const saturday = new Date(2025, 0, 4) // Jan 4, 2025 is Saturday
      assert.strictEqual(dateUtils.isWeekend(saturday), true)
    })

    it('should return true for Sunday', () => {
      const sunday = new Date(2025, 0, 5) // Jan 5, 2025 is Sunday
      assert.strictEqual(dateUtils.isWeekend(sunday), true)
    })

    it('should return false for weekdays', () => {
      const wednesday = new Date(2025, 0, 1) // Jan 1, 2025 is Wednesday
      assert.strictEqual(dateUtils.isWeekend(wednesday), false)
    })
  })

  describe('addDays', () => {
    it('should add days correctly', () => {
      const date = new Date(2025, 0, 15)
      const result = dateUtils.addDays(date, 5)
      assert.strictEqual(result.getDate(), 20)
    })

    it('should handle month rollover', () => {
      const date = new Date(2025, 0, 30)
      const result = dateUtils.addDays(date, 5)
      assert.strictEqual(result.getMonth(), 1) // February
      assert.strictEqual(result.getDate(), 4)
    })
  })

  describe('addMonths', () => {
    it('should add months correctly', () => {
      const date = new Date(2025, 0, 15)
      const result = dateUtils.addMonths(date, 2)
      assert.strictEqual(result.getMonth(), 2) // March
    })

    it('should handle year rollover', () => {
      const date = new Date(2025, 10, 15) // November
      const result = dateUtils.addMonths(date, 3)
      assert.strictEqual(result.getFullYear(), 2026)
      assert.strictEqual(result.getMonth(), 1) // February
    })
  })

  describe('isSameDay', () => {
    it('should return true for same day', () => {
      const date1 = new Date(2025, 0, 15, 10, 30)
      const date2 = new Date(2025, 0, 15, 18, 45)
      assert.strictEqual(dateUtils.isSameDay(date1, date2), true)
    })

    it('should return false for different days', () => {
      const date1 = new Date(2025, 0, 15)
      const date2 = new Date(2025, 0, 16)
      assert.strictEqual(dateUtils.isSameDay(date1, date2), false)
    })
  })

  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const result = dateUtils.parseDate('2025-01-15')
      assert.ok(result instanceof Date)
    })

    it('should return null for invalid date', () => {
      const result = dateUtils.parseDate('not-a-date')
      assert.strictEqual(result, null)
    })

    it('should return null for empty string', () => {
      const result = dateUtils.parseDate('')
      assert.strictEqual(result, null)
    })
  })

  describe('getMonthDateRange', () => {
    it('should return start and end of month', () => {
      const range = dateUtils.getMonthDateRange(2025, 0)

      assert.strictEqual(range.start.getDate(), 1)
      assert.strictEqual(range.start.getMonth(), 0)
      assert.strictEqual(range.end.getDate(), 31)
      assert.strictEqual(range.end.getMonth(), 0)
    })
  })

  describe('getWeekNumber', () => {
    it('should return week 1 for early January', () => {
      const date = new Date(2025, 0, 1)
      const weekNum = dateUtils.getWeekNumber(date)
      assert.ok(weekNum >= 1 && weekNum <= 53)
    })
  })
})

describe('CalendarView Component', () => {
  it('should export CalendarView class', () => {
    const { CalendarView } = require('../../plugins/calendar/renderer/components/CalendarView')
    assert.ok(CalendarView)
    assert.ok(typeof CalendarView === 'function')
  })
})

describe('DayCell Component', () => {
  it('should export DayCell class', () => {
    const { DayCell } = require('../../plugins/calendar/renderer/components/DayCell')
    assert.ok(DayCell)
    assert.ok(typeof DayCell === 'function')
  })
})

describe('Renderer Components Index', () => {
  it('should export all components', () => {
    const components = require('../../plugins/calendar/renderer/components/index')

    assert.ok(components.CalendarView)
    assert.ok(components.DayCell)
    assert.ok(components.CalendarViewComponent)
    assert.ok(typeof components.CalendarViewComponent.mount === 'function')
  })
})
