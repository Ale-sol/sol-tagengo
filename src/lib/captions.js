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

const WEB_KEY    = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const ANDROID_UA = 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip'

// Clients tried in order — each with the User-Agent YouTube expects
const CLIENTS = [
  {
    name: 'ANDROID',
    key: WEB_KEY,
    ua: ANDROID_UA,
    context: { clientName: 'ANDROID', clientVersion: '17.31.35', androidSdkVersion: 30, hl: 'en', gl: 'US' },
  },
  {
    name: 'MWEB',
    key: WEB_KEY,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    context: { clientName: 'MWEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
  },
  {
    name: 'WEB_EMBEDDED',
    key: WEB_KEY,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    context: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20240101.0.0', hl: 'en', gl: 'US' },
  },
  {
    name: 'WEB',
    key: WEB_KEY,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    context: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
  },
]

export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang     = settings.targetLanguage || 'Japanese'
  const langCode = LANGUAGE_CODES[lang] || lang.toLowerCase()

  const cached = await getCachedCaptions(videoId, lang)
  if (cached) { onProgress?.('Loaded from cache', 100); return cached }

  if (!settings.proxyUrl) throw new Error('Caption Proxy URL not set in Settings.')

  const proxy = settings.proxyUrl.replace(/\/$/, '')

  onProgress?.('Fetching from YouTube…', 20)

  let captionUrl
  const errors = []

  for (const client of CLIENTS) {
    try {
      captionUrl = await getSignedCaptionUrl(videoId, langCode, lang, proxy, client)
      if (captionUrl) { console.log(`✓ Got captions via ${client.name}`); break }
    } catch (e) {
      errors.push(`${client.name}: ${e.message}`)
      console.warn(`✗ ${client.name}:`, e.message)
    }
  }

  if (!captionUrl) throw new Error(`Could not get captions.\n${errors.join('\n')}`)

  onProgress?.('Downloading captions…', 55)

  let raw
  try {
    raw = await fetchCaption(captionUrl, proxy)
  } catch (e) {
    throw new Error(`Caption download failed: ${e.message}`)
  }

  if (!raw?.length) throw new Error('Captions appear empty for this video.')

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
  const url     = `https://www.youtube.com/youtubei/v1/player?key=${client.key}`
  const proxied = `${proxy}?url=${encodeURIComponent(url)}`

  const res = await fetch(proxied, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Tell the Worker which User-Agent to use when calling YouTube
      'X-Proxy-User-Agent': client.ua,
    },
    body: JSON.stringify({ videoId, context: { client: client.context } }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  let data
  try { data = await res.json() }
  catch { throw new Error('Invalid JSON from YouTube') }

  const status = data?.playabilityStatus?.status
  if (status && status !== 'OK') throw new Error(`Video status: ${status}`)

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) {
    // Log the response keys for debugging
    const keys = Object.keys(data || {}).join(', ')
    throw new Error(`No caption tracks (response keys: ${keys})`)
  }

  const manual = tracks.find(t => t.languageCode === langCode && t.kind !== 'asr')
  const asr    = tracks.find(t => t.languageCode === langCode)
  const base   = tracks.find(t => t.languageCode?.startsWith(langCode.split('-')[0]))
  const track  = manual || asr || base

  if (!track) {
    const available = tracks.map(t => `${t.name?.simpleText || t.languageCode}${t.kind === 'asr' ? '(auto)' : ''}`).join(', ')
    throw new Error(`No ${langName} captions. Available: ${available}`)
  }

  let url2 = track.baseUrl.replace(/([?&])fmt=[^&]*/g, '')
  url2 += (url2.includes('?') ? '&' : '?') + 'fmt=json3'
  return url2
}

async function fetchCaption(captionUrl, proxy) {
  const proxied = `${proxy}?url=${encodeURIComponent(captionUrl)}`
  const res     = await fetch(proxied)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const text = await res.text()
  if (!text) throw new Error('Empty response')

  let data
  try { data = JSON.parse(text) }
  catch { throw new Error(`Non-JSON: ${text.slice(0, 80)}`) }

  return parseJSON3(data)
}

function parseJSON3(data) {
  const segments = []
  for (const event of (data?.events || [])) {
    if (!event.segs || event.tStartMs === undefined) continue
    const text = event.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim()
    if (!text || text === ' ') continue
    segments.push({ start: event.tStartMs, end: event.tStartMs + (event.dDurationMs || 2000), text })
  }
  return segments
}
