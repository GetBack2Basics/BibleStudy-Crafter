import { useEffect, useRef, useState, createContext, useContext } from 'react'
import { Link, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import StatusDock from './components/StatusDock'
import AuthScreen from './components/AuthScreen'
import ProfileModal from './components/ProfileModal'
import { api } from './lib/api'
import { auth, type AuthUser } from './lib/auth'
import { studies as studyApi, bible, preferences, passages, TRADITIONS, type StudyOut, type DayOut, type DayDraft, type TranslationInfo, type CompareVerse, type PassageOut, type SearchHit, type TTSChoice, ttsDefaultVoices } from './lib/studies'
import SourceReaderModal, { type AnySource } from './components/SourceReaderModal'
import QuestionsSection from './components/QuestionsSection'
import CommentarySection from './components/CommentarySection'
import PrayerSection from './components/PrayerSection'
import DayHeroBanner from './components/DayHeroBanner'
import InfographicViewer from './components/InfographicViewer'
import MoodArtworkSection from './components/MoodArtworkSection'
import PromptCrafterModal from './components/PromptCrafterModal'
import { assets as assetApi, type AssetOut } from './lib/studies'
import { initAppearance, getStoredTheme, getStoredFontScale, applyTheme, applyFontScale, type ThemeMode } from './lib/theme'

const STATUS_CLS: Record<string, string> = {
  pending: 'text-outline',
  generating: 'text-tertiary',
  ready: 'text-primary',
  failed: 'text-error',
}

const StudyTitleCtx = createContext<{ title: string | null; dayNum?: number } | null>(null)
const SetStudyTitleCtx = createContext<((v: { title: string; dayNum?: number } | null) => void) | null>(null)
export const OpenProfileCtx = createContext<(tab?: 'profile' | 'byok' | 'admin') => void>(() => {})

export function isKeyError(errText?: string | null): boolean {
  if (!errText) return false
  const lower = errText.toLowerCase()
  return (
    lower.includes('key_required') ||
    lower.includes('no text provider') ||
    lower.includes('all providers failed') ||
    lower.includes('all text providers failed') ||
    lower.includes('api key') ||
    lower.includes('402') ||
    lower.includes('noprovideravailable') ||
    lower.includes('openrouter_free') ||
    lower.includes('gemini_free') ||
    lower.includes('exhausted')
  )
}

export function ApiKeyAlert({ error, className = '' }: { error?: string | null; className?: string }) {
  const openProfile = useContext(OpenProfileCtx)
  return (
    <div className={`rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-ambient ${className}`}>
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-2xl text-amber-400 shrink-0">key</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-headline-sm text-sm font-bold text-amber-300">
            API Key Required for AI Generation
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
            {error && error.includes('KEY_REQUIRED')
              ? error.replace(/^.*KEY_REQUIRED:\s*/i, '')
              : 'The free AI model pool could not be reached or quota was exhausted. Please configure your free Google Gemini or OpenRouter API key to continue generating study content.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openProfile('byok')}
              className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow"
            >
              <I name="key" cls="text-[16px]" /> Add API Key (Free)
            </button>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline hover:text-primary-container inline-flex items-center gap-1"
            >
              Get free Gemini Key <I name="open_in_new" cls="text-[13px]" />
            </a>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-on-surface-variant underline hover:text-on-surface inline-flex items-center gap-1"
            >
              Get free OpenRouter Key <I name="open_in_new" cls="text-[13px]" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

/* Reusable collapsible block. Header is a div so the optional `right` slot
   (e.g. a Refresh button) is a sibling, NOT a nested <button> (invalid HTML).
   Clicking the title or the chevron toggles; `right` is independent. */
function CollapsibleSection({ title, icon, defaultOpen = true, children, right, className = '' }: {
  title: React.ReactNode
  icon?: string
  defaultOpen?: boolean
  children: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => !o)
  return (
    <section className={`rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-ambient ${className}`}>
      <div className="flex items-center gap-2 rounded-2xl px-4 py-3 transition-colors hover:bg-surface-container-high">
        <button type="button" onClick={toggle} aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {icon && <I name={icon} cls="text-[18px] text-primary shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-ui-label-md text-on-surface">{title}</span>
        </button>
        {right}
        <button type="button" onClick={toggle} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}
                className="shrink-0 text-on-surface-variant transition-transform">
          <I name={open ? 'expand_less' : 'expand_more'} cls="text-[22px]" />
        </button>
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => auth.accessToken() !== null)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [profileTab, setProfileTab] = useState<'profile' | 'byok' | 'admin'>('profile')
  const [studiesList, setStudiesList] = useState<StudyOut[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [studyTitle, setStudyTitle] = useState<{ title: string; dayNum?: number } | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [fontScale, setFontScale] = useState<number>(() => getStoredFontScale())

  useEffect(() => {
    initAppearance()
  }, [])

  const handleDecreaseFont = () => {
    const newScale = Math.max(0.75, Math.round((fontScale - 0.1) * 100) / 100)
    setFontScale(newScale)
    applyFontScale(newScale)
  }

  const handleIncreaseFont = () => {
    const newScale = Math.min(1.5, Math.round((fontScale + 0.1) * 100) / 100)
    setFontScale(newScale)
    applyFontScale(newScale)
  }

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const openProfile = (tab: 'profile' | 'byok' | 'admin' = 'profile') => {
    setProfileTab(tab)
    setIsProfileOpen(true)
  }

  const refreshList = () => {
    setLoadingList(true)
    studyApi.list().then(setStudiesList).catch(() => setStudiesList([])).finally(() => setLoadingList(false))
  }

  const loadUser = () => {
    auth.me().then(setCurrentUser).catch(() => {})
  }

  const handleLogout = async () => {
    await auth.logout()
    setAuthed(false)
    setCurrentUser(null)
    setStudiesList([])
    window.history.back()
  }

  // Any unrecoverable 401 (e.g. refresh expired) drops the user to the login screen.
  useEffect(() => {
    api.setUnauthorizedHandler(() => { setAuthed(false); setCurrentUser(null); setStudiesList([]) })
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this study? This cannot be undone.')) return
    await studyApi.remove(id)
    refreshList()
    loadUser()
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL studies? The Bible translations and verses are kept.')) return
    await studyApi.removeAll()
    window.history.back()
    refreshList()
    loadUser()
  }

  useEffect(() => {
    if (authed) {
      refreshList()
      loadUser()
    }
  }, [authed])

  if (!authed) {
    return <AuthScreen onAuthed={() => { setAuthed(true); loadUser() }} />
  }

  return (
    <OpenProfileCtx.Provider value={openProfile}>
    <SetStudyTitleCtx.Provider value={setStudyTitle}>
    <StudyTitleCtx.Provider value={studyTitle}>
    <div className="min-h-screen bg-background text-on-background">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b border-outline-variant/20 bg-surface-container-lowest/80 px-margin-mobile py-3 backdrop-blur lg:px-margin-desktop">
        <Link to="/" className="font-study-title text-study-title font-bold text-primary tracking-tight hover:text-primary-container transition-colors">
          {studyTitle?.title ?? 'BibleStudy-Crafter'}{studyTitle && studyTitle.dayNum ? ` · Day ${studyTitle.dayNum}` : ''}
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Font scale decrease / increase (small F / big F) */}
          <div className="flex items-center rounded-full border border-outline-variant/30 bg-surface-container-low p-0.5 shadow-sm">
            <button
              type="button"
              onClick={handleDecreaseFont}
              title="Decrease font size (small F)"
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors font-bold"
              aria-label="Decrease font size"
            >
              <span className="text-[11px] leading-none font-bold">F</span>
            </button>
            <div className="h-3.5 w-px bg-outline-variant/30 mx-0.5" />
            <button
              type="button"
              onClick={handleIncreaseFont}
              title="Increase font size (big F)"
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors font-bold"
              aria-label="Increase font size"
            >
              <span className="text-[17px] leading-none font-bold">F</span>
            </button>
          </div>

          {/* Theme Quick Toggle */}
          <button
            type="button"
            onClick={handleToggleTheme}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors shadow-sm"
            aria-label="Toggle dark / light theme"
          >
            <I name={theme === 'dark' ? 'light_mode' : 'dark_mode'} cls="text-[18px] text-amber-400" />
          </button>

          {/* User Account / Profile Button */}
          <button
            type="button"
            onClick={() => openProfile('profile')}
            title={`Account Settings (${currentUser?.display_name || currentUser?.email || 'Profile'})`}
            aria-label="Account Settings and Profile"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high transition-all shadow-sm overflow-hidden"
          >
            {currentUser?.picture_url ? (
              <img src={currentUser.picture_url} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/20 text-primary font-bold text-xs">
                {(currentUser?.display_name || currentUser?.email || 'U')[0].toUpperCase()}
              </div>
            )}
          </button>
        </div>
      </header>

      <main className="page-shell py-8">
        <Routes>
          <Route path="/" element={<StudyList studies={studiesList} loading={loadingList} onRefresh={refreshList} onDelete={handleDelete} onDeleteAll={handleDeleteAll} />} />
          <Route path="/study/:id" element={<StudyDetail />} />
          <Route path="/study/:id/day/:day" element={<DayDetail />} />
        </Routes>
      </main>

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false)
          setTheme(getStoredTheme())
          setFontScale(getStoredFontScale())
        }}
        currentUser={currentUser}
        onUserUpdated={(u) => setCurrentUser(u)}
        initialTab={profileTab}
        onLogout={handleLogout}
      />

      <StatusDock />
    </div>
    </StudyTitleCtx.Provider>
    </SetStudyTitleCtx.Provider>
    </OpenProfileCtx.Provider>
  )
}

/* ---------- Create form + list ---------- */

function StudyList({ studies, loading, onRefresh, onDelete, onDeleteAll }: {
  studies: StudyOut[]
  loading: boolean
  onRefresh: () => void
  onDelete: (id: number) => void
  onDeleteAll: () => void
}) {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [days, setDays] = useState(7)
  const [tradition, setTradition] = useState('non_denominational')
  const [version, setVersion] = useState('KJV')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // verse pool: search the corpus for the topic and let the user pick
  const [allTranslations, setAllTranslations] = useState<TranslationInfo[]>([])
  const [hits, setHits] = useState<SearchHit[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    bible.translations().then(setAllTranslations).catch(() => setAllTranslations([]))
  }, [])

  const runSearch = async () => {
    if (!topic.trim()) { setErr('Enter a topic first to find relevant verses'); return }
    setSearching(true)
    try {
      const results = await bible.search(topic.trim(), version, 50)
      setHits(results)
      setSearched(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  const toggle = (ref: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref); else next.add(ref)
      return next
    })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!topic.trim()) { setErr('Topic is required'); return }
    setBusy(true)
    try {
      const res = await studyApi.create({
        topic: topic.trim(), minutes_per_day: minutes, total_days: days,
        tradition, primary_translation: version,
        selected_refs: picked.size > 0 ? [...picked] : undefined,
      })
      navigate(`/study/${res.study_id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Step 1: Subject */}
      <section className="bg-surface-container rounded-3xl p-8 shadow-ambient">
        <div className="mb-6 flex items-center gap-4">
          <div className="step-badge">1</div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Subject of Inquiry</h2>
        </div>
        <form onSubmit={submit} className="space-y-6">
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm focus-within:shadow-md transition-shadow">
            <label className="mb-1 block font-ui-label-sm text-ui-label-sm uppercase tracking-wider text-on-surface-variant" htmlFor="study-topic">
              Primary Topic, Book, or Theme
            </label>
            <input id="study-topic"
              className="w-full bg-transparent border-0 outline-none font-body-reading text-body-reading text-on-surface placeholder:text-outline/50"
              placeholder="e.g. The concept of Grace in Romans, or Isaiah 53"
              value={topic}
              onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="font-ui-label-sm text-on-surface-variant py-1">Suggestions:</span>
            {['Sermon on the Mount', 'Pauline Justification', 'Wisdom Literature'].map((s) => (
              <button key={s} type="button"
                className="font-ui-label-sm text-primary bg-primary-container/30 hover:bg-primary-container px-3 py-1 rounded-full transition-colors text-on-primary-container"
                onClick={() => setTopic(s)}>{s}</button>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Minutes / day</span>
              <input type="number" min={5} max={120}
                className="field-underline"
                value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Days</span>
              <input type="number" min={1} max={90}
                className="field-underline"
                value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Theological Lens</span>
              <select
                className="field-underline"
                value={tradition} onChange={(e) => setTradition(e.target.value)}>
                {TRADITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Preferred Bible version</span>
              <select
                className="field-underline"
                value={version} onChange={(e) => setVersion(e.target.value)}>
                {allTranslations.length > 0
                  ? allTranslations.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)
                  : <option value="KJV">KJV</option>}
              </select>
            </label>
          </div>

          <div className="flex items-end gap-3">
            <button type="button" onClick={runSearch} disabled={searching}
              className="btn-outline disabled:opacity-50">
              <I name="search" cls="text-[18px]" /> {searching ? 'Searching…' : 'Find relevant verses'}
            </button>
            <span className="text-ui-label-sm text-on-surface-variant">Searches the Bible for your topic; tick the verses you want to build the study from.</span>
          </div>

          {hits.length > 0 ? (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-sm">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-ui-label-sm text-on-surface-variant">Showing {hits.length} verses in {version}. Tick to include ({picked.size} selected).</p>
                <button type="button" onClick={() => setPicked(picked.size === hits.length ? new Set() : new Set(hits.map((h) => h.ref)))}
                  className="text-ui-label-sm text-primary hover:text-primary-container">
                  {picked.size === hits.length ? 'Select none' : 'Select all verses'}
                </button>
              </div>
              {hits.map((h) => (
                <label key={h.ref + h.text} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-surface-container-high">
                  <input type="checkbox" className="mt-1 accent-primary" checked={picked.has(h.ref)} onChange={() => toggle(h.ref)} />
                  <span className="text-body-reading"><span className="font-semibold text-primary">{h.ref}</span> — {h.text}</span>
                </label>
              ))}
            </div>
          ) : searched ? (
            <p className="text-ui-label-sm text-on-surface-variant">No verses found for "{topic.trim()}" in {version}. Try a different word.</p>
          ) : null}

          {err && (
            isKeyError(err) ? (
              <ApiKeyAlert error={err} className="my-3" />
            ) : (
              <p className="text-ui-label-sm text-error">{err}</p>
            )
          )}
          <div>
            <button type="submit" disabled={busy}
              className="btn-primary px-8 py-3 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create study'} <I name="arrow_forward" cls="text-[18px]" />
            </button>
          </div>
        </form>
      </section>

      {/* Studies library */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">My Library</h2>
          <div className="flex items-center gap-3">
            {studies.length > 0 && (
              <button onClick={onDeleteAll} className="text-ui-label-md text-error hover:text-error-container">
                Delete all
              </button>
            )}
            <button onClick={onRefresh} className="btn-ghost">
              <I name="refresh" cls="text-[16px]" /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {studies.length === 0 ? (
          <p className="text-ui-label-sm text-on-surface-variant">No studies yet — create one above.</p>
        ) : (
          <ul className="overflow-hidden rounded-3xl border border-outline-variant/20 bg-surface-container-lowest shadow-ambient">
            {studies.map((s) => (
              <li key={s.id} className="group flex items-center border-b border-outline-variant/10 last:border-0">
                <Link to={`/study/${s.id}`}
                  className="flex flex-1 items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-container-high">
                  <span className={`text-[10px] ${STATUS_CLS[s.status]}`}>●</span>
                  <span className="flex-1">
                    <span className="font-ui-label-lg text-on-surface">{s.title || s.topic}</span>
                    <span className="ml-2 text-ui-label-sm text-on-surface-variant">{s.total_days}d · {s.minutes_per_day}m/day · {s.tradition}</span>
                  </span>
                  <span className="text-ui-label-sm text-on-surface-variant">#{s.id}</span>
                </Link>
                <button onClick={() => onDelete(s.id)} title="Delete study"
                  className="px-4 py-4 text-on-surface-variant hover:text-error transition-colors">
                  <I name="delete" cls="text-[18px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ---------- Study detail (poll + render days) ---------- */

function StudyDetail() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const studyId = Number(params.id)
  const [study, setStudy] = useState<StudyOut | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Live generation progress fed by the SSE event stream.
  const [progress, setProgress] = useState<number | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const esRef = useRef<EventSource | null>(null)
  const setTitle = useContext(SetStudyTitleCtx)

  const load = () => {
    studyApi.get(studyId).then(setStudy).catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    if (!Number.isInteger(studyId) || studyId < 1) {
      setErr('Invalid study.')
      return
    }
    load()
    timer.current = setInterval(() => {
      studyApi.get(studyId).then((s) => {
        setStudy(s)
        if (s.status === 'ready' || s.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
        }
      }).catch(() => {})
    }, 2000)

    // Stream real-time progress events for this study.
    const es = new EventSource(`${api.url}/api/events`)
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data?.study_id === studyId && typeof data.progress === 'number') {
          setProgress(data.progress)
          setProgressMsg(data.message || '')
          if (data.progress >= 100 || data.level === 'error') {
            es.close(); esRef.current = null
          }
        }
      } catch { /* ignore malformed */ }
    }

    return () => {
      if (timer.current) clearInterval(timer.current)
      if (esRef.current) esRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId])

  useEffect(() => {
    if (study) setTitle?.({ title: study.title || study.topic })
    return () => setTitle?.(null)
  }, [study, setTitle])

  const genDay = async (day: number) => {
    setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === day ? { ...d, status: 'generating' } : d) }) : s)
    try {
      const res = await studyApi.generateDay(studyId, day)
      setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === day ? { ...d, status: 'ready', blocks_json: res.draft } : d) }) : s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  if (err && !study) return <div className="text-error">{err}</div>
  if (!study) return <p className="text-on-surface-variant">Loading…</p>

  const readyDays = study.days.filter((d) => d.status === 'ready').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="btn-ghost">
          <I name="arrow_back" cls="text-[18px]" /> All studies
        </button>
        <span className={`text-ui-label-md ${STATUS_CLS[study.status]}`}>
          {study.status} · {readyDays}/{study.total_days} days ready
        </span>
      </div>

      <div>
        <h1 className="font-study-title text-study-title font-bold text-on-surface tracking-tight">{study.title || study.topic}</h1>
        <p className="mt-1 text-ui-label-md text-on-surface-variant">
          {study.total_days} days · {study.minutes_per_day} min/day · {study.tradition} · {study.primary_translation}
        </p>
      </div>

      {study.status === 'failed' && (
        <ApiKeyAlert
          error="AI Generation Failed: The AI provider was unreachable or free quota was exhausted. Please configure your free Gemini or OpenRouter key below to continue."
          className="my-3"
        />
      )}

      {err && (
        isKeyError(err) ? (
          <ApiKeyAlert error={err} className="my-3" />
        ) : (
          <div className="text-error my-3">{err}</div>
        )
      )}

      {study.status === 'generating' && (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-ambient">
          <div className="mb-2 flex items-center justify-between text-ui-label-md">
            <span className="text-tertiary">{progressMsg || 'Generating outline & day 1…'}</span>
            <span className="text-on-surface-variant">{progress != null ? `${progress}%` : 'working…'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-outline-variant/30">
            <div className="h-full rounded-full bg-primary transition-all duration-500"
                 style={{ width: `${progress != null ? progress : 8}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-6">
        {study.days.map((d) => (
          <DayCard key={d.day_number} studyId={studyId} day={d} onGenerate={() => genDay(d.day_number)} />
        ))}
      </div>
    </div>
  )
}

/* ---------- Day card with inline editing + select-to-revise ---------- */

function DayCard({ studyId, day, onGenerate, defaultOpen = false }: { studyId: number; day: DayOut; onGenerate: () => void; defaultOpen?: boolean }) {
  const dayLink = `/study/${studyId}/day/${day.day_number}`
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DayDraft | null>(day.blocks_json ?? null)
  const [notes, setNotes] = useState<Record<string, string>>(day.notes ?? {})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const draftRef = useRef<DayDraft | null>(draft)
  draftRef.current = draft
  const notesRef = useRef<Record<string, string>>(notes)
  notesRef.current = notes

  // day-level collapse (default collapsed so long studies stay scannable, or open on detail page)
  const [dayOpen, setDayOpen] = useState(defaultOpen)

  // Visual Assets & Prompt Crafter State
  const [dayAssets, setDayAssets] = useState<AssetOut[]>([])
  const [isCrafterOpen, setIsCrafterOpen] = useState(false)
  const [crafterInitialTab, setCrafterInitialTab] = useState<'presets' | 'assistant' | 'playground' | 'gallery'>('presets')

  const loadDayAssets = async () => {
    try {
      const list = await assetApi.list(studyId, day.day_number)
      setDayAssets(list)
    } catch {
      setDayAssets([])
    }
  }

  useEffect(() => {
    if (dayOpen) {
      loadDayAssets()
    }
  }, [dayOpen, studyId, day.day_number])

  const activeCover = dayAssets.find((a) => (a.kind === 'cover_art' || a.kind === 'image') && a.is_active) || null
  const activeInfographic = dayAssets.find((a) => a.kind === 'infographic' && a.is_active) || null

  const handleOpenCrafter = (tab: 'presets' | 'assistant' | 'playground' | 'gallery' = 'presets') => {
    setCrafterInitialTab(tab)
    setIsCrafterOpen(true)
  }

  // keep local draft in sync with the server ONLY when not actively editing,
  // so the 2s poll doesn't clobber in-progress edits
  useEffect(() => { if (!editing) setDraft(day.blocks_json ?? null) }, [day.blocks_json, editing])
  // sync notes from server when not editing
  useEffect(() => { if (!editing) setNotes(day.notes ?? {}) }, [day.notes, editing])

  const startEdit = () => { setDraft(day.blocks_json ?? null); setErr(null); setEditing(true) }
  const cancel = () => { setDraft(day.blocks_json ?? null); setEditing(false) }

  const save = async () => {
    const current = draftRef.current
    if (!current) return
    setSaving(true)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, current, notesRef.current)
      setDraft(updated.blocks_json ?? null)
      setNotes(updated.notes ?? {})
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async (updatedNotes: Record<string, string>) => {
    const current = draftRef.current
    if (!current) return
    setNotes(updatedNotes)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, current, updatedNotes)
      setNotes(updated.notes ?? updatedNotes)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const [refiningSection, setRefiningSection] = useState<'opening_prayer' | 'commentary' | 'closing_prayer' | null>(null)

  const handleSaveSection = async (section: 'opening_prayer' | 'commentary' | 'closing_prayer', newText: string) => {
    const current = draftRef.current
    if (!current) return
    const updatedDraft = { ...current, [section]: newText }
    setDraft(updatedDraft)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, updatedDraft, notesRef.current)
      setDraft(updated.blocks_json ?? updatedDraft)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAIRefineSection = async (section: 'opening_prayer' | 'commentary' | 'closing_prayer', inst: string, sel?: string | null) => {
    setRefiningSection(section)
    setErr(null)
    try {
      const res = await studyApi.reviseDay(studyId, day.day_number, inst, sel || null, section)
      const current = draftRef.current
      if (current) {
        let nextVal = res.revised
        if (sel && current[section] && current[section].includes(sel)) {
          nextVal = current[section].replace(sel, res.revised)
        }
        const updated = await studyApi.updateDay(studyId, day.day_number, { ...current, [section]: nextVal }, notesRef.current)
        setDraft(updated.blocks_json ?? null)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRefiningSection(null)
    }
  }

  return (
    <article className="passage-card">
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={() => setDayOpen((o) => !o)} aria-expanded={dayOpen}
                aria-label={dayOpen ? `Collapse Day ${day.day_number}` : `Expand Day ${day.day_number}`}
                className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high">
          <I name={dayOpen ? 'expand_less' : 'expand_more'} cls="text-[24px]" />
        </button>
        <Link to={dayLink} className="min-w-0 flex-1">
          <h3 className="font-headline-md text-headline-md text-on-surface truncate">
            <span className="text-primary">Day {day.day_number}</span>{draft?.heading ? ` — ${draft.heading}` : (day.title ? ` — ${day.title}` : '')}
            {day.theme && <span className="ml-2 font-ui-label-sm font-normal text-on-surface-variant">· {day.theme}</span>}
          </h3>
        </Link>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`text-ui-label-sm ${STATUS_CLS[day.status]}`}>{day.status}</span>
          {!editing && day.status !== 'generating' && (
            <>
              <button onClick={startEdit} className="btn-outline"><I name="edit" cls="text-[16px]" /> Edit</button>
              <button onClick={onGenerate} className="btn-outline">
                <I name={day.blocks_json ? 'autorenew' : 'add'} cls="text-[16px]" />
                {day.blocks_json ? 'Regenerate' : 'Generate'}
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={cancel} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary px-3 py-1.5 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {dayOpen && (
        <div className="space-y-4">
          {err && (
            isKeyError(err) ? (
              <ApiKeyAlert error={err} className="mb-2" />
            ) : (
              <p className="mb-2 text-ui-label-sm text-error">{err}</p>
            )
          )}

          {/* Day Hero Cover Art Banner */}
          <DayHeroBanner
            studyId={studyId}
            dayNumber={day.day_number}
            dayTitle={day.title}
            dayHeading={draft?.heading}
            dayTheme={day.theme}
            scriptureRefs={draft?.scripture?.map((s) => s.ref).filter(Boolean) || []}
            activeCoverAsset={activeCover}
            onOpenPromptCrafter={handleOpenCrafter}
          />

          {draft ? (
            <DraftEditor
              draft={draft}
              studyId={studyId}
              day={day.day_number}
              editing={editing}
              onChange={setDraft}
              notes={notes}
              onNotesChange={setNotes}
              onSaveNotes={handleSaveNotes}
              activeCoverAsset={activeCover}
              activeInfographicAsset={activeInfographic}
              onOpenPromptCrafter={handleOpenCrafter}
              onRefreshAssets={loadDayAssets}
              onSaveSection={handleSaveSection}
              onAIRefineSection={handleAIRefineSection}
              refiningSection={refiningSection}
            />
          ) : (
            <p className="text-ui-label-sm text-on-surface-variant">
              {day.status === 'generating' ? 'Working…' : 'Not generated yet.'}
            </p>
          )}
          <Discussions
            studyId={studyId}
            day={day}
            draft={draft}
            notes={notes}
            onSaveNotes={handleSaveNotes}
          />
        </div>
      )}

      {/* Prompt Crafter Studio Modal */}
      <PromptCrafterModal
        isOpen={isCrafterOpen}
        onClose={() => setIsCrafterOpen(false)}
        studyId={studyId}
        dayNumber={day.day_number}
        dayTitle={draft?.heading || day.title || `Day ${day.day_number}`}
        initialTab={crafterInitialTab}
        onAssetSelected={loadDayAssets}
      />
    </article>
  )
}

/* ---------- Read / edit renderer ---------- */

function DraftEditor({
  draft,
  editing,
  onChange,
  studyId,
  day,
  notes,
  onNotesChange,
  onSaveNotes,
  activeCoverAsset,
  activeInfographicAsset,
  onOpenPromptCrafter,
  onRefreshAssets,
  onSaveSection,
  onAIRefineSection,
  refiningSection,
}: {
  draft: DayDraft
  editing: boolean
  onChange: (d: DayDraft) => void
  studyId: number
  day: number
  notes: Record<string, string>
  onNotesChange: (n: Record<string, string>) => void
  onSaveNotes?: (n: Record<string, string>) => Promise<void> | void
  activeCoverAsset?: AssetOut | null
  activeInfographicAsset?: AssetOut | null
  onOpenPromptCrafter?: (initialTab?: 'presets' | 'assistant' | 'playground' | 'gallery') => void
  onRefreshAssets?: () => void
  onSaveSection?: (section: 'opening_prayer' | 'commentary' | 'closing_prayer', newText: string) => Promise<void> | void
  onAIRefineSection?: (section: 'opening_prayer' | 'commentary' | 'closing_prayer', instruction: string, selection?: string | null) => Promise<void> | void
  refiningSection?: 'opening_prayer' | 'commentary' | 'closing_prayer' | null
}) {
  const setField = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch })
  const saveNotesHandler = onSaveNotes || onNotesChange

  return (
    <div className="space-y-4 text-body-reading text-on-surface">
      {/* Optional Day Heading Edit when editing day overview */}
      {editing && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-3">
          <Labeled label="Day Heading">
            <input
              type="text"
              className="field-underline w-full rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-2 text-ui-label-md font-semibold text-on-surface focus:border-primary focus:outline-none"
              value={draft.heading ?? ''}
              onChange={(e) => setField({ heading: e.target.value })}
              placeholder="e.g. Walking in Grace, The Beatitudes..."
            />
          </Labeled>
        </div>
      )}

      {/* Scripture Readings */}
      <CollapsibleSection title="Scriptures" icon="auto_stories" defaultOpen>
        <PassageEditor studyId={studyId} day={day} fallbackScripture={draft.scripture} onChanged={() => { /* passage changes are server-side; nothing to sync into draft */ }} />
      </CollapsibleSection>

      {/* Sacred Visual Atmosphere & Mood Artwork directly following Scripture reading */}
      <MoodArtworkSection
        studyId={studyId}
        dayNumber={day}
        dayTitle={draft.heading}
        dayTheme={draft.heading}
        scriptureRefs={draft?.scripture?.map((s) => s.ref).filter(Boolean) || []}
        activeArtwork={activeCoverAsset}
        onOpenPromptCrafter={onOpenPromptCrafter}
        onAssetChanged={onRefreshAssets}
      />

      {/* 1. Opening Prayer Section (CoverLetter-Crafter Edit, Save & AI Update Pattern) */}
      <PrayerSection
        title="Opening prayer"
        icon="volunteer_activism"
        prayer={draft.opening_prayer ?? ''}
        note={notes.opening_prayer}
        onSavePrayer={async (text) => {
          if (onSaveSection) {
            await onSaveSection('opening_prayer', text)
          } else {
            setField({ opening_prayer: text })
          }
        }}
        onSaveNote={async (noteVal) => {
          const nextNotes = { ...notes, opening_prayer: noteVal }
          if (saveNotesHandler) await saveNotesHandler(nextNotes)
        }}
        onAIRefine={async (inst, sel) => {
          if (onAIRefineSection) {
            await onAIRefineSection('opening_prayer', inst, sel)
          }
        }}
        isAIRefining={refiningSection === 'opening_prayer'}
      />

      {/* 2. Commentary Section (CoverLetter-Crafter Edit, Save & AI Update Pattern) */}
      <CommentarySection
        commentary={draft.commentary ?? ''}
        note={notes.commentary}
        onSave={async (text) => {
          if (onSaveSection) {
            await onSaveSection('commentary', text)
          } else {
            setField({ commentary: text })
          }
        }}
        onSaveNote={async (noteVal) => {
          const nextNotes = { ...notes, commentary: noteVal }
          if (saveNotesHandler) await saveNotesHandler(nextNotes)
        }}
        onAIRefine={async (inst, sel) => {
          if (onAIRefineSection) {
            await onAIRefineSection('commentary', inst, sel)
          }
        }}
        isAIRefining={refiningSection === 'commentary'}
      />

      {/* Key Learnings & Infographic */}
      {draft.commentary && (
        <CollapsibleSection title="Key Learnings & Infographic" icon="insights" defaultOpen>
          <InfographicViewer
            studyId={studyId}
            dayNumber={day}
            dayTheme={draft.heading}
            hasCommentary={Boolean(draft.commentary)}
            onOpenPromptCrafter={onOpenPromptCrafter}
            activeInfographicAsset={activeInfographicAsset}
            onAssetChanged={onRefreshAssets}
          />
        </CollapsibleSection>
      )}

      {/* Reflection Questions */}
      <CollapsibleSection title="Reflection questions" icon="help" defaultOpen>
        <QuestionsSection
          questions={draft.questions ?? []}
          notes={notes}
          onSaveNotes={saveNotesHandler}
          editing={editing}
          onQuestionsChange={(q) => setField({ questions: q })}
        />
      </CollapsibleSection>

      {/* 3. Closing Prayer Section (CoverLetter-Crafter Edit, Save & AI Update Pattern) */}
      <PrayerSection
        title="Closing prayer"
        icon="volunteer_activism"
        prayer={draft.closing_prayer ?? ''}
        note={notes.closing_prayer}
        onSavePrayer={async (text) => {
          if (onSaveSection) {
            await onSaveSection('closing_prayer', text)
          } else {
            setField({ closing_prayer: text })
          }
        }}
        onSaveNote={async (noteVal) => {
          const nextNotes = { ...notes, closing_prayer: noteVal }
          if (saveNotesHandler) await saveNotesHandler(nextNotes)
        }}
        onAIRefine={async (inst, sel) => {
          if (onAIRefineSection) {
            await onAIRefineSection('closing_prayer', inst, sel)
          }
        }}
        isAIRefining={refiningSection === 'closing_prayer'}
      />

      {/* External Discussions / Source Notes */}
      {notes.discussions && (
        <CollapsibleSection title="Your note · external voices & sources" icon="forum" defaultOpen>
          <p className="rounded-xl bg-surface-container-high p-3 text-ui-label-sm text-on-tertiary-container whitespace-pre-wrap">{notes.discussions}</p>
        </CollapsibleSection>
      )}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-ui-label-sm uppercase tracking-wide text-on-surface-variant">{label}</div>
      {children}
    </div>
  )
}

/* ---------- Day detail view for /study/:id/day/:day ---------- */

function DayDetail() {
  const navigate = useNavigate()
  const params = useParams<{ id: string; day: string }>()
  const studyId = Number(params.id)
  const dayNum = Number(params.day)

  const [study, setStudy] = useState<StudyOut | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const esRef = useRef<EventSource | null>(null)
  const setTitle = useContext(SetStudyTitleCtx)

  const load = () => {
    if (!Number.isInteger(studyId) || studyId < 1) return
    studyApi.get(studyId).then(setStudy).catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    if (!Number.isInteger(studyId) || studyId < 1) {
      setErr('Invalid study.')
      return
    }
    load()
    timer.current = setInterval(() => {
      studyApi.get(studyId).then((s) => {
        setStudy(s)
        if (s.status === 'ready' || s.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
        }
      }).catch(() => {})
    }, 2000)

    const es = new EventSource(`${api.url}/api/events`)
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data?.study_id === studyId && typeof data.progress === 'number') {
          setProgress(data.progress)
          setProgressMsg(data.message || '')
          if (data.progress >= 100 || data.level === 'error') {
            es.close(); esRef.current = null
          }
        }
      } catch { /* ignore malformed */ }
    }

    return () => {
      if (timer.current) clearInterval(timer.current)
      if (esRef.current) esRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId])

  useEffect(() => {
    if (study) setTitle?.({ title: study.title || study.topic, dayNum })
    return () => setTitle?.(null)
  }, [study, setTitle, dayNum])

  const day = study?.days.find((d) => d.day_number === dayNum)

  if (err && !study) return <div className="text-error">{err}</div>
  if (!study) return <p className="text-on-surface-variant">Loading…</p>
  if (!day) return <div className="text-error">Day {dayNum} not found in this study.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(`/study/${studyId}`)} className="btn-ghost">
          <I name="arrow_back" cls="text-[18px]" /> Back to study
        </button>
      </div>

      <div>
        <h1 className="font-study-title text-study-title font-bold text-on-surface tracking-tight">
          {study.title || study.topic} — Day {dayNum}
        </h1>
      </div>

      {study.status === 'generating' && (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-ambient">
          <div className="mb-2 flex items-center justify-between text-ui-label-md">
            <span className="text-tertiary">{progressMsg || 'Generating…'}</span>
            <span className="text-on-surface-variant">{progress != null ? `${progress}%` : 'working…'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-outline-variant/30">
            <div className="h-full rounded-full bg-primary transition-all duration-500"
                 style={{ width: `${progress != null ? progress : 8}%` }} />
          </div>
        </div>
      )}

      <DayCard studyId={studyId} day={day} defaultOpen onGenerate={async () => {
        try {
          await studyApi.generateDay(studyId, dayNum)
          navigate(`/study/${studyId}/day/${dayNum}`)
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e))
        }
      }} />

      <DayTTS studyId={studyId} day={day} />

      <div className="text-ui-label-md text-on-surface-variant">
        {study.status} · {study.days.filter((d) => d.status === 'ready').length}/{study.total_days} days ready
      </div>
    </div>
  )
}

