export default function VideoCard({ video, onClick }) {
  return (
    <button
      onClick={() => onClick(video)}
      className="w-full text-left group"
    >
      <div className="relative rounded-xl overflow-hidden bg-surface aspect-video mb-2">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {video.duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            {video.duration}
          </span>
        )}
      </div>
      <p className="text-white text-sm font-medium line-clamp-2 leading-snug mb-1">
        {video.title}
      </p>
      <p className="text-white/40 text-xs">{video.channelTitle}</p>
    </button>
  )
}
