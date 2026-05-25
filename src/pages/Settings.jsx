import { useState } from 'react'
import { PROVIDERS } from '../lib/llm.js'
import { LANGUAGE_CODES } from '../lib/captions.js'
import { exportProfile, importProfile } from '../lib/storage.js'

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

function ApiKeyField({ label, placeholder, value, onChange, url }) {
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
          Get key ↗
        </a>
      )}
    </div>
  )
}

export default function Settings({ settings, onUpdate }) {
  const [importError, setImportError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  function update(key, val) {
    onUpdate(key, val)
    setSaveMsg('Saved')
    setTimeout(() => setSaveMsg(''), 1500)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      await importProfile(text)
      setImportError('')
      setSaveMsg('Profile imported!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (err) {
      setImportError(err.message)
    }
    e.target.value = ''
  }

  const activeProvider = PROVIDERS[settings.llmProvider]

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 pb-28 pt-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl text-white">Settings</h1>
        {saveMsg && (
          <span className="text-accent text-xs font-sans animate-fade-in">{saveMsg}</span>
        )}
      </div>

      {/* LLM Provider */}
      <Section title="AI Provider">
        <Field label="Provider">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <button
                key={id}
                onClick={() => update('llmProvider', id)}
                className={`py-3 rounded-xl text-sm font-sans font-medium border transition-all active:scale-[0.97] ${
                  settings.llmProvider === id
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
              value={settings.llmModel}
              onChange={e => update('llmModel', e.target.value)}
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
              label={p.keyLabel}
              placeholder={p.keyPlaceholder}
              value={settings[`${id}ApiKey`] || ''}
              onChange={val => update(`${id}ApiKey`, val)}
              url={p.keyUrl}
            />
          </Field>
        ))}

        <Field
          label="YouTube Data API Key"
          hint="Required for video browsing"
        >
          <ApiKeyField
            placeholder="AIza..."
            value={settings.youtubeApiKey || ''}
            onChange={val => update('youtubeApiKey', val)}
            url="https://console.cloud.google.com"
          />
        </Field>

        <Field
          label="Caption Proxy URL"
          hint="Cloudflare Worker URL for fetching YouTube captions. See README for setup (5 min, free)."
        >
          <input
            type="url"
            value={settings.proxyUrl || ''}
            onChange={e => update('proxyUrl', e.target.value)}
            placeholder="https://your-worker.workers.dev"
            className="input"
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
                onClick={() => update('targetLanguage', lang)}
                className={`py-2.5 rounded-xl text-xs font-sans font-medium border transition-all active:scale-[0.97] ${
                  settings.targetLanguage === lang
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

      {/* Study */}
      <Section title="Study Mode">
        <Field label="Immersion mode">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'intensive', label: '⏸ Intensive', hint: 'Pauses after each line' },
              { id: 'free', label: '▶ Free Flow', hint: 'Continuous playback' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => update('immersionMode', id)}
                className={`py-3 rounded-xl text-sm font-sans border transition-all active:scale-[0.97] ${
                  settings.immersionMode === id
                    ? 'bg-accent text-black border-accent'
                    : 'border-border text-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="English translation">
          <div className="space-y-2">
            {/* Show/hide toggle */}
            <button
              onClick={() => update('showTranslation', !settings.showTranslation)}
              className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all ${
                settings.showTranslation ? 'border-accent/40 bg-accent/5' : 'border-border'
              }`}
            >
              <span className="text-sm text-white/70 font-sans">Show translation</span>
              <div className={`w-10 h-6 rounded-full transition-colors relative ${settings.showTranslation ? 'bg-accent' : 'bg-white/20'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.showTranslation ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </button>

            {/* Blur toggle */}
            {settings.showTranslation && (
              <button
                onClick={() => update('blurTranslation', !settings.blurTranslation)}
                className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all ${
                  settings.blurTranslation ? 'border-accent/40 bg-accent/5' : 'border-border'
                }`}
              >
                <div>
                  <span className="text-sm text-white/70 font-sans">Blur until tapped</span>
                  <p className="text-white/30 text-xs">Challenge yourself first</p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors relative ${settings.blurTranslation ? 'bg-accent' : 'bg-white/20'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.blurTranslation ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </button>
            )}
          </div>
        </Field>
      </Section>

      {/* Profile */}
      <Section title="Profile">
        <div className="grid grid-cols-2 gap-3">
          <button
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
          Export saves all word progress. API keys are excluded from export for security.
        </p>
      </Section>
    </div>
  )
}
