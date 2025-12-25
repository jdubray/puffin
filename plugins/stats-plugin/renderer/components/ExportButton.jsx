import React, { useState } from 'react'
import '../styles/export-button.css'

/**
 * ExportButton - Button to export stats table as Markdown
 * Handles file save dialog and success/error notifications
 *
 * @param {Object} props
 * @param {Function} props.onExport - Callback that returns markdown content
 * @param {Function} props.onSuccess - Callback when export succeeds
 * @param {Function} props.onError - Callback when export fails
 * @param {boolean} props.disabled - Whether button is disabled
 */
function ExportButton({ onExport, onSuccess, onError, disabled = false }) {
  const [exporting, setExporting] = useState(false)

  async function handleClick() {
    if (exporting || disabled) return

    setExporting(true)

    try {
      // Get markdown content from parent
      const content = onExport()

      if (!content) {
        throw new Error('No content to export')
      }

      // Request file save dialog via IPC
      const result = await window.puffin.ipc.invoke('plugin:stats-plugin:showSaveDialog', {
        defaultPath: generateDefaultFilename(),
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      // User cancelled
      if (!result.success || !result.data?.filePath) {
        setExporting(false)
        return
      }

      // Save the file
      const saveResult = await window.puffin.ipc.invoke('plugin:stats-plugin:saveMarkdownExport', {
        content,
        filePath: result.data.filePath
      })

      if (saveResult.success) {
        onSuccess?.(result.data.filePath)
      } else {
        throw new Error(saveResult.error || 'Failed to save file')
      }
    } catch (err) {
      console.error('Export failed:', err)
      onError?.(err.message)
    } finally {
      setExporting(false)
    }
  }

  /**
   * Generate a default filename for the export
   * @returns {string} Suggested filename
   */
  function generateDefaultFilename() {
    const date = new Date().toISOString().split('T')[0]
    return `stats-report-${date}.md`
  }

  return (
    <button
      className={`export-button ${exporting ? 'export-button--exporting' : ''}`}
      onClick={handleClick}
      disabled={disabled || exporting}
      aria-busy={exporting}
      title="Save table as Markdown file"
    >
      <span className="export-button-icon" aria-hidden="true">
        {exporting ? '⏳' : '📄'}
      </span>
      <span className="export-button-text">
        {exporting ? 'Saving...' : 'Save as Markdown'}
      </span>
    </button>
  )
}

export default ExportButton
