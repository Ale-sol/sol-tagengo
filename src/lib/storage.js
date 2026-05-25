import { openDB } from 'idb'

const DB_NAME = 'immerse-db'
const DB_VERSION = 1

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings')
        }
        // Word knowledge store — keyed by `${language}::${lemma}`
        if (!db.objectStoreNames.contains('words')) {
          const ws = db.createObjectStore('words', { keyPath: 'id' })
          ws.createIndex('by-language', 'language')
          ws.createIndex('by-status', 'status')
        }
        // Caption cache — keyed by `${videoId}::${language}`
        if (!db.objectStoreNames.contains('captions')) {
          db.createObjectStore('captions')
        }
      },
    })
  }
  return dbPromise
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSetting(key, fallback = null) {
  const db = await getDB()
  const val = await db.get('settings', key)
  return val !== undefined ? val : fallback
}

export async function setSetting(key, value) {
  const db = await getDB()
  await db.put('settings', value, key)
}

export async function getAllSettings() {
  const db = await getDB()
  const keys = await db.getAllKeys('settings')
  const out = {}
  for (const k of keys) out[k] = await db.get('settings', k)
  return out
}

// ── Words ─────────────────────────────────────────────────────────────────────

/** Get a word record, or null if it doesn't exist */
export async function getWord(language, lemma) {
  const db = await getDB()
  return db.get('words', `${language}::${lemma}`) ?? null
}

/** Upsert a word record */
export async function saveWord(wordRecord) {
  const db = await getDB()
  await db.put('words', wordRecord)
}

/** All words for a language */
export async function getWordsByLanguage(language) {
  const db = await getDB()
  const idx = db.transaction('words').store.index('by-language')
  return idx.getAll(language)
}

/** Count known/learning words per language */
export async function getWordStats(language) {
  const words = await getWordsByLanguage(language)
  const stats = { known: 0, learning: 0, new: 0, total: 0 }
  for (const w of words) {
    stats.total++
    stats[w.status] = (stats[w.status] || 0) + 1
  }
  return stats
}

// ── Caption Cache ─────────────────────────────────────────────────────────────

export async function getCachedCaptions(videoId, language) {
  const db = await getDB()
  return db.get('captions', `${videoId}::${language}`) ?? null
}

export async function setCachedCaptions(videoId, language, captions) {
  const db = await getDB()
  await db.put('captions', captions, `${videoId}::${language}`)
}

// ── Profile Export / Import ───────────────────────────────────────────────────

export async function exportProfile() {
  const db = await getDB()
  const settings = await getAllSettings()
  const words = await db.getAll('words')

  // Strip API keys from export for safety — user can re-enter them
  const safeSettings = { ...settings }
  const keyFields = ['claudeApiKey', 'groqApiKey', 'grokApiKey', 'openaiApiKey', 'youtubeApiKey', 'proxyUrl']
  keyFields.forEach(k => delete safeSettings[k])

  const blob = new Blob(
    [JSON.stringify({ version: 1, settings: safeSettings, words }, null, 2)],
    { type: 'application/json' }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `immerse-profile-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importProfile(jsonString) {
  const data = JSON.parse(jsonString)
  if (!data.version || data.version !== 1) throw new Error('Invalid profile format')

  const db = await getDB()

  // Import settings (skip API keys)
  if (data.settings) {
    for (const [k, v] of Object.entries(data.settings)) {
      await db.put('settings', v, k)
    }
  }

  // Import words
  if (data.words) {
    const tx = db.transaction('words', 'readwrite')
    for (const w of data.words) await tx.store.put(w)
    await tx.done
  }
}
