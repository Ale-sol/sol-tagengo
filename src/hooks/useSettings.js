import { useState, useEffect, useCallback } from 'react'
import { getSetting, setSetting } from '../lib/storage.js'

const DEFAULTS = {
  // LLM
  llmProvider: 'groq',
  llmModel: 'llama-3.1-8b-instant',

  // API keys
  claudeApiKey: '',
  groqApiKey: '',
  grokApiKey: '',
  openaiApiKey: '',
  youtubeApiKey: '',
  googleOAuthClientId: '',

  // Caption proxy
  proxyUrl: '',

  // Language
  targetLanguage: 'Japanese',

  // Study settings
  immersionMode: 'intensive',       // 'free' | 'intensive'
  showTranslation: true,
  blurTranslation: false,
  playbackSpeed: 1,
}

export function useSettings() {
  const [settings, setSettingsState] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const loaded = { ...DEFAULTS }
      await Promise.all(
        Object.keys(DEFAULTS).map(async key => {
          const val = await getSetting(key)
          if (val !== null) loaded[key] = val
        })
      )
      setSettingsState(loaded)
      setLoaded(true)
    }
    load()
  }, [])

  const updateSetting = useCallback(async (key, value) => {
    await setSetting(key, value)
    setSettingsState(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateSettings = useCallback(async (updates) => {
    await Promise.all(
      Object.entries(updates).map(([k, v]) => setSetting(k, v))
    )
    setSettingsState(prev => ({ ...prev, ...updates }))
  }, [])

  return { settings, updateSetting, updateSettings, loaded }
}
