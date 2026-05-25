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
    throw new Error('Caption Proxy URL not set in Settings.')
  }

  const proxy = settings.proxyUrl.replace(/\/$/, '')

  onProgress?.('Fetching from YouTube…', 20)

  // Step 1: get signed caption URL from InnerTube
  let captionUrl
  try {
    captionUrl = await getSignedCaptionUrl(videoId, langCode, lang, proxy)
  } catch (e) {
    throw new Error(e.message)
  }

  onProgress?.('Downloading captions…', 50)

  // Step 2: fetch the caption data using the signed URL
  let raw
  try {
    raw = await fetchCaption(captionUrl, proxy)
  } catch (e) {
    throw new Error(`Caption download failed: ${e.message}`)
  }

  if (!raw?.length) {
    throw new Error('Captions loaded but appear empty. Try a different video to confirm the setup works.')
  }

  onProgress?.('Fixing sentence breaks with AI…', 65)

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

async function getSignedCaptionUrl(videoId, langCode, langName, proxy) {
  // Call YouTube's internal player API to get the signed caption URL
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

  const proxied = `${proxy}?url=${encodeURIComponent(INNERTUBE_URL)}`

  const res = await fetch(proxied, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) {
    throw new Error(`YouTube API returned HTTP ${res.status}. Check your Worker supports POST requests.`)
  }

  const text = await res.text()

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`YouTube returned invalid data. First 100 chars: ${text.slice(0, 100)}`)
  }

  if (data.error) {
    throw new Error(`YouTube error: ${data.error.message}`)
  }

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks

  if (!tracks?.length) {
    // Check if the video is available at all
    const status = data?.playabilityStatus?.status
    if (status && status !== 'OK') {
      throw new Error(`Video not available: ${status}`)
    }
    throw new Error(`No captions found for this video in any language.`)
  }

  // Find best matching track
  const manual = tracks.find(t => t.languageCode === langCode && t.kind !== 'asr')
  const asr = tracks.find(t => t.languageCode === langCode)
  const base = tracks.find(t => t.languageCode?.startsWith(langCode.split('-')[0]))
  const track = manual || asr || base

  if (!track) {
    const available = tracks.map(t =>
      `${t.name?.simpleText || t.languageCode}${t.kind === 'asr' ? ' (auto)' : ''}`
    ).join(', ')
    throw new Error(`No ${langName} captions. Available: ${available}`)
  }

  // Use the signed baseUrl from YouTube — add json3 format
  let url = track.baseUrl
  // Replace any existing fmt parameter, or add json3
  url = url.replace(/([?&])fmt=[^&]*/g, '')
  url += (url.includes('?') ? '&' : '?') + 'fmt=json3'

  return url
}

async function fetchCaption(captionUrl, proxy) {
  const proxied = `${proxy}?url=${encodeURIComponent(captionUrl)}`
  const res = await fetch(proxied)

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching caption data`)
  }

  const text = await res.text()

  if (!text) throw new Error('Empty response from YouTube')

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`YouTube returned non-JSON: ${text.slice(0, 80)}`)
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
