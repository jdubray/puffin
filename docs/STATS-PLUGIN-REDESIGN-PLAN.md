# Stats Plugin Redesign Plan

**Author:** Claude (Sonnet 4.5)
**Date:** 2025-02-10
**Status:** 📋 Planning
**Related:** [METRICS-INSTRUMENTATION.md](./METRICS-INSTRUMENTATION.md)

---

## Executive Summary

This document outlines the comprehensive redesign of the Stats plugin to leverage the new centralized metrics instrumentation system. The redesign shifts focus from **branch-centric prompt history** to **component-centric cognitive architecture metrics**, emphasizing trends, normalization, and business value insights.

### Key Changes

| Aspect | Current (v1.0.0) | Proposed (v2.0.0) |
|--------|------------------|-------------------|
| **Data Source** | History service (prompts by branch) | MetricsService (component operations) |
| **Primary Focus** | Branch comparison | Component performance & trends |
| **Metrics** | Turns, cost, duration per branch | Tokens, cost, duration, operation counts per component |
| **Normalization** | None | Per-story, per-day, per-week normalized metrics |
| **Time Granularity** | Weekly (last 26 weeks) | Daily & Weekly (last 30 days, last 12 weeks) |
| **Visualizations** | 3 charts (weekly trends, branch bars, cost line) | 6+ charts (component treemap, daily sparklines, normalized trends, cost attribution) |

---

## Design Philosophy

### Core Principles

1. **Component-Centric**: Focus on understanding which parts of the cognitive architecture consume the most resources
2. **Trend-Oriented**: Surface patterns over time to identify optimization opportunities
3. **Normalized Insights**: Show efficiency metrics (cost per story, tokens per operation) to contextualize absolute values
4. **Actionable**: Present data that helps answer: "Where should I optimize?" and "Is performance improving?"
5. **Progressive Disclosure**: Start with high-level summary, allow drill-down into specific components/operations

### User Questions to Answer

- **Cost Attribution**: Which component is most expensive? (CRE plan generation vs. interactive sessions)
- **Efficiency Trends**: Are we getting more efficient over time? (tokens per story, cost per story)
- **Bottlenecks**: Which operations take the longest? (plan generation, RIS, assertions)
- **Daily Patterns**: What does a typical development day look like in terms of AI usage?
- **Story Economics**: How much does each story cost on average to implement?

---

## Data Architecture

### Primary Data Source: `metrics_events` Table

**Schema** (from migration `010_add_metrics_events.js`):

```sql
CREATE TABLE metrics_events (
  id TEXT PRIMARY KEY,
  component TEXT NOT NULL,           -- e.g., 'claude-service', 'cre-plan', 'memory-plugin'
  operation TEXT NOT NULL,           -- e.g., 'interactive-session', 'generate-plan'
  event_type TEXT NOT NULL,          -- 'start', 'complete', 'error'
  session_id TEXT,
  branch_id TEXT,
  story_id TEXT,
  plan_id TEXT,
  sprint_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  turns INTEGER,
  duration_ms INTEGER,
  metadata TEXT DEFAULT '{}',        -- JSON blob
  created_at TEXT NOT NULL
)
```

**Indexes**:
- `idx_metrics_events_component` (component)
- `idx_metrics_events_operation` (operation)
- `idx_metrics_events_created` (created_at DESC)
- `idx_metrics_events_story_id` (story_id)
- `idx_metrics_events_component_type` (component, event_type, created_at DESC)

### Component Taxonomy

**Components** (from METRICS-INSTRUMENTATION.md):

| Component | Operations | Typical Cost | Volume |
|-----------|-----------|--------------|--------|
| `claude-service` | `interactive-session`, `one-shot-prompt`, `derive-stories`, `generate-title` | High (opus/sonnet) | Medium |
| `cre-plan` | `analyze-ambiguities`, `generate-plan`, `refine-plan`, `infer-intent`, `identify-schema-gaps` | High (sonnet) | Medium |
| `cre-ris` | `generate-ris` | High (sonnet) | Medium |
| `cre-assertion` | `generate-assertions` | Low (haiku) | High |
| `memory-plugin` | `extraction`, `evolution` | Low (haiku) | Low |
| `outcome-lifecycle-plugin` | `outcome-synthesis` | Low (haiku) | Low |

### Normalization Context

**User Stories Table** (existing in puffin.db):
- Count of stories created per day/week
- Use `story_id` foreign key in `metrics_events` to attribute costs

**Sprints Table** (existing in puffin.db):
- Sprint-level aggregations
- Stories per sprint for per-sprint normalization

