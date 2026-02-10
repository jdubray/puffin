/**
 * SummaryCards - Metrics summary cards with trend indicators
 *
 * Displays 4 key metric cards:
 * - Total Cost (30d)
 * - Avg Cost/Story
 * - Total Tokens (30d)
 * - Avg Tokens/Story
 *
 * Each card shows an icon, formatted value, label, and trend indicator
 * (% change vs previous period) with color coding.
 */
export class SummaryCards {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} [options]
   * @param {Object} [options.data] - Metrics summary data (from getMetricsSummary)
   */
  constructor(element, options = {}) {
    this.container = element
    this.data = options.data || null
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

    return [
      {
        icon: '💰',
        value: SummaryCards.formatCost(current.totalCost),
        label: 'Total Cost (30d)',
        trend: comparison.totalCost,
        invertColor: true // cost increase = red
      },
      {
        icon: '📊',
        value: SummaryCards.formatCost(perStory.avgCostPerStory),
        label: 'Avg Cost / Story',
        trend: null, // no comparison for per-story
        subtitle: perStory.storyCount != null ? `${perStory.storyCount} stories` : null,
        invertColor: true
      },
      {
        icon: '🔤',
        value: SummaryCards.formatTokens(current.totalTokens),
        label: 'Total Tokens (30d)',
        trend: comparison.totalTokens,
        invertColor: true // more tokens = more cost, so red
      },
      {
        icon: '📈',
        value: SummaryCards.formatTokens(perStory.avgTokensPerStory),
        label: 'Avg Tokens / Story',
        trend: null,
        subtitle: perStory.storyCount != null ? `${perStory.storyCount} stories` : null,
        invertColor: true
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
      <div class="metrics-card-icon">${card.icon}</div>
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
   * @param {number} tokens
   * @returns {string}
   */
  static formatTokens(tokens) {
    if (tokens == null || typeof tokens !== 'number' || isNaN(tokens)) return '0'
    if (tokens >= 1000000) {
      const v = tokens / 1000000
      return v % 1 === 0 ? `${v}M` : `${parseFloat(v.toFixed(1))}M`
    }
    if (tokens >= 1000) {
      const v = tokens / 1000
      return v % 1 === 0 ? `${v}k` : `${parseFloat(v.toFixed(1))}k`
    }
    return String(tokens)
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
}

export default SummaryCards