/* ---------- Read aloud: TTS for a day's content ---------- */

function DayTTS({ studyId, day }: { studyId: number; day: DayOut }) {
  const [voices, setVoices] = useState<TTSChoice[]>(ttsDefaultVoices)
  const [selectedVoice, setSelectedVoice] = useState<TTSChoice | null>(null)
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [ttsStatus, setTtsStatus] = useState<{ asset_id?: number; status?: string } | null>(null)
  const [loadingRender, setLoadingRender] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const assetPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // When the day changes, reset TTS state so the picker and play button start fresh.
  useEffect(() => {
    setTtsStatus(null)
    setSelectedVoice(voices[0] ?? null)
    setErr(null)
  }, [day.day_number, voices])

  const loadVoices = async () => {
    if (voices.length > 0 && voices[0]?.short_name) return
    setLoadingVoices(true)
    try {
      const res = await studyApi.ttsVoices()
      setVoices(res.voices.length ? res.voices : ttsDefaultVoices)
      if (!selectedVoice || !res.voices.find((v) => v.short_name === selectedVoice.short_name)) {
        setSelectedVoice(res.voices[0] ?? ttsDefaultVoices[0] ?? null)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setVoices(ttsDefaultVoices)
      setSelectedVoice(ttsDefaultVoices[0] ?? null)
    } finally {
      setLoadingVoices(false)
    }
  }

  useEffect(() => { loadVoices() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startRender = async () => {
    if (!selectedVoice) return
    setLoadingRender(true)
    setTtsStatus(null)
    setErr(null)
    try {
      const res = await studyApi.ttsRender(studyId, day.day_number, selectedVoice.short_name)
      setTtsStatus(res)
      if (res.status === 'rendering') {
        pollAsset(res.asset_id)
      } else if (res.status === 'ready') {
        startPlayback(res.asset_id)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRender(false)
    }
  }

  const pollAsset = (assetId: number) => {
    if (assetPollRef.current) clearInterval(assetPollRef.current)
    assetPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${api.url}/api/tts/asset/${assetId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${auth.accessToken()}` },
        })
        if (r.status === 200) {
          if (assetPollRef.current) clearInterval(assetPollRef.current)
          setTtsStatus({ asset_id: assetId, status: 'ready' })
          startPlayback(assetId)
        } else if (r.status === 409) {
          if (assetPollRef.current) clearInterval(assetPollRef.current)
          setTtsStatus({ asset_id: assetId, status: 'failed' })
          setErr('Voice rendering failed')
        }
        // 202 still rendering - keep polling
      } catch {
        /* keep polling */
      }
    }, 1500)
  }

  const startPlayback = (assetId: number) => {
    if (assetPollRef.current) clearInterval(assetPollRef.current)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    const token = auth.accessToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    const src = `${api.url}/api/tts/asset/${assetId}${qs}`
    const audio = new Audio(src)
    audioRef.current = audio
    audio.addEventListener('error', () => setErr('Playback failed'))
    audio.play().catch(() => {/* autoplay blocked; user can press play */})
  }

  const ttsReady = ttsStatus?.status === 'ready'
  const ttsRendering = ttsStatus?.status === 'rendering'
  const hasVoice = Boolean(selectedVoice)
  const dayReady = day.status === 'ready' && day.blocks_json
  const contentEmpty = dayReady && !day.blocks_json?.opening_prayer &&
    !day.blocks_json?.commentary && (!day.blocks_json?.questions || day.blocks_json.questions.length === 0) &&
    !day.blocks_json?.closing_prayer

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-ambient">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <I name="speaker_wave" cls="text-[20px] text-primary" />
          <span className="font-ui-label-sm text-on-surface-variant">Read aloud</span>
        </div>

        <label className="flex flex-1 min-w-0 flex-wrap items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-1.5">
          <span className="shrink-0 font-ui-label-sm text-on-surface-variant">Voice</span>
          <select
            className="field-underline inline-block w-auto min-w-0 text-on-surface"
            value={selectedVoice?.short_name ?? ''}
            onChange={(e) => {
              const v = voices.find((vv) => vv.short_name === e.target.value)
              setSelectedVoice(v ?? null)
            }}
            disabled={loadingVoices || voices.length === 0}
          >
            {loadingVoices && <option value="">Loading voices…</option>}
            {voices.map((v) => (
              <option key={v.short_name} value={v.short_name}>
                {v.friendly_name || `${v.locale} · ${v.gender} · ${v.short_name}`}
              </option>
            ))}
          </select>
          {voices.length === 0 && !loadingVoices && (
            <span className="text-ui-label-sm text-error">No voices available</span>
          )}
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={startRender}
            disabled={!dayReady || contentEmpty || !hasVoice || ttsRendering || loadingRender}
            className="btn-outline disabled:opacity-50 disabled:text-on-surface-variant"
          >
            {ttsRendering ? 'Rendering…' : loadingRender ? 'Starting…' : ttsReady ? 'Re-read' : 'Read'}
            <I name={ttsRendering ? 'hourglass_empty' : ttsReady ? 'replay' : 'play_arrow'} cls="text-[18px]" />
          </button>

          {ttsReady && (
            <button
              onClick={() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 } }}
              className="btn-ghost"
              title="Stop"
            >
              <I name="stop" cls="text-[18px]" />
            </button>
          )}
        </div>
      </div>

      {ttsRendering && (
        <div className="mt-3 flex items-center gap-2 text-ui-label-sm text-tertiary">
          <span className="relative flex h-2 w-24 overflow-hidden rounded-full bg-outline-variant/30">
            <span className="animate-pulse h-full rounded-full bg-primary" style={{ width: '40%' }} />
          </span>
          <span>Rendering voice…</span>
        </div>
      )}

      {err && <p className="mt-2 text-ui-label-sm text-error">{err}</p>}

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} />
    </div>
  )
}

/* ---------- Discussions: real, cited reading material about the verses ---------- */

function SourceGrid({
  sources,
  empty,
  onOpenSource,
}: {
  sources: AnySource[]
  empty: string
  onOpenSource: (s: AnySource) => void
}) {
  const displaySources = sources.slice(0, 8)
  if (!displaySources.length) {
    return <p className="text-ui-label-sm text-on-surface-variant/80">{empty}</p>
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {displaySources.map((s, i) => {
        const summary = (s.snippet || '').trim()
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenSource(s)}
            className="voice-card text-left hover:text-primary transition-all group w-full cursor-pointer flex flex-col justify-between"
          >
            <div className="w-full">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                  <I name={s.kind === 'social' ? 'forum' : 'menu_book'} cls="text-[14px]" />
                </span>
                {s.platform && (
                  <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-ui-label-xs text-on-tertiary-container uppercase">
                    {s.platform}
                  </span>
                )}
                {typeof s.engagement === 'number' && s.engagement > 0 && (
                  <span className="font-ui-label-xs text-on-surface-variant/70">▲ {s.engagement}</span>
                )}
                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-primary text-xs flex items-center gap-0.5 font-semibold">
                  Read article <I name="open_in_new" cls="text-[14px]" />
                </span>
              </div>
              <div className="font-ui-label-md font-semibold text-on-surface group-hover:text-primary leading-snug">
                {s.title}
              </div>
              {summary && (
                <p className="mt-2 text-xs text-on-surface-variant/90 line-clamp-4 leading-relaxed font-body-reading">
                  {summary}
                </p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Discussions({
  studyId,
  day,
  draft,
  notes = {},
  onSaveNotes,
}: {
  studyId: number
  day: DayOut
  draft?: DayDraft | null
  notes?: Record<string, string>
  onSaveNotes?: (n: Record<string, string>) => Promise<void> | void
}) {
  const [data, setData] = useState<DayOut['discussions']>(day.discussions ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeSource, setActiveSource] = useState<AnySource | null>(null)

  const reload = async () => {
    const dayNum = Number(day?.day_number)
    if (!Number.isInteger(dayNum) || dayNum < 1) {
      setErr("Cannot identify which day to fetch discussions for.")
      return
    }
    setBusy(true); setErr(null)
    try {
      const res = await studyApi.refreshDiscussions(studyId, dayNum)
      setData(res.discussions)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const d = data

  const handleOpenSource = (s: AnySource) => {
    setActiveSource(s)
  }

  const handleSaveModalNote = async (targetKey: string, formattedNoteContent: string) => {
    const nextNotes = {
      ...notes,
      [targetKey]: formattedNoteContent,
    }
    if (onSaveNotes) {
      await onSaveNotes(nextNotes)
    }
  }

  return (
    <>
      <CollapsibleSection
        title="Voices on these verses"
        icon="forum"
        defaultOpen={false}
        className="mt-6"
      >
        {!d && (
          <div className="flex flex-col gap-3">
            <p className="text-ui-label-sm text-on-surface-variant">Real discussion about these verses, with links back to the sources. Click "Find discussions".</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={reload}
                disabled={busy}
                className="btn-outline flex items-center gap-1.5 text-ui-label-sm disabled:opacity-50"
              >
                <I name="forum" cls="text-[16px]" />
                {busy ? 'Fetching…' : 'Find discussions'}
              </button>
            </div>
          </div>
        )}
        {d && d.status === 'empty' && (
          <div className="flex flex-col gap-3">
            <p className="text-ui-label-sm text-on-surface-variant">No external discussion could be fetched right now. Engage the Scripture directly.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={reload}
                disabled={busy}
                className="btn-outline flex items-center gap-1.5 text-ui-label-sm disabled:opacity-50"
              >
                <I name="refresh" cls="text-[16px]" />
                {busy ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        )}
        {d && d.status === 'ok' && (
          <>
            <p className="mb-4 text-ui-label-sm text-on-surface-variant">
              Curated from {Math.min(8, d.official_sources?.length ?? 0) + Math.min(8, d.social_sources?.length ?? 0)} real sources
              (~{d.official_min} min official, ~{d.social_min} min social).
              Every discussion links directly to its source.
            </p>

            {/* Official commentary sources */}
            <div className="mb-5">
              <div className="mb-2.5 flex items-center gap-2 font-ui-label-sm uppercase tracking-wide text-on-surface-variant font-semibold">
                <I name="menu_book" cls="text-[16px] text-primary" /> Official Commentary
              </div>
              <SourceGrid
                sources={d.official_sources ?? []}
                empty="No official commentary sources were fetched."
                onOpenSource={handleOpenSource}
              />
            </div>

            {/* Social commentary sources */}
            <div className="border-t border-outline-variant/20 pt-4">
              <div className="mb-2.5 flex items-center gap-2 font-ui-label-sm uppercase tracking-wide text-on-surface-variant font-semibold">
                <I name="forum" cls="text-[16px] text-primary" /> Social Commentary
                <span className="font-ui-label-xs normal-case tracking-normal text-on-surface-variant/70 font-normal">(Reddit · Quora · X · Facebook)</span>
              </div>
              <SourceGrid
                sources={d.social_sources ?? []}
                empty="No social-media discussion was fetched (Reddit · Quora · X · Facebook)."
                onOpenSource={handleOpenSource}
              />
            </div>

            {/* Regenerate button positioned on bottom right */}
            <div className="mt-5 flex justify-end border-t border-outline-variant/10 pt-3">
              <button
                type="button"
                onClick={reload}
                disabled={busy}
                className="btn-outline flex items-center gap-1.5 text-ui-label-sm disabled:opacity-50"
              >
                <I name="refresh" cls="text-[16px]" />
                {busy ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </>
        )}
        {err && <p className="mt-2 text-ui-label-sm text-error">{err}</p>}
      </CollapsibleSection>

      {/* Pop-up source reader modal within the site */}
      {activeSource && (
        <SourceReaderModal
          source={activeSource}
          studyId={studyId}
          dayNumber={day.day_number}
          draft={draft}
          notes={notes}
          onClose={() => setActiveSource(null)}
          onSaveNote={handleSaveModalNote}
        />
      )}
    </>
  )
}

/* ---------- Verse expander: click a ref to compare versions ---------- */

function VerseExpander({ refText }: { refText: string }) {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<string[]>([])
  const [all, setAll] = useState<TranslationInfo[]>([])
  const [rows, setRows] = useState<CompareVerse[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const p = await preferences.getTranslations()
    const a = await bible.translations()
    setPrefs(p)
    setAll(a)
    setBusy(true)
    try {
      const cmp = await bible.compare(refText, p)
      setRows(cmp.verses)
    } finally {
      setBusy(false)
    }
  }

  const toggle = () => {
    if (!open) load()
    setOpen((o) => !o)
  }

  const switchVersion = async (code: string) => {
    // move chosen version to front of preferences (most-used)
    const next = [code, ...prefs.filter((c) => c !== code)].slice(0, 3)
    const saved = await preferences.setTranslations(next)
    setPrefs(saved)
    setBusy(true)
    try {
      const cmp = await bible.compare(refText, saved)
      setRows(cmp.verses)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-2">
      <button
        onClick={toggle}
        className="font-ui-label-sm font-semibold uppercase tracking-wide text-primary hover:text-primary-container transition-colors"
      >
        {refText} <I name={open ? 'expand_less' : 'expand_more'} cls="text-[16px] align-middle" />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-3">
          {busy && <p className="text-ui-label-sm text-on-surface-variant">Loading versions…</p>}
          {!busy && rows.length === 0 && (
            <p className="text-ui-label-sm text-on-surface-variant">No text found for {refText}.</p>
          )}
          {rows.map((v, i) => (
            <div key={i} className="text-body-reading">
              <div className="font-ui-label-sm font-medium text-primary">
                {v.translation}
                {v.words_of_jesus && <span className="ml-1 text-error">✦</span>}
              </div>
              <div className="text-on-surface">{v.text}</div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/15">
            <div className="flex items-center gap-2">
              <span className="text-ui-label-xs text-on-surface-variant">Switch version:</span>
              <select
                className="text-[11px] font-mono py-0.5 px-2 rounded-md border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition-colors cursor-pointer"
                value=""
                onChange={(e) => { if (e.target.value) switchVersion(e.target.value) }}
              >
                <option value="">Choose…</option>
                {all.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-ui-label-xs text-on-surface-variant/80">
              Top: {prefs.join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}


/* ---------- Scripture passages: version-switchable, reorderable, highlightable ---------- */

function PassageEditor({ studyId, day, fallbackScripture, onChanged }: {
  studyId: number
  day: number
  fallbackScripture?: Array<{ ref: string; translation?: string; text?: string; rationale?: string }>
  onChanged: () => void
}) {
  const [list, setList] = useState<PassageOut[]>([])
  const [all, setAll] = useState<TranslationInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [newRef, setNewRef] = useState('')
  const [hlText, setHlText] = useState<string | null>(null)
  const [hlNote, setHlNote] = useState('')

  const load = async () => {
    setBusy(true)
    setErr(null)
    try {
      const [ps, ts] = await Promise.all([
        passages.list(studyId, day),
        bible.translations(),
      ])
      setList(ps.sort((a, b) => a.order - b.order))
      setAll(ts)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const scriptureKey = JSON.stringify(fallbackScripture?.map((s) => s.ref) ?? [])
  useEffect(() => { load() }, [studyId, day, scriptureKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadWhenDone = async (p: Promise<unknown>) => {
    await p
    await load()
    onChanged()
  }

  const seedFromDraft = async () => {
    if (!fallbackScripture || fallbackScripture.length === 0) return
    setSeeding(true)
    try {
      for (const item of fallbackScripture) {
        if (item.ref) {
          await passages.add(studyId, day, item.ref, item.rationale, item.translation)
        }
      }
      await load()
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSeeding(false)
    }
  }

  const switchVersion = (id: number, code: string) =>
    reloadWhenDone(passages.update(studyId, day, id, { translation: code }))

  const reorder = (id: number, dir: -1 | 1) =>
    reloadWhenDone(passages.update(studyId, day, id, { order: (list.find((p) => p.id === id)?.order ?? 0) + dir }))

  const remove = (id: number) =>
    reloadWhenDone(passages.remove(studyId, day, id))

  const add = () => {
    const ref = newRef.trim()
    if (!ref) return
    setNewRef('')
    reloadWhenDone(passages.add(studyId, day, ref))
  }

  const [hlPid, setHlPid] = useState<number | null>(null)

  const captureHighlight = (p: PassageOut, el: HTMLTextAreaElement | null) => {
    if (!el) return
    const t = el.value.slice(el.selectionStart, el.selectionEnd).trim()
    if (t) { setHlText(t); setHlPid(p.id) }
  }

  const saveHighlight = () => {
    if (!hlText || hlPid == null) return
    const p = list.find((x) => x.id === hlPid)
    if (!p) return
    const highlights = [...(p.highlights ?? []), { text: hlText, note: hlNote }]
    setHlText(null); setHlNote(''); setHlPid(null)
    reloadWhenDone(passages.update(studyId, day, hlPid, { highlights }))
  }

  // Edit an existing personal reflection's note.
  const [editHl, setEditHl] = useState<{ pid: number; idx: number; text: string; note: string } | null>(null)
  const startEditHl = (pid: number, idx: number, text: string, note: string) =>
    setEditHl({ pid, idx, text, note })
  const saveEditHl = async () => {
    if (!editHl) return
    const p = list.find((x) => x.id === editHl.pid)
    if (!p) return
    const highlights = (p.highlights ?? []).map((h, i) =>
      i === editHl.idx ? { text: editHl.text, note: editHl.note } : h)
    setEditHl(null)
    reloadWhenDone(passages.update(studyId, day, editHl.pid, { highlights }))
  }
  const deleteHl = (pid: number, idx: number) => {
    const p = list.find((x) => x.id === pid)
    if (!p) return
    const highlights = (p.highlights ?? []).filter((_, i) => i !== idx)
    reloadWhenDone(passages.update(studyId, day, pid, { highlights }))
  }

  const hasFallback = fallbackScripture && fallbackScripture.length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-ui-label-lg text-ui-label-lg text-on-surface">
        <div className="flex items-center gap-2">
          <I name="auto_stories" cls="text-[20px] text-primary" /> Scriptures
        </div>
        {list.length === 0 && hasFallback && !busy && (
          <button
            onClick={seedFromDraft}
            disabled={seeding}
            className="btn-outline text-[12px] py-1 px-2.5 flex items-center gap-1.5"
            title="Import scriptures into the interactive passages editor"
          >
            <I name="sync" cls={`text-[15px] ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Importing…' : 'Make Passages Interactive'}
          </button>
        )}
      </div>

      {err && (
        <div className="flex items-center justify-between rounded-xl bg-error/10 border border-error/30 p-2.5 text-ui-label-sm text-error">
          <span>{err}</span>
          <button onClick={load} className="btn-ghost text-error underline text-xs">Retry</button>
        </div>
      )}

      {busy && <p className="text-ui-label-sm text-on-surface-variant flex items-center gap-2">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading passages…
      </p>}

      {/* Render active passages */}
      {list.map((p, i) => (
        <div key={p.id} className="passage-card relative group/card">
          <div className="mb-2 flex items-center justify-between gap-2">
            <VerseExpander refText={p.ref} />
            <div className="flex items-center gap-1">
              <button onClick={() => reorder(p.id, -1)} disabled={i === 0}
                className="btn-ghost px-1.5 disabled:opacity-30" title="Move Up"><I name="arrow_upward" cls="text-[16px]" /></button>
              <button onClick={() => reorder(p.id, 1)} disabled={i === list.length - 1}
                className="btn-ghost px-1.5 disabled:opacity-30" title="Move Down"><I name="arrow_downward" cls="text-[16px]" /></button>
              <button onClick={() => remove(p.id)}
                className="btn-ghost px-1.5 text-error" title="Remove Passage"><I name="close" cls="text-[16px]" /></button>
            </div>
          </div>
          <div className="relative">
            <textarea readOnly
              className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3.5 py-2.5 pb-8 font-body-reading text-on-surface outline-none focus:border-primary/40 transition-colors"
              rows={Math.max(2, Math.ceil(p.text.length / 70))}
              value={p.text}
              onMouseUp={(e) => captureHighlight(p, e.currentTarget)}
            />
            {/* Version dropdown: small, sleek, on the bottom right of each verse */}
            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1 z-10">
              <select
                className="text-[11px] font-mono font-medium py-0.5 px-2 rounded-md border border-outline-variant/30 bg-surface-container-high/90 hover:bg-surface-container-highest text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition-colors cursor-pointer"
                value={p.translation}
                onChange={(e) => switchVersion(p.id, e.target.value)}
                title="Choose Bible Version"
              >
                {all.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {p.rationale && <div className="mt-1 text-ui-label-sm italic text-on-surface-variant">Why: {p.rationale}</div>}
          {p.highlights && p.highlights.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="font-ui-label-sm uppercase tracking-wide text-tertiary">Personal reflection</div>
              {p.highlights.map((h, hi) => (
                editHl && editHl.pid === p.id && editHl.idx === hi ? (
                  <div key={hi} className="rounded-lg border border-tertiary/40 bg-tertiary/5 p-2 space-y-2">
                    <textarea
                      className="field-underline w-full"
                      rows={2}
                      value={editHl.text}
                      onChange={(e) => setEditHl({ ...editHl, text: e.target.value })}
                    />
                    <input
                      className="field-underline w-full"
                      placeholder="Your note…"
                      value={editHl.note}
                      onChange={(e) => setEditHl({ ...editHl, note: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEditHl} className="btn-primary px-3 py-1.5">Save</button>
                      <button onClick={() => setEditHl(null)} className="btn-ghost">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={hi} className="group rounded-lg border border-tertiary/30 bg-tertiary/5 px-2 py-1 text-ui-label-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-on-tertiary-container">"{h.text}"</span>
                        {h.note && <span className="text-on-surface-variant"> — {h.note}</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => startEditHl(p.id, hi, h.text, h.note ?? '')}
                          className="btn-ghost px-1.5" title="Edit reflection">
                          <I name="edit" cls="text-[16px]" />
                        </button>
                        <button onClick={() => deleteHl(p.id, hi)}
                          className="btn-ghost px-1.5 text-error" title="Delete reflection">
                          <I name="delete" cls="text-[16px]" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Fallback view when no database DayPassage rows exist yet */}
      {!busy && list.length === 0 && hasFallback && (
        <div className="space-y-3">
          {fallbackScripture!.map((fs, i) => (
            <div key={i} className="passage-card border border-outline-variant/30">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-ui-label-sm font-semibold text-primary">{fs.ref}</span>
                {fs.translation && <span className="text-ui-label-xs text-on-surface-variant font-mono">{fs.translation}</span>}
              </div>
              {fs.text && (
                <div className="w-full rounded-xl bg-surface-container-lowest px-3 py-2 font-body-reading text-on-surface">
                  {fs.text}
                </div>
              )}
              {fs.rationale && <div className="mt-1 text-ui-label-sm italic text-on-surface-variant">Why: {fs.rationale}</div>}
            </div>
          ))}
        </div>
      )}

      {!busy && list.length === 0 && !hasFallback && (
        <p className="text-ui-label-sm text-on-surface-variant">No scripture passages added for this day yet. Add one below:</p>
      )}

      <div className="flex items-center gap-2">
        <input
          className="field-underline flex-1"
          placeholder="Add a scripture ref (e.g. John 3:16)"
          value={newRef} onChange={(e) => setNewRef(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button onClick={add} className="btn-primary px-4 py-1.5">Add</button>
      </div>

      {hlText && (
        <div className="rounded-2xl border border-tertiary/40 bg-tertiary/5 p-3">
          <div className="mb-1 font-ui-label-sm font-semibold uppercase tracking-wide text-tertiary">Highlight for reflection</div>
          <p className="mb-2 text-ui-label-sm italic text-on-tertiary-container">"{hlText.slice(0, 120)}{hlText.length > 120 ? '…' : ''}"</p>
          <input
            className="field-underline w-full"
            placeholder="Optional note…"
            value={hlNote} onChange={(e) => setHlNote(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveHighlight} className="btn-primary px-4 py-1.5">Save highlight</button>
            <button onClick={() => { setHlText(null); setHlNote(''); setHlPid(null) }} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