### Aggregation Queries

**Daily Totals**:
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as operation_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(duration_ms) as avg_duration
FROM metrics_events
WHERE event_type = 'complete'
  AND created_at >= date('now', '-30 days')
GROUP BY date
ORDER BY date DESC
```

**Component Stats** (last 30 days):
```sql
SELECT
  component,
  COUNT(*) as operation_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(duration_ms) as avg_duration
FROM metrics_events
WHERE event_type = 'complete'
  AND created_at >= date('now', '-30 days')
GROUP BY component
ORDER BY total_cost DESC
```

**Per-Story Normalization**:
```sql
-- Stories created in last 30 days
SELECT COUNT(DISTINCT id) FROM user_stories
WHERE created_at >= date('now', '-30 days')

-- Cost per story
SELECT (SUM(cost_usd) / story_count) as cost_per_story
FROM metrics_events, (SELECT COUNT(DISTINCT id) as story_count FROM user_stories WHERE ...)
WHERE event_type = 'complete' AND created_at >= date('now', '-30 days')
```

---

## UI Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Stats Dashboard                                   🔄 Export │
├─────────────────────────────────────────────────────────────┤
│                     SUMMARY CARDS                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 💰 Total│ │ 🎯 Avg  │ │ ⚡ Total│ │ 📝 Avg  │          │
│  │  Cost   │ │  Cost   │ │ Tokens  │ │ Tokens  │          │
│  │  (30d)  │ │ /Story  │ │  (30d)  │ │ /Story  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
├─────────────────────────────────────────────────────────────┤
│              COMPONENT BREAKDOWN (Treemap)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [claude-service 45%] │ [cre-plan 30%]                │  │
│  │                       │                               │  │
│  │ ──────────────────────────────────────────────────    │  │
│  │ [cre-ris 15%]  │[cre-assertion 5%]│[plugins 5%]      │  │
│  └──────────────────────────────────────────────────────┘  │
│  Click on component for operation breakdown                 │
├─────────────────────────────────────────────────────────────┤
│  DAILY TRENDS (Last 30 Days)        [•Cost •Tokens •Ops]   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      Cost Line Chart (area fill)                      │  │
│  │      ╱╲    ╱╲                                         │  │
│  │    ╱    ╲╱    ╲╱                                      │  │
│  │  ╱                ╲                                   │  │
│  │─────────────────────────────────────────────────────→│  │
│  │ Feb 1         Feb 15         Feb 28                   │  │
│  └──────────────────────────────────────────────────────┘  │
│  Sparklines: Tokens █▃▂▅▇▃▁  Operations ▂▃▅▂▁▃▄           │
├─────────────────────────────────────────────────────────────┤
│  NORMALIZED EFFICIENCY (Weekly Trends, Last 12 Weeks)       │
│  [Tab: Cost/Story] [Tab: Tokens/Story] [Tab: Duration/Op]  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Bar chart showing metric per normalized unit         │  │
│  │  ████  ████  ████  ███   ███   ██    ██   █          │  │
│  │  W1    W2    W3    W4    W5    W6    W7   W8         │  │
│  └──────────────────────────────────────────────────────┘  │
│  Trend line overlay with % change indicator                 │
├─────────────────────────────────────────────────────────────┤
│  COMPONENT PERFORMANCE TABLE                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Component     │ Ops │ Cost   │ Tokens │ Avg Dur │ %  │  │
│  │ claude-srv    │ 120 │ $12.45 │ 145K   │ 45s    │ 45%│  │
│  │ cre-plan      │  45 │  $8.20 │  95K   │ 78s    │ 30%│  │
│  │ cre-ris       │  38 │  $4.10 │  48K   │ 52s    │ 15%│  │
│  │ cre-assertion │  38 │  $1.35 │  15K   │ 12s    │  5%│  │
│  │ memory-plugin │  15 │  $0.80 │   8K   │  8s    │  3%│  │
│  │ outcome-plugin│  10 │  $0.50 │   5K   │  6s    │  2%│  │
│  └──────────────────────────────────────────────────────┘  │
│  Click row to expand operation-level breakdown              │
└─────────────────────────────────────────────────────────────┘
```

### Components to Build

#### 1. Summary Cards (4 cards)

**Card 1: Total Cost (30 days)**
- Icon: 💰
- Value: `$XX.XX`
- Subtext: "Last 30 days"
- Trend indicator: `+X%` vs previous 30 days (color: red up, green down)

