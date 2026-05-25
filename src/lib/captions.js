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

// InnerTube client configs — tried in order until one works
const CLIENTS = [
  {
    name: 'ANDROID',
    key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    context: {
      clientName: 'ANDROID',
      clientVersion: '17.31.35',
      androidSdkVersion: 30,
      hl: 'en',
      gl: 'US',
    },
  },
  {
    name: 'WEB',
    key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    context: {
      clientName: 'WEB',
      clientVersion: '2.20240101.00.00',
      hl: 'en',
      gl: 'US',
    },
  },
  {
    name: 'TV_EMBEDDED',
    key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    context: {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      hl: 'en',
      gl: 'US',
    },
  },
]

export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang = settings.targetLanguage || 'Japanese'
  const langCode = LANGUAGE_CODES[lang] || lang.toLowerCase()

  const cached = await getCachedCaptions(videoId, lang)
  if (cached) {
    onProgress?.('Loaded from cache', 100)
    return cached
  }

  if (!settings.proxyUrl) {
    throw new Error('Caption Proxy URL not set in Settings.')
  }

  const proxy = settings.proxyUrl.replace(/\/$/, '')

  onProgress?.('Fetching from YouTube…', 20)

  let captionUrl
  const errors = []

  // Try each client until one returns a playable response with captions
  for (const client of CLIENTS) {
    try {
      captionUrl = await getSignedCaptionUrl(videoId, langCode, lang, proxy, client)
      if (captionUrl) break
    } catch (e) {
      errors.push(`${client.name}: ${e.message}`)
    }
  }

  if (!captionUrl) {
    throw new Error(`Could not get captions. Tried all clients:\n${errors.join('\n')}`)
  }

  onProgress?.('Downloading captions…', 55)

  let raw
  try {
    raw = await fetchCaption(captionUrl, proxy)
  } catch (e) {
    throw new Error(`Caption download failed: ${e.message}`)
  }

  if (!raw?.length) {
    throw new Error('Captions returned empty. This video may have no speech content.')
  }

  onProgress?.('Fixing sentence breaks with AI…', 70)

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

async function getSignedCaptionUrl(videoId, langCode, langName, proxy, client) {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${client.key}`
  const proxied = `${proxy}?url=${encodeURIComponent(url)}`

  const res = await fetch(proxied, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: { client: client.context },
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('Invalid JSON response')
  }

  const status = data?.playabilityStatus?.status
  if (status && status !== 'OK') {
    throw new Error(`Video status: ${status}`)
  }

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) {
    throw new Error('No caption tracks in response')
  }

  // Find best matching track
  const manual = tracks.find(t => t.languageCode === langCode && t.kind !== 'asr')
  const asr    = tracks.find(t => t.languageCode === langCode)
  const base   = tracks.find(t => t.languageCode?.startsWith(langCode.split('-')[0]))
  const track  = manual || asr || base

  if (!track) {
    const available = tracks.map(t =>
      `${t.name?.simpleText || t.languageCode}${t.kind === 'asr' ? ' (auto)' : ''}`
    ).join(', ')
    throw new Error(`No ${langName} captions. Available: ${available}`)
  }

  // Build URL with json3 format
  let trackUrl = track.baseUrl
  trackUrl = trackUrl.replace(/([?&])fmt=[^&]*/g, '')
  trackUrl += (trackUrl.includes('?') ? '&' : '?') + 'fmt=json3'

  return trackUrl
}

async function fetchCaption(captionUrl, proxy) {
  const proxied = `${proxy}?url=${encodeURIComponent(captionUrl)}`
  const res = await fetch(proxied)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const text = await res.text()
  if (!text) throw new Error('Empty response')

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 80)}`)
  }

  return parseJSON3(data)
}

function parseJSON3(data) {
  const events = data?.events || []
  const segments = []
  for (const event of events) {
    if (!event.segs || event.tStartMs === undefined) continue
    const text = event.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim()
    if (!text || text === ' ') continue
    segments.push({
      start: event.tStartMs,
      end: event.tStartMs + (event.dDurationMs || 2000),
      text,
    })
  }
  return segments
}
