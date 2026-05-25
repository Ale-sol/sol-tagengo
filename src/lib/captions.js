/**
 * Caption fetching.
 *
 * Strategy:
 * 1. Call InnerTube API to confirm captions exist and get language code/kind
 * 2. Construct an unsigned timedtext URL (no expiring signature)
 * 3. Fetch through Cloudflare Worker proxy
 * 4. Fix segmentation with LLM
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

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang = settings.targetLanguage || 'Japanese'
  const langCode = LANGUAGE_CODES[lang] || lang.toLowerCase()

  const cached = await getCachedCaptions(videoId, lang)
  if (cached) {
    onProgress?.('Loaded from cache', 100)
    return cached
  }

  if (!settings.proxyUrl) {
    throw new Error('Caption Proxy URL not set. Add your Cloudflare Worker URL in Settings and save.')
  }

  const proxy = settings.proxyUrl.replace(/\/$/, '')

  onProgress?.('Checking available captions…', 15)

  // Step 1: Get track info from InnerTube
  let trackInfo
  try {
    trackInfo = await getTrackInfo(videoId, langCode, lang, proxy)
  } catch (e) {
    throw new Error(e.message)
  }

  onProgress?.('Downloading captions…', 40)

  // Step 2: Fetch using unsigned timedtext URL
  let raw
  try {
    raw = await fetchWithTimedtext(videoId, trackInfo, proxy)
  } catch (e) {
    throw new Error(`Caption download failed: ${e.message}`)
  }

  if (!raw || raw.length === 0) {
    throw new Error(`No ${lang} caption content found for this video.`)
  }

  onProgress?.('Fixing sentence breaks with AI…', 60)

  let processed
  try {
    processed = await fixCaptions(raw, lang, videoMeta.title, videoMeta.description, settings)
  } catch (e) {
    console.warn('LLM fix failed, using raw:', e)
    processed = raw
  }

  onProgress?.('Saving…', 95)
  await setCachedCaptions(videoId, lang, processed)
  onProgress?.('Done', 100)
  return processed
}

// ── Step 1: InnerTube — get language code and kind (asr or manual) ─────────────

async function getTrackInfo(videoId, langCode, langName, proxy) {
  const body = JSON.stringify({
    videoId,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'en',
        gl: 'US',
      },
    },
  })

  const url = `${proxy}?url=${encodeURIComponent(INNERTUBE_URL)}`

  let data
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const text = await res.text()
    data = JSON.parse(text)
  } catch (e) {
    // InnerTube failed — skip to direct timedtext attempt
    console.warn('InnerTube failed, will try timedtext directly:', e)
    return { langCode, kind: 'asr' }
  }

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) {
    // No track info from InnerTube — try anyway
    return { langCode, kind: 'asr' }
  }

  // Find best matching track
  const manual = tracks.find(t => t.languageCode === langCode && t.kind !== 'asr')
  const asr = tracks.find(t => t.languageCode === langCode)
  const base = tracks.find(t => t.languageCode?.startsWith(langCode.split('-')[0]))
  const track = manual || asr || base

  if (!track) {
    const available = tracks.map(t => t.name?.simpleText || t.languageCode).join(', ')
    throw new Error(`No ${langName} captions. Available: ${available}`)
  }

  return {
    langCode: track.languageCode,
    kind: track.kind === 'asr' ? 'asr' : '',
  }
}

// ── Step 2: Fetch using unsigned timedtext URL ────────────────────────────────

async function fetchWithTimedtext(videoId, trackInfo, proxy) {
  // Try multiple URL formats — YouTube accepts all of these
  const urls = [
    // Auto-generated (asr)
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${trackInfo.langCode}&kind=asr&fmt=json3`,
    // Manual captions
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${trackInfo.langCode}&fmt=json3`,
    // With name parameter empty
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${trackInfo.langCode}&name=&fmt=json3`,
    // Base language code only (e.g. zh instead of zh-Hans)
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${trackInfo.langCode.split('-')[0]}&kind=asr&fmt=json3`,
  ]

  for (const timedtextUrl of urls) {
    try {
      const proxied = `${proxy}?url=${encodeURIComponent(timedtextUrl)}`
      const res = await fetch(proxied)

      if (!res.ok) continue

      const text = await res.text()
      if (!text || text.length < 10) continue

      let data
      try { data = JSON.parse(text) } catch { continue }

      const parsed = parseJSON3(data)
      if (parsed.length > 0) return parsed
    } catch {
      continue
    }
  }

  throw new Error('All caption URL formats returned empty. Video may have no captions for this language.')
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