**Card 2: Average Cost per Story**
- Icon: 🎯
- Value: `$X.XX/story`
- Subtext: "Based on N stories"
- Trend indicator: `+X%` vs previous period

**Card 3: Total Tokens (30 days)**
- Icon: ⚡
- Value: `XXXk tokens` (abbreviated)
- Subtext: "Input + Output"
- Trend indicator: `+X%` vs previous 30 days

**Card 4: Average Tokens per Story**
- Icon: 📝
- Value: `XXk/story`
- Subtext: "Based on N stories"
- Trend indicator: `+X%` vs previous period

#### 2. Component Breakdown Treemap

**Visualization**: Treemap (nested rectangles)
- Each rectangle = component
- Size = proportional to cost (or tokens, user-selectable)
- Color = gradient based on efficiency (darker = more expensive per operation)
- Label: Component name + percentage
- Hover: Tooltip with exact values

**Interactivity**:
- Click component → expand to show operation-level breakdown
- Toggle metric: Cost vs Tokens vs Operations
- Time range selector: 7d, 30d, 90d

**Implementation**: Canvas-based custom treemap or D3.js integration

#### 3. Daily Trends Chart

**Primary Chart**: Multi-line area chart
- X-axis: Date (last 30 days)
- Y-axis (left): Cost (USD)
- Y-axis (right): Tokens (thousands)
- Lines: Cost (area fill, primary), Tokens (line, secondary), Operations (line, tertiary)
- Grid: Horizontal only

**Sparklines Below**:
- Tokens per day: Small inline chart █▃▂▅▇▃▁
- Operations per day: Small inline chart ▂▃▅▂▁▃▄
- ASCII-style or minimal canvas

**Interactivity**:
- Hover: Tooltip with exact values for that day
- Click day: Filter component table to that day's operations

#### 4. Normalized Efficiency Chart

**Tabbed Interface**: 3 tabs
1. **Cost per Story**: Bar chart of `total_cost / stories_created` per week
2. **Tokens per Story**: Bar chart of `total_tokens / stories_created` per week
3. **Duration per Operation**: Bar chart of `avg_duration_ms` per week

**Trend Line**: Linear regression overlay showing improvement/degradation

**Features**:
- X-axis: Week number (W1, W2, ...)
- Y-axis: Normalized metric
- Bars: Colored by value (green = good, yellow = ok, red = bad)
- % change indicator: Overall trend % from week 1 to latest

#### 5. Component Performance Table

**Columns**:
| Column | Description | Sortable | Format |
|--------|-------------|----------|--------|
| Component | Component name | Yes | Text |
| Operations | Count of complete events | Yes | Number |
| Cost | Total cost (USD) | Yes | $XX.XX |
| Tokens | Total tokens | Yes | XXk |
| Avg Duration | Average operation duration | Yes | XXs or XXm |
| % of Total | Percentage of total cost | No | XX% |

**Row Expansion**:
- Click row → expand to show operation-level breakdown
- Sub-table columns: Operation, Count, Cost, Tokens, Avg Dur

**Features**:
- Default sort: Cost descending
- Search/filter by component name
- Export button → CSV or Markdown

#### 6. Export Options

**Formats**:
1. **Markdown**: Tables for all sections (existing exporter can be extended)
2. **CSV**: Raw data export for external analysis
3. **JSON**: Complete data dump for programmatic access

**Dialog**:
- Format selector (radio buttons)
- Time range selector (7d, 30d, 90d, all)
- Include/exclude sections (checkboxes)
- Save dialog via IPC

---

## Implementation Plan

### Phase 1: Data Layer (Backend)

**Files to Modify**:
- `plugins/stats-plugin/index.js`

**Tasks**:

1. **Add MetricsService Integration**
   ```javascript
   // In activate() method
   try {
     const { getMetricsService } = require('../../src/main/metrics-service')
     this.metricsService = getMetricsService()
   } catch (err) {
     logger.warn('[stats-plugin] MetricsService not available, using fallback')
   }
   ```

2. **Implement New IPC Handlers**
   ```javascript
   // Replace getWeeklyStats() and getStats() with:

   async getMetricsSummary(options = {}) {
     // Returns: { total30d: {...}, previous30d: {...}, perStory: {...} }
     // Query metrics_events for last 30 days and previous 30 days
     // Join with user_stories to get story count
   }

   async getComponentStats(options = {}) {
     // Returns: [{ component, operationCount, cost, tokens, avgDuration, percentage }, ...]
     // Query metrics_events grouped by component
     // Calculate percentages
   }

   async getOperationStats(component, options = {}) {
     // Returns: [{ operation, count, cost, tokens, avgDuration }, ...]
     // Query metrics_events WHERE component = ? GROUP BY operation
   }

   async getDailyTrends(options = {}) {
     // Returns: [{ date, cost, tokens, operations }, ...]
     // Query metrics_events grouped by DATE(created_at)
   }

   async getWeeklyNormalized(metric, options = {}) {
     // Returns: [{ week, value, storyCount, normalizedValue }, ...]
     // Join metrics_events with user_stories
     // Group by ISO week, compute normalized metric
   }
   ```

