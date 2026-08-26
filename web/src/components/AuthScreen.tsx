import { useState } from 'react'
import { auth } from '../lib/auth'
import { api } from '../lib/api'

// Injected at build time (empty when Google sign-in is disabled).
declare const __GOOGLE_CLIENT_ID__: string

type Mode = 'login' | 'register'

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  // The client id is baked in; the button shows only if it is non-empty AND the
  // backend reports Google enabled (cheatsheet: option is conditional).
  const googleClientId = __GOOGLE_CLIENT_ID__ || ''
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(googleClientId ? null : false)

  // Ask the backend whether Google sign-in is actually configured server-side.
  useState(() => {
    if (!googleClientId) { setGoogleEnabled(false); return }
    api.meta()
      .then((m) => setGoogleEnabled(Boolean(m.auth?.google_enabled)))
      .catch(() => setGoogleEnabled(false))
  })

  const handleGoogle = async (credential: string) => {
    setError(null)
    setGoogleBusy(true)
    try {
      await auth.googleLogin(credential)
      onAuthed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
    } finally {
      setGoogleBusy(false)
    }
  }

  // Google Identity Services: render the One Tap button into a div and wire its
  // callback to our backend exchange. Done imperatively so we only load GIS once
  // the button is actually shown.
  const googleDivRef = (el: HTMLDivElement | null) => {
    if (!el || !googleEnabled || !(window as any).google?.accounts?.id) return
    ;(window as any).google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (resp: { credential: string }) => handleGoogle(resp.credential),
    })
    ;(window as any).google.accounts.id.renderButton(el, {
      theme: 'outline',
      size: 'large',
      width: el.clientWidth || 280,
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await auth.login(email, password)
      else await auth.register(email, password, displayName || undefined)
      onAuthed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-8 space-y-4">
        <h1 className="font-headline-lg text-headline-lg text-primary">BibleStudy-Crafter</h1>
        <p className="text-ui-body-md text-on-surface-variant">
          {mode === 'login' ? 'Sign in to your studies' : 'Create your account'}
        </p>

        {googleEnabled && (
          <div className="space-y-3">
            <div ref={googleDivRef} className="flex justify-center" />
            <div className="flex items-center gap-2 text-ui-label-sm text-on-surface-variant">
              <span className="h-px flex-1 bg-outline-variant/30" />
              or
              <span className="h-px flex-1 bg-outline-variant/30" />
            </div>
          </div>
        )}
        {googleEnabled === false && (
          <p className="text-ui-label-sm text-on-surface-variant">Google sign-in is not configured on this server.</p>
        )}

        {mode === 'register' && (
          <input
            className="w-full rounded-lg bg-surface-container px-3 py-2 text-ui-body-md outline-none focus:ring-2 focus:ring-primary"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
        <input
          type="email" required
          className="w-full rounded-lg bg-surface-container px-3 py-2 text-ui-body-md outline-none focus:ring-2 focus:ring-primary"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password" required minLength={8}
          className="w-full rounded-lg bg-surface-container px-3 py-2 text-ui-body-md outline-none focus:ring-2 focus:ring-primary"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-ui-label-sm text-error">{error}</p>}

        <button
          type="submit" disabled={busy || googleBusy}
          className="w-full rounded-lg bg-primary px-4 py-2 text-ui-label-lg text-on-primary font-medium disabled:opacity-50"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="w-full text-ui-label-sm text-on-surface-variant hover:text-primary"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
