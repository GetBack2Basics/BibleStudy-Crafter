import { auth } from './auth'

export type KeyStatus = {
  use_custom_keys: boolean
  preferred_provider: string
  has_openrouter: boolean
  has_gemini: boolean
  has_anthropic: boolean
  has_fal: boolean
  has_replicate: boolean
  masked_keys: Record<string, string>
  server_free_providers: string[]
}

export type KeySettingsPayload = {
  use_custom_keys: boolean
  preferred_provider: string
  openrouter_api_key?: string
  gemini_api_key?: string
  anthropic_api_key?: string
  fal_key?: string
  replicate_api_token?: string
}

export type TestKeyPayload = {
  provider: 'gemini' | 'openrouter' | 'anthropic' | string
  api_key: string
}

export type TestKeyResult = {
  success: boolean
  latency_ms: number
  message: string
  error?: string
}

function apiUrl(): string {
  return import.meta.env.VITE_API_URL ?? 'http://localhost:8421'
}

export const keysApi = {
  async getStatus(): Promise<KeyStatus> {
    const t = auth.accessToken()
    const r = await fetch(`${apiUrl()}/api/keys/status`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
    if (!r.ok) throw new Error('Failed to load API key status')
    return (await r.json()) as KeyStatus
  },

  async saveSettings(payload: KeySettingsPayload): Promise<KeyStatus> {
    const t = auth.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/keys/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to save settings')
    return (await r.json()) as KeyStatus
  },

  async testKey(payload: TestKeyPayload): Promise<TestKeyResult> {
    const t = auth.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/keys/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Test request failed')
    return (await r.json()) as TestKeyResult
  },
}
