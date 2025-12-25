Excellent! Now I have a complete understanding of the data architecture. Let me create the full specification.

---

# Branch Statistics Plugin - Full Specification

## 1. Plugin Overview

| Field | Value |
|-------|-------|
| **Name** | `puffin-branch-stats` |
| **Display Name** | Branch Statistics |
| **Description** | Aggregates thread statistics by week across all branches, displaying in a dedicated tab with tables and charts |
| **Version** | 1.0.0 |

---

## 2. Feature Requirements

### 2.1 Core Features

| ID | Feature | Priority |
|----|---------|----------|
| F1 | Add "Stats" tab at same level as Git tab in sidebar | High |
| F2 | Collect and aggregate statistics from all branches/threads | High |
| F3 | Group statistics by week (ISO week format) | High |
| F4 | Display weekly summary in table format | High |
| F5 | Display weekly trends in chart format | High |
| F6 | Persist aggregated stats for performance | Medium |
| F7 | Auto-refresh when new responses complete | Medium |

### 2.2 Statistics to Collect

Based on the data available in `history.json`, the following metrics can be aggregated:

| Metric | Source | Aggregation |
|--------|--------|-------------|
| **Total Prompts** | Count of prompts | Sum per week |
| **Total Responses** | Count of responses | Sum per week |
| **Total Turns** | `response.turns` | Sum per week |
| **Total Duration** | `response.duration` (ms) | Sum per week |
| **Total Cost** | `response.cost` | Sum per week |
| **Files Modified** | `response.filesModified.length` | Sum unique per week |
| **Average Turns per Response** | Computed | Avg per week |
| **Average Duration per Response** | Computed | Avg per week |
| **Active Branches** | Branches with activity | Count per week |

### 2.3 Data Sources

```
.puffin/history.json
├── branches
│   ├── specifications
│   │   └── prompts[] → { timestamp, response: { turns, duration, cost, filesModified } }
│   ├── ui
│   │   └── prompts[]
│   ├── backend
│   │   └── prompts[]
│   └── feature/xxx
│       └── prompts[]
```

---

## 3. User Interface Specification

### 3.1 Tab Placement

The Stats tab should appear in the sidebar navigation alongside existing tabs:

```
┌─────────────────┐
│ 📋 
Config       │
│ 💬 
Prompt       │
│ 🎨 
Designer     │
│ 📝 
Stories      │
│ 🏗️ 
Architecture │
│ 💻 
CLI Output   │
│ ⎇  Git          │
│ 📊 
Stats        │  ← NEW TAB
│ 👤 
Profile      │
└─────────────────┘
```

### 3.2 Stats Panel Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ 📊 
Branch Statistics                                    [↻ Refresh] │
├────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │                     WEEKLY TREND CHART                        │   │
│ │                                                               │   │
│ │     ▓▓▓                                                       │   │
│ │     ▓▓▓  ▓▓▓                    ▓▓▓                           │   │
│ │     ▓▓▓  ▓▓▓  ▓▓▓         ▓▓▓  ▓▓▓  ▓▓▓                      │   │
│ │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓              │   │
│ │  ─────────────────────────────────────────────                │   │
│ │  W48  W49  W50  W51  W52  W01  W02  W03  W04                  │   │
│ │                                                               │   │
│ │  Legend: ■ Prompts  ■ Turns  ■ Cost ($)                       │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │                    WEEKLY SUMMARY TABLE                       │   │
│ ├──────┬─────────┬───────┬──────────┬────────┬────────┬───────┤   │
│ │ Week │ Prompts │ Turns │ Duration │  Cost  │ Files  │Branches│   │
│ ├──────┼─────────┼───────┼──────────┼────────┼────────┼───────┤   │
│ │ W04  │    42   │  185  │  2h 15m  │ $12.50 │   38   │   4   │   │
│ │ W03  │    38   │  156  │  1h 48m  │ $10.20 │   29   │   3   │   │
│ │ W02  │    25   │   98  │  1h 12m  │  $7.80 │   21   │   2   │   │
│ │ W01  │    31   │  142  │  1h 35m  │  $9.45 │   25   │   3   │   │
│ │ ...  │   ...   │  ...  │   ...    │  ...   │  ...   │  ...  │   │
│ └──────┴─────────┴───────┴──────────┴────────┴────────┴───────┘   │
│                                                                     │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │                   BRANCH BREAKDOWN (Current Week)             │   │
│ ├──────────────────┬─────────┬───────┬──────────┬──────────────┤   │
│ │ Branch           │ Prompts │ Turns │ Duration │ Last Active  │   │
│ ├──────────────────┼─────────┼───────┼──────────┼──────────────┤   │
│ │ specifications   │   12    │  45   │   32m    │ 2h ago       │   │
│ │ ui               │   18    │  82   │  1h 15m  │ 30m ago      │   │
│ │ backend          │    8    │  38   │   28m    │ 1d ago       │   │
│ │ feature/plugins  │    4    │  20   │   15m    │ 4h ago       │   │
│ └──────────────────┴─────────┴───────┴──────────┴──────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 Chart Specifications

