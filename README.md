# Immerse

Language learning through YouTube. Mobile-first PWA — install on your phone like a native app.

---

## What it does

- Browse YouTube (Home, Search) and tap any video to study it
- Loads captions and fixes broken sentence segmentation using AI
- Highlights new words (green) and words you're learning (yellow)
- Tap any word to see its base form, definition, and context explanation
- Auto-plays word pronunciation
- Tracks which words you know across all sessions
- Works on phone and PC browser — same URL

---

## Step 1 — Get your API keys

### Required: LLM (pick one)
| Provider | Where to get key | Free tier |
|---|---|---|
| **Groq** (recommended) | https://console.groq.com | Generous free tier |
| Claude | https://console.anthropic.com | Pay per token |
| Grok (xAI) | https://console.x.ai | — |
| OpenAI | https://platform.openai.com | — |

### Required: YouTube Data API
1. Go to https://console.cloud.google.com
2. Create a project → Enable "YouTube Data API v3"
3. Credentials → Create API Key → copy it

---

## Step 2 — Set up the caption proxy (5 minutes, free)

YouTube's captions can't be fetched directly from a browser (CORS restriction).
You need a tiny Cloudflare Worker to proxy the request.

1. Go to https://workers.cloudflare.com → sign up (free)
2. Create Worker → paste this code:

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url)
    const target = url.searchParams.get('url')
    if (!target) return new Response('Missing url param', { status: 400 })

    const res = await fetch(decodeURIComponent(target))
    const body = await res.text()

    return new Response(body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    })
  }
}
```

3. Deploy → copy the URL (looks like `https://your-worker.username.workers.dev`)
4. Paste that URL into **Settings → Caption Proxy URL** in the app

---

## Step 3 — Deploy the app (free)

### Option A: Cloudflare Pages (recommended)
1. Run `npm run build` in this folder
2. Go to https://pages.cloudflare.com
3. Upload the `dist/` folder
4. Done — you get a permanent URL

### Option B: Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:5173` on your PC.
On your phone (same WiFi): open `http://[your-PC-IP]:5173`

---

## Step 4 — Install on your phone

1. Open the app URL in Chrome on Android
2. Tap the three-dot menu → "Add to Home Screen"
3. It installs as a PWA — looks and works like a native app

---

## Settings reference

| Setting | What it does |
|---|---|
| LLM Provider | Which AI to use for captions, definitions, translation |
| LLM Model | Specific model (cheaper = faster, smarter = better quality) |
| API Keys | Enter and update keys at any time — stored locally only |
| Caption Proxy URL | Your Cloudflare Worker URL |
| Target Language | Language you're studying |
| Immersion Mode | Intensive pauses after each subtitle; Free Flow plays continuously |
| Show Translation | Toggle English translation below each subtitle |
| Blur Translation | Hides translation until you tap it — challenge yourself |

---

## Word knowledge system

| Color | Meaning | Rule |
|---|---|---|
| 🟢 Green | New word | First time seen |
| 🟡 Yellow | Learning | Looked up at least once |
| White | Known | Seen 5× without looking up |

Tapping a word → resets its counter, marks as "learning"
Advancing past a subtitle without tapping → counts as 1 pass toward "known"

---

## Privacy

All your data (word progress, settings) is stored locally in your browser's IndexedDB.
Nothing is sent anywhere except your API calls (directly to Groq/Claude/etc.).
API keys are stored locally and never leave your device.
Export your profile from Settings to back up your word progress.

---

## Supported languages

Polish, Japanese, Spanish, French, German, Italian, Portuguese, Russian, Arabic, Chinese, Korean, Hindi
