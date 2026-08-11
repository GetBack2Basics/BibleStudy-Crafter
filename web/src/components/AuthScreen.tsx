import { useState } from 'react'
import { auth } from '../lib/auth'

type Mode = 'login' | 'register'

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
          type="submit" disabled={busy}
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
