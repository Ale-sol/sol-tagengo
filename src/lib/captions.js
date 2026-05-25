import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVideo } from '../lib/youtube.js'
import { loadCaptions } from '../lib/captions.js'
import { translateSentence } from '../lib/llm.js'
import { recordSeen } from '../lib/wordTracker.js'
import SubtitlePanel from '../components/SubtitlePanel.jsx'
import PlaybackControls from '../components/PlaybackControls.jsx'
import WordPopup from '../components/WordPopup.jsx'

// ── YouTube IFrame Player loader ──────────────────────────────────────────────
let ytAPIPromise = null
function loadYouTubeAPI() {
  if (ytAPIPromise) return ytAPIPromise
  ytAPIPromise = new Promise(resolve => {
    if (window.YT?.Player) { resolve(window.YT); return }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
  })
  return ytAPIPromise
}

export default function Study({ settings }) {
  const { videoId } = useParams()
  const navigate = useNavigate()

  const [video, setVideo] = useState(null)
  const [captions, setCaptions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState('video') // 'video' | 'captions' | 'done' | 'error'
  const [loadingMsg, setLoadingMsg] = useState('Loading video…')
  const [loadingPct, setLoadingPct] = useState(0)
  const [captionChoice, setCaptionChoice] = useState(null) // null = not chosen yet, 'ai' | 'done'
  const [translation, setTranslation] = useState('')
  const [wordPopup, setWordPopup] = useState(null) // { word, sentence }

  const playerRef = useRef(null)
  const playerDivRef = useRef(null)
  const syncIntervalRef = useRef(null)
  const lang = settings?.targetLanguage || 'Japanese'
  const intensiveMode = settings?.immersionMode !== 'free'

  // ── Load video metadata ───────────────────────────────────────────────────

  useEffect(() => {
    if (!videoId) return
    getVideo(videoId, settings)
      .then(v => {
        setVideo(v)
        setLoadingPhase('caption-choice')
      })
      .catch(e => {
        setLoadingMsg(e.message)
        setLoadingPhase('error')
      })
  }, [videoId])

  // ── Init YouTube Player ───────────────────────────────────────────────────

  useEffect(() => {
    if (!videoId) return
    let player

    async function init() {
      const YT = await loadYouTubeAPI()
      player = new YT.Player(playerDivRef.current, {
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onStateChange: (e) => {
            setIsPlaying(e.data === 1)
          },
        },
      })
      playerRef.current = player
    }

    init()

    return () => {
      clearInterval(syncIntervalRef.current)
      player?.destroy?.()
    }
  }, [videoId])

  // ── Subtitle sync loop ────────────────────────────────────────────────────

  useEffect(() => {
    clearInterval(syncIntervalRef.current)
    if (!captions.length) return

    syncIntervalRef.current = setInterval(() => {
      const player = playerRef.current
      if (!player?.getCurrentTime) return
      const t = player.getCurrentTime() * 1000 // ms

      const idx = captions.findIndex((c, i) => {
        const next = captions[i + 1]
        return t >= c.start && (!next || t < next.start)
      })
      if (idx !== -1 && idx !== currentIndex) {
        handleIndexChange(idx)
      }
    }, 150)

    return () => clearInterval(syncIntervalRef.current)
  }, [captions, currentIndex])

  // ── Translate current subtitle ────────────────────────────────────────────

  useEffect(() => {
    const cap = captions[currentIndex]
    if (!cap || !settings?.showTranslation) { setTranslation(''); return }

    let cancelled = false
    translateSentence(cap.text, lang, settings).then(t => {
      if (!cancelled) setTranslation(t)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [currentIndex, captions, settings?.showTranslation])

  // ── Caption loading ───────────────────────────────────────────────────────

  async function handleLoadCaptions() {
    if (!video) return
    setLoadingPhase('loading-captions')
    try {
      const caps = await loadCaptions(videoId, video, settings, (msg, pct) => {
        setLoadingMsg(msg)
        setLoadingPct(pct)
      })
      setCaptions(caps)
      setCaptionChoice('done')
      setLoadingPhase('done')
    } catch (e) {
      setLoadingMsg(e.message)
      setLoadingPhase('error')
    }
  }

  // ── Playback controls ─────────────────────────────────────────────────────

  function handlePlayPause() {
    const player = playerRef.current
    if (!player) return
    if (isPlaying) player.pauseVideo()
    else player.playVideo()
  }

  function handleIndexChange(newIdx) {
    // Record seen for words in the subtitle we're leaving
    const leaving = captions[currentIndex]
    if (leaving) markSubtitleSeen(leaving.text)

    setCurrentIndex(newIdx)
    setWordPopup(null)

    const cap = captions[newIdx]
    if (cap && playerRef.current?.seekTo) {
      // Seek if we're more than 1.5s off
      const currentMs = playerRef.current.getCurrentTime?.() * 1000 || 0
      if (Math.abs(currentMs - cap.start) > 1500) {
        playerRef.current.seekTo(cap.start / 1000, true)
      }
    }

    // Intensive mode: pause on each new subtitle
    if (intensiveMode && playerRef.current?.pauseVideo) {
      playerRef.current.pauseVideo()
    }
  }

  function handlePrev() {
    if (currentIndex > 0) handleIndexChange(currentIndex - 1)
  }

  function handleNext() {
    if (currentIndex < captions.length - 1) handleIndexChange(currentIndex + 1)
  }

  function handleRepeat() {
    const cap = captions[currentIndex]
    if (cap && playerRef.current?.seekTo) {
      playerRef.current.seekTo(cap.start / 1000, true)
      playerRef.current.playVideo()
    }
  }

  function handleSpeedChange(speed) {
    playerRef.current?.setPlaybackRate?.(speed)
  }

  async function markSubtitleSeen(text) {
    // Simple word split for seen tracking
    const words = text.split(/\s+/).filter(w => w.trim().length > 1)
    await Promise.all(words.map(w => recordSeen(lang, w.toLowerCase()).catch(() => {})))
  }

  function handleWordTap(surface, sentence) {
    setWordPopup({ word: surface, sentence })
    if (isPlaying) playerRef.current?.pauseVideo?.()
  }

  function handleSubtitleClick(idx) {
    handleIndexChange(idx)
    const cap = captions[idx]
    if (cap && playerRef.current?.seekTo) {
      playerRef.current.seekTo(cap.start / 1000, true)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-3 bg-bg">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 text-white/60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">{video?.title || 'Loading…'}</p>
          <p className="text-white/40 text-xs truncate">{video?.channelTitle}</p>
        </div>
        {/* Language badge */}
        <span className="flex-shrink-0 text-accent text-xs font-display font-semibold bg-accent/10 px-2 py-1 rounded-lg">
          {lang.slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* YouTube Player (1/3 height) */}
      <div className="w-full bg-black" style={{ aspectRatio: '16/9', maxHeight: '33vh' }}>
        <div ref={playerDivRef} className="w-full h-full" />
      </div>

      {/* Caption choice screen */}
      {loadingPhase === 'caption-choice' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center mb-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-accent">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <h2 className="font-display font-bold text-xl text-white mb-2">Load subtitles</h2>
          <p className="text-white/40 text-sm mb-8 max-w-xs">
            Transcribe this video with Gladia's Whisper AI — accurate, any language, takes 3–10 minutes. Or skip and just watch.
          </p>
          <button
            onClick={handleLoadCaptions}
            className="btn-primary w-full max-w-xs mb-3 py-4 rounded-2xl text-base font-display font-semibold"
          >
            Transcribe with Gladia
          </button>
          <button
            onClick={() => { setCaptionChoice('done'); setLoadingPhase('done') }}
            className="text-white/30 text-sm py-3"
          >
            Skip — just watch
          </button>
        </div>
      )}

      {/* Loading captions */}
      {loadingPhase === 'loading-captions' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-full max-w-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin flex-shrink-0" />
              <p className="text-white/60 text-sm">{loadingMsg}</p>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${loadingPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadingPhase === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-red-400 text-sm mb-4">{loadingMsg}</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Go back
          </button>
        </div>
      )}

      {/* Study interface */}
      {loadingPhase === 'done' && (
        <>
          {captions.length > 0 ? (
            <>
              <SubtitlePanel
                captions={captions}
                currentIndex={currentIndex}
                translation={translation}
                showTranslation={settings?.showTranslation}
                blurTranslation={settings?.blurTranslation}
                language={lang}
                onWordTap={handleWordTap}
                onSubtitleClick={handleSubtitleClick}
              />
              <PlaybackControls
                isPlaying={isPlaying}
                speed={settings?.playbackSpeed || 1}
                currentIndex={currentIndex}
                total={captions.length}
                onPlayPause={handlePlayPause}
                onPrev={handlePrev}
                onNext={handleNext}
                onRepeat={handleRepeat}
                onSpeedChange={handleSpeedChange}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white/30 text-sm">Watching freely — no captions loaded</p>
            </div>
          )}
        </>
      )}

      {/* Word popup */}
      {wordPopup && (
        <WordPopup
          word={wordPopup.word}
          sentence={wordPopup.sentence}
          settings={settings}
          onClose={() => setWordPopup(null)}
        />
      )}
    </div>
  )
}
