/**
 * YouTube Data API v3 wrapper.
 * Requires a YouTube Data API key in settings.
 */

const BASE = 'https://www.googleapis.com/youtube/v3'

async function ytFetch(endpoint, params, settings) {
  const apiKey = settings?.youtubeApiKey
  if (!apiKey) throw new Error('No YouTube API key. Go to Settings.')

  const url = new URL(`${BASE}/${endpoint}`)
  url.searchParams.set('key', apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `YouTube API error ${res.status}`)
  }
  return res.json()
}

/** Home feed — returns popular videos for a region */
export async function getHomeFeed(settings, pageToken = null) {
  const data = await ytFetch('videos', {
    part: 'snippet,contentDetails',
    chart: 'mostPopular',
    maxResults: 24,
    regionCode: 'JP', // can be configurable later
    pageToken,
  }, settings)
  return {
    items: data.items.map(formatVideo),
    nextPageToken: data.nextPageToken || null,
  }
}

/** Search YouTube */
export async function searchVideos(query, settings, pageToken = null) {
  const data = await ytFetch('search', {
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: 24,
    pageToken,
    safeSearch: 'none',
  }, settings)

  // Get full video details for duration
  const ids = data.items.map(i => i.id.videoId).join(',')
  const details = await ytFetch('videos', {
    part: 'snippet,contentDetails',
    id: ids,
  }, settings)

  const detailMap = {}
  for (const v of details.items) detailMap[v.id] = v

  return {
    items: data.items
      .filter(i => detailMap[i.id.videoId])
      .map(i => formatVideo(detailMap[i.id.videoId])),
    nextPageToken: data.nextPageToken || null,
  }
}

/** Get subscriptions (requires OAuth access token) */
export async function getSubscriptions(accessToken, pageToken = null) {
  const url = new URL(`${BASE}/subscriptions`)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('mine', 'true')
  url.searchParams.set('maxResults', '50')
  if (pageToken) url.searchParams.set('pageToken', pageToken)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Subscriptions error ${res.status}`)
  const data = await res.json()
  return {
    channels: data.items.map(i => ({
      id: i.snippet.resourceId.channelId,
      title: i.snippet.title,
      thumbnail: i.snippet.thumbnails?.default?.url,
    })),
    nextPageToken: data.nextPageToken || null,
  }
}

/** Get latest videos from a channel */
export async function getChannelVideos(channelId, settings, pageToken = null) {
  const data = await ytFetch('search', {
    part: 'snippet',
    channelId,
    type: 'video',
    order: 'date',
    maxResults: 12,
    pageToken,
  }, settings)

  const ids = data.items.map(i => i.id.videoId).join(',')
  if (!ids) return { items: [], nextPageToken: null }

  const details = await ytFetch('videos', { part: 'snippet,contentDetails', id: ids }, settings)
  return {
    items: details.items.map(formatVideo),
    nextPageToken: data.nextPageToken || null,
  }
}

/** Get a single video's metadata */
export async function getVideo(videoId, settings) {
  const data = await ytFetch('videos', {
    part: 'snippet,contentDetails',
    id: videoId,
  }, settings)
  if (!data.items?.length) throw new Error('Video not found')
  return formatVideo(data.items[0])
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatVideo(item) {
  const s = item.snippet
  return {
    id: item.id,
    title: s.title,
    channelTitle: s.channelTitle,
    channelId: s.channelId,
    thumbnail: s.thumbnails?.medium?.url || s.thumbnails?.default?.url,
    publishedAt: s.publishedAt,
    duration: parseDuration(item.contentDetails?.duration),
    description: s.description || '',
  }
}

function parseDuration(iso) {
  if (!iso) return ''
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return ''
  const h = parseInt(m[1] || 0)
  const min = parseInt(m[2] || 0)
  const s = parseInt(m[3] || 0)
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${min}:${String(s).padStart(2, '0')}`
}

// ── Google OAuth (for subscriptions) ─────────────────────────────────────────

export function initiateGoogleAuth(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    include_granted_scopes: 'true',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** Parse access token from URL hash after OAuth redirect */
export function parseAuthCallback() {
  const hash = window.location.hash.slice(1)
  const params = new URLSearchParams(hash)
  const token = params.get('access_token')
  if (token) {
    // Clean URL
    window.history.replaceState(null, '', window.location.pathname)
    return token
  }
  return null
}
