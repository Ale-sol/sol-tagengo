import { useNavigate } from 'react-router-dom'

export default function VideoSelectModal({ video, onClose }) {
  const navigate = useNavigate()

  if (!video) return null

  function openNormally() {
    window.open(`https://www.youtube.com/watch?v=${video.id}`, '_blank')
    onClose()
  }

  function openStudy() {
    navigate(`/study/${video.id}`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full bg-surface border-t border-border rounded-t-3xl p-6 pb-safe animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Video info */}
        <div className="flex gap-3 mb-6">
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-24 h-14 object-cover rounded-lg flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-white text-sm font-medium line-clamp-2 leading-snug">{video.title}</p>
            <p className="text-white/40 text-xs mt-1">{video.channelTitle}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={openStudy}
            className="w-full bg-accent text-black font-display font-semibold text-base rounded-2xl py-4 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            Study Mode
          </button>

          <button
            onClick={openNormally}
            className="w-full bg-white/5 border border-border text-white/70 font-sans font-medium text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open in YouTube
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-3 py-3 text-white/30 text-sm font-sans"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