| Property | Value |
|----------|-------|
| **Chart Type** | Bar chart (grouped) |
| **X-Axis** | Week labels (W01, W02, etc.) |
| **Y-Axis** | Metric values (auto-scaled) |
| **Series** | Prompts (blue), Turns (green), Cost (orange) |
| **Weeks Shown** | Last 12 weeks |
| **Library** | Canvas-based (no external deps) or simple SVG |

---

## 4. Technical Architecture

### 4.1 Plugin Structure

```
~/.puffin/plugins/puffin-branch-stats/
├── puffin-plugin.json          # Plugin manifest
├── index.js                    # Main entry point (backend)
├── lib/
│   ├── stats-aggregator.js     # Statistics calculation logic
│   └── week-utils.js           # ISO week date utilities
└── README.md                   # Plugin documentation
```

### 4.2 Plugin Manifest

```json
{
  "name": "puffin-branch-stats",
  "version": "1.0.0",
  "displayName": "Branch Statistics",
  "description": "Aggregates thread statistics by week across all branches with table and chart display",
  "main": "index.js",
  "author": "Puffin Team",
  "license": "MIT",
  "keywords": ["statistics", "analytics", "branches", "metrics"],
  "extensionPoints": {
    "ipcHandlers": [
      "getWeeklyStats",
      "getBranchBreakdown",
      "getCurrentWeekStats",
      "refreshStats"
    ],
    "components": ["stats-panel"]
  },
  "contributions": {
    "views": [
      {
        "id": "stats",
        "title": "Stats",
        "icon": "📊",
        "order": 7
      }
    ]
  },
  "activationEvents": ["onStartup"]
}
```

### 4.3 Backend IPC Handlers

| Handler | Input | Output |
|---------|-------|--------|
| `getWeeklyStats` | `{ weeks?: number }` | `WeeklyStats[]` |
| `getBranchBreakdown` | `{ weekId: string }` | `BranchStats[]` |
| `getCurrentWeekStats` | none | `WeeklyStats` |
| `refreshStats` | none | `{ success: boolean }` |

### 4.4 Data Types

```typescript
interface WeeklyStats {
  weekId: string           // "2025-W04"
  weekLabel: string        // "W04"
  startDate: string        // "2025-01-20"
  endDate: string          // "2025-01-26"
  prompts: number
  responses: number
  totalTurns: number
  totalDurationMs: number
  totalCost: number
  filesModified: number
  activeBranches: number
  avgTurnsPerResponse: number
  avgDurationPerResponse: number
}

interface BranchStats {
  branchId: string
  branchName: string
  prompts: number
  responses: number
  turns: number
  durationMs: number
  cost: number
  filesModified: number
  lastActiveAt: number     // timestamp
}
```

---

## 5. Acceptance Criteria

### Story: View Weekly Branch Statistics

**As a developer**, I want to view weekly aggregated statistics across all branches **so that** I can track my development progress over time.

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Stats tab appears in sidebar navigation at same level as Git tab | Visual inspection |
| 2 | Clicking Stats tab displays the statistics panel | Click action works |
| 3 | Weekly statistics table shows last 12 weeks of data | Table renders with correct week labels |
| 4 | Each week row shows: prompts, turns, duration, cost, files modified, active branches | All columns populated |
| 5 | Duration is formatted as human-readable (e.g., "2h 15m") | Format verification |
| 6 | Cost is formatted as currency (e.g., "$12.50") | Format verification |
| 7 | Chart displays weekly trends for prompts, turns, and cost | Chart renders with 3 series |
| 8 | Branch breakdown section shows per-branch stats for selected week | Clicking week row updates breakdown |
| 9 | Refresh button recalculates statistics from history | Click refresh, verify update |
| 10 | Statistics persist in plugin storage for fast load | Check storage file exists |
| 11 | New responses automatically update statistics | Complete a response, verify stats update |

