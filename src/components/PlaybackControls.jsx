const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5]

export default function PlaybackControls({
  isPlaying,
  speed,
  onPlayPause,
  onPrev,
  onNext,
  onRepeat,
  onSpeedChange,
  currentIndex,
  total,
}) {
  const currentSpeedIdx = SPEEDS.indexOf(speed) === -1 ? 2 : SPEEDS.indexOf(speed)

  function cycleSpeed() {
    const next = SPEEDS[(currentSpeedIdx + 1) % SPEEDS.length]
    onSpeedChange(next)
  }

  return (
    <div className="px-4 py-3 border-t border-border bg-surface/80 backdrop-blur">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-white/30 text-[10px] font-sans tabular-nums">{currentIndex + 1}</span>
        <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: total > 0 ? `${((currentIndex + 1) / total) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-white/30 text-[10px] font-sans tabular-nums">{total}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Speed */}
        <button
          onClick={cycleSpeed}
          className="w-12 h-9 flex items-center justify-center rounded-lg bg-white/5 text-white/50 text-xs font-sans font-medium hover:bg-white/10 transition-colors active:scale-95"
        >
          {speed}×
        </button>

        {/* Prev */}
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="w-11 h-11 flex items-center justify-center text-white/60 hover:text-white transition-colors disabled:opacity-30 active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-black shadow-lg shadow-accent/20 active:scale-95 transition-transform"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onClick={onNext}
          disabled={currentIndex >= total - 1}
          className="w-11 h-11 flex items-center justify-center text-white/60 hover:text-white transition-colors disabled:opacity-30 active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M6 18l8.5-6L6 6v12zm2.5-6l5.5 4-5.5-4zm7.5 6h2V6h-2v12z" />
          </svg>
        </button>

        {/* Repeat sentence */}
        <button
          onClick={onRepeat}
          className="w-12 h-9 flex items-center justify-center rounded-lg bg-white/5 text-white/50 hover:bg-white/10 transition-colors active:scale-95"
          title="Repeat sentence"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-4.142-3.358-7.5-7.5-7.5S4.5 7.858 4.5 12s3.358 7.5 7.5 7.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 9.75L19.5 12l-3 2.25" />
          </svg>
        </button>
      </div>
    </div>
  )
}
