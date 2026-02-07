/**
 * Bundle entry point for Excalidraw + React dependencies
 *
 * This gets bundled by esbuild into a single file that exposes
 * React, ReactDOM, and Excalidraw on the window object.
 * Required because Electron's sandboxed renderer cannot use require().
 */
import React from 'react'
import ReactDOM from 'react-dom'
import { Excalidraw, exportToCanvas, exportToSvg, exportToBlob } from '@excalidraw/excalidraw'

window.React = React
window.ReactDOM = ReactDOM
window.Excalidraw = Excalidraw
window.exportToCanvas = exportToCanvas
window.exportToSvg = exportToSvg
window.exportToBlob = exportToBlob
