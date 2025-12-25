import React, { useState, useEffect } from 'react'
import StatsTable from './StatsTable'
import '../styles/stats-view.css'

/**
 * StatsView - Main container component for the Stats Plugin UI
 * Manages data fetching and coordinates child components
 */
function StatsView() {
  const [weeklyStats, setWeeklyStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  return (
    <div className="stats-view">
      <header className="stats-view-header">
        <h2 className="stats-view-title">Usage Statistics</h2>
        <p className="stats-view-subtitle">Last 26 weeks</p>
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
        <StatsTable data={weeklyStats} loading={loading} />
      </div>
    </div>
  )
}

export default StatsView
