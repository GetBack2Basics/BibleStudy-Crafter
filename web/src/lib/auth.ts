// Auth client: register / login / logout / token storage.
// Tokens live in localStorage (access + refresh). The access token is attached
// as a Bearer header by lib/api.ts. On 401 we refresh once, else force logout.

const TOKEN_KEY = 'bsc_tokens'

export type Tokens = { access_token: string; refresh_token: string }

export type AuthUser = {
  id: number
  email: string
  display_name: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER' | string
  auth_provider: 'EMAIL' | 'GOOGLE' | string
  picture_url: string
  organization: string
  phone: string
  notes: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  study_count: number
}

export type ProfileUpdatePayload = {
  display_name?: string
  organization?: string
  phone?: string
  picture_url?: string
  notes?: string
}

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

  async googleLogin(idToken: string): Promise<Tokens> {
    const r = await fetch(`${apiUrl()}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Google sign-in failed')
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

  async updateProfile(payload: ProfileUpdatePayload): Promise<AuthUser> {
    const t = this.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to update profile')
    return (await r.json()) as AuthUser
  },

  // Admin User Management
  async listAdminUsers(): Promise<AuthUser[]> {
    const t = this.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/auth/admin/users`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to list users')
    return (await r.json()) as AuthUser[]
  },

  async updateUserRole(userId: number, role: string): Promise<AuthUser> {
    const t = this.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/auth/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ role }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to update role')
    return (await r.json()) as AuthUser
  },

  async updateUserStatus(userId: number, isActive: boolean): Promise<AuthUser> {
    const t = this.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/auth/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ is_active: isActive }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to update status')
    return (await r.json()) as AuthUser
  },

  async deleteUser(userId: number): Promise<void> {
    const t = this.accessToken()
    if (!t) throw new Error('Not authenticated')
    const r = await fetch(`${apiUrl()}/api/auth/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to delete user')
  },
}

function apiUrl(): string {
  return (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
    ? import.meta.env.VITE_API_URL
    : (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:8421' : '')
}
