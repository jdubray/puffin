#!/usr/bin/env node
/**
 * Generates build/icon.png (1024×1024 RGB PNG) using only Node.js built-ins.
 * No external dependencies required.
 */
'use strict'

const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 1024
const SCALE = 24 // each font pixel → 24×24 screen pixels

// Background: deep indigo #1a237e
const BG = [26, 35, 126]
// Text: white
const FG = [255, 255, 255]
// Accent bar: electric cyan #00e5ff
const ACCENT = [0, 229, 255]

// 5-wide × 7-tall bitmap font
const FONT = {
  P: [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  U: [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  F: [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  I: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[1,1,1,1,1]],
  N: [[1,0,0,0,1],[1,1,0,0,1],[1,0,1,0,1],[1,0,0,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
}

// ── pixel buffer (RGB, 3 bytes per pixel) ──────────────────────────────────
const pixels = new Uint8Array(SIZE * SIZE * 3)

// fill background
for (let i = 0; i < pixels.length; i += 3) {
  pixels[i] = BG[0]; pixels[i + 1] = BG[1]; pixels[i + 2] = BG[2]
}

function setPixel(x, y, color) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
  const i = (y * SIZE + x) * 3
  pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]
}

function fillRect(x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(x + dx, y + dy, color)
}

function drawChar(ch, ox, oy) {
  const rows = FONT[ch]
  if (!rows) return
  const dot = SCALE - 2 // leave a 2px gap between font pixels
  for (let row = 0; row < rows.length; row++)
    for (let col = 0; col < rows[row].length; col++)
      if (rows[row][col])
        fillRect(ox + col * SCALE, oy + row * SCALE, dot, dot, FG)
}

// ── render "PUFFIN" centered ────────────────────────────────────────────────
const text = 'PUFFIN'
const charW = 5 * SCALE
const charH = 7 * SCALE
const gap = Math.round(SCALE * 0.8)
const totalW = text.length * charW + (text.length - 1) * gap
const startX = Math.floor((SIZE - totalW) / 2)
const startY = Math.floor((SIZE - charH) / 2)

for (let i = 0; i < text.length; i++) {
  drawChar(text[i], startX + i * (charW + gap), startY)
}

// ── accent bar below text ───────────────────────────────────────────────────
const barY = startY + charH + Math.round(SCALE * 0.6)
const barH = Math.round(SCALE * 0.35)
fillRect(startX, barY, totalW, barH, ACCENT)

// ── PNG encoding ────────────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++)
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// raw scanlines: filter byte 0 (None) + RGB per row
const rowStride = 1 + SIZE * 3
const raw = Buffer.allocUnsafe(SIZE * rowStride)
for (let y = 0; y < SIZE; y++) {
  raw[y * rowStride] = 0 // filter type: None
  for (let x = 0; x < SIZE; x++) {
    const src = (y * SIZE + x) * 3
    const dst = y * rowStride + 1 + x * 3
    raw[dst] = pixels[src]; raw[dst + 1] = pixels[src + 1]; raw[dst + 2] = pixels[src + 2]
  }
}

const IHDR = Buffer.allocUnsafe(13)
IHDR.writeUInt32BE(SIZE, 0)
IHDR.writeUInt32BE(SIZE, 4)
IHDR[8] = 8 // bit depth
IHDR[9] = 2 // color type: RGB
IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0

const compressed = zlib.deflateSync(raw, { level: 6 })

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const png = Buffer.concat([
  PNG_SIG,
  makeChunk('IHDR', IHDR),
  makeChunk('IDAT', compressed),
  makeChunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(__dirname, '..', 'build', 'icon.png')
fs.writeFileSync(outPath, png)
console.log(`Generated ${outPath} (${SIZE}×${SIZE}, ${Math.round(png.length / 1024)} KB)`)