3. **Add Helper Functions**
   ```javascript
   _computeNormalizedMetric(totalValue, normalizationCount) {
     // Handle division by zero
     // Return formatted value
   }

   _computeTrend(current, previous) {
     // Return percentage change
     // Handle edge cases (0, null, undefined)
   }

   _getStoryCountForPeriod(startDate, endDate) {
     // Query user_stories WHERE created_at BETWEEN ...
     // Return count
   }
   ```

4. **Update Plugin Manifest**
   ```json
   // In puffin-plugin.json, update actions:
   {
     "actions": [
       { "name": "getMetricsSummary", "description": "Get 30-day summary with normalization" },
       { "name": "getComponentStats", "description": "Get component-level statistics" },
       { "name": "getOperationStats", "description": "Get operation-level stats for component" },
       { "name": "getDailyTrends", "description": "Get daily trend data" },
       { "name": "getWeeklyNormalized", "description": "Get weekly normalized efficiency metrics" }
     ]
   }
   ```

**Acceptance Criteria**:
- [ ] All 5 new IPC handlers respond with correct schema
- [ ] Handles missing MetricsService gracefully (fallback to mock/empty data)
- [ ] Queries use proper indexes (performance < 100ms for 30-day queries)
- [ ] Story count normalization accurate (uses user_stories table)
- [ ] Trend calculations handle edge cases (null, 0, division by zero)

---

### Phase 2: UI Components (Frontend)

**Files to Modify**:
- `plugins/stats-plugin/renderer/components/StatsView.js`

**Files to Create**:
- `plugins/stats-plugin/renderer/components/SummaryCards.js`
- `plugins/stats-plugin/renderer/components/TreemapChart.js`
- `plugins/stats-plugin/renderer/components/TrendsChart.js`
- `plugins/stats-plugin/renderer/components/NormalizedChart.js`
- `plugins/stats-plugin/renderer/components/ComponentTable.js`
- `plugins/stats-plugin/renderer/styles/summary-cards.css`
- `plugins/stats-plugin/renderer/styles/treemap.css`
- `plugins/stats-plugin/renderer/styles/trends.css`

**Tasks**:

#### 2.1. SummaryCards Component

```javascript
// SummaryCards.js (vanilla JS)
export class SummaryCards {
  constructor(container) {
    this.container = container
  }

  render(data) {
    // data = { total30d, previous30d, perStory }
    const cards = [
      { icon: '💰', label: 'Total Cost (30d)', value: data.total30d.cost, trend: this._computeTrend(...) },
      { icon: '🎯', label: 'Avg Cost/Story', value: data.perStory.cost, trend: ... },
      { icon: '⚡', label: 'Total Tokens (30d)', value: data.total30d.tokens, trend: ... },
      { icon: '📝', label: 'Avg Tokens/Story', value: data.perStory.tokens, trend: ... }
    ]

    this.container.innerHTML = cards.map(card => this._renderCard(card)).join('')
  }

  _renderCard(card) {
    return `
      <div class="summary-card">
        <div class="card-icon">${card.icon}</div>
        <div class="card-content">
          <div class="card-value">${card.value}</div>
          <div class="card-label">${card.label}</div>
          <div class="card-trend ${card.trend.direction}">${card.trend.text}</div>
        </div>
      </div>
    `
  }

  _computeTrend(current, previous) {
    const change = ((current - previous) / previous) * 100
    return {
      direction: change > 0 ? 'up' : 'down',
      text: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
    }
  }
}
```

**Styling**:
```css
/* summary-cards.css */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.summary-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.card-icon {
  font-size: 2.5rem;
}

.card-value {
  font-size: 1.75rem;
  font-weight: bold;
  color: var(--text-primary);
}

.card-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.card-trend {
  font-size: 0.875rem;
  font-weight: 600;
}

.card-trend.up { color: var(--color-error); }
.card-trend.down { color: var(--color-success); }
```

#### 2.2. TreemapChart Component

