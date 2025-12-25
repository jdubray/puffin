import React, { useState, useEffect, useCallback } from 'react'
import StatsChart from './StatsChart'
import StatsTable from './StatsTable'
import ExportButton from './ExportButton'
import Notification from './Notification'
import { generateMarkdown } from '../../src/utils/markdown-exporter'
import '../styles/stats-view.css'

/**
 * StatsView - Main container component for the Stats Plugin UI
 * Manages data fetching and coordinates child components
 */
function StatsView() {
  const [weeklyStats, setWeeklyStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notification, setNotification] = useState({
    visible: false,
    message: '',
    type: 'info'
  })

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)
    setError(null)

    try {
      // Call the plugin IPC handler
      const result = await window.puffin.ipc.invoke('plugin:stats-plugin:getWeeklyStats', {
        weeks: 26
      })

      if (result.success) {
        setWeeklyStats(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch stats')
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Generate markdown content for export
  const handleExport = useCallback(() => {
    return generateMarkdown(weeklyStats, {
      title: 'Stats Report',
      includeTotals: true
    })
  }, [weeklyStats])

  // Handle successful export
  const handleExportSuccess = useCallback((filePath) => {
    setNotification({
      visible: true,
      message: `Report saved successfully`,
      type: 'success'
    })
  }, [])

  // Handle export error
  const handleExportError = useCallback((errorMessage) => {
    setNotification({
      visible: true,
      message: `Export failed: ${errorMessage}`,
      type: 'error'
    })
  }, [])

  // Close notification
  const handleCloseNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, visible: false }))
  }, [])

  return (
    <div className="stats-view">
      <header className="stats-view-header">
        <div className="stats-view-header-text">
          <h2 className="stats-view-title">Usage Statistics</h2>
          <p className="stats-view-subtitle">Last 26 weeks</p>
        </div>
        <div className="stats-view-header-actions">
          <ExportButton
            onExport={handleExport}
            onSuccess={handleExportSuccess}
            onError={handleExportError}
            disabled={loading || weeklyStats.length === 0}
          />
        </div>
      </header>

      {error && (
        <div className="stats-view-error">
          <span className="error-icon">⚠</span>
          <span>{error}</span>
          <button onClick={fetchStats} className="retry-button">
            Retry
          </button>
        </div>
      )}

      <div className="stats-view-content">
        <StatsChart data={weeklyStats} loading={loading} />
        <StatsTable data={weeklyStats} loading={loading} />
      </div>

      <Notification
        message={notification.message}
        type={notification.type}
        visible={notification.visible}
        onClose={handleCloseNotification}
        duration={4000}
      />
    </div>
  )
}

export default StatsView
