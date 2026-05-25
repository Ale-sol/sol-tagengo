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

export async function loadCaptions(videoId, videoMeta, settings, onProgress) {
  const lang     = settings.targetLanguage || 'Japanese'
  const langCode = LANGUAGE_CODES[lang] || lang.toLowerCase()

  const cached = await getCachedCaptions(videoId, lang)
  if (cached) { onProgress?.('Loaded from cache', 100); return cached }

  if (!settings.proxyUrl) throw new Error('Caption Proxy URL not set in Settings.')

  const proxy = settings.proxyUrl.replace(/\/$/, '')

  onProgress?.('Fetching captions from YouTube…', 25)

  // Single call to Worker's /captions endpoint
  // The Worker handles InnerTube + caption fetch internally (same IP = signed URLs work)
  let data
  try {
    const res = await fetch(`${proxy}/captions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, langCode }),
    })
    data = await res.json()

    if (!res.ok) {
      if (data?.error === 'NO_LANG') {
        throw new Error(`No ${lang} captions available. Languages found: ${data.available}`)
      }
      throw new Error(data?.details?.join(' | ') || `Worker error ${res.status}`)
    }
  } catch (e) {
    if (e.message.includes('captions') || e.message.includes('Worker')) throw e
    throw new Error(`Could not reach caption proxy: ${e.message}`)
  }

  onProgress?.('Processing captions…', 55)

  const raw = parseJSON3(data)
  if (!raw?.length) throw new Error('Captions returned empty content.')

  onProgress?.('Fixing sentence breaks with AI…', 70)

  let processed
  try {
    processed = await fixCaptions(raw, lang, videoMeta.title, videoMeta.description, settings)
  } catch (e) {
    console.warn('LLM fix skipped:', e.message)
    processed = raw
  }

  onProgress?.('Saving…', 95)
  await setCachedCaptions(videoId, lang, processed)
  onProgress?.('Done', 100)
  return processed
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
