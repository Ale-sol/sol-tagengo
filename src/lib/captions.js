/**
 * Caption fetching and processing.
 *
 * YouTube's timedtext endpoint requires a CORS proxy.
 * Set proxyUrl in Settings to your Cloudflare Worker URL.
 *
 * Cloudflare Worker code (deploy at workers.cloudflare.com, free):
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
 *       }
 *     })
 *   }
 * }
 * ─────────────────────────────────────────────────────────────────
 */

import { fixCaptions } from './llm.js'
import { getCachedCaptions, setCachedCaptions } from './storage.js'

// Language code map — target language name → YouTube lang code
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
 * Caches results in IndexedDB.
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

  onProgress?.('Fetching captions from YouTube…', 20)

  // 1. Fetch raw captions
  let raw
  try {
    raw = await fetchYouTubeCaptions(videoId, langCode, settings)
  } catch (e) {
    throw new Error(`Could not fetch captions: ${e.message}`)
  }

  if (!raw || raw.length === 0) {
    throw new Error(`No ${lang} captions available for this video.`)
  }

  onProgress?.('Fixing segmentation with AI…', 50)

  // 2. Fix with LLM
  let processed
  try {
    processed = await fixCaptions(raw, lang, videoMeta.title, videoMeta.description, settings)
  } catch (e) {
    console.warn('LLM fix failed, using raw captions:', e)
    processed = raw // Fallback to raw if LLM fails
  }

  onProgress?.('Caching…', 90)

  // 3. Cache
  await setCachedCaptions(videoId, lang, processed)

  onProgress?.('Done', 100)
  return processed
}

/** Fetch YouTube captions via CORS proxy or direct */
async function fetchYouTubeCaptions(videoId, langCode, settings) {
  const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&fmt=json3&xorb=2&xobt=3&xovt=3`

  let url
  if (settings.proxyUrl) {
    url = `${settings.proxyUrl.replace(/\/$/, '')}?url=${encodeURIComponent(timedtextUrl)}`
  } else {
    // Try direct (will work in dev with browser CORS disabled, or if YouTube allows)
    url = timedtextUrl
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const text = await res.text()
  if (!text || text.length < 10) {
    throw new Error('Empty caption response — video may have no captions in this language')
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid caption data received')
  }

  return parseJSON3(data)
}

/** Parse YouTube JSON3 caption format into [{start, end, text}] */
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

/** List available caption languages for a video */
export async function listCaptionLanguages(videoId, settings) {
  const listUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`

  let url
  if (settings?.proxyUrl) {
    url = `${settings.proxyUrl.replace(/\/$/, '')}?url=${encodeURIComponent(listUrl)}`
  } else {
    url = listUrl
  }

  try {
    const res = await fetch(url)
    const text = await res.text()
    // Parse XML list
    const parser = new DOMParser()
    const xml = parser.parseFromString(text, 'text/xml')
    const tracks = xml.querySelectorAll('track')
    return Array.from(tracks).map(t => ({
      langCode: t.getAttribute('lang_code'),
      name: t.getAttribute('name'),
      isAsr: t.getAttribute('kind') === 'asr',
    }))
  } catch {
    return []
  }
}
