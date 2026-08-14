/**
 * Doctor Panel — the health report, grouped and honest.
 *
 * Failures sort to the top with the suggested fix beside them, because the
 * reason anyone opens this is that something is broken and the working checks
 * are not what they came for. A skipped check is rendered as skipped rather
 * than folded into "ok": "we could not test this" and "this works" are
 * different answers, and conflating them is how a doctor starts lying.
 */

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

const MARKS = { ok: '✓', warn: '!', fail: '✗', skip: '–' }
const ORDER = { fail: 0, warn: 1, skip: 2, ok: 3 }

export class DoctorPanelComponent {
  constructor() {
    this.container = null
    this.button = null
    this.report = null
    this.isRunning = false
    this.isOpen = false
  }

  init() {
    this.container = document.getElementById('doctor-panel')
    this.button = document.getElementById('doctor-btn')
    if (!this.container || !this.button) return

    this.button.addEventListener('click', () => this.toggle())
    this.container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action
      if (action === 'rerun') this.run()
      else if (action === 'close') this.toggle(false)
    })
  }

  toggle(open = !this.isOpen) {
    this.isOpen = open
    this.container.classList.toggle('hidden', !open)
    if (open && !this.report && !this.isRunning) this.run()
    else this.render()
  }

  async run() {
    this.isRunning = true
    this.render()
    try {
      const result = await window.puffin.doctor.run()
      this.report = result?.success
        ? result
        : { checks: [], summary: {}, error: result?.error || 'the doctor could not run' }
    } catch (error) {
      this.report = { checks: [], summary: {}, error: error.message }
    } finally {
      this.isRunning = false
      this.render()
    }
  }

  render() {
    if (!this.container || !this.isOpen) return
    const report = this.report

    if (this.isRunning) {
      this.container.innerHTML = `
        <div class="doctor-head">
          <span class="doctor-title">Checking…</span>
        </div>
        <div class="doctor-running">Probing the CLI, GLM, Polygraph, the workflow runtime and this project.</div>`
      return
    }

    if (!report) return
    if (report.error) {
      this.container.innerHTML = `
        <div class="doctor-head">
          <span class="doctor-title">Doctor</span>
          <span class="doctor-head-actions">
            <button class="btn btn-secondary btn-sm" data-action="rerun">Run again</button>
            <button class="btn btn-secondary btn-sm" data-action="close">Close</button>
          </span>
        </div>
        <div class="doctor-fail-note">✗ ${esc(report.error)}</div>`
      return
    }

    const { ok = 0, warn = 0, fail = 0, skip = 0 } = report.summary || {}
    const groups = new Map()
    for (const check of report.checks) {
      if (!groups.has(check.group)) groups.set(check.group, [])
      groups.get(check.group).push(check)
    }
    // Groups with problems first; checks within a group likewise.
    const worst = list => Math.min(...list.map(c => ORDER[c.status] ?? 9))
    const ordered = [...groups.entries()].sort(([, a], [, b]) => worst(a) - worst(b))

    this.container.innerHTML = `
      <div class="doctor-head">
        <span class="doctor-title">Doctor</span>
        <span class="doctor-summary">
          ${fail ? `<span class="doctor-mark doctor-fail">${fail} failing</span>` : ''}
          ${warn ? `<span class="doctor-mark doctor-warn">${warn} to look at</span>` : ''}
          ${skip ? `<span class="doctor-mark doctor-skip">${skip} not tested</span>` : ''}
          <span class="doctor-mark doctor-ok">${ok} ok</span>
        </span>
        <span class="doctor-head-actions">
          <button class="btn btn-secondary btn-sm" data-action="rerun">Run again</button>
          <button class="btn btn-secondary btn-sm" data-action="close">Close</button>
        </span>
      </div>

      ${!fail && !warn ? '<div class="doctor-clean">Everything Puffin depends on is answering.</div>' : ''}

      ${ordered.map(([group, checks]) => `
        <div class="doctor-group">
          <div class="doctor-group-name">${esc(group)}</div>
          ${checks.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)).map(check => `
            <div class="doctor-check doctor-${esc(check.status)}">
              <span class="doctor-check-mark">${MARKS[check.status] || '?'}</span>
              <div class="doctor-check-body">
                <div class="doctor-check-label">${esc(check.label)}</div>
                <div class="doctor-check-detail">${esc(check.detail)}</div>
                ${check.fix ? `<div class="doctor-check-fix">→ ${esc(check.fix)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    `
  }
}
