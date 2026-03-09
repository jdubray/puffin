/**
 * Puffin - Speech Service
 *
 * Transcribes audio buffers via an OpenAI-compatible Whisper API endpoint.
 * Uses only Node.js built-in modules (https) — no additional npm dependencies.
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

const DEFAULT_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe'

class SpeechService {
  /**
   * Transcribe an audio buffer using an OpenAI-compatible Whisper endpoint.
   *
   * @param {Buffer} audioBuffer - Raw audio bytes (webm/opus from MediaRecorder)
   * @param {string} apiKey      - API key for the endpoint
   * @param {string} [apiUrl]    - Endpoint URL (defaults to OpenAI's transcription endpoint)
   * @param {string} [model]     - Model name (defaults to gpt-4o-mini-transcribe)
   * @returns {Promise<string>}  - Transcribed text
   */
  async transcribe(audioBuffer, apiKey, apiUrl = DEFAULT_API_URL, model = DEFAULT_MODEL) {
    if (!apiKey) throw new Error('No Speech API key configured')
    if (!audioBuffer || audioBuffer.length === 0) throw new Error('Empty audio buffer')

    // Build multipart/form-data payload manually — avoids form-data npm dep
    const boundary = `----PuffinSpeech${Date.now()}${Math.random().toString(36).slice(2)}`
    const CRLF = '\r\n'

    const partModel = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
      `${model}${CRLF}`
    )
    const partFileHeader = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="audio.webm"${CRLF}` +
      `Content-Type: audio/webm${CRLF}${CRLF}`
    )
    const partFileFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)

    const body = Buffer.concat([partModel, partFileHeader, audioBuffer, partFileFooter])

    const parsed = new URL(apiUrl)
    const transport = parsed.protocol === 'https:' ? https : http

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + (parsed.search || ''),
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
          }
        },
        (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8')
            if (res.statusCode === 200) {
              try {
                const json = JSON.parse(raw)
                resolve((json.text || '').trim())
              } catch {
                reject(new Error('Speech API returned invalid JSON'))
              }
            } else {
              // Surface the API's error message if available
              let msg = `Speech API error ${res.statusCode}`
              try {
                const json = JSON.parse(raw)
                if (json.error?.message) msg += `: ${json.error.message}`
              } catch { /* ignore */ }
              reject(new Error(msg))
            }
          })
        }
      )

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }
}

// Singleton
let instance = null

/**
 * @returns {SpeechService}
 */
function getInstance() {
  if (!instance) instance = new SpeechService()
  return instance
}

module.exports = { getInstance }