---

## 6. Implementation Considerations

### 6.1 UI Integration Challenge

The current plugin system supports registering components, but **adding a new sidebar view requires renderer-side integration** that goes beyond what the current plugin API supports.

**Options:**

| Option | Description | Complexity |
|--------|-------------|------------|
| A | Extend plugin system to support view registration | High - requires core changes |
| B | Create stats as sub-tab within existing view | Medium - uses current patterns |
| C | Add stats via configuration (not pure plugin) | Low - but not plugin-based |

**Recommendation:** For Phase 1, implement Option B - add Stats as a tab within the Git panel (similar to Status/Branches/Changes/History tabs). This uses existing patterns and demonstrates plugin UI capabilities.

### 6.2 Data Access

The plugin needs to read `.puffin/history.json` to calculate statistics. This requires:

1. **IPC handler** to read history data from main process
2. **Service injection** for the plugin to access file system

Current plugin context provides `getService()` - need to verify if a history/state service is exposed.

### 6.3 Performance

For large histories:
- Cache aggregated statistics in plugin storage
- Only recalculate on demand or when new responses complete
- Subscribe to `response:completed` events for incremental updates

---

## 7. Dependencies

### 7.1 Plugin System Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Plugin lifecycle (activate/deactivate) | ✅ 
Available | Core plugin system |
| IPC handler registration | ✅ 
Available | `registerIpcHandler()` |
| Plugin storage | ✅ 
Available | `context.storage` |
| Event subscription | ✅ 
Available | `context.subscribe()` |
| Component registration | ✅ 
Available | `registerComponent()` |
| View/tab registration | ❌ 
Not available | Requires enhancement |

### 7.2 Required Enhancements

To fully implement this plugin with its own sidebar tab:

1. **View Registration API** - Allow plugins to register new sidebar views
2. **History Access Service** - Expose history data to plugins via service
3. **Renderer Component Mounting** - Allow plugin components to be mounted in renderer

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| View registration not supported | High | Use sub-tab within Git panel as fallback |
| Large history files slow down stats | Medium | Implement caching and incremental updates |
| Chart rendering without library | Low | Use simple SVG bars, no external deps |
| Plugin storage not working | Low | Already tested in plugin system |

---

## 9. Implementation Phases

### Phase 1: Backend Statistics Engine
- Create stats aggregation logic
- Implement IPC handlers
- Add plugin storage caching
- Subscribe to response events

### Phase 2: UI Integration (Sub-tab)
- Add Stats tab to Git panel
- Render statistics table
- Implement basic chart

### Phase 3: Full View (Requires Core Enhancement)
- Add view registration to plugin API
- Create standalone Stats view
- Enhanced chart with interactions

---

## 10. Open Questions

1. **Should stats include all historical data or just recent (e.g., last 6 months)?**
   - Recommendation: Include all data, but default view shows last 12 weeks

2. **Should the chart be interactive (hover for details)?**
   - Recommendation: Phase 1 - static chart; Phase 2 - add tooltips

3. **Should stats be exportable (CSV/JSON)?**
   - Recommendation: Add export feature in Phase 2

4. **How should weeks without activity be displayed?**
   - Recommendation: Show row with zeros, or skip gaps > 4 weeks

---

## Summary

This specification defines a **Branch Statistics Plugin** that:

1. **Aggregates** thread statistics from `.puffin/history.json`
2. **Groups by week** using ISO week format
3. **Displays** in table format with weekly summaries
4. **Visualizes** trends using a simple bar chart
5. **Provides** branch-level breakdown for each week

The plugin leverages the existing plugin system for backend logic and storage, with UI integration depending on available extension points. A phased approach allows for incremental delivery while identifying core enhancements needed for full sidebar integration.