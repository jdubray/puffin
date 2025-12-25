import React from 'react'
import {
  formatCost,
  formatDuration,
  formatWeekLabel,
  formatNumber
} from '../../src/utils/formatters'
import '../styles/chart-tooltip.css'

/**
 * ChartTooltip - Custom tooltip component for the stats chart
 * Displays week, turns, cost, and duration when hovering over data points
 *
 * @param {Object} props - Recharts tooltip props
 * @param {boolean} props.active - Whether tooltip should be visible
 * @param {Array} props.payload - Data payload from Recharts
 * @param {string} props.label - The x-axis label (week string)
 */
function ChartTooltip({ active, payload, label }) {
  // Don't render if not active or no data
  if (!active || !payload || payload.length === 0) {
    return null
  }

  // Extract the full data object from the first payload entry
  const data = payload[0]?.payload
  if (!data) {
    return null
  }

  return (
    <div className="chart-tooltip" role="tooltip" aria-live="polite">
      <div className="chart-tooltip-header">
        {formatWeekLabel(data.week || label)}
      </div>
      <div className="chart-tooltip-content">
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">Turns:</span>
          <span className="chart-tooltip-value">{formatNumber(data.turns)}</span>
        </div>
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">Cost:</span>
          <span className="chart-tooltip-value">{formatCost(data.cost)}</span>
        </div>
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">Duration:</span>
          <span className="chart-tooltip-value">{formatDuration(data.duration)}</span>
        </div>
      </div>
    </div>
  )
}

export default ChartTooltip
