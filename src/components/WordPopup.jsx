import { useState, useEffect } from 'react'
import { lookupWord } from '../lib/llm.js'
import { speak, stop } from '../lib/tts.js'
import { recordLookup } from '../lib/wordTracker.js'

export default function WordPopup({ word, sentence, settings, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [playing, setPlaying] = useState(false)

  const lang = settings?.targetLanguage || 'Japanese'

  useEffect(() => {
    if (!word) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      // Record lookup in word tracker
      try {
        await recordLookup(lang, word)
      } catch (e) {
        console.warn('Word tracker error:', e)
      }

      // Get definition from LLM
      try {
        const result = await lookupWord(word, sentence, lang, settings)
        if (!cancelled) {
          setData(result)
          // Auto-play pronunciation
          playWord(result.base_form || word)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      stop()
    }
  }, [word, sentence])

  async function playWord(text) {
    setPlaying(true)
    try {
      await speak(text, lang)
    } catch (e) {
      console.warn('TTS error:', e)
    } finally {
      setPlaying(false)
    }
  }

  const isJapanese = lang === 'Japanese'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        className="relative w-full bg-surface border-t border-border rounded-t-3xl p-6 pb-safe animate-slide-up"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '60vh', overflowY: 'auto' }}
      >
        {/* Close handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />

        {loading && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-white/50 text-sm">Looking up…</span>
          </div>
        )}

        {error && (
          <div className="text-red-400/80 text-sm py-2">{error}</div>
        )}

        {data && (
          <div>
            {/* Word header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                {isJapanese && data.furigana && (
                  <p className="text-white/40 text-xs mb-0.5 font-sans">{data.furigana}</p>
                )}
                <p className="text-accent font-display font-bold text-2xl leading-tight">
                  {data.base_form || word}
                </p>
                {data.base_form && data.base_form !== word && (
                  <p className="text-white/30 text-xs mt-0.5">
                    from: <span className="text-white/50">{word}</span>
                  </p>
                )}
              </div>

              {/* TTS button */}
              <button
                onClick={() => playWord(data.base_form || word)}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  playing ? 'bg-accent text-black' : 'bg-white/10 text-white/60 hover:bg-white/15'
                }`}
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Definition */}
            <div className="bg-white/5 rounded-xl p-4 mb-3">
              <p className="text-white/40 text-[10px] font-sans uppercase tracking-widest mb-1.5">Definition</p>
              <p className="text-white text-sm leading-relaxed font-sans">{data.definition}</p>
            </div>

            {/* Context note */}
            {data.context_note && (
              <div className="bg-accent/5 border border-accent/15 rounded-xl p-4">
                <p className="text-white/40 text-[10px] font-sans uppercase tracking-widest mb-1.5">In this sentence</p>
                <p className="text-white/80 text-sm leading-relaxed font-sans italic">{data.context_note}</p>
              </div>
            )}

            {/* Original sentence for context */}
            <p className="text-white/20 text-xs mt-4 leading-relaxed font-sans border-t border-border pt-3">
              {sentence}
            </p>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-white/30 hover:text-white/60 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
