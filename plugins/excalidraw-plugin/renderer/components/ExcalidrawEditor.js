/**
 * ExcalidrawEditor - React wrapper for Excalidraw component
 *
 * Bridges the Excalidraw React component with Puffin's vanilla JS view system.
 * Handles API reference forwarding and state synchronization.
 */

// Note: These will be imported via window.React/ReactDOM when available
// Excalidraw will be loaded via dynamic import to avoid bundling issues

class ExcalidrawEditor {
  /**
   * Create Excalidraw React element
   * @param {Object} props - Component properties
   * @param {Object} props.initialData - Initial scene data {elements, appState, files}
   * @param {string} props.theme - 'light' or 'dark'
   * @param {Function} props.onChange - Callback when scene changes (elements, appState, files)
   * @param {Function} props.onAPIReady - Callback when Excalidraw API is ready
   * @returns {ReactElement} React element
   */
  static createReactElement(props) {
    const { initialData, theme, onChange, onAPIReady } = props

    // Will be set by dynamic import
    let Excalidraw = null

    // Try to load Excalidraw from window if already imported
    if (window.Excalidraw) {
      Excalidraw = window.Excalidraw
    } else {
      // Placeholder until loaded
      return window.React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontSize: '1.5rem',
          color: 'var(--text-secondary)'
        }
      }, 'Loading Excalidraw...')
    }

    return window.React.createElement(Excalidraw, {
      initialData: initialData || { elements: [], appState: {}, files: {} },
      theme: theme || 'light',
      onChange: (elements, appState, files) => {
        if (onChange) {
          onChange(elements, appState, files)
        }
      },
      excalidrawAPI: (api) => {
        if (api && onAPIReady) {
          onAPIReady(api)
        }
      },
      // Excalidraw configuration
      langCode: 'en',
      viewModeEnabled: false,
      gridModeEnabled: false,
      zenModeEnabled: false,
      UIOptions: {
        canvasActions: {
          saveAsImage: true,
          loadScene: false,
          export: false,
          saveToActiveFile: false,
          toggleTheme: false
        }
      }
    })
  }

  /**
   * Load Excalidraw via require (works in Electron renderer with CommonJS)
   * Must be called before createReactElement can succeed
   * @returns {Promise<void>}
   */
  static async loadExcalidraw() {
    if (window.Excalidraw) {
      return // Already loaded
    }

    // Load the pre-bundled script that sets window.React, window.ReactDOM, window.Excalidraw
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      // Resolve path relative to the plugin's renderer directory
      const pluginBase = new URL('.', import.meta.url).pathname
        .replace(/^\/([A-Z]:)/, '$1') // Fix Windows drive letter
        .replace(/\/components\/$/, '/')
      script.src = `file://${pluginBase}excalidraw-bundle.js`
      script.onload = () => {
        console.log('[ExcalidrawEditor] Excalidraw bundle loaded successfully')
        resolve()
      }
      script.onerror = (err) => {
        console.error('[ExcalidrawEditor] Failed to load Excalidraw bundle:', err)
        reject(new Error('Failed to load Excalidraw bundle'))
      }
      document.head.appendChild(script)
    })

    if (!window.Excalidraw) {
      throw new Error('Excalidraw not found on window after bundle load')
    }
  }
}

// ES module export
export { ExcalidrawEditor }
export default ExcalidrawEditor
