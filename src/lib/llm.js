/**
 * LLM abstraction — supports Claude, Groq, Grok (xAI), and OpenAI GPT.
 * All calls go through llmCall(prompt, settings) and return a string.
 */

// Provider configs
export const PROVIDERS = {
  claude: {
    name: 'Claude (Anthropic)',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest, cheapest)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
    ],
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com',
  },
  groq: {
    name: 'Groq',
    models: [
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest, free tier)' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (smarter)' },
    ],
    keyLabel: 'Groq API Key',
    keyPlaceholder: 'gsk_...',
    keyUrl: 'https://console.groq.com',
  },
  grok: {
    name: 'Grok (xAI)',
    models: [
      { id: 'grok-3-mini', label: 'Grok 3 Mini (fast, cheap)' },
      { id: 'grok-3', label: 'Grok 3 (smarter)' },
    ],
    keyLabel: 'xAI API Key',
    keyPlaceholder: 'xai-...',
    keyUrl: 'https://console.x.ai',
  },
  openai: {
    name: 'OpenAI GPT',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (cheapest)' },
      { id: 'gpt-4o', label: 'GPT-4o (smarter)' },
    ],
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.openai.com',
  },
}

/** Call the configured LLM with a plain text prompt. Returns response string. */
export async function llmCall(prompt, settings, systemPrompt = null) {
  const { llmProvider, llmModel } = settings

  if (!llmProvider) throw new Error('No LLM provider configured. Go to Settings.')

  const apiKey = settings[`${llmProvider}ApiKey`]
  if (!apiKey) throw new Error(`No API key for ${llmProvider}. Go to Settings.`)

  if (llmProvider === 'claude') {
    return callClaude(prompt, systemPrompt, apiKey, llmModel)
  } else {
    return callOpenAICompat(prompt, systemPrompt, apiKey, llmModel, llmProvider)
  }
}

async function callClaude(prompt, systemPrompt, apiKey, model) {
  const body = {
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  }
  if (systemPrompt) body.system = systemPrompt

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error ${res.status}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

async function callOpenAICompat(prompt, systemPrompt, apiKey, model, provider) {
  const baseURLMap = {
    groq: 'https://api.groq.com/openai/v1',
    grok: 'https://api.x.ai/v1',
    openai: 'https://api.openai.com/v1',
  }

  const defaultModelMap = {
    groq: 'llama-3.1-8b-instant',
    grok: 'grok-3-mini',
    openai: 'gpt-4o-mini',
  }

  const baseURL = baseURLMap[provider]
  const finalModel = model || defaultModelMap[provider]

  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: finalModel, messages, max_tokens: 2048 }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `${provider} API error ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ── Task-specific LLM calls ───────────────────────────────────────────────────

/** Fix broken YouTube caption segmentation */
export async function fixCaptions(rawCaptions, language, videoTitle, videoDescription, settings) {
  const system = `You are a subtitle editor. Fix broken YouTube auto-captions.
Merge caption fragments into complete sentences using natural ${language} sentence boundaries.
Use the video title and description as context to fix obvious transcription errors.
Modify the text as LITTLE as possible — only fix clear errors and merging.
Return ONLY a JSON array, no other text.`

  const prompt = `Video title: ${videoTitle}
Description: ${videoDescription?.slice(0, 300) || 'N/A'}

Fix these broken captions into complete sentences.
Each output item: { "start": number (ms), "end": number (ms), "text": string }
Use start of first merged fragment and end of last merged fragment for timing.

Captions:
${JSON.stringify(rawCaptions.slice(0, 200))}`

  const raw = await llmCall(prompt, settings, system)

  // Extract JSON from response
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('LLM did not return valid caption JSON')
  return JSON.parse(match[0])
}

/** Translate a sentence to English */
export async function translateSentence(text, fromLanguage, settings) {
  const prompt = `Translate this ${fromLanguage} text to English. Return ONLY the translation, nothing else.\n\n${text}`
  return llmCall(prompt, settings)
}

/** Look up a word in context */
export async function lookupWord(word, sentence, language, settings) {
  const isJapanese = language === 'ja' || language === 'Japanese'

  const system = `You are a ${language} language tutor. Return ONLY valid JSON, no other text.`

  const prompt = `The learner tapped on "${word}" in this sentence:
"${sentence}"

Return JSON:
{
  "base_form": "uninflected/dictionary form of the word",
  ${isJapanese ? '"furigana": "reading in hiragana if kanji present, else null",' : ''}
  "definition": "brief English definition (1 sentence max)",
  "context_note": "how this word is used in THIS specific sentence (1 sentence max)"
}`

  const raw = await llmCall(prompt, settings, system)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('LLM did not return valid word data')
  return JSON.parse(match[0])
}
