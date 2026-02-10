/**
 * ComponentPerformanceTable - Sortable, expandable component stats table.
 *
 * Features:
 * - Columns: Component, Operations, Cost, Tokens, Avg Duration, % of Total
 * - Click column header to sort (asc/desc toggle)
 * - Click row to expand inline operation-level sub-table
 * - Search/filter by component name
 * - Export to CSV or Markdown
 */

const COMPONENT_DISPLAY_NAMES = {
  'claude-service': 'Claude Service',
  'cre-plan': 'CRE Plan Generator',
  'cre-ris': 'CRE RIS Generator',
  'cre-assertion': 'CRE Assertion Generator',
  'hdsl-engine': 'h-DSL Engine',
  'memory-plugin': 'Memory Plugin',
  'outcomes-plugin': 'Outcomes Plugin',
  'skills-system': 'Skills System'
}

const COLUMNS = [
  { id: 'component', label: 'Component', sortable: true, align: 'left' },
  { id: 'operations', label: 'Operations', sortable: true, align: 'right' },
  { id: 'totalCost', label: 'Cost', sortable: true, align: 'right' },
  { id: 'totalTokens', label: 'Tokens', sortable: true, align: 'right' },
  { id: 'avgDuration', label: 'Avg Duration', sortable: true, align: 'right' },
  { id: 'pctOfCost', label: '% of Total', sortable: true, align: 'right' }
]

const OP_COLUMNS = [
  { id: 'operation', label: 'Operation', align: 'left' },
  { id: 'count', label: 'Count', align: 'right' },
  { id: 'totalCost', label: 'Cost', align: 'right' },
  { id: 'totalTokens', label: 'Tokens', align: 'right' },
  { id: 'avgDuration', label: 'Avg Duration', align: 'right' },
  { id: 'avgCostPerOp', label: 'Avg Cost/Op', align: 'right' }
]

