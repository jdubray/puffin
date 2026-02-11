/**
 * SummaryCards - Metrics summary cards with trend indicators
 *
 * Displays 4 key metric cards:
 * - Total Cost (30d)
 * - Avg Cost/Story
 * - Total Operations (30d)
 * - Avg Operations/Story
 *
 * Each card shows an icon, formatted value, label, and trend indicator
 * (% change vs previous period) with color coding.
 *
 * Note: Token counts are not available from Claude CLI, so we display
 * operation counts instead as a proxy for activity level.
 */
export class SummaryCards {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} [options]
   * @param {Object} [options.data] - Metrics summary data (from getMetricsSummary)
   * @param {string} [options.mode='mixed'] - Display mode: 'prompt' (prompt-level only), 'story' (story-level only), or 'mixed' (both)
   */
  constructor(element, options = {}) {
    this.container = element
    this.data = options.data || null
    this.mode = options.mode || 'mixed'
  }

  /**
   * Update data and re-render
   * @param {Object} data - Metrics summary data
   */
  update(data) {
    this.data = data
    this.render()
  }

  /**
   * Render the summary cards
   */
  render() {
    if (!this.container) return

    const cards = this._buildCardDefinitions()
    this.container.innerHTML = ''
    this.container.className = 'metrics-summary-cards'

    for (const card of cards) {
      this.container.appendChild(this._createCardElement(card))
    }
  }

  /**
   * Build card definitions from current data
   * @returns {Array<Object>}
   */
  _buildCardDefinitions() {
    const summary = this.data
    const current = summary?.current || {}
    const comparison = summary?.comparison || {}
    const perStory = summary?.perStory || {}

    // Prompt-level cards (raw prompt metrics)
    if (this.mode === 'prompt') {
      return [
        {
          icon: '💰',
          value: SummaryCards.formatCost(current.totalCost),
          label: 'Total Cost (30d)',
          trend: comparison.totalCost,
          invertColor: true
        },
        {
          icon: '💵',
          value: current.operations > 0
            ? SummaryCards.formatCost(current.totalCost / current.operations)
            : '$0.00',
          label: 'Avg Cost / Operation',
          trend: null,
          subtitle: `${current.operations || 0} operations`,
          invertColor: true
        },
        {
          icon: '🔢',
          value: SummaryCards.formatNumber(current.operations),
          label: 'Total Operations (30d)',
          trend: comparison.operations,
          invertColor: false
        },
        {
          icon: '⏱️',
          value: current.operations > 0
            ? SummaryCards.formatDuration(Math.round(current.totalDuration / current.operations))
            : '0s',
          label: 'Avg Duration / Op',
          trend: null,
          subtitle: SummaryCards.formatDuration(current.totalDuration),
          invertColor: false
        }
      ]
    }

    // Mixed mode (default - includes story-level metrics)
    return [
      {
        icon: '💰',
        value: SummaryCards.formatCost(current.totalCost),
        label: 'Total Cost (30d)',
        trend: comparison.totalCost,
        invertColor: true
      },
      {
        icon: '📊',
        value: SummaryCards.formatCost(perStory.avgCostPerStory),
        label: 'Avg Cost / Story',
        trend: null,
        subtitle: perStory.storyCount != null ? `${perStory.storyCount} stories` : null,
        invertColor: true
      },
      {
        icon: '🔢',
        value: SummaryCards.formatNumber(current.operations),
        label: 'Total Operations (30d)',
        trend: comparison.operations,
        invertColor: false
      },
      {
        icon: '📈',
        value: SummaryCards.formatNumber(Math.round((current.operations || 0) / (perStory.storyCount || 1))),
        label: 'Avg Operations / Story',
        trend: null,
        subtitle: perStory.storyCount != null ? `${perStory.storyCount} stories` : null,
        invertColor: false
      }
    ]
  }

  /**
   * Create a single card DOM element
   * @param {Object} card - Card definition
   * @returns {HTMLElement}
   */
  _createCardElement(card) {
    const el = document.createElement('div')
    el.className = 'metrics-card'

    const trend = SummaryCards.formatPercentChange(card.trend)
    const trendClass = this._getTrendClass(trend.direction, card.invertColor)

    let trendHtml = ''
    if (card.trend != null) {
      const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : ''
      trendHtml = `
        <span class="metrics-card-trend ${trendClass}">
          ${arrow} ${this._escapeHtml(trend.text)}
        </span>
      `
    }

    let subtitleHtml = ''
    if (card.subtitle) {
      subtitleHtml = `<span class="metrics-card-subtitle">${this._escapeHtml(card.subtitle)}</span>`
    }

    el.innerHTML = `
      <div class="metrics-card-icon">${this._escapeHtml(card.icon)}</div>
      <div class="metrics-card-body">
        <div class="metrics-card-value-row">
          <span class="metrics-card-value">${this._escapeHtml(card.value)}</span>
          ${trendHtml}
        </div>
        <div class="metrics-card-label">${this._escapeHtml(card.label)}</div>
        ${subtitleHtml}
      </div>
    `
    return el
  }

  /**
   * Get CSS class for trend direction.
   * For cost metrics (invertColor=true): up=bad(red), down=good(green).
   *
   * @param {string} direction - 'up'|'down'|'neutral'
   * @param {boolean} invertColor - Whether to invert color meaning
   * @returns {string} CSS class
   */
  _getTrendClass(direction, invertColor) {
    if (direction === 'neutral') return 'trend-neutral'
    if (invertColor) {
      return direction === 'up' ? 'trend-bad' : 'trend-good'
    }
    return direction === 'up' ? 'trend-good' : 'trend-bad'
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  _escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = String(text)
    return div.innerHTML
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
    this.data = null
  }

  // ── Static formatting helpers (inline to avoid CJS/ESM mismatch) ──

  /**
   * @param {number} cost
   * @returns {string}
   */
  static formatCost(cost) {
    if (typeof cost !== 'number' || isNaN(cost)) return '$0.00'
    return `$${cost.toFixed(2)}`
  }

  /**
   * @param {number} num
   * @returns {string}
   */
  static formatNumber(num) {
    if (num == null || typeof num !== 'number' || isNaN(num)) return '0'
    if (num >= 1000000) {
      const v = num / 1000000
      return v % 1 === 0 ? `${v}M` : `${parseFloat(v.toFixed(1))}M`
    }
    if (num >= 1000) {
      const v = num / 1000
      return v % 1 === 0 ? `${v}k` : `${parseFloat(v.toFixed(1))}k`
    }
    return String(num)
  }

  /**
   * @param {number} pct
   * @returns {{ text: string, direction: string }}
   */
  static formatPercentChange(pct) {
    if (pct == null || typeof pct !== 'number' || isNaN(pct)) {
      return { text: '—', direction: 'neutral' }
    }
    if (pct === 0) return { text: '0%', direction: 'neutral' }
    const sign = pct > 0 ? '+' : ''
    const rounded = parseFloat(pct.toFixed(1))
    return {
      text: `${sign}${rounded}%`,
      direction: pct > 0 ? 'up' : 'down'
    }
  }

  /**
   * @param {number} ms - Duration in milliseconds
   * @returns {string}
   */
  static formatDuration(ms) {
    if (!ms || ms === 0) return '0s'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }
}

export default SummaryCards
