/**
 * Caption fetching and processing.
 *
 * Strategy: fetch the YouTube watch page HTML through the CORS proxy,
 * extract ytInitialPlayerResponse, get the real caption track URL,
 * then fetch and parse captions. Much more reliable than timedtext API directly.
 *
 * Cloudflare Worker code (deploy free at workers.cloudflare.com):
 * ─────────────────────────────────────────────────────────────────
 * export default {
 *   async fetch(request) {
 *     const url = new URL(request.url)
 *     const target = url.searchParams.get('url')
 *     if (!target) return new Response('Missing url param', { status: 400 })
 *     const res = await fetch(decodeURIComponent(target))
 *     const body = await res.text()
 *     return new Response(body, {
 *       headers: {
 *         'Content-Type': res.headers.get('Content-Type') || 'text/plain',
 *         'Access-Control-Allow-Origin': '*',
 *         'Access-Control-Allow-Methods': 'GET',
 *       }
 *     })
 *   }
 * }
 * ─────────────────────────────────────────────────────────────────
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

/**
 * Main entry point.
 * Returns processed captions array: [{start, end, text}]
 */
export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang = settings.targetLanguage || 'Japanese'
  const langCode = LANGUAGE_CODES[lang] || lang.toLowerCase()

  // Check cache first
  const cached = await getCachedCaptions(videoId, lang)
  if (cached) {
    onProgress?.('Loaded from cache', 100)
    return cached
  }

  if (!settings.proxyUrl) {
    throw new Error('Caption Proxy URL not set. Add your Cloudflare Worker URL in Settings.')
  }

  onProgress?.('Fetching captions from YouTube…', 15)

  // 1. Get caption track URL from watch page
  let trackUrl
  try {
    trackUrl = await getCaptionTrackUrl(videoId, langCode, settings.proxyUrl)
  } catch (e) {
    throw new Error(`Could not find ${lang} captions: ${e.message}`)
  }

  onProgress?.('Downloading captions…', 40)

  // 2. Fetch the actual caption data
  let raw
  try {
    raw = await fetchCaptionTrack(trackUrl, settings.proxyUrl)
  } catch (e) {
    throw new Error(`Failed to download captions: ${e.message}`)
  }

  if (!raw || raw.length === 0) {
    throw new Error(`No ${lang} captions found for this video.`)
  }

  onProgress?.('Fixing sentence breaks with AI…', 60)

  // 3. Fix segmentation with LLM
  let processed
  try {
    processed = await fixCaptions(raw, lang, videoMeta.title, videoMeta.description, settings)
  } catch (e) {
    console.warn('LLM fix failed, using raw captions:', e)
    processed = raw
  }

  onProgress?.('Saving to cache…', 95)

  await setCachedCaptions(videoId, lang, processed)

  onProgress?.('Done', 100)
  return processed
}

// ── Step 1: Parse watch page to get caption track URL ─────────────────────────

async function getCaptionTrackUrl(videoId, langCode, proxyUrl) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`
  const proxied = `${proxyUrl.replace(/\/$/, '')}?url=${encodeURIComponent(watchUrl)}`

  const res = await fetch(proxied, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
  })

  if (!res.ok) throw new Error(`Watch page fetch failed: HTTP ${res.status}`)

  const html = await res.text()

  // Extract ytInitialPlayerResponse from the page
  const playerData = extractPlayerResponse(html)
  if (!playerData) throw new Error('Could not parse YouTube page data')

  // Find caption tracks
  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks || tracks.length === 0) {
    throw new Error('This video has no captions available')
  }

  // Try to find the target language track
  // Priority: exact match → base lang match → auto-generated match
  const exactMatch = tracks.find(t =>
    t.languageCode === langCode && t.kind !== 'asr'
  )
  const asrMatch = tracks.find(t =>
    t.languageCode === langCode && t.kind === 'asr'
  )
  const baseMatch = tracks.find(t =>
    t.languageCode?.startsWith(langCode.split('-')[0])
  )

  const track = exactMatch || asrMatch || baseMatch

  if (!track) {
    const available = tracks.map(t => `${t.name?.simpleText || t.languageCode} (${t.kind || 'manual'})`).join(', ')
    throw new Error(`No ${langCode} captions. Available: ${available}`)
  }

  // The baseUrl from YouTube is already a full URL
  let trackUrl = track.baseUrl
  if (!trackUrl) throw new Error('Caption track has no URL')

  // Add JSON format if not present
  if (!trackUrl.includes('fmt=')) {
    trackUrl += (trackUrl.includes('?') ? '&' : '?') + 'fmt=json3'
  } else {
    trackUrl = trackUrl.replace(/fmt=[^&]+/, 'fmt=json3')
  }

  return trackUrl
}

function extractPlayerResponse(html) {
  // Try multiple patterns YouTube uses
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*({.+?})\s*;/,
    /var ytInitialPlayerResponse\s*=\s*({.+?})\s*;/,
    /"INITIAL_PLAYER_RESPONSE"\s*:\s*({.+?})\s*,\s*"INITIAL_DATA"/,
  ]

  for (const pattern of patterns) {
    try {
      const match = html.match(pattern)
      if (match?.[1]) {
        return JSON.parse(match[1])
      }
    } catch (e) {
      continue
    }
  }

  // Fallback: find by bracket matching
  const marker = 'ytInitialPlayerResponse='
  const start = html.indexOf(marker)
  if (start === -1) return null

  let depth = 0
  let i = start + marker.length
  let jsonStart = -1

  for (; i < html.length; i++) {
    if (html[i] === '{') {
      if (depth === 0) jsonStart = i
      depth++
    } else if (html[i] === '}') {
      depth--
      if (depth === 0 && jsonStart !== -1) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  return null
}

// ── Step 2: Fetch and parse caption track ─────────────────────────────────────

async function fetchCaptionTrack(trackUrl, proxyUrl) {
  const proxied = `${proxyUrl.replace(/\/$/, '')}?url=${encodeURIComponent(trackUrl)}`
  const res = await fetch(proxied)

  if (!res.ok) throw new Error(`Caption track fetch failed: HTTP ${res.status}`)

  const text = await res.text()
  if (!text || text.length < 10) throw new Error('Empty caption response')

  const data = JSON.parse(text)
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

    if (!text || text === ' ' || text === '\n') continue

    segments.push({
      start: event.tStartMs,
      end: event.tStartMs + (event.dDurationMs || 2000),
      text,
    })
  }

  return segments
}
