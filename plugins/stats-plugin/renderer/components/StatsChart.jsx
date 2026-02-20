import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import { formatWeekShort, formatCost } from '../../src/utils/formatters'
import '../styles/stats-chart.css'

/**
 * StatsChart - Displays weekly statistics as a line chart
 * Features custom tooltip that shows all metrics on hover
 *
 * @param {Object} props
 * @param {Array} props.data - Array of weekly stat objects
 * @param {boolean} props.loading - Loading state
 */
function StatsChart({ data = [], loading = false }) {
  const [useLogScale, setUseLogScale] = React.useState(true)
  if (loading) {
    return (
      <div className="stats-chart-container">
        <div className="stats-chart-loading">Loading chart...</div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="stats-chart-container">
        <div className="stats-chart-empty">No data available for chart</div>
      </div>
    )
  }

  // Transform data for chart display
  // Convert duration from ms to hours for better visualization
  const chartData = data.map(week => ({
    ...week,
    weekLabel: formatWeekShort(week.week),
    durationHours: week.duration / 3600000 // Convert ms to hours
  }))

  return (
    <div className="stats-chart-container">
      <div className="chart-controls">
        <label className="chart-control-checkbox">
          <input
            type="checkbox"
            checked={useLogScale}
            onChange={(e) => setUseLogScale(e.target.checked)}
          />
          <span>Logarithmic scale</span>
        </label>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--chart-grid-color, #e0e0e0)"
            vertical={false}
          />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 11, fill: 'var(--chart-axis-text, #666)' }}
            tickLine={{ stroke: 'var(--chart-axis-line, #ccc)' }}
            axisLine={{ stroke: 'var(--chart-axis-line, #ccc)' }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: 'var(--chart-axis-text, #666)' }}
            tickLine={{ stroke: 'var(--chart-axis-line, #ccc)' }}
            axisLine={{ stroke: 'var(--chart-axis-line, #ccc)' }}
            label={{
              value: 'Turns',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 12, fill: 'var(--chart-axis-text, #666)' }
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            scale={useLogScale ? 'log' : 'auto'}
            domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
            tick={{ fontSize: 11, fill: 'var(--chart-axis-text, #666)' }}
            tickLine={{ stroke: 'var(--chart-axis-line, #ccc)' }}
            axisLine={{ stroke: 'var(--chart-axis-line, #ccc)' }}
            tickFormatter={(value) => {
              if (value === 0) return '$0'
              if (value < 0.01) return `$${value.toFixed(4)}`
              if (value < 1) return `$${value.toFixed(2)}`
              return `$${value.toFixed(0)}`
            }}
            label={{
              value: useLogScale ? 'Cost (log scale)' : 'Cost',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: 12, fill: 'var(--chart-axis-text, #666)' }
            }}
            allowDataOverflow={false}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{
              stroke: 'var(--chart-cursor-color, #6c63ff)',
              strokeWidth: 1,
              strokeDasharray: '4 4'
            }}
            isAnimationActive={false}
          />
          <Legend
            wrapperStyle={{ paddingTop: 16 }}
            iconType="circle"
            iconSize={8}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="turns"
            name="Turns"
            stroke="var(--chart-color-turns, #6c63ff)"
            strokeWidth={2}
            dot={{
              r: 4,
              fill: 'var(--chart-color-turns, #6c63ff)',
              strokeWidth: 0
            }}
            activeDot={{
              r: 6,
              fill: 'var(--chart-color-turns, #6c63ff)',
              stroke: '#fff',
              strokeWidth: 2
            }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cost"
            name="Cost ($)"
            stroke="var(--chart-color-cost, #48bb78)"
            strokeWidth={2}
            dot={{
              r: 4,
              fill: 'var(--chart-color-cost, #48bb78)',
              strokeWidth: 0
            }}
            activeDot={{
              r: 6,
              fill: 'var(--chart-color-cost, #48bb78)',
              stroke: '#fff',
              strokeWidth: 2
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default StatsChart
