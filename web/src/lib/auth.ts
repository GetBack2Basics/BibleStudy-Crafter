// Auth client: register / login / logout / token storage.
// Tokens live in localStorage (access + refresh). The access token is attached
// as a Bearer header by lib/api.ts. On 401 we refresh once, else force logout.

const TOKEN_KEY = 'bsc_tokens'

export type Tokens = { access_token: string; refresh_token: string }
export type AuthUser = { id: number; email: string; display_name: string; is_admin: boolean; is_active: boolean }

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export const auth = {
  tokens(): Tokens | null {
    return safeParse<Tokens>(localStorage.getItem(TOKEN_KEY))
  },
  setTokens(t: Tokens) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
  },
  accessToken(): string | null {
    return this.tokens()?.access_token ?? null
  },

  async register(email: string, password: string, display_name?: string): Promise<Tokens> {
    const r = await fetch(`${apiUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Registration failed')
    const t = (await r.json()) as Tokens & { user: AuthUser }
    this.setTokens({ access_token: t.access_token, refresh_token: t.refresh_token })
    return { access_token: t.access_token, refresh_token: t.refresh_token }
  },

  async login(email: string, password: string): Promise<Tokens> {
    const r = await fetch(`${apiUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Login failed')
    const t = (await r.json()) as Tokens & { user: AuthUser }
    this.setTokens({ access_token: t.access_token, refresh_token: t.refresh_token })
    return { access_token: t.access_token, refresh_token: t.refresh_token }
  },

  async logout() {
    const t = this.tokens()
    if (t) {
      await fetch(`${apiUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.access_token}` },
        body: JSON.stringify({ refresh_token: t.refresh_token }),
      }).catch(() => {})
    }
    this.clear()
  },

  // Exchange a refresh token for a new pair. Returns null if the refresh is invalid.
  async refresh(): Promise<Tokens | null> {
    const t = this.tokens()
    if (!t) return null
    const r = await fetch(`${apiUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh_token }),
    })
    if (!r.ok) { this.clear(); return null }
    const next = (await r.json()) as Tokens
    this.setTokens(next)
    return next
  },

  async me(): Promise<AuthUser | null> {
    const t = this.accessToken()
    if (!t) return null
    const r = await fetch(`${apiUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!r.ok) return null
    return (await r.json()) as AuthUser
  },
}

function apiUrl(): string {
  return import.meta.env.VITE_API_URL ?? 'http://localhost:8421'
}
