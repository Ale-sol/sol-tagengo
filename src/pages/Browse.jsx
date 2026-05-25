import { useState, useEffect, useRef } from 'react'
import { getHomeFeed, searchVideos, getSubscriptions, getChannelVideos } from '../lib/youtube.js'
import VideoCard from '../components/VideoCard.jsx'
import VideoSelectModal from '../components/VideoSelectModal.jsx'

const TABS = ['Home', 'Search', 'Subscriptions']
const TOKEN_KEY = 'yt_access_token'
const TOKEN_EXPIRY_KEY = 'yt_token_expiry'

// ── Google Identity Services auth (no redirect URI needed) ────────────────────

function loadGIS() {
  return new Promise(resolve => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = resolve
    s.async = true
    document.head.appendChild(s)
  })
}

function useGoogleAuth(clientId) {
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem(TOKEN_KEY)
    const exp = localStorage.getItem(TOKEN_EXPIRY_KEY)
    return t && exp && Date.now() < parseInt(exp) ? t : null
  })
  const clientRef = useRef(null)

  useEffect(() => {
    if (!clientId) return
    loadGIS().then(() => {
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        callback: (resp) => {
          if (resp.error) { console.error('GIS error:', resp.error); return }
          const expiry = Date.now() + (resp.expires_in || 3600) * 1000
          localStorage.setItem(TOKEN_KEY, resp.access_token)
          localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry))
          setToken(resp.access_token)
        },
      })
    })
  }, [clientId])

  function signIn() {
    if (!clientId) { alert('Add your Google OAuth Client ID in Settings first.'); return }
    if (!clientRef.current) { alert('Still loading — try again in a moment.'); return }
    clientRef.current.requestAccessToken()
  }

  function signOut() {
    if (token) window.google?.accounts?.oauth2?.revoke?.(token, () => {})
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRY_KEY)
    setToken(null)
  }

  const isValid = token && Date.now() < parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0')
  return { token: isValid ? token : null, signIn, signOut }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Browse({ settings }) {
  const [tab, setTab] = useState('Home')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nextPageToken, setNextPageToken] = useState(null)
  const [selectedVideo, setSelectedVideo] = useState(null)

  const { token, signIn, signOut } = useGoogleAuth(settings?.googleOAuthClientId)

  useEffect(() => {
    setItems([])
    setChannels([])
    setSelectedChannel(null)
    setError(null)
    setNextPageToken(null)
    if (tab === 'Home') loadHome()
    if (tab === 'Subscriptions' && token) loadSubscriptions()
  }, [tab, token])

  async function loadHome(pageToken = null) {
    if (!settings?.youtubeApiKey) { setError('Add your YouTube API key in Settings.'); return }
    setLoading(true); setError(null)
    try {
      const r = await getHomeFeed(settings, pageToken)
      setItems(prev => pageToken ? [...prev, ...r.items] : r.items)
      setNextPageToken(r.nextPageToken)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim() || !settings?.youtubeApiKey) return
    setLoading(true); setError(null); setItems([]); setNextPageToken(null)
    try {
      const r = await searchVideos(query, settings)
      setItems(r.items); setNextPageToken(r.nextPageToken)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadSubscriptions() {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const r = await getSubscriptions(token)
      setChannels(r.channels)
    } catch (e) {
      if (e.message.includes('401')) { signOut(); setError('Session expired. Sign in again.') }
      else setError(e.message)
    }
    finally { setLoading(false) }
  }

  async function loadChannelVideos(ch) {
    setSelectedChannel(ch); setItems([]); setLoading(true)
    try {
      const r = await getChannelVideos(ch.id, settings)
      setItems(r.items)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadMore() {
    if (!nextPageToken || loading) return
    setLoading(true)
    try {
      const r = tab === 'Home'
        ? await getHomeFeed(settings, nextPageToken)
        : await searchVideos(query, settings, nextPageToken)
      setItems(prev => [...prev, ...r.items])
      setNextPageToken(r.nextPageToken)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const Skeleton = () => (
    <div className="grid grid-cols-2 gap-3">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-video bg-surface rounded-xl mb-2" />
          <div className="h-3 bg-surface rounded w-3/4 mb-1.5" />
          <div className="h-2.5 bg-surface rounded w-1/2" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-12 pb-0 bg-bg sticky top-0 z-30">
        <h1 className="font-display font-bold text-2xl text-white mb-4">
          Immerse<span className="text-accent">.</span>
        </h1>
        <div className="flex gap-1 bg-surface rounded-xl p-1 mb-4">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-sans font-medium transition-all ${tab === t ? 'bg-accent text-black' : 'text-white/50 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Search' && (
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search YouTube…" className="input flex-1" />
            <button type="submit" className="btn-primary px-4 rounded-xl" disabled={loading}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </button>
          </form>
        )}
        {tab === 'Subscriptions' && selectedChannel && (
          <button onClick={() => { setSelectedChannel(null); setItems([]) }}
            className="flex items-center gap-2 text-white/60 text-sm mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {selectedChannel.title}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* ── Subscriptions ── */}
        {tab === 'Subscriptions' && (
          <>
            {!token && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-8 h-8 text-white/30">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <p className="text-white/60 text-sm mb-1">Sign in to see your subscriptions</p>
                <p className="text-white/25 text-xs mb-6 max-w-xs">Google will let you choose which account</p>
                <button onClick={signIn}
                  className="flex items-center gap-3 bg-white text-gray-800 font-sans font-medium text-sm px-6 py-3 rounded-xl active:scale-[0.97] transition-transform">
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>
            )}

            {token && !selectedChannel && (
              <>
                <div className="flex items-center justify-between mb-4 py-2">
                  <p className="text-white/40 text-xs">Your subscriptions</p>
                  <button onClick={signOut} className="text-white/30 text-xs hover:text-white/60 transition-colors">
                    Switch account ↗
                  </button>
                </div>
                {loading && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>}
                <div className="space-y-1">
                  {channels.map(ch => (
                    <button key={ch.id} onClick={() => loadChannelVideos(ch)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98] text-left">
                      {ch.thumbnail
                        ? <img src={ch.thumbnail} alt={ch.title} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-full bg-surface flex-shrink-0" />}
                      <span className="text-white text-sm font-sans">{ch.title}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-white/20 ml-auto flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  ))}
                </div>
              </>
            )}

            {token && selectedChannel && (
              <div className="grid grid-cols-2 gap-3">
                {loading && items.length === 0 && <Skeleton />}
                {items.map(v => <VideoCard key={v.id} video={v} onClick={setSelectedVideo} />)}
              </div>
            )}
          </>
        )}

        {/* ── Home + Search ── */}
        {(tab === 'Home' || tab === 'Search') && (
          <>
            {loading && items.length === 0 && <Skeleton />}
            {!loading && items.length === 0 && !error && tab === 'Search' && (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-white/30 text-sm">Search for videos to study</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {items.map(v => <VideoCard key={v.id} video={v} onClick={setSelectedVideo} />)}
            </div>
            {nextPageToken && !loading && (
              <button onClick={loadMore}
                className="w-full mt-6 py-3 text-accent text-sm font-sans border border-border rounded-xl active:scale-[0.98] transition-transform">
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

      {selectedVideo && <VideoSelectModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  )
}