export class ComponentPerformanceTable {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} [options]
   * @param {Function} [options.invoke] - IPC invoke function
   */
  constructor(element, options = {}) {
    this.container = element
    this.invoke = options.invoke || ((plugin, handler, args) =>
      window.puffin.plugins.invoke(plugin, handler, args))

    // State
    this.breakdown = null      // getComponentBreakdown() result
    this.sortCol = 'totalCost'
    this.sortDir = 'desc'
    this.filter = ''
    this.expandedComponent = null  // component id or null
    this.expandedData = null       // getOperationStats() result
    this.loading = false
    this.expandLoading = false
  }

  async init() {
    this.render()
    await this.fetchData()
  }

  async fetchData() {
    this.loading = true
    this.render()

    try {
      this.breakdown = await this.invoke('stats-plugin', 'getComponentBreakdown', { days: 30 })
    } catch (err) {
      console.error('[ComponentPerformanceTable] fetchData failed:', err)
      this.breakdown = null
    }

    this.loading = false
    this.render()
  }

  async fetchOperationStats(componentId) {
    this.expandLoading = true
    this.render()

    try {
      this.expandedData = await this.invoke('stats-plugin', 'getOperationStats', {
        component: componentId,
        days: 30
      })
    } catch (err) {
      console.error('[ComponentPerformanceTable] fetchOperationStats failed:', err)
      this.expandedData = null
    }

    this.expandLoading = false
    this.render()
  }

  // ── Render ───────────────────────────────────────────────────

  render() {
    if (!this.container) return
    this.container.innerHTML = ''
    this.container.className = 'perf-table-component'

    // Header bar: title + search + export
    const header = document.createElement('div')
    header.className = 'perf-table-header'
    header.innerHTML = `
      <h3 class="perf-table-title">Component Performance</h3>
      <div class="perf-table-controls">
        <input type="text" class="perf-table-search" placeholder="Filter components..."
               value="${this._escapeAttr(this.filter)}" />
        <button class="perf-table-export-btn" title="Export">Export</button>
      </div>
    `
    this.container.appendChild(header)

    // Attach control listeners
    const searchInput = header.querySelector('.perf-table-search')
    searchInput.addEventListener('input', (e) => {
      this.filter = e.target.value
      this.render()
      // Refocus and restore cursor position
      const newInput = this.container.querySelector('.perf-table-search')
      if (newInput) {
        newInput.focus()
        newInput.setSelectionRange(newInput.value.length, newInput.value.length)
      }
    })

    header.querySelector('.perf-table-export-btn').addEventListener('click', () => {
      this._showExportMenu()
    })

    // Loading
    if (this.loading) {
      const el = document.createElement('div')
      el.className = 'perf-table-loading'
      el.textContent = 'Loading...'
      this.container.appendChild(el)
      return
    }

    const components = this._getSortedFilteredRows()
    if (components.length === 0) {
      const el = document.createElement('div')
      el.className = 'perf-table-empty'
      el.textContent = this.filter ? 'No components match filter' : 'No data available'
      this.container.appendChild(el)
      return
    }

    // Table
    const tableWrap = document.createElement('div')
    tableWrap.className = 'perf-table-scroll'
    const table = document.createElement('table')
    table.className = 'perf-table'

    // thead
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    for (const col of COLUMNS) {
      const th = document.createElement('th')
      th.className = `perf-th-${col.align}`
      if (col.sortable) {
        th.classList.add('perf-th-sortable')
        th.addEventListener('click', () => this._handleSort(col.id))
        if (this.sortCol === col.id) {
          th.classList.add(this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc')
        }
      }
      th.textContent = col.label
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    // tbody
    const tbody = document.createElement('tbody')
    for (const comp of components) {
      const isExpanded = this.expandedComponent === comp.component

      // Main row
      const tr = document.createElement('tr')
      tr.className = `perf-table-row${isExpanded ? ' expanded' : ''}`
      tr.addEventListener('click', () => this._handleRowClick(comp.component))

      tr.innerHTML = `
        <td class="perf-td-left">
          <span class="perf-expand-icon">${isExpanded ? '\u25BC' : '\u25B6'}</span>
          ${this._escapeHtml(ComponentPerformanceTable.displayName(comp.component))}
        </td>
        <td class="perf-td-right">${comp.operations.toLocaleString()}</td>
        <td class="perf-td-right">$${comp.totalCost.toFixed(2)}</td>
        <td class="perf-td-right">${ComponentPerformanceTable.abbreviateNumber(comp.totalTokens)}</td>
        <td class="perf-td-right">${ComponentPerformanceTable.formatDuration(comp.avgDuration)}</td>
        <td class="perf-td-right">${comp.pctOfCost}%</td>
      `
      tbody.appendChild(tr)

      // Expanded sub-table
      if (isExpanded) {
        const expandTr = document.createElement('tr')
        expandTr.className = 'perf-table-expand-row'
        const expandTd = document.createElement('td')
        expandTd.colSpan = COLUMNS.length
        expandTd.className = 'perf-table-expand-cell'

        if (this.expandLoading) {
          expandTd.innerHTML = '<div class="perf-table-loading">Loading operations...</div>'
        } else if (this.expandedData?.operations?.length > 0) {
          expandTd.appendChild(this._buildSubTable(this.expandedData.operations))
        } else {
          expandTd.innerHTML = '<div class="perf-table-empty">No operations found</div>'
        }

        expandTr.appendChild(expandTd)
        tbody.appendChild(expandTr)
      }
    }
    table.appendChild(tbody)

    // Totals footer
    if (this.breakdown?.totals) {
      const tfoot = document.createElement('tfoot')
      const footRow = document.createElement('tr')
      footRow.className = 'perf-table-total'
      const t = this.breakdown.totals
      footRow.innerHTML = `
        <td class="perf-td-left"><strong>Total</strong></td>
        <td class="perf-td-right"><strong>${t.operations.toLocaleString()}</strong></td>
        <td class="perf-td-right"><strong>$${t.totalCost.toFixed(2)}</strong></td>
        <td class="perf-td-right"><strong>${ComponentPerformanceTable.abbreviateNumber(t.totalTokens)}</strong></td>
        <td class="perf-td-right"></td>
        <td class="perf-td-right"><strong>100%</strong></td>
      `
      tfoot.appendChild(footRow)
      table.appendChild(tfoot)
    }

    tableWrap.appendChild(table)
    this.container.appendChild(tableWrap)
  }

  // ── Sub-table for expanded row ───────────────────────────────

  _buildSubTable(operations) {
    const table = document.createElement('table')
    table.className = 'perf-subtable'

    const thead = document.createElement('thead')
    const hRow = document.createElement('tr')
    for (const col of OP_COLUMNS) {
      const th = document.createElement('th')
      th.className = `perf-th-${col.align}`
      th.textContent = col.label
      hRow.appendChild(th)
    }
    thead.appendChild(hRow)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    for (const op of operations) {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td class="perf-td-left">${this._escapeHtml(op.operation)}</td>
        <td class="perf-td-right">${op.count.toLocaleString()}</td>
        <td class="perf-td-right">$${op.totalCost.toFixed(2)}</td>
        <td class="perf-td-right">${ComponentPerformanceTable.abbreviateNumber(op.totalTokens)}</td>
        <td class="perf-td-right">${ComponentPerformanceTable.formatDuration(op.avgDuration)}</td>
        <td class="perf-td-right">$${op.avgCostPerOp.toFixed(4)}</td>
      `
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)

    return table
  }

  // ── Sort / filter logic ──────────────────────────────────────

  _handleSort(colId) {
    if (this.sortCol === colId) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      this.sortCol = colId
      this.sortDir = colId === 'component' ? 'asc' : 'desc'
    }
    this.render()
  }

  _handleRowClick(componentId) {
    if (this.expandedComponent === componentId) {
      this.expandedComponent = null
      this.expandedData = null
      this.render()
    } else {
      this.expandedComponent = componentId
      this.expandedData = null
      this.fetchOperationStats(componentId)
    }
  }

  /**
   * Get sorted and filtered rows from breakdown data.
   * @returns {Object[]}
   */
  _getSortedFilteredRows() {
    if (!this.breakdown?.components) return []

    let rows = [...this.breakdown.components]

    // Filter
    if (this.filter) {
      const lowerFilter = this.filter.toLowerCase()
      rows = rows.filter(c => {
        const display = ComponentPerformanceTable.displayName(c.component).toLowerCase()
        const raw = c.component.toLowerCase()
        return display.includes(lowerFilter) || raw.includes(lowerFilter)
      })
    }

    // Sort
    return ComponentPerformanceTable.sortRows(rows, this.sortCol, this.sortDir)
  }

  // ── Export ───────────────────────────────────────────────────

  _showExportMenu() {
    const components = this._getSortedFilteredRows()
    if (components.length === 0) return

    // Create a simple dropdown
    const existing = this.container.querySelector('.perf-export-menu')
    if (existing) { existing.remove(); return }

    const menu = document.createElement('div')
    menu.className = 'perf-export-menu'
    menu.innerHTML = `
      <button class="perf-export-option" data-format="csv">Export CSV</button>
      <button class="perf-export-option" data-format="markdown">Export Markdown</button>
    `

    menu.addEventListener('click', (e) => {
      const format = e.target.dataset?.format
      if (format) {
        this._doExport(format, components)
        menu.remove()
      }
    })

    // Close on outside click
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove()
        document.removeEventListener('click', closeHandler, true)
      }
    }
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0)

    const btn = this.container.querySelector('.perf-table-export-btn')
    if (btn) {
      btn.parentElement.style.position = 'relative'
      btn.parentElement.appendChild(menu)
    }
  }

  async _doExport(format, components) {
    const content = format === 'csv'
      ? ComponentPerformanceTable.toCSV(components)
      : ComponentPerformanceTable.toMarkdown(components)

    const ext = format === 'csv' ? 'csv' : 'md'
    try {
      const dialogResult = await this.invoke('stats-plugin', 'showSaveDialog', {
        defaultPath: `component-performance.${ext}`,
        filters: format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (!dialogResult?.filePath) return

      await this.invoke('stats-plugin', 'saveMarkdownExport', {
        content,
        filePath: dialogResult.filePath
      })
    } catch (err) {
      console.error('[ComponentPerformanceTable] Export failed:', err)
    }
  }

  // ── Static helpers (testable without DOM) ────────────────────

  /**
   * Sort an array of component rows by the given column and direction.
   * @param {Object[]} rows
   * @param {string} col - Column id
   * @param {string} dir - 'asc' or 'desc'
   * @returns {Object[]} New sorted array
   */
  static sortRows(rows, col, dir) {
    const mult = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const aVal = col === 'component'
        ? ComponentPerformanceTable.displayName(a.component)
        : (a[col] ?? 0)
      const bVal = col === 'component'
        ? ComponentPerformanceTable.displayName(b.component)
        : (b[col] ?? 0)

      if (typeof aVal === 'string') {
        return mult * aVal.localeCompare(bVal)
      }
      return mult * (aVal - bVal)
    })
  }

  /**
   * Get display name for a component.
   */
  static displayName(componentId) {
    if (!componentId) return ''
    return COMPONENT_DISPLAY_NAMES[componentId] || componentId
  }

  /**
   * Generate CSV from component rows.
   * @param {Object[]} rows
   * @returns {string}
   */
  static toCSV(rows) {
    if (!rows || rows.length === 0) return ''

    const headers = ['Component', 'Operations', 'Cost', 'Tokens', 'Avg Duration (ms)', '% of Cost']
    const lines = [headers.join(',')]

    for (const r of rows) {
      const fields = [
        ComponentPerformanceTable.csvEscape(ComponentPerformanceTable.displayName(r.component)),
        String(r.operations),
        r.totalCost.toFixed(4),
        String(r.totalTokens),
        String(r.avgDuration),
        String(r.pctOfCost)
      ]
      lines.push(fields.join(','))
    }
    return lines.join('\n')
  }

  /**
   * Generate Markdown table from component rows.
   * @param {Object[]} rows
   * @returns {string}
   */
  static toMarkdown(rows) {
    if (!rows || rows.length === 0) return ''

    const lines = []
    lines.push('# Component Performance Report')
    lines.push('')
    lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`)
    lines.push('')
    lines.push('| Component | Operations | Cost | Tokens | Avg Duration | % of Cost |')
    lines.push('|-----------|-----------|------|--------|-------------|-----------|')

    for (const r of rows) {
      const name = ComponentPerformanceTable.displayName(r.component)
      lines.push(
        `| ${name} | ${r.operations.toLocaleString()} | $${r.totalCost.toFixed(2)} | ${ComponentPerformanceTable.abbreviateNumber(r.totalTokens)} | ${ComponentPerformanceTable.formatDuration(r.avgDuration)} | ${r.pctOfCost}% |`
      )
    }

    return lines.join('\n')
  }

  /**
   * Escape a value for CSV.
   */
  static csvEscape(val) {
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  /**
   * Abbreviate a number: 1500 → "1.5k", 2500000 → "2.5M"
   */
  static abbreviateNumber(n) {
    if (n == null || isNaN(n)) return '0'
    if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
    if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
    return String(Math.round(n))
  }

  /**
   * Format milliseconds compactly.
   */
  static formatDuration(ms) {
    if (!ms || ms <= 0) return '0s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s % 60}s`
    return `${s}s`
  }

  // ── Helpers ──────────────────────────────────────────────────

  _escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = String(text)
    return div.innerHTML
  }

  _escapeAttr(text) {
    if (!text) return ''
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
    this.breakdown = null
    this.expandedData = null
  }
}

export default ComponentPerformanceTable
