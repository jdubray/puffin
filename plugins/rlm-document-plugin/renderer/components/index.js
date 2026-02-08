/**
 * RLM Document Plugin - Renderer Entry Point
 *
 * This module exports all renderer components for the RLM Document Plugin.
 * Components are vanilla JavaScript classes (no JSX) following Puffin's plugin architecture.
 *
 * The plugin provides document analysis capabilities using the Recursive Language Model
 * pattern, allowing iterative exploration and evidence extraction from large documents.
 *
 * Component Architecture:
 * - RLMDocumentView: Main orchestrating panel with fixed flexbox layout
 * - SessionStatusDisplay: Session state and REPL connection indicator
 * - DocumentPicker: File selection with drag-drop and recent files
 * - QueryPanel: Query input with type selector (peek, grep, query)
 * - ResultsTree: Collapsible tree view of query results
 * - ChunkInspector: Detail view with Prism.js syntax highlighting
 * - ExportControls: Export functionality with format selection
 *
 * Usage:
 * The Puffin plugin loader will import this module and instantiate
 * the RLMDocumentView component when the user navigates to the plugin view.
 *
 * @module rlm-document-plugin/renderer
 */

// Export the main view component
export { RLMDocumentView, default as default } from './RLMDocumentView.js'

// Export sub-components for potential standalone use or testing
export { SessionStatusDisplay } from './SessionStatusDisplay.js'
export { DocumentPicker } from './DocumentPicker.js'
export { QueryPanel } from './QueryPanel.js'
export { ResultsTree } from './ResultsTree.js'
export { ChunkInspector } from './ChunkInspector.js'
export { ExportControls } from './ExportControls.js'
export { Toast, ToastManager, toastManager } from './Toast.js'
