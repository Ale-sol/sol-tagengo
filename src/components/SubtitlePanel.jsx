import { useState, useEffect, useRef } from 'react'
import { getBatchStatuses } from '../lib/wordTracker.js'

/**
 * Splits subtitle text into tappable words.
 * For CJK languages, each character is a word unit.
 * For space-separated languages, split by spaces.
 */
function tokenize(text, language) {
  const isCJK = language === 'Japanese' || language === 'Chinese'

  if (isCJK) {
    // Each character is a potential word (simple approach without a parser)
    return text.split('').map((char, i) => ({
      surface: char,
      key: `${char}_${i}`,
      tappable: /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(char),
    }))
  }

  // Space-separated: preserve spaces as non-tappable
  const parts = text.split(/(\s+)/)
  return parts.map((part, i) => ({
    surface: part,
    key: `${part}_${i}`,
    tappable: part.trim().length > 1 && /\p{L}/u.test(part),
  }))
}

/** Strip punctuation from a word to get a clean lookup key */
function cleanWord(surface) {
  return surface.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

function WordSpan({ token, status, onTap }) {
  if (!token.tappable) {
    return <span className="select-none">{token.surface}</span>
  }

  const cls =
    status === 'known'
      ? 'word-known'
      : status === 'learning'
      ? 'word-learning'
      : 'word-new'

  return (
    <span
      className={cls}
      onClick={() => onTap(token.surface)}
    >
      {token.surface}
    </span>
  )
}

export default function SubtitlePanel({
  captions,
  currentIndex,
  translation,
  showTranslation,
  blurTranslation,
  language,
  onWordTap,
  onSubtitleClick,
}) {
  const [wordStatuses, setWordStatuses] = useState({})
  const currentRef = useRef(null)

  const current = captions?.[currentIndex]

  // Load word statuses for current subtitle
  useEffect(() => {
    if (!current?.text || !language) return

    const tokens = tokenize(current.text, language)
    const words = tokens
      .filter(t => t.tappable)
      .map(t => cleanWord(t.surface))
      .filter(Boolean)

    getBatchStatuses(language, words).then(setWordStatuses)
  }, [current?.text, language])

  // Scroll current subtitle into view
  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex])

  if (!captions?.length) return null

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {captions.map((cap, i) => {
        const isCurrent = i === currentIndex
        const isPast = i < currentIndex

        return (
          <div
            key={i}
            ref={isCurrent ? currentRef : null}
            onClick={() => onSubtitleClick?.(i)}
            className={`rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
              isCurrent
                ? 'bg-white/8 border border-white/10'
                : isPast
                ? 'opacity-30'
                : 'opacity-50'
            }`}
          >
            {/* Target language subtitle */}
            <p className={`font-sans leading-relaxed ${isCurrent ? 'text-white text-lg' : 'text-white/70 text-base'}`}>
              {isCurrent
                ? tokenize(cap.text, language).map(token => (
                    <WordSpan
                      key={token.key}
                      token={token}
                      status={wordStatuses[cleanWord(token.surface)] || 'new'}
                      onTap={(surface) => onWordTap(surface, cap.text)}
                    />
                  ))
                : cap.text}
            </p>

            {/* English translation */}
            {isCurrent && showTranslation && translation && (
              <div className="mt-2">
                {blurTranslation ? (
                  <p
                    className="text-white/50 text-sm font-sans italic select-none cursor-pointer transition-all"
                    style={{ filter: 'blur(5px)' }}
                    onClick={(e) => {
                      e.currentTarget.style.filter = 'none'
                      e.stopPropagation()
                    }}
                  >
                    {translation}
                  </p>
                ) : (
                  <p className="text-white/50 text-sm font-sans italic">{translation}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
