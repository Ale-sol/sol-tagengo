import { useState, useEffect } from 'react'
import { getWordStats, getWordsByLanguage } from '../lib/wordTracker.js'
import { LANGUAGE_CODES } from '../lib/captions.js'

const LANGUAGES = Object.keys(LANGUAGE_CODES)

const STATUS_CONFIG = {
  known: { label: 'Known', color: 'text-green-400', bg: 'bg-green-400/10', bar: 'bg-green-400' },
  learning: { label: 'Learning', color: 'text-yellow-400', bg: 'bg-yellow-400/10', bar: 'bg-yellow-400' },
  new: { label: 'New', color: 'text-white/50', bg: 'bg-white/5', bar: 'bg-white/30' },
}

export default function Stats({ settings }) {
  const [stats, setStats] = useState(null)
  const [recentWords, setRecentWords] = useState([])
  const lang = settings?.targetLanguage || 'Japanese'

  useEffect(() => {
    async function load() {
      const s = await getWordStats(lang)
      setStats(s)

      const words = await getWordsByLanguage(lang)
      const sorted = words
        .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
        .slice(0, 30)
      setRecentWords(sorted)
    }
    load()
  }, [lang])

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  const total = stats.total || 0
  const knownPct = total > 0 ? Math.round((stats.known / total) * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28 pt-12 px-4">
      <h1 className="font-display font-bold text-2xl text-white mb-1">Words</h1>
      <p className="text-white/40 text-sm mb-6">{lang}</p>

      {/* Big number */}
      <div className="card p-6 mb-4 text-center">
        <p className="text-6xl font-display font-bold text-accent mb-1">{stats.known}</p>
        <p className="text-white/40 text-sm font-sans">words known</p>
        {total > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-700"
                style={{ width: `${knownPct}%` }}
              />
            </div>
            <p className="text-white/30 text-xs mt-2">{knownPct}% of {total} encountered</p>
          </div>
        )}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <div key={status} className={`card p-4 text-center ${cfg.bg}`}>
            <p className={`text-2xl font-display font-bold ${cfg.color} mb-0.5`}>
              {stats[status] || 0}
            </p>
            <p className="text-white/40 text-xs font-sans">{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* Recent words */}
      {recentWords.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-xs uppercase tracking-widest text-white/30 mb-3 px-1">
            Recent encounters
          </h2>
          <div className="card divide-y divide-border">
            {recentWords.map((word, i) => {
              const cfg = STATUS_CONFIG[word.status] || STATUS_CONFIG.new
              return (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <span className="font-sans text-white text-sm">{word.lemma}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 text-xs">{word.totalSeen}×</span>
                    <span className={`text-xs font-sans px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-8 h-8 text-white/20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-white/40 text-sm">No {lang} words yet</p>
          <p className="text-white/20 text-xs mt-1">Start studying to track your progress</p>
        </div>
      )}
    </div>
  )
}
