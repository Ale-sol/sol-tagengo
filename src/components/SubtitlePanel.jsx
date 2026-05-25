import { useState, useEffect } from 'react'
import { getBatchStatuses } from '../lib/wordTracker.js'

/**
 * Shows ONE subtitle at a time — current sentence centered,
 * previous faded above, next faded below.
 */

function tokenize(text, language) {
  const isCJK = language === 'Japanese' || language === 'Chinese'
  if (isCJK) {
    return text.split('').map((char, i) => ({
      surface: char,
      key: `${char}_${i}`,
      tappable: /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(char),
    }))
  }
  return text.split(/(\s+)/).map((part, i) => ({
    surface: part,
    key: `${part}_${i}`,
    tappable: part.trim().length > 1 && /\p{L}/u.test(part),
  }))
}

function cleanWord(surface) {
  return surface.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

function WordSpan({ token, status, onTap }) {
  if (!token.tappable) return <span>{token.surface}</span>
  const cls = status === 'known' ? 'word-known'
    : status === 'learning' ? 'word-learning'
    : 'word-new'
  return <span className={cls} onClick={() => onTap(token.surface)}>{token.surface}</span>
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
  const [blurRevealed, setBlurRevealed] = useState(false)

  const current  = captions?.[currentIndex]
  const previous = captions?.[currentIndex - 1]
  const next     = captions?.[currentIndex + 1]

  // Reset blur reveal when subtitle changes
  useEffect(() => { setBlurRevealed(false) }, [currentIndex])

  // Load word statuses for current subtitle
  useEffect(() => {
    if (!current?.text || !language) return
    const tokens = tokenize(current.text, language)
    const words = tokens.filter(t => t.tappable).map(t => cleanWord(t.surface)).filter(Boolean)
    getBatchStatuses(language, words).then(setWordStatuses)
  }, [current?.text, language])

  if (!captions?.length) return null

  return (
    <div className="flex-1 flex flex-col justify-center px-4 py-4 overflow-hidden">

      {/* Previous subtitle — faded above */}
      {previous && (
        <p
          className="text-white/20 text-sm font-sans text-center mb-4 line-clamp-2 cursor-pointer leading-relaxed"
          onClick={() => onSubtitleClick?.(currentIndex - 1)}
        >
          {previous.text}
        </p>
      )}

      {/* Current subtitle — prominent, centered */}
      <div className="text-center">
        <p className="text-white font-sans text-xl leading-relaxed font-medium mb-3 select-none">
          {tokenize(current?.text || '', language).map(token => (
            <WordSpan
              key={token.key}
              token={token}
              status={wordStatuses[cleanWord(token.surface)] || 'new'}
              onTap={(surface) => onWordTap(surface, current.text)}
            />
          ))}
        </p>

        {/* English translation */}
        {showTranslation && translation && (
          blurTranslation && !blurRevealed ? (
            <p
              className="text-white/40 text-sm font-sans italic cursor-pointer select-none"
              style={{ filter: 'blur(6px)' }}
              onClick={() => setBlurRevealed(true)}
            >
              {translation}
            </p>
          ) : (
            <p className="text-white/50 text-sm font-sans italic">{translation}</p>
          )
        )}

        {/* Subtitle counter */}
        <p className="text-white/20 text-xs font-sans mt-4">
          {currentIndex + 1} / {captions.length}
        </p>
      </div>

      {/* Next subtitle — faded below */}
      {next && (
        <p
          className="text-white/20 text-sm font-sans text-center mt-4 line-clamp-2 cursor-pointer leading-relaxed"
          onClick={() => onSubtitleClick?.(currentIndex + 1)}
        >
          {next.text}
        </p>
      )}
    </div>
  )
}
