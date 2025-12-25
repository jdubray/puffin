import React, { useMemo } from 'react'
import TotalsRow from './TotalsRow'
import {
  formatCost,
  formatDuration,
  formatWeekShort,
  formatNumber
} from '../../src/utils/formatters'
import '../styles/stats-table.css'

/**
 * StatsTable - Displays weekly statistics in a tabular format
 * @param {Object} props
 * @param {Array} props.data - Array of weekly stat objects
 * @param {boolean} props.loading - Loading state
 */
function StatsTable({ data = [], loading = false }) {
  // Compute totals using useMemo for performance
  const totals = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return { turns: 0, cost: 0, duration: 0 }
    }

    return data.reduce(
      (acc, week) => ({
        turns: acc.turns + (week.turns || 0),
        cost: acc.cost + (week.cost || 0),
        duration: acc.duration + (week.duration || 0)
      }),
      { turns: 0, cost: 0, duration: 0 }
    )
  }, [data])

  if (loading) {
    return (
      <div className="stats-table-container">
        <div className="stats-table-loading">Loading statistics...</div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="stats-table-container">
        <div className="stats-table-empty">No statistics available</div>
      </div>
    )
  }

  return (
    <div className="stats-table-container">
      <div className="stats-table-scroll-wrapper">
        <table className="stats-table">
          <thead className="stats-table-header">
            <tr>
              <th className="stats-col-week">Week</th>
              <th className="stats-col-turns">Turns</th>
              <th className="stats-col-cost">Cost</th>
              <th className="stats-col-duration">Duration</th>
            </tr>
          </thead>
          <tbody className="stats-table-body">
            {data.map((week, index) => (
              <tr key={week.week || index} className="stats-table-row">
                <td className="stats-col-week">{formatWeekShort(week.week)}</td>
                <td className="stats-col-turns">{formatNumber(week.turns)}</td>
                <td className="stats-col-cost">{formatCost(week.cost)}</td>
                <td className="stats-col-duration">{formatDuration(week.duration)}</td>
              </tr>
            ))}
          </tbody>
          <TotalsRow totals={totals} />
        </table>
      </div>
    </div>
  )
}

export default StatsTable
