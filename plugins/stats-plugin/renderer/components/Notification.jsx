import React, { useEffect } from 'react'
import '../styles/notification.css'

/**
 * Notification - Toast notification for success/error messages
 *
 * @param {Object} props
 * @param {string} props.message - Notification message
 * @param {string} props.type - Notification type ('success' | 'error' | 'info')
 * @param {boolean} props.visible - Whether notification is visible
 * @param {Function} props.onClose - Callback to close notification
 * @param {number} props.duration - Auto-close duration in ms (0 to disable)
 */
function Notification({
  message,
  type = 'info',
  visible = false,
  onClose,
  duration = 4000
}) {
  useEffect(() => {
    if (visible && duration > 0) {
      const timer = setTimeout(() => {
        onClose?.()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [visible, duration, onClose])

  if (!visible) {
    return null
  }

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  }

  return (
    <div
      className={`notification notification--${type}`}
      role="alert"
      aria-live="polite"
    >
      <span className="notification-icon" aria-hidden="true">
        {icons[type] || icons.info}
      </span>
      <span className="notification-message">{message}</span>
      <button
        className="notification-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        ✕
      </button>
    </div>
  )
}

export default Notification