```javascript
// TreemapChart.js
export class TreemapChart {
  constructor(canvas, width, height) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = width
    this.height = height
    this.selectedMetric = 'cost' // or 'tokens', 'operations'
  }

  render(componentStats) {
    // componentStats = [{ component, cost, tokens, operations, percentage }, ...]

    // 1. Compute total for selected metric
    const total = componentStats.reduce((sum, c) => sum + c[this.selectedMetric], 0)

    // 2. Compute normalized areas
    const areas = componentStats.map(c => ({
      ...c,
      area: (c[this.selectedMetric] / total) * (this.width * this.height)
    }))

    // 3. Layout rectangles using squarified treemap algorithm
    const rects = this._layoutTreemap(areas, { x: 0, y: 0, width: this.width, height: this.height })

    // 4. Draw rectangles
    this._clear()
    rects.forEach(rect => this._drawRect(rect))
  }

  _layoutTreemap(items, bounds) {
    // Simplified squarified treemap algorithm
    // Sort items by value descending
    // Recursively partition space
    // Return array of { x, y, width, height, data }
  }

  _drawRect(rect) {
    // Fill rectangle with gradient based on efficiency
    // Stroke border
    // Draw label text (component name + percentage)
  }
}
```

#### 2.3. TrendsChart Component

```javascript
// TrendsChart.js
export class TrendsChart {
  constructor(canvas, width, height) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = width
    this.height = height
  }

  render(dailyData) {
    // dailyData = [{ date, cost, tokens, operations }, ...]

    this._clear()
    this._drawGrid()
    this._drawAxis()

    // Draw cost as area chart (primary)
    this._drawAreaLine(dailyData, 'cost', 'rgba(99, 102, 241, 0.3)')

    // Draw tokens as line chart (secondary)
    this._drawLine(dailyData, 'tokens', 'rgba(16, 185, 129, 1)')

    // Draw operations as line chart (tertiary)
    this._drawLine(dailyData, 'operations', 'rgba(251, 191, 36, 1)')

    this._drawLegend()
  }

  _drawAreaLine(data, key, color) {
    // Path with area fill under the line
  }

  _drawLine(data, key, color) {
    // Simple line without fill
  }

  _drawSparkline(data, key, container) {
    // Minimal inline sparkline using unicode block chars or tiny canvas
  }
}
```

#### 2.4. NormalizedChart Component

```javascript
// NormalizedChart.js
export class NormalizedChart {
  constructor(canvas, width, height) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = width
    this.height = height
    this.currentTab = 'costPerStory' // 'tokensPerStory', 'durationPerOp'
  }

  render(weeklyData, tab) {
    // weeklyData = [{ week, value, storyCount, normalizedValue, trend }, ...]
    this.currentTab = tab

    this._clear()
    this._drawGrid()
    this._drawBars(weeklyData)
    this._drawTrendLine(weeklyData)
    this._drawTrendIndicator(weeklyData)
  }

  _drawBars(data) {
    // Bar chart with color gradient based on value (green=good, red=bad)
  }

  _drawTrendLine(data) {
    // Linear regression line overlay
  }

  _drawTrendIndicator(data) {
    // % change from first week to last week, displayed in corner
  }
}
```

#### 2.5. ComponentTable Component

```javascript
// ComponentTable.js
export class ComponentTable {
  constructor(container) {
    this.container = container
    this.expandedRows = new Set()
    this.sortColumn = 'cost'
    this.sortDirection = 'desc'
  }

  render(componentStats) {
    // componentStats = [{ component, operations, cost, tokens, avgDuration, percentage }, ...]

    // Sort data
    const sorted = this._sortData(componentStats)

    // Render table
    const tableHTML = `
      <table class="component-table">
        <thead>
          <tr>
            <th data-sort="component">Component</th>
            <th data-sort="operations">Ops</th>
            <th data-sort="cost">Cost</th>
            <th data-sort="tokens">Tokens</th>
            <th data-sort="avgDuration">Avg Dur</th>
            <th>% of Total</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(row => this._renderRow(row)).join('')}
        </tbody>
      </table>
    `

    this.container.innerHTML = tableHTML
    this._bindEvents()
  }

  _renderRow(row) {
    const isExpanded = this.expandedRows.has(row.component)
    return `
      <tr class="component-row" data-component="${row.component}">
        <td>${row.component} ${isExpanded ? '▼' : '▶'}</td>
        <td>${row.operations}</td>
        <td>${this._formatCost(row.cost)}</td>
        <td>${this._formatTokens(row.tokens)}</td>
        <td>${this._formatDuration(row.avgDuration)}</td>
        <td>${row.percentage.toFixed(1)}%</td>
      </tr>
      ${isExpanded ? this._renderExpandedRow(row.component) : ''}
    `
  }

  _renderExpandedRow(component) {
    // Fetch operation-level data via IPC
    // Render sub-table
  }

  _bindEvents() {
    // Click row to expand/collapse
    // Click column header to sort
  }
}
```

