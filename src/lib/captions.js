/**
 * Caption fetching via Gladia's Whisper API.
 * Gladia accepts YouTube URLs directly — their servers fetch the audio,
 * so our IP (or any cloud IP) is never blocked by YouTube.
 *
 * Free tier: 10 hours/month recurring. Get a key at app.gladia.io
 */

import { getCachedCaptions, setCachedCaptions } from './storage.js'

export const LANGUAGE_CODES = {
  Polish: 'pl', Japanese: 'ja', Spanish: 'es', French: 'fr', German: 'de',
  Italian: 'it', Portuguese: 'pt', Russian: 'ru', Arabic: 'ar',
  Chinese: 'zh-Hans', Korean: 'ko', Hindi: 'hi',
}

const GLADIA_BASE = 'https://api.gladia.io/v2'
const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang = settings.targetLanguage || 'Japanese'

  // Check cache first
  const cached = await getCachedCaptions(videoId, lang)
  if (cached) { onProgress?.('Loaded from cache', 100); return cached }

  const apiKey = settings.gladiaApiKey?.trim()
  if (!apiKey) throw new Error('No Gladia API key. Get a free key at app.gladia.io then add it in Settings.')

  onProgress?.('Submitting to Gladia…', 8)

  // Submit transcription job with YouTube URL
  const submitRes = await fetch(`${GLADIA_BASE}/pre-recorded`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gladia-key': apiKey },
    body: JSON.stringify({
      audio_url: `https://www.youtube.com/watch?v=${videoId}`,
      detect_language: true,
      sentences: true,
      context_prompt: videoMeta?.title || '',
    }),
  })

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}))
    const msg = err?.message || err?.detail || `HTTP ${submitRes.status}`
    if (submitRes.status === 401) throw new Error('Invalid Gladia API key. Check Settings.')
    if (submitRes.status === 429) throw new Error('Gladia quota exceeded. Free tier: 10 hours/month.')
    throw new Error(`Gladia submission failed: ${msg}`)
  }

  const { id, result_url } = await submitRes.json()
  if (!id) throw new Error('Gladia did not return a job ID')

  onProgress?.('Transcribing audio… (3–10 minutes for a typical video)', 15)

  // Poll until done
  const pollUrl = result_url || `${GLADIA_BASE}/pre-recorded/${id}`
  const result = await pollGladia(pollUrl, apiKey, onProgress)

  onProgress?.('Processing transcript…', 90)

  const raw = parseResult(result)
  if (!raw?.length) throw new Error('Gladia returned an empty transcript. The video may have no speech.')

  onProgress?.('Saving to cache…', 96)
  await setCachedCaptions(videoId, lang, raw)

  onProgress?.('Done', 100)
  return raw
}

async function pollGladia(url, apiKey, onProgress) {
  const MAX = 90       // 90 × 5s = 7.5 minutes max
  const INTERVAL = 5000

  for (let i = 1; i <= MAX; i++) {
    await sleep(INTERVAL)

    const res = await fetch(url, { headers: { 'x-gladia-key': apiKey } })
    if (!res.ok) throw new Error(`Poll failed: HTTP ${res.status}`)

    const data = await res.json()

    if (data.status === 'done') return data.result
    if (data.status === 'error') throw new Error(`Gladia error: ${data.error_message || 'transcription failed'}`)

    // Progress from 15% → 85% while waiting
    const pct = Math.min(15 + (i / MAX) * 70, 85)
    const elapsed = Math.round(i * INTERVAL / 1000)
    onProgress?.(`Transcribing… ${elapsed}s elapsed`, pct)
  }

  throw new Error('Transcription timed out after 7.5 minutes. Try a shorter video.')
}

function parseResult(result) {
  const segments = []

  // Gladia returns sentences or utterances depending on version
  const items = (
    result?.transcription?.sentences ||
    result?.transcription?.utterances ||
    []
  )

  for (const item of items) {
    const text = (item.sentence || item.text || item.transcript || '')
      .replace(/\n/g, ' ').trim()
    if (!text) continue

    segments.push({
      start: Math.round((item.start ?? 0) * 1000),
      end:   Math.round((item.end   ?? (item.start + 3)) * 1000),
      text,
    })
  }

  // Fallback: if no segments, split full transcript roughly
  if (!segments.length && result?.transcription?.full_transcript) {
    const words = result.transcription.full_transcript.split(' ')
    const chunkSize = 10
    for (let i = 0; i < words.length; i += chunkSize) {
      segments.push({
        start: i * 500,
        end:   (i + chunkSize) * 500,
        text:  words.slice(i, i + chunkSize).join(' '),
      })
    }
  }

  return segments
}
