/**
 * Word knowledge system.
 *
 * States:
 *   new      — first time seen, highlighted green
 *   learning — looked up at least once, highlighted yellow
 *   known    — seen 5 consecutive times without looking up
 *
 * Rules:
 *   - Advancing a subtitle without tapping a new/learning word counts as 1 consecutive pass
 *   - 5 consecutive passes without lookup → known
 *   - Any lookup resets consecutivePasses to 0, sets status to learning
 */

import { getWord, saveWord, getWordStats, getWordsByLanguage } from './storage.js'

const PASSES_TO_KNOWN = 5

/** Get or create a word record */
async function getOrCreate(language, lemma) {
  const existing = await getWord(language, lemma)
  if (existing) return existing

  return {
    id: `${language}::${lemma}`,
    language,
    lemma,
    status: 'new',
    consecutivePasses: 0,
    totalSeen: 0,
    totalLookups: 0,
    addedAt: Date.now(),
    lastSeen: Date.now(),
  }
}

/** Record that a word was seen (subtitle advanced without looking it up) */
export async function recordSeen(language, lemma) {
  const w = await getOrCreate(language, lemma)
  w.totalSeen++
  w.lastSeen = Date.now()

  if (w.status !== 'known') {
    w.consecutivePasses++
    if (w.consecutivePasses >= PASSES_TO_KNOWN) {
      w.status = 'known'
    }
  }

  await saveWord(w)
  return w
}

/** Record that a word was looked up */
export async function recordLookup(language, lemma) {
  const w = await getOrCreate(language, lemma)
  w.totalSeen++
  w.totalLookups++
  w.lastSeen = Date.now()
  w.consecutivePasses = 0
  w.status = 'learning'
  await saveWord(w)
  return w
}

/** Get current status of a word (for rendering color) */
export async function getWordStatus(language, lemma) {
  const w = await getWord(language, lemma)
  return w?.status || 'new'
}

/** Batch-get statuses for a list of lemmas (for subtitle rendering) */
export async function getBatchStatuses(language, lemmas) {
  const result = {}
  await Promise.all(
    lemmas.map(async lemma => {
      const w = await getWord(language, lemma)
      result[lemma] = w?.status || 'new'
    })
  )
  return result
}

export { getWordStats, getWordsByLanguage }
