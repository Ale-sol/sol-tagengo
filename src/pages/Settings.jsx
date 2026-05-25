import { useState, useEffect } from 'react'
import { PROVIDERS } from '../lib/llm.js'
import { LANGUAGE_CODES } from '../lib/captions.js'
import { exportProfile, importProfile, getAllSettings } from '../lib/storage.js'
import { saveToGoogleDrive, loadFromGoogleDrive } from '../lib/driveSync.js'

const LANGUAGES = Object.keys(LANGUAGE_CODES)

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-xs uppercase tracking-widest text-white/30 mb-3 px-1">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-white/70 text-sm font-sans mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-white/30 text-xs mt-1.5">{hint}</p>}
    </div>
  )
}

function Toggle({ value, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all ${
        value ? 'border-accent/40 bg-accent/5' : 'border-border'
      }`}
    >
      <div>
        <span className="text-sm text-white/70 font-sans">{label}</span>
        {hint && <p className="text-white/30 text-xs">{hint}</p>}
      </div>
      <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? 'bg-accent' : 'bg-white/20'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
    </button>
  )
}

function ApiKeyField({ placeholder, value, onChange, url }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="input pr-10"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
            {show
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            }
          </svg>
        </button>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost border border-border rounded-xl px-3 text-xs whitespace-nowrap"
        >
          Get ↗
        </a>
      )}
    </div>
  )
}

export default function Settings({ settings, onUpdate, onUpdateMany }) {
  // Local draft — nothing saves until you hit Save
  const [draft, setDraft] = useState(settings)
  const [isDirty, setIsDirty] = useState(false)
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [importError, setImportError] = useState('')
  const [driveMsg, setDriveMsg] = useState('')

  const driveToken = localStorage.getItem('yt_access_token')

  async function handleDriveSave() {
    if (!driveToken) { setDriveMsg('Sign in to Google first (Browse → Subscriptions tab)'); return }
    setDriveMsg('Saving to Drive…')
    try {
      const { getAllSettings, getWordsByLanguage } = await import('../lib/storage.js')
      const savedSettings = await getAllSettings()
      const LANGS = ['Japanese', 'Polish', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Arabic', 'Chinese', 'Korean', 'Hindi']
      const words = []
      for (const lang of LANGS) words.push(...await getWordsByLanguage(lang))
      await saveToGoogleDrive(driveToken, { version: 1, settings: savedSettings, words })
      setDriveMsg('✓ Saved to Google Drive')
    } catch (e) { setDriveMsg(`Error: ${e.message}`) }
    setTimeout(() => setDriveMsg(''), 5000)
  }

  async function handleDriveLoad() {
    if (!driveToken) { setDriveMsg('Sign in to Google first (Browse → Subscriptions tab)'); return }
    setDriveMsg('Loading from Drive…')
    try {
      const data = await loadFromGoogleDrive(driveToken)
      if (!data) { setDriveMsg('No profile found on Drive yet'); return }
      await importProfile(JSON.stringify(data))
      setDriveMsg('✓ Loaded — reload the page to apply')
    } catch (e) { setDriveMsg(`Error: ${e.message}`) }
    setTimeout(() => setDriveMsg(''), 5000)
  }

  // Sync draft when settings load from DB initially
  useEffect(() => {
    setDraft(settings)
    setIsDirty(false)
  }, []) // Only on mount

  function set(key, val) {
    setDraft(prev => ({ ...prev, [key]: val }))
    setIsDirty(true)
  }

  async function handleSave() {
    setSaveState('saving')
    try {
      await onUpdateMany(draft)
      setIsDirty(false)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (e) {
      setSaveState('idle')
      alert('Save failed: ' + e.message)
    }
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      await importProfile(text)
      setImportError('')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (err) {
      setImportError(err.message)
    }
    e.target.value = ''
  }

  const activeProvider = PROVIDERS[draft.llmProvider]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-36 pt-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display font-bold text-2xl text-white">Settings</h1>
          {isDirty && (
            <span className="text-yellow-400/70 text-xs font-sans animate-fade-in">
              Unsaved changes
            </span>
          )}
        </div>

        {/* AI Provider */}
        <Section title="AI Provider">
          <Field label="Provider">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PROVIDERS).map(([id, p]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('llmProvider', id)}
                  className={`py-3 rounded-xl text-sm font-sans font-medium border transition-all active:scale-[0.97] ${
                    draft.llmProvider === id
                      ? 'bg-accent text-black border-accent'
                      : 'border-border text-white/50 hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Field>

          {activeProvider && (
            <Field label="Model">
              <select
                value={draft.llmModel}
                onChange={e => set('llmModel', e.target.value)}
                className="input"
              >
                {activeProvider.models.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Field>
          )}
        </Section>

        {/* API Keys */}
        <Section title="API Keys">
          {Object.entries(PROVIDERS).map(([id, p]) => (
            <Field key={id} label={p.name}>
              <ApiKeyField
                placeholder={p.keyPlaceholder}
                value={draft[`${id}ApiKey`] || ''}
                onChange={val => set(`${id}ApiKey`, val)}
                url={p.keyUrl}
              />
            </Field>
          ))}

          <Field label="Gladia API Key (Whisper transcription)" hint="Free 10 hours/month — get a key at app.gladia.io">
            <ApiKeyField
              placeholder="your-gladia-key"
              value={draft.gladiaApiKey || ''}
              onChange={val => set('gladiaApiKey', val)}
              url="https://app.gladia.io"
            />
          </Field>

          <Field label="YouTube Data API Key" hint="Required for video browsing">
            <ApiKeyField
              placeholder="AIza..."
              value={draft.youtubeApiKey || ''}
              onChange={val => set('youtubeApiKey', val)}
              url="https://console.cloud.google.com"
            />
          </Field>

          <Field
            label="Google OAuth Client ID"
            hint="Required for Subscriptions tab. Create an OAuth 2.0 Client ID in Google Cloud Console → Credentials."
          >
            <ApiKeyField
              placeholder="xxxx.apps.googleusercontent.com"
              value={draft.googleOAuthClientId || ''}
              onChange={val => set('googleOAuthClientId', val)}
              url="https://console.cloud.google.com"
            />
          </Field>


        </Section>

        {/* Language */}
        <Section title="Language">
          <Field label="Language you are studying">
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => set('targetLanguage', lang)}
                  className={`py-2.5 rounded-xl text-xs font-sans font-medium border transition-all active:scale-[0.97] ${
                    draft.targetLanguage === lang
                      ? 'bg-accent text-black border-accent'
                      : 'border-border text-white/50 hover:text-white'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Study Mode */}
        <Section title="Study Mode">
          <Field label="Immersion mode">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'intensive', label: '⏸ Intensive', sub: 'Pauses after each line' },
                { id: 'free', label: '▶ Free Flow', sub: 'Continuous playback' },
              ].map(({ id, label, sub }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('immersionMode', id)}
                  className={`py-3 px-3 rounded-xl text-sm font-sans border transition-all active:scale-[0.97] text-left ${
                    draft.immersionMode === id
                      ? 'bg-accent text-black border-accent'
                      : 'border-border text-white/50'
                  }`}
                >
                  <div className="font-medium">{label}</div>
                  <div className={`text-xs mt-0.5 ${draft.immersionMode === id ? 'text-black/60' : 'text-white/30'}`}>{sub}</div>
                </button>
              ))}
            </div>
          </Field>

          <Toggle
            value={draft.showTranslation}
            onChange={v => set('showTranslation', v)}
            label="Show English translation"
          />

          {draft.showTranslation && (
            <Toggle
              value={draft.blurTranslation}
              onChange={v => set('blurTranslation', v)}
              label="Blur until tapped"
              hint="Challenge yourself before peeking"
            />
          )}
        </Section>

        {/* Profile */}
        <Section title="Profile">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={exportProfile}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-white/60 text-sm font-sans hover:text-white transition-colors active:scale-[0.97]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export
            </button>
            <label className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-white/60 text-sm font-sans hover:text-white transition-colors active:scale-[0.97] cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Import
              <input type="file" accept=".json" onChange={handleImport} className="sr-only" />
            </label>
          </div>
          {importError && <p className="text-red-400 text-xs mt-2">{importError}</p>}
          <p className="text-white/25 text-xs mt-2">
            Word progress is saved. API keys are excluded from exports.
          </p>

          {/* Google Drive sync */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-white/40 text-xs font-sans mb-3">Google Drive sync — works across all your devices</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDriveSave}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-sans hover:bg-blue-500/20 transition-colors active:scale-[0.97]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.72 11.095" />
                </svg>
                Save to Drive
              </button>
              <button
                type="button"
                onClick={handleDriveLoad}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-sans hover:bg-blue-500/20 transition-colors active:scale-[0.97]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75v6.75m0 0l-3-3m3 3l3-3m-8.25 6a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.72 11.095" />
                </svg>
                Load from Drive
              </button>
            </div>
            {driveMsg && (
              <p className={`text-xs mt-2 font-sans ${driveMsg.startsWith('✓') ? 'text-green-400' : driveMsg.startsWith('Error') ? 'text-red-400' : 'text-white/40'}`}>
                {driveMsg}
              </p>
            )}
            <p className="text-white/20 text-xs mt-2">Requires Google sign-in (Browse → Subscriptions). API keys are never synced.</p>
          </div>
        </Section>

      </div>

      {/* Sticky Save Button */}
      <div className="fixed bottom-0 inset-x-0 px-4 pb-6 pt-3 bg-gradient-to-t from-bg via-bg to-transparent z-50">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveState === 'saving'}
          className={`w-full py-4 rounded-2xl font-display font-semibold text-base transition-all active:scale-[0.98] ${
            saveState === 'saved'
              ? 'bg-green-500 text-white'
              : isDirty
              ? 'bg-accent text-black shadow-lg shadow-accent/20'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          }`}
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : isDirty ? 'Save Changes' : 'No Changes'}
        </button>
      </div>
    </div>
  )
}
