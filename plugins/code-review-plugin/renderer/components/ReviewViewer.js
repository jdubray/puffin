export class ReviewViewer {
  constructor(container, pluginContext, { story }) {
    this._container = container
    this._story = story
    this._selectedItems = new Set()
    this._actionItems = []
    this._branches = []
    this._currentBranch = ''
  }

  async init() {
    this._container.innerHTML = '<div class="cr-review-loading">Loading review…</div>'

    try {
      const [docData, stateData] = await Promise.all([
        window.puffin.plugins.invoke('code-review-plugin', 'getReviewDoc', { storyId: this._story.id }),
        window.puffin.state.get()
      ])

      const { markdown } = docData
      const branchMap = stateData?.history?.branches || {}
      this._branches = Object.values(branchMap).map(b => ({ id: b.id, name: b.name }))
      this._currentBranch = stateData?.history?.activeBranch || ''

      this._actionItems = this._parseActionItems(markdown)
      this._render(markdown)
    } catch (err) {
      this._container.innerHTML = `<div class="cr-error">Failed to load review: ${this._esc(err.message)}</div>`
    }
  }

  _parseActionItems(markdown) {
    const items = []
    const lines = markdown.split('\n')
    let idx = 0

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue

      const sevMatch = /\*\*\[(critical|important|info)\]\*\*/i.exec(trimmed)
      if (!sevMatch) continue
      const severity = sevMatch[1].toLowerCase()

      // Extract rule ID from the text after the **[SEVERITY]** tag
      const afterTag = trimmed.slice(sevMatch.index + sevMatch[0].length).trim()
      const ruleMatch = /^([A-Z][A-Z_]{2,29})/.exec(afterTag)
      const fileMatch = /([a-z][\w/\\.-]+\.(?:js|ts|json|css|html))(?::(\d+))?/.exec(trimmed)

      const description = trimmed
        .replace(/^[-*]\s+/, '')
        .replace(/\*\*\[.*?\]\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      items.push({
        id: `ai-${idx++}`,
        severity,
        rule: ruleMatch ? ruleMatch[1] : 'FINDING',
        file: fileMatch ? fileMatch[1] : '',
        line: fileMatch && fileMatch[2] ? parseInt(fileMatch[2], 10) : null,
        description
      })
    }

    return items
  }

  _render(markdown) {
    const branchOptions = this._branches.map(b =>
      `<option value="${this._esc(b.id)}" ${b.id === this._currentBranch ? 'selected' : ''}>${this._esc(b.name)}</option>`
    ).join('')

    const itemRows = this._actionItems.length === 0
      ? '<p class="cr-no-findings">No tagged findings in this review.</p>'
      : this._actionItems.map(item => `
          <label class="cr-action-item cr-sev-${this._esc(item.severity)}" data-item-id="${this._esc(item.id)}">
            <input type="checkbox" class="cr-item-chk" data-id="${this._esc(item.id)}">
            <span class="cr-sev-badge cr-severity-${this._esc(item.severity)}">${this._esc(item.severity)}</span>
            <code class="cr-rule">${this._esc(item.rule)}</code>
            <span class="cr-item-file">${item.file ? this._esc(item.file) + (item.line ? `:${this._esc(String(item.line))}` : '') : ''}</span>
            <span class="cr-item-desc">${this._esc(item.description)}</span>
          </label>
        `).join('')

    this._container.innerHTML = `
      <div class="cr-review-viewer">
        <div class="cr-action-items-section">
          <div class="cr-section-header">
            <strong>Action Items (${this._actionItems.length})</strong>
            <div class="cr-fix-controls">
              ${this._branches.length > 0
                ? `<select class="cr-branch-select cr-fix-branch">${branchOptions}</select>`
                : ''}
              <button class="cr-btn cr-btn-primary cr-fix-btn">Fix Selected</button>
            </div>
          </div>
          <div class="cr-action-items-list">${itemRows}</div>
        </div>
        <div class="cr-review-doc-section">
          <div class="cr-review-doc">${this._markdownToHtml(markdown)}</div>
        </div>
      </div>
    `

    this._container.querySelectorAll('.cr-item-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const id = chk.dataset.id
        if (chk.checked) {
          this._selectedItems.add(id)
          chk.closest('.cr-action-item')?.classList.add('cr-item-selected')
        } else {
          this._selectedItems.delete(id)
          chk.closest('.cr-action-item')?.classList.remove('cr-item-selected')
        }
      })
    })

    this._container.querySelector('.cr-fix-btn').addEventListener('click', () => this._fixSelected())
  }

  _fixSelected() {
    const selected = this._actionItems.filter(i => this._selectedItems.has(i.id))
    if (selected.length === 0) {
      window.puffin?.toast?.show?.('Select one or more findings first', 'info')
      return
    }

    const branchId = this._container.querySelector('.cr-fix-branch')?.value || this._currentBranch
    const branchName = this._branches.find(b => b.id === branchId)?.name || branchId

    const findingLines = selected.map((item, n) => {
      const loc = item.file ? `\n   File: ${item.file}${item.line ? ':' + item.line : ''}` : ''
      return `${n + 1}. [${item.severity.toUpperCase()}] ${item.rule}${loc}\n   Issue: ${item.description}`
    }).join('\n\n')

    const prompt = [
      `Fix the following ${selected.length} code review finding${selected.length > 1 ? 's' : ''} in the "${this._story.title}" story (branch: ${branchName}).`,
      ``,
      `## Findings`,
      ``,
      findingLines,
      ``,
      `## Instructions`,
      ``,
      `For each finding listed above:`,
      `1. Read the file at the specified path and line`,
      `2. Identify the exact issue described`,
      `3. Apply the minimal correct fix`,
      `4. State what you changed and why`,
      ``,
      `Do not fix anything not listed above.`,
    ].join('\n')

    try {
      window.puffin.claude.submit({ prompt, branchId })
      window.puffin?.toast?.show?.(`Submitted fix prompt for ${selected.length} finding(s) to Claude`, 'info')
    } catch {
      navigator.clipboard?.writeText?.(prompt).then(() => {
        window.puffin?.toast?.show?.(`Fix prompt for ${selected.length} finding(s) copied to clipboard — paste into the Prompt panel`, 'info')
      }).catch(() => {
        window.puffin?.toast?.show?.('Could not submit or copy fix prompt', 'error')
      })
    }
  }

  _markdownToHtml(md) {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n\n+/g, '</p><p>')
  }

  destroy() { this._container.innerHTML = '' }

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
