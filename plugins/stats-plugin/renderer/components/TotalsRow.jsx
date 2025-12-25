import React from 'react'
import {
  formatCost,
  formatDuration,
  formatNumber
} from '../../src/utils/formatters'
import '../styles/totals-row.css'

/**
 * TotalsRow - Displays aggregated totals at the bottom of the stats table
 * Uses sticky positioning to remain visible during scroll
 *
 * @param {Object} props
 * @param {Object} props.totals - Aggregated totals object
 * @param {number} props.totals.turns - Total number of turns
 * @param {number} props.totals.cost - Total cost in dollars
 * @param {number} props.totals.duration - Total duration in milliseconds
 */
function TotalsRow({ totals }) {
  if (!totals) {
    return null
  }

  const { turns = 0, cost = 0, duration = 0 } = totals

  return (
    <tfoot className="stats-table-totals">
      <tr className="totals-row">
        <td className="stats-col-week totals-label">Total</td>
        <td className="stats-col-turns totals-value">{formatNumber(turns)}</td>
        <td className="stats-col-cost totals-value">{formatCost(cost)}</td>
        <td className="stats-col-duration totals-value">{formatDuration(duration)}</td>
      </tr>
    </tfoot>
  )
}

export default TotalsRow