#### 2.6. Update StatsView.js

```javascript
// StatsView.js - Main container
export class StatsView {
  constructor() {
    this.summaryCards = null
    this.treemap = null
    this.trendsChart = null
    this.normalizedChart = null
    this.componentTable = null
  }

  async init() {
    // Create container structure
    this.element = document.createElement('div')
    this.element.className = 'stats-view-v2'
    this.element.innerHTML = `
      <div class="stats-header">
        <h2>Stats Dashboard</h2>
        <button class="export-btn">🔄 Export</button>
      </div>

      <section class="summary-section">
        <div id="summary-cards"></div>
      </section>

      <section class="treemap-section">
        <h3>Component Breakdown</h3>
        <div class="treemap-controls">
          <label><input type="radio" name="metric" value="cost" checked> Cost</label>
          <label><input type="radio" name="metric" value="tokens"> Tokens</label>
          <label><input type="radio" name="metric" value="operations"> Operations</label>
        </div>
        <canvas id="treemap-canvas"></canvas>
      </section>

      <section class="trends-section">
        <h3>Daily Trends (Last 30 Days)</h3>
        <canvas id="trends-canvas"></canvas>
        <div class="sparklines">
          <div>Tokens: <span id="tokens-sparkline"></span></div>
          <div>Operations: <span id="ops-sparkline"></span></div>
        </div>
      </section>

      <section class="normalized-section">
        <h3>Normalized Efficiency (Weekly Trends)</h3>
        <div class="tabs">
          <button class="tab active" data-tab="costPerStory">Cost/Story</button>
          <button class="tab" data-tab="tokensPerStory">Tokens/Story</button>
          <button class="tab" data-tab="durationPerOp">Duration/Op</button>
        </div>
        <canvas id="normalized-canvas"></canvas>
      </section>

      <section class="table-section">
        <h3>Component Performance</h3>
        <div id="component-table"></div>
      </section>
    `

    // Initialize sub-components
    this.summaryCards = new SummaryCards(this.element.querySelector('#summary-cards'))
    this.treemap = new TreemapChart(...)
    this.trendsChart = new TrendsChart(...)
    this.normalizedChart = new NormalizedChart(...)
    this.componentTable = new ComponentTable(this.element.querySelector('#component-table'))

    // Fetch data and render
    await this.fetchAndRender()
  }

  async fetchAndRender() {
    try {
      // Fetch all data in parallel
      const [summary, components, daily, weekly] = await Promise.all([
        window.puffin.plugins.invoke('stats-plugin', 'getMetricsSummary'),
        window.puffin.plugins.invoke('stats-plugin', 'getComponentStats'),
        window.puffin.plugins.invoke('stats-plugin', 'getDailyTrends'),
        window.puffin.plugins.invoke('stats-plugin', 'getWeeklyNormalized', { metric: 'costPerStory' })
      ])

      // Render all components
      this.summaryCards.render(summary)
      this.treemap.render(components)
      this.trendsChart.render(daily)
      this.normalizedChart.render(weekly, 'costPerStory')
      this.componentTable.render(components)

    } catch (err) {
      this._showError(err)
    }
  }
}
```

**Acceptance Criteria**:
- [ ] All 5 UI components render without errors
- [ ] Treemap interaction (click, hover) works
- [ ] Charts resize on window resize
- [ ] Table sorting and expansion work
- [ ] Export button generates correct output
- [ ] Loading states displayed during data fetch
- [ ] Error states handled gracefully
- [ ] Dark mode compatible

---

### Phase 3: Utilities and Polish

**Tasks**:

1. **Extend Formatters** (`src/utils/formatters.js`)
   ```javascript
   export function formatTokens(tokens) {
     if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
     if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
     return tokens.toString()
   }

   export function formatPercentChange(current, previous) {
     const change = ((current - previous) / previous) * 100
     return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
   }

   export function formatComponentName(component) {
     // Shorten component names for display
     const map = {
       'claude-service': 'Claude',
       'cre-plan': 'CRE Plan',
       'cre-ris': 'CRE RIS',
       'cre-assertion': 'CRE Assertions',
       'memory-plugin': 'Memory',
       'outcome-lifecycle-plugin': 'Outcomes'
     }
     return map[component] || component
   }
   ```

