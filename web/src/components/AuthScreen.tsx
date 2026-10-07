import { useState, useEffect, useRef } from 'react'
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
  
  const [googleClientId, setGoogleClientId] = useState<string>(
    typeof __GOOGLE_CLIENT_ID__ !== 'undefined' ? __GOOGLE_CLIENT_ID__ : ''
  )
  const [googleEnabled, setGoogleEnabled] = useState<boolean>(false)
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  // Fetch server meta to dynamically detect GOOGLE_CLIENT_ID from backend if not set at build time
  useEffect(() => {
    api.meta()
      .then((m) => {
        const clientId = m.auth?.google_client_id || googleClientId
        if (clientId) {
          setGoogleClientId(clientId)
          setGoogleEnabled(true)
        } else {
          setGoogleEnabled(false)
        }
      })
      .catch(() => {
        if (googleClientId) setGoogleEnabled(true)
      })
  }, [])

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

  // Initialize and render Google button
  useEffect(() => {
    if (!googleEnabled || !googleClientId || !googleBtnRef.current) return

    const initGoogle = () => {
      if ((window as any).google?.accounts?.id) {
        try {
          ;(window as any).google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (resp: { credential: string }) => handleGoogle(resp.credential),
          })
          if (googleBtnRef.current) {
            googleBtnRef.current.innerHTML = ''
            ;(window as any).google.accounts.id.renderButton(googleBtnRef.current, {
              theme: 'outline',
              size: 'large',
              type: 'standard',
              shape: 'pill',
              text: 'signin_with',
              logo_alignment: 'left',
              width: googleBtnRef.current.clientWidth || 320,
            })
          }
        } catch (e) {
          console.warn('Google Auth init error:', e)
        }
      }
    }

    if ((window as any).google?.accounts?.id) {
      initGoogle()
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(interval)
          initGoogle()
        }
      }, 200)
      return () => clearInterval(interval)
    }
  }, [googleEnabled, googleClientId, mode])

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
    <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-4 py-8">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl border border-outline-variant/30 p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-1">
            <span className="material-symbols-outlined text-[28px]">menu_book</span>
          </div>
          <h1 className="font-headline-lg text-2xl font-bold text-primary tracking-tight">BibleStudy-Crafter</h1>
          <p className="text-xs text-on-surface-variant max-w-xs mx-auto">
            {mode === 'login' ? 'Welcome back. Sign in to your devotionals & study plans.' : 'Create your free account to start crafting theological studies.'}
          </p>
        </div>

        {googleEnabled && (
          <div className="space-y-4">
            <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <span className="h-px flex-1 bg-outline-variant/20" />
              <span>or with email</span>
              <span className="h-px flex-1 bg-outline-variant/20" />
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Display Name</label>
              <input
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3.5 py-2.5 text-sm text-on-surface outline-none focus:border-primary transition-colors"
                placeholder="e.g. David"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-on-surface-variant">Email Address</label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setEmail('demo'); setPassword('demo123'); setError(null); }}
                  className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                >
                  Use Demo Account
                </button>
              )}
            </div>
            <input
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3.5 py-2.5 text-sm text-on-surface outline-none focus:border-primary transition-colors"
              placeholder="user@example.com or demo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3.5 py-2.5 text-sm text-on-surface outline-none focus:border-primary transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {busy || googleBusy ? 'Authenticating…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              className="text-xs text-on-surface-variant hover:text-primary transition-colors"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            >
              {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
