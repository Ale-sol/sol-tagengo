/**
 * Text-to-speech via Edge TTS (free, no API key needed).
 * Uses a public Edge TTS API endpoint.
 * Falls back to browser's built-in SpeechSynthesis if Edge TTS fails.
 */

// Voice map by language
const VOICES = {
  Japanese: 'ja-JP-NanamiNeural',
  Polish: 'pl-PL-ZofiaNeural',
  Spanish: 'es-ES-ElviraNeural',
  French: 'fr-FR-DeniseNeural',
  German: 'de-DE-KatjaNeural',
  Italian: 'it-IT-ElsaNeural',
  Portuguese: 'pt-BR-FranciscaNeural',
  Russian: 'ru-RU-SvetlanaNeural',
  Arabic: 'ar-SA-ZariyahNeural',
  Chinese: 'zh-CN-XiaoxiaoNeural',
  Korean: 'ko-KR-SunHiNeural',
  Hindi: 'hi-IN-SwaraNeural',
}

let currentAudio = null

/** Speak a word/phrase in the target language */
export async function speak(text, language = 'Japanese') {
  // Stop any currently playing audio
  stop()

  const voice = VOICES[language] || VOICES.Japanese

  // Try Edge TTS via public API
  try {
    const audio = await getEdgeTTSAudio(text, voice)
    currentAudio = audio
    audio.play()
    return
  } catch (e) {
    console.warn('Edge TTS failed, using browser TTS:', e)
  }

  // Fallback: browser SpeechSynthesis
  useBrowserTTS(text, language)
}

export function stop() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
  window.speechSynthesis?.cancel()
}

async function getEdgeTTSAudio(text, voice) {
  // Using the public edge-tts endpoint (no auth required)
  const endpoint = 'https://tts.trafficmanager.net/cognitiveservices/v1'

  const ssml = `<speak version='1.0' xml:lang='${voice.slice(0, 5)}'>
    <voice name='${voice}'>
      <prosody rate='-10%'>${escapeXml(text)}</prosody>
    </voice>
  </speak>`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'Mozilla/5.0',
    },
    body: ssml,
  })

  if (!res.ok) throw new Error(`TTS error ${res.status}`)

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.onended = () => URL.revokeObjectURL(url)
  return audio
}

function useBrowserTTS(text, language) {
  if (!window.speechSynthesis) return

  const langCodeMap = {
    Japanese: 'ja-JP', Polish: 'pl-PL', Spanish: 'es-ES',
    French: 'fr-FR', German: 'de-DE', Italian: 'it-IT',
    Portuguese: 'pt-BR', Russian: 'ru-RU', Arabic: 'ar-SA',
    Chinese: 'zh-CN', Korean: 'ko-KR', Hindi: 'hi-IN',
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = langCodeMap[language] || 'ja-JP'
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