2. **Extend Markdown Exporter** (`src/utils/markdown-exporter.js`)
   ```javascript
   export function generateMetricsReport(summary, components, daily, weekly) {
     let md = `# Stats Report\n\n`
     md += `**Generated:** ${new Date().toISOString()}\n\n`

     md += `## Summary (Last 30 Days)\n\n`
     md += `- Total Cost: ${formatCost(summary.total30d.cost)}\n`
     md += `- Total Tokens: ${formatTokens(summary.total30d.tokens)}\n`
     md += `- Avg Cost/Story: ${formatCost(summary.perStory.cost)}\n`
     md += `- Avg Tokens/Story: ${formatTokens(summary.perStory.tokens)}\n\n`

     md += `## Component Breakdown\n\n`
     md += `| Component | Operations | Cost | Tokens | Avg Duration |\n`
     md += `|-----------|------------|------|--------|-------------|\n`
     components.forEach(c => {
       md += `| ${c.component} | ${c.operations} | ${formatCost(c.cost)} | ${formatTokens(c.tokens)} | ${formatDuration(c.avgDuration)} |\n`
     })

     // Add daily and weekly sections...

     return md
   }
   ```

3. **Add CSV Exporter**
   ```javascript
   export function generateCSV(data, type) {
     // Convert JSON to CSV
     // Handle different data types (components, daily, weekly)
   }
   ```

4. **Add Sparkline Renderer** (`src/utils/sparkline.js`)
   ```javascript
   export function renderSparkline(values, container) {
     // Unicode block chars: ▁▂▃▄▅▆▇█
     // Or tiny canvas (20px height)
   }
   ```

---

### Phase 4: Testing and Documentation

**Testing Tasks**:

1. **Unit Tests** (`tests/stats-plugin.test.js`)
   - Test all 5 new IPC handlers
   - Test normalization calculations
   - Test trend computations
   - Test formatters and exporters

2. **Integration Tests**
   - Test full data flow (metrics_events → IPC → renderer)
   - Test with empty database (no metrics)
   - Test with large datasets (10,000+ events)

3. **Visual Regression Tests**
   - Screenshot comparison for each chart/component
   - Test dark mode rendering

**Documentation Tasks**:

1. **Update IMPLEMENTATION_STATUS.md**
   - Document v2.0.0 architecture
   - List all new features
   - Migration guide from v1.0.0

2. **Add User Guide** (`docs/STATS-PLUGIN-USER-GUIDE.md`)
   - How to read each chart
   - What each metric means
   - How to optimize based on stats

3. **Add Developer Guide** (`docs/STATS-PLUGIN-DEV-GUIDE.md`)
   - Component architecture
   - Data flow diagrams
   - How to add new visualizations

---

## Migration Strategy

### Backward Compatibility

**Approach**: Dual mode support

```javascript
// In StatsView.js
async init() {
  // Check if MetricsService is available
  const hasMetrics = await this._checkMetricsAvailability()

  if (hasMetrics) {
    this._initV2() // New metrics-based UI
  } else {
    this._initV1() // Legacy history-based UI
  }
}

