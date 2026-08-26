import { auth } from './auth'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8421'

export type LogEvent = {
  ts: number
  level: 'info' | 'success' | 'warn' | 'error'
  scope: string
  message: string
  cost_usd: number | null
  study_id: number | null
}

export type Meta = {
  build_stamp: string
  git_sha: string
  started_at: number
  version: string
  providers: { text: boolean; ollama: boolean; image: boolean }
  budget_cap_usd: number
  auth: { google_enabled: boolean; google_client_id: string | null }
}

// Centralised fetch: attaches the bearer token, retries once on 401 with a
// refreshed token, and triggers a forced logout (via the onUnauthorized hook)
// if auth cannot be recovered.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = auth.accessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API}${path}`, { ...init, headers })

  if (res.status === 401 && token) {
    const next = await auth.refresh()
    if (next) {
      const h2 = new Headers(init.headers)
      h2.set('Authorization', `Bearer ${next.access_token}`)
      if (init.body && !h2.has('Content-Type')) h2.set('Content-Type', 'application/json')
      return fetch(`${API}${path}`, { ...init, headers: h2 })
    }
    // Refresh failed -> force logout.
    auth.clear()
    onUnauthorized?.()
  }
  return res
}

export const api = {
  url: API,
  meta: (): Promise<Meta> => authedFetch(`/api/meta`).then((r) => r.json()),
  health: async () => { const r = await authedFetch(`/health`); return r.ok },
  eventStream: () => new EventSource(`${API}/api/events`),
  raw: authedFetch,
  // Authenticated fetch for callers that build their own full paths.
  fetch: authedFetch,
  setUnauthorizedHandler,
}
