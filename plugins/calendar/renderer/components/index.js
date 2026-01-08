/**
 * Calendar Plugin - Renderer Components Index
 *
 * Exports all renderer components for the calendar plugin.
 */

import { CalendarView, VIEW_TYPES } from './CalendarView.js'
import { DayCell } from './DayCell.js'
import { ViewToggle } from './ViewToggle.js'
import { WeekView } from './WeekView.js'
import { MonthView } from './MonthView.js'
import { NavigationControls } from './NavigationControls.js'
import { SprintPanel } from './SprintPanel.js'
import { SprintListItem } from './SprintListItem.js'
import { SprintModal } from './SprintModal.js'
import { BranchIndicator } from './BranchIndicator.js'
import { PostItNote } from './PostItNote.js'
import { NoteEditor, MAX_NOTE_LENGTH, NOTE_COLORS } from './NoteEditor.js'
import { Toast, ToastManager, toastManager } from './Toast.js'

/**
 * CalendarViewComponent - Plugin view component wrapper
 * Used by the plugin system to instantiate the calendar view
 */
class CalendarViewComponent {
  /**
   * Create a CalendarViewComponent
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Component options
   */
  constructor(container, options = {}) {
    this.container = container
    this.options = options
    this.context = options.context || {}
    this.calendarView = null
    this.currentModal = null
  }

  /**
   * Initialize the component
   */
  async init() {
    this.calendarView = new CalendarView(this.container, {
      showSprintPanel: true,
      onDaySelect: (dayData) => {
        if (this.context && this.context.log) {
          this.context.log.debug(`Day selected: ${dayData.date}`)
        }
      },
      onSprintClick: (sprint) => {
        if (this.context && this.context.log) {
          this.context.log.debug(`Sprint clicked: ${sprint.id || sprint.name}`)
        }

        // Close existing modal if open
        if (this.currentModal) {
          this.currentModal.destroy()
          this.currentModal = null
        }

        // Open sprint modal with user stories
        this.currentModal = SprintModal.show(sprint, {
          onClose: () => {
            this.currentModal = null
          }
        })

        // Emit event for external handlers
        this.container.dispatchEvent(new CustomEvent('calendar:sprint-click', {
          detail: { sprint },
          bubbles: true
        }))
      }
    })
  }

  /**
   * Refresh the calendar view
   */
  refresh() {
    if (this.calendarView) {
      this.calendarView.refresh()
    }
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.currentModal) {
      this.currentModal.destroy()
      this.currentModal = null
    }
    if (this.calendarView) {
      this.calendarView.destroy()
      this.calendarView = null
    }
  }
}

export {
  CalendarView,
  VIEW_TYPES,
  DayCell,
  ViewToggle,
  WeekView,
  MonthView,
  NavigationControls,
  SprintPanel,
  SprintListItem,
  SprintModal,
  BranchIndicator,
  PostItNote,
  NoteEditor,
  MAX_NOTE_LENGTH,
  NOTE_COLORS,
  Toast,
  ToastManager,
  toastManager,
  CalendarViewComponent
}

export default CalendarViewComponent