async _checkMetricsAvailability() {
  try {
    const result = await window.puffin.plugins.invoke('stats-plugin', 'getMetricsSummary')
    return result && result.total30d
  } catch {
    return false
  }
}
```

**Fallback Behavior**:
- If `metrics_events` table is empty → show "No data yet" message with explanation
- If MetricsService unavailable → fall back to legacy history-based stats
- If user_stories table empty → show absolute metrics only (no normalization)

---

## Performance Considerations

### Query Optimization

**Expected Query Times** (30-day window):

| Query | Expected Rows | Index Used | Est. Time |
|-------|---------------|------------|-----------|
| Daily totals (30 days) | ~30 | `idx_metrics_events_created` | < 10ms |
| Component stats | ~6 groups | `idx_metrics_events_component_type` | < 20ms |
| Weekly normalized | ~12 weeks | `idx_metrics_events_created` + join | < 50ms |
| Story metrics | ~100 events | `idx_metrics_events_story_id` | < 15ms |

**Caching Strategy**:
- Cache component stats for 5 minutes (low churn)
- Cache daily trends for 1 minute (updates frequently)
- Invalidate cache on new metrics events (via event listener)

### Rendering Performance

**Canvas Optimization**:
- Debounce resize events (300ms)
- Use `requestAnimationFrame` for animations
- Implement viewport culling for large datasets
- Lazy-load operation-level data (only on expand)

---

## Open Questions

1. **Metric Prioritization**: Should we prioritize cost or tokens as the default metric?
   - **Recommendation**: Cost (more business-relevant)

2. **Time Range Defaults**: 30 days vs 7 days vs 90 days?
   - **Recommendation**: 30 days (balances recency with trend visibility)

3. **Normalization Denominator**: Per story, per sprint, or per week?
   - **Recommendation**: Per story (most actionable for optimization)

4. **Component Grouping**: Should we group CRE operations under single "CRE" component?
   - **Recommendation**: No, keep separate for granular insights

5. **Real-time Updates**: Should stats auto-refresh during active development?
   - **Recommendation**: Yes, poll every 60 seconds when view is active

---

## Success Metrics

**Quantitative**:
- [ ] All queries execute in < 100ms (p95)
- [ ] UI renders in < 500ms from data fetch
- [ ] No memory leaks after 1 hour of use
- [ ] Export completes in < 2 seconds for 30 days of data

**Qualitative**:
- [ ] User can identify most expensive component in < 5 seconds
- [ ] User can understand efficiency trends without documentation
- [ ] User can drill down to operation-level details in < 3 clicks
- [ ] Export format is readable and shareable

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Data Layer | 2 days | MetricsService deployed |
| Phase 2: UI Components | 4 days | Phase 1 complete |
| Phase 3: Utilities | 1 day | Phase 2 complete |
| Phase 4: Testing & Docs | 2 days | Phase 3 complete |
| **Total** | **9 days** | - |

**Buffer**: +2 days for unforeseen issues

---

## Appendix

### A. SQL Query Examples

**Component Stats (Last 30 Days)**:
```sql
SELECT
  component,
  COUNT(*) as operation_count,
  COALESCE(SUM(total_tokens), 0) as total_tokens,
  COALESCE(SUM(cost_usd), 0) as total_cost,
  COALESCE(AVG(duration_ms), 0) as avg_duration,
  (COALESCE(SUM(cost_usd), 0) * 100.0 / (
    SELECT SUM(cost_usd) FROM metrics_events
    WHERE event_type = 'complete'
    AND created_at >= date('now', '-30 days')
  )) as percentage
FROM metrics_events
WHERE event_type = 'complete'
  AND created_at >= date('now', '-30 days')
GROUP BY component
ORDER BY total_cost DESC
```

**Daily Trends**:
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as operations,
  COALESCE(SUM(total_tokens), 0) as tokens,
  COALESCE(SUM(cost_usd), 0) as cost
FROM metrics_events
WHERE event_type = 'complete'
  AND created_at >= date('now', '-30 days')
GROUP BY DATE(created_at)
ORDER BY date ASC
```

**Weekly Normalized (Cost per Story)**:
```sql
WITH weekly_metrics AS (
  SELECT
    strftime('%Y-%W', created_at) as week,
    COALESCE(SUM(cost_usd), 0) as total_cost
  FROM metrics_events
  WHERE event_type = 'complete'
    AND created_at >= date('now', '-84 days')  -- 12 weeks
  GROUP BY week
),
weekly_stories AS (
  SELECT
    strftime('%Y-%W', created_at) as week,
    COUNT(DISTINCT id) as story_count
  FROM user_stories
  WHERE created_at >= date('now', '-84 days')
  GROUP BY week
)
SELECT
  wm.week,
  wm.total_cost,
  COALESCE(ws.story_count, 0) as story_count,
  CASE
    WHEN COALESCE(ws.story_count, 0) > 0
    THEN wm.total_cost / ws.story_count
    ELSE 0
  END as cost_per_story
FROM weekly_metrics wm
LEFT JOIN weekly_stories ws ON wm.week = ws.week
ORDER BY wm.week ASC
```

### B. Color Palette

**Component Colors** (for treemap):
```javascript
const COMPONENT_COLORS = {
  'claude-service': '#6366f1',    // Indigo
  'cre-plan': '#8b5cf6',          // Violet
  'cre-ris': '#a855f7',           // Purple
  'cre-assertion': '#d946ef',     // Fuchsia
  'memory-plugin': '#10b981',     // Emerald
  'outcome-lifecycle-plugin': '#14b8a6'  // Teal
}
```

**Efficiency Gradient** (for normalized charts):
- Green (#10b981): Good (below average)
- Yellow (#fbbf24): OK (near average)
- Red (#ef4444): Bad (above average)

---

**End of Plan**
