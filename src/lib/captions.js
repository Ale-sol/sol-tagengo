/**
 * Caption fetching via YouTube's InnerTube API.
 * Much more reliable than HTML parsing or the timedtext endpoint.
 *
 * Requires the Cloudflare Worker proxy (see README).
 * Update your Worker to support POST requests — see README for updated Worker code.
 */

import { fixCaptions } from './llm.js'
import { getCachedCaptions, setCachedCaptions } from './storage.js'

export const LANGUAGE_CODES = {
  Polish: 'pl',
  Japanese: 'ja',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Russian: 'ru',
  Arabic: 'ar',
  Chinese: 'zh-Hans',
  Korean: 'ko',
  Hindi: 'hi',
}

// YouTube InnerTube API key (public, embedded in YouTube web app)
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const INNERTUBE_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`

/**
 * Main entry point.
 * Returns processed captions array: [{start, end, text}]
 */
export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang = settings.targetLanguage || 'Japanese'
  const langCode = LANGUAGE_CODES[lang] || lang.toLowerCase()

  // Check cache
  const cached = await getCachedCaptions(videoId, lang)
  if (cached) {
    onProgress?.('Loaded from cache', 100)
    return cached
  }

  if (!settings.proxyUrl) {
    throw new Error('Caption Proxy URL not set. Add your Cloudflare Worker URL in Settings → save.')
  }

  const proxy = settings.proxyUrl.replace(/\/$/, '')

  onProgress?.('Fetching video data from YouTube…', 15)

  // 1. Get player data via InnerTube API
  let playerData
  try {
    playerData = await fetchPlayerData(videoId, proxy)
  } catch (e) {
    throw new Error(`YouTube API error: ${e.message}`)
  }

  onProgress?.('Finding caption track…', 35)

  // 2. Find caption track URL
  let trackUrl
  try {
    trackUrl = findCaptionTrack(playerData, langCode, lang)
  } catch (e) {
    throw new Error(e.message)
  }

  onProgress?.('Downloading captions…', 50)

  // 3. Fetch the caption data
  let raw
  try {
    raw = await fetchCaptionTrack(trackUrl, proxy)
  } catch (e) {
    throw new Error(`Caption download failed: ${e.message}`)
  }

  if (!raw || raw.length === 0) {
    throw new Error(`No ${lang} captions found for this video.`)
  }

  onProgress?.('Fixing sentence breaks with AI…', 65)

  // 4. Fix segmentation with LLM
  let processed
  try {
    processed = await fixCaptions(raw, lang, videoMeta.title, videoMeta.description, settings)
  } catch (e) {
    console.warn('LLM segmentation fix failed, using raw captions:', e)
    processed = raw
  }

  onProgress?.('Saving…', 95)
  await setCachedCaptions(videoId, lang, processed)

  onProgress?.('Done', 100)
  return processed
}

// ── InnerTube player API ──────────────────────────────────────────────────────

async function fetchPlayerData(videoId, proxy) {
  const body = JSON.stringify({
    videoId,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'en',
        gl: 'US',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    },
  })

  const url = `${proxy}?url=${encodeURIComponent(INNERTUBE_URL)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const text = await res.text()

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid response from YouTube')
  }

  if (data.error) {
    throw new Error(data.error.message || 'YouTube API error')
  }

  return data
}

// ── Caption track selection ───────────────────────────────────────────────────

function findCaptionTrack(playerData, langCode, langName) {
  const trackList = playerData?.captions?.playerCaptionsTracklistRenderer
  const tracks = trackList?.captionTracks

  if (!tracks || tracks.length === 0) {
    throw new Error('This video has no captions available in any language.')
  }

  // Priority order: exact match (manual) → exact match (auto) → base language match
  const exactManual = tracks.find(t =>
    t.languageCode === langCode && t.kind !== 'asr'
  )
  const exactAsr = tracks.find(t =>
    t.languageCode === langCode
  )
  const baseMatch = tracks.find(t =>
    t.languageCode?.startsWith(langCode.split('-')[0])
  )

  const track = exactManual || exactAsr || baseMatch

  if (!track) {
    const available = tracks
      .map(t => `${t.name?.simpleText || t.languageCode}`)
      .join(', ')
    throw new Error(`No ${langName} captions. Available languages: ${available}`)
  }

  let url = track.baseUrl
  if (!url) throw new Error('Caption track has no URL')

  // Ensure JSON3 format
  if (!url.includes('fmt=json3')) {
    url += (url.includes('?') ? '&' : '?') + 'fmt=json3'
  }

  return url
}

// ── Caption data fetching ─────────────────────────────────────────────────────

async function fetchCaptionTrack(trackUrl, proxy) {
  const url = `${proxy}?url=${encodeURIComponent(trackUrl)}`
  const res = await fetch(url)

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const text = await res.text()
  if (!text || text.length < 5) throw new Error('Empty response')

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid caption data')
  }

  return parseJSON3(data)
}

function parseJSON3(data) {
  const events = data?.events || []
  const segments = []

  for (const event of events) {
    if (!event.segs || event.tStartMs === undefined) continue

    const text = event.segs
      .map(s => s.utf8 || '')
      .join('')
      .replace(/\n/g, ' ')
      .trim()

    if (!text || text === ' ') continue

    segments.push({
      start: event.tStartMs,
      end: event.tStartMs + (event.dDurationMs || 2000),
      text,
    })
  }

  return segments
}
