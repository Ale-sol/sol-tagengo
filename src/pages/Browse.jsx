import { useState, useEffect, useCallback } from 'react'
import { getHomeFeed, searchVideos } from '../lib/youtube.js'
import VideoCard from '../components/VideoCard.jsx'
import VideoSelectModal from '../components/VideoSelectModal.jsx'

const TABS = ['Home', 'Search', 'Subscriptions']

export default function Browse({ settings }) {
  const [tab, setTab] = useState('Home')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nextPageToken, setNextPageToken] = useState(null)
  const [selectedVideo, setSelectedVideo] = useState(null)

  // Load home feed on mount or tab change
  useEffect(() => {
    if (tab === 'Home') loadHome()
    if (tab === 'Subscriptions') setItems([]) // placeholder
  }, [tab])

  async function loadHome(pageToken = null) {
    if (!settings.youtubeApiKey) {
      setError('Add your YouTube API key in Settings to browse.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await getHomeFeed(settings, pageToken)
      setItems(prev => pageToken ? [...prev, ...result.items] : result.items)
      setNextPageToken(result.nextPageToken)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim() || !settings.youtubeApiKey) return
    setLoading(true)
    setError(null)
    setItems([])
    try {
      const result = await searchVideos(query, settings)
      setItems(result.items)
      setNextPageToken(result.nextPageToken)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!nextPageToken || loading) return
    if (tab === 'Home') await loadHome(nextPageToken)
    if (tab === 'Search') {
      setLoading(true)
      try {
        const result = await searchVideos(query, settings, nextPageToken)
        setItems(prev => [...prev, ...result.items])
        setNextPageToken(result.nextPageToken)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-12 pb-0 bg-bg sticky top-0 z-30">
        <h1 className="font-display font-bold text-2xl text-white mb-4">
          Immerse<span className="text-accent">.</span>
        </h1>

        {/* Tab bar */}
        <div className="flex gap-1 bg-surface rounded-xl p-1 mb-4">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-sans font-medium transition-all ${
                tab === t ? 'bg-accent text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search bar (Search tab) */}
        {tab === 'Search' && (
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search YouTube…"
              className="input flex-1"
            />
            <button
              type="submit"
              className="btn-primary px-4 rounded-xl"
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </button>
          </form>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Subscriptions placeholder */}
        {tab === 'Subscriptions' && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-8 h-8 text-white/30">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <p className="text-white/50 text-sm font-sans">Subscriptions coming soon</p>
            <p className="text-white/25 text-xs mt-1 max-w-xs">Requires Google OAuth setup in Settings</p>
          </div>
        )}

        {/* Video grid */}
        {(tab === 'Home' || tab === 'Search') && (
          <>
            {loading && items.length === 0 && (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-video bg-surface rounded-xl mb-2" />
                    <div className="h-3 bg-surface rounded w-3/4 mb-1.5" />
                    <div className="h-2.5 bg-surface rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!loading && items.length === 0 && !error && tab === 'Search' && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-white/30 text-sm">Search for videos to study</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {items.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onClick={setSelectedVideo}
                />
              ))}
            </div>

            {/* Load more */}
            {nextPageToken && !loading && (
              <button
                onClick={loadMore}
                className="w-full mt-6 py-3 text-accent text-sm font-sans border border-border rounded-xl active:scale-[0.98] transition-transform"
              >
                Load more
              </button>
            )}

            {loading && items.length > 0 && (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Video select modal */}
      {selectedVideo && (
        <VideoSelectModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  )
}
