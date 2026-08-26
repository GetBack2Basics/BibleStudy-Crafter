import { useEffect, useRef, useState } from 'react'
import StatusDock from './components/StatusDock'
import AuthScreen from './components/AuthScreen'
import { api } from './lib/api'
import { auth } from './lib/auth'
import { studies as studyApi, bible, preferences, passages, TRADITIONS, type StudyOut, type DayOut, type DayDraft, type TranslationInfo, type CompareVerse, type PassageOut, type SearchHit } from './lib/studies'

type View = { kind: 'list' } | { kind: 'detail'; id: number }

const STATUS_CLS: Record<string, string> = {
  pending: 'text-outline',
  generating: 'text-tertiary',
  ready: 'text-primary',
  failed: 'text-error',
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
          <span className="min-w-0 flex-1 truncate font-ui-label-md text-ui-label-md text-on-surface">{title}</span>
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
  const [view, setView] = useState<View>({ kind: 'list' })
  const [studiesList, setStudiesList] = useState<StudyOut[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const refreshList = () => {
    setLoadingList(true)
    studyApi.list().then(setStudiesList).catch(() => setStudiesList([])).finally(() => setLoadingList(false))
  }

  const handleLogout = async () => {
    await auth.logout()
    setAuthed(false)
    setView({ kind: 'list' })
    setStudiesList([])
  }

  // Any unrecoverable 401 (e.g. refresh expired) drops the user to the login screen.
  useEffect(() => {
    api.setUnauthorizedHandler(() => { setAuthed(false); setStudiesList([]) })
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this study? This cannot be undone.')) return
    await studyApi.remove(id)
    if (view.kind === 'detail' && view.id === id) setView({ kind: 'list' })
    refreshList()
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL studies? The Bible translations and verses are kept.')) return
    await studyApi.removeAll()
    setView({ kind: 'list' })
    refreshList()
  }

  useEffect(() => { if (authed) refreshList() }, [authed])

  if (!authed) {
    return <AuthScreen onAuthed={() => setAuthed(true)} />
  }

  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b border-outline-variant/20 bg-surface-container-lowest/80 px-margin-mobile py-4 backdrop-blur lg:px-margin-desktop">
        <button className="font-headline-lg text-headline-lg text-primary tracking-tight hover:text-primary-container transition-colors"
                onClick={() => setView({ kind: 'list' })}>
          BibleStudy-Crafter
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view.kind === 'detail' && (
            <span className="text-ui-label-md text-on-surface-variant">/ study #{view.id}</span>
          )}
          <button onClick={handleLogout}
                  className="text-ui-label-sm text-on-surface-variant hover:text-error transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="page-shell py-8">
        {view.kind === 'list' ? (
          <StudyList
            studies={studiesList}
            loading={loadingList}
            onRefresh={refreshList}
            onCreate={() => setView({ kind: 'list' })}
            onOpen={(id) => setView({ kind: 'detail', id })}
            onDelete={handleDelete}
            onDeleteAll={handleDeleteAll}
          />
        ) : (
          <StudyDetail
            id={view.id}
            onBack={() => { refreshList(); setView({ kind: 'list' }) }}
          />
        )}
      </main>

      <StatusDock />
    </div>
  )
}

/* ---------- Create form + list ---------- */

function StudyList({ studies, loading, onRefresh, onCreate, onOpen, onDelete, onDeleteAll }: {
  studies: StudyOut[]
  loading: boolean
  onRefresh: () => void
  onCreate: () => void
  onOpen: (id: number) => void
  onDelete: (id: number) => void
  onDeleteAll: () => void
}) {
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
      onCreate()
      onOpen(res.study_id)
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
            <p className="text-ui-label-sm text-on-surface-variant">No verses found for “{topic.trim()}” in {version}. Try a different word.</p>
          ) : null}

          {err && <p className="text-ui-label-sm text-error">{err}</p>}
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
                <button onClick={() => onOpen(s.id)}
                  className="flex flex-1 items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-container-high">
                  <span className={`text-[10px] ${STATUS_CLS[s.status]}`}>●</span>
                  <span className="flex-1">
                    <span className="font-ui-label-lg text-on-surface">{s.title || s.topic}</span>
                    <span className="ml-2 text-ui-label-sm text-on-surface-variant">{s.total_days}d · {s.minutes_per_day}m/day · {s.tradition}</span>
                  </span>
                  <span className="text-ui-label-sm text-on-surface-variant">#{s.id}</span>
                </button>
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

function StudyDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [study, setStudy] = useState<StudyOut | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Live generation progress fed by the SSE event stream.
  const [progress, setProgress] = useState<number | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const esRef = useRef<EventSource | null>(null)

  const load = () => {
    studyApi.get(id).then(setStudy).catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    load()
    timer.current = setInterval(() => {
      studyApi.get(id).then((s) => {
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
        if (data?.study_id === id && typeof data.progress === 'number') {
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
  }, [id])

  const genDay = async (day: number) => {
    setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === day ? { ...d, status: 'generating' } : d) }) : s)
    try {
      const res = await studyApi.generateDay(id, day)
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
        <button onClick={onBack} className="btn-ghost">
          <I name="arrow_back" cls="text-[18px]" /> All studies
        </button>
        <span className={`text-ui-label-md ${STATUS_CLS[study.status]}`}>
          {study.status} · {readyDays}/{study.total_days} days ready
        </span>
      </div>

      <div className="reading-column !px-0">
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{study.title || study.topic}</h1>
        <p className="mt-1 text-ui-label-md text-on-surface-variant">
          {study.total_days} days · {study.minutes_per_day} min/day · {study.tradition} · {study.primary_translation}
        </p>
      </div>

      {study.status === 'generating' && (
        <div className="reading-column !px-0 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-ambient">
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
          <DayCard key={d.day_number} studyId={id} day={d} onGenerate={() => genDay(d.day_number)} />
        ))}
      </div>
    </div>
  )
}

/* ---------- Day card with inline editing + select-to-revise ---------- */

function DayCard({ studyId, day, onGenerate }: { studyId: number; day: DayOut; onGenerate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DayDraft | null>(day.blocks_json ?? null)
  const [notes, setNotes] = useState<Record<string, string>>(day.notes ?? {})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const draftRef = useRef<DayDraft | null>(draft)
  draftRef.current = draft
  const notesRef = useRef<Record<string, string>>(notes)
  notesRef.current = notes

  // select-to-revise (JobHunt_Crafter pattern): capture highlighted text
  const [selectedText, setSelectedText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [revBusy, setRevBusy] = useState(false)

  // day-level collapse (default collapsed so long studies stay scannable)
  const [dayOpen, setDayOpen] = useState(false)

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

  const handleSelection = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    const { selectionStart, selectionEnd, value } = el
    const t = value.slice(selectionStart, selectionEnd).trim()
    if (t) setSelectedText(t)
  }

  const doRevise = async () => {
    if (!instruction.trim()) return
    setRevBusy(true)
    try {
      const res = await studyApi.reviseDay(studyId, day.day_number, instruction, selectedText || null)
      const current = draftRef.current
      if (current) {
        let next = res.revised
        // if a passage was selected, splice the revision in place of it
        if (selectedText && current.commentary.includes(selectedText)) {
          next = current.commentary.replace(selectedText, res.revised)
        }
        const updated = await studyApi.updateDay(studyId, day.day_number, { ...current, commentary: next })
        setDraft(updated.blocks_json ?? null)
      }
      setSelectedText('')
      setInstruction('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRevBusy(false)
    }
  }

  return (
    <article className="reading-column !px-0 passage-card">
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={() => setDayOpen((o) => !o)} aria-expanded={dayOpen}
                aria-label={dayOpen ? `Collapse Day ${day.day_number}` : `Expand Day ${day.day_number}`}
                className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high">
          <I name={dayOpen ? 'expand_less' : 'expand_more'} cls="text-[24px]" />
        </button>
        <h3 className="min-w-0 flex-1 font-headline-md text-headline-md text-on-surface truncate">
          <span className="text-primary">Day {day.day_number}</span>{draft?.heading ? ` — ${draft.heading}` : (day.title ? ` — ${day.title}` : '')}
          {day.theme && <span className="ml-2 font-ui-label-sm font-normal text-on-surface-variant">· {day.theme}</span>}
        </h3>
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
          {err && <p className="mb-2 text-ui-label-sm text-error">{err}</p>}

          {/* Revise-with-AI panel (mirrors JobHunt_Crafter select-to-revise) */}
          {editing && (
            <div className="mb-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-ui-label-sm font-semibold uppercase tracking-wide text-primary">
                  <I name="auto_awesome" cls="text-[16px]" /> Revise with AI
                  {selectedText && (
                    <span className="rounded-full border border-primary-container bg-primary-container/30 px-2 py-0.5 text-on-primary-container">
                      Focusing on selection
                    </span>
                  )}
                </div>
                {selectedText && (
                  <button onClick={() => setSelectedText('')} className="text-ui-label-sm text-on-surface-variant hover:text-error">× clear</button>
                )}
              </div>
              {selectedText && (
                <p className="mb-2 text-ui-label-sm italic text-on-surface-variant">Selected: "{selectedText.slice(0, 80)}{selectedText.length > 80 ? '…' : ''}"</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="field-underline min-w-0 flex-1"
                  placeholder={selectedText ? 'Refining selected section…' : "Ask for changes (e.g. 'make it warmer', 'shorten this')"}
                  value={instruction} onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && instruction.trim()) doRevise() }}
                />
                <button onClick={doRevise} disabled={revBusy || !instruction.trim()}
                  className="btn-primary px-3 py-1.5 disabled:opacity-50">
                  {revBusy ? 'Revising…' : 'Revise'}
                </button>
              </div>
            </div>
          )}

          {draft ? (
            <DraftEditor draft={draft} studyId={studyId} day={day.day_number} editing={editing} onChange={setDraft} onSelect={handleSelection} notes={notes} onNotesChange={setNotes} />
          ) : (
            <p className="text-ui-label-sm text-on-surface-variant">
              {day.status === 'generating' ? 'Working…' : 'Not generated yet.'}
            </p>
          )}
          <Discussions studyId={studyId} day={day} />
        </div>
      )}
    </article>
  )
}

/* ---------- Read / edit renderer ---------- */

function DraftEditor({ draft, editing, onChange, onSelect, studyId, day, notes, onNotesChange }: {
  draft: DayDraft
  editing: boolean
  onChange: (d: DayDraft) => void
  onSelect: (el: HTMLTextAreaElement | null) => void
  studyId: number
  day: number
  notes: Record<string, string>
  onNotesChange: (n: Record<string, string>) => void
}) {
  const setField = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="space-y-4 text-body-reading text-on-surface">
      <CollapsibleSection title="Primary Texts" icon="auto_stories" defaultOpen>
        <PassageEditor studyId={studyId} day={day} onChanged={() => { /* passage changes are server-side; nothing to sync into draft */ }} />
      </CollapsibleSection>

      {draft.scripture && draft.scripture.length > 0 && (
        <p className="text-ui-label-sm text-on-surface-variant">Note: the scripture above is now managed as reorderable, version-switchable passages. The quoted text below is a read-only snapshot from generation.</p>
      )}

      {editing ? (
        <CollapsibleSection title="Edit content" icon="edit" defaultOpen>
          <div className="space-y-4">
            <Labeled label="Opening prayer">
              <textarea className="field-underline"
                rows={2} value={draft.opening_prayer ?? ''}
                onChange={(e) => setField({ opening_prayer: e.target.value })} />
            </Labeled>
            <Labeled label="Your note on this opening prayer">
              <textarea className="field-underline"
                rows={2} value={notes.opening_prayer ?? ''}
                placeholder="What stood out to you?"
                onChange={(e) => onNotesChange({ ...notes, opening_prayer: e.target.value })} />
            </Labeled>
            <Labeled label="Commentary (select text, then Revise with AI)">
              <textarea className="field-underline"
                rows={6} value={draft.commentary ?? ''}
                onChange={(e) => setField({ commentary: e.target.value })}
                onMouseUp={(e) => onSelect(e.currentTarget)} />
            </Labeled>
            <Labeled label="Your note on the commentary">
              <textarea className="field-underline"
                rows={2} value={notes.commentary ?? ''}
                placeholder="Your reflection / takeaway"
                onChange={(e) => onNotesChange({ ...notes, commentary: e.target.value })} />
            </Labeled>
            <Labeled label="Closing prayer">
              <textarea className="field-underline"
                rows={2} value={draft.closing_prayer ?? ''}
                onChange={(e) => setField({ closing_prayer: e.target.value })} />
            </Labeled>
            <Labeled label="Your note on this closing prayer">
              <textarea className="field-underline"
                rows={2} value={notes.closing_prayer ?? ''}
                placeholder="What stood out to you?"
                onChange={(e) => onNotesChange({ ...notes, closing_prayer: e.target.value })} />
            </Labeled>
            <Labeled label="Reflection questions">
              <QuestionsEditor questions={draft.questions ?? []} onChange={(q) => setField({ questions: q })} />
            </Labeled>
          </div>
        </CollapsibleSection>
      ) : (
        <div className="space-y-4">
          {draft.opening_prayer && (
            <CollapsibleSection title="Opening prayer" icon="volunteer_activism" defaultOpen>
              <p className="text-on-surface">{draft.opening_prayer}</p>
            </CollapsibleSection>
          )}
          {notes.opening_prayer && (
            <CollapsibleSection title="Your note · opening prayer" icon="lightbulb" defaultOpen>
              <p className="rounded bg-surface-container-high p-2 text-ui-label-sm text-on-tertiary-container">{notes.opening_prayer}</p>
            </CollapsibleSection>
          )}
          {draft.commentary && (
            <CollapsibleSection title="Commentary" icon="menu_book" defaultOpen>
              <p className="text-on-surface">{draft.commentary}</p>
            </CollapsibleSection>
          )}
          {notes.commentary && (
            <CollapsibleSection title="Your note · commentary" icon="lightbulb" defaultOpen>
              <p className="rounded bg-surface-container-high p-2 text-ui-label-sm text-on-tertiary-container">{notes.commentary}</p>
            </CollapsibleSection>
          )}
          {draft.questions && draft.questions.length > 0 && (
            <CollapsibleSection title="Reflection questions" icon="help" defaultOpen>
              <ul className="list-disc space-y-1 pl-5 text-on-surface">
                {draft.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </CollapsibleSection>
          )}
          {draft.closing_prayer && (
            <CollapsibleSection title="Closing prayer" icon="volunteer_activism" defaultOpen>
              <p className="text-on-surface">{draft.closing_prayer}</p>
            </CollapsibleSection>
          )}
          {notes.closing_prayer && (
            <CollapsibleSection title="Your note · closing prayer" icon="lightbulb" defaultOpen>
              <p className="rounded bg-surface-container-high p-2 text-ui-label-sm text-on-tertiary-container">{notes.closing_prayer}</p>
            </CollapsibleSection>
          )}
        </div>
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

/* ---------- Discussions: real, cited reading material about the verses ---------- */

type AnySource = {
  title: string; url: string; snippet?: string; source: string
  kind?: string; platform?: string | null; engagement?: number | null
}

function SourceGrid({ sources, empty }: { sources: AnySource[]; empty: string }) {
  if (!sources.length) {
    return <p className="text-ui-label-sm text-on-surface-variant/80">{empty}</p>
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {sources.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noreferrer noopener"
           className="voice-card hover:text-primary">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary-container">
              <I name={s.kind === 'social' ? 'forum' : 'menu_book'} cls="text-[14px]" />
            </span>
            <span className="font-ui-label-sm uppercase tracking-wider text-on-surface-variant">{s.source}</span>
            {s.platform && (
              <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-ui-label-xs text-on-tertiary-container">{s.platform}</span>
            )}
            {typeof s.engagement === 'number' && (
              <span className="font-ui-label-xs text-on-surface-variant/70">▲ {s.engagement}</span>
            )}
          </div>
          <div className="font-ui-label-md text-on-surface group-hover:text-primary">{s.title}</div>
        </a>
      ))}
    </div>
  )
}

function Discussions({ studyId, day }: { studyId: number; day: DayOut }) {
  const [data, setData] = useState<DayOut['discussions']>(day.discussions ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
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
  return (
    <CollapsibleSection
      title="Voices on these verses"
      icon="forum"
      defaultOpen={false}
      right={
        <button onClick={reload} disabled={busy}
          className="btn-outline disabled:opacity-50 shrink-0">
          {busy ? 'Fetching…' : (d ? 'Refresh' : 'Find discussions')}
        </button>
      }
      className="mt-6"
    >
      {!d && <p className="text-ui-label-sm text-on-surface-variant">Real discussion about these verses, with links back to the sources. Click "Find discussions".</p>}
      {d && d.status === 'empty' && (
        <p className="text-ui-label-sm text-on-surface-variant">No external discussion could be fetched right now. Engage the Scripture directly.</p>
      )}
      {d && d.status === 'ok' && (
        <>
          <p className="mb-3 text-ui-label-sm text-on-surface-variant">
            Curated from {(d.official_sources?.length ?? 0) + (d.social_sources?.length ?? 0)} real sources
            (~{d.official_min} min official, ~{d.social_min} min social — about half this day).
            Includes critical / non-Christian takes where they exist. Every claim links to its source.
          </p>
          <div className="mb-4 whitespace-pre-wrap font-body-reading text-on-surface">{d.guide}</div>

          {/* Official commentary sources */}
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 font-ui-label-sm uppercase tracking-wide text-on-surface-variant">
              <I name="menu_book" cls="text-[16px]" /> Official commentary
            </div>
            <SourceGrid sources={d.official_sources ?? []} empty="No official commentary sources were fetched." />
          </div>

          {/* Social commentary sources */}
          <div className="border-t border-outline-variant/20 pt-3">
            <div className="mb-2 flex items-center gap-2 font-ui-label-sm uppercase tracking-wide text-on-surface-variant">
              <I name="forum" cls="text-[16px]" /> Social commentary
              <span className="font-ui-label-xs normal-case tracking-normal text-on-surface-variant/70">(Reddit · Quora · X · Facebook)</span>
            </div>
            <SourceGrid sources={d.social_sources ?? []} empty="No social-media discussion was fetched (Reddit · Quora · X · Facebook)." />
          </div>
        </>
      )}
      {err && <p className="mt-2 text-ui-label-sm text-error">{err}</p>}
    </CollapsibleSection>
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
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-ui-label-sm text-on-surface-variant">Switch version:</span>
            <select
              className="field-underline inline-block w-auto"
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
            <span className="text-ui-label-sm text-on-surface-variant">
              showing your top {prefs.length}: {prefs.join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionsEditor({ questions, onChange }: { questions: string[]; onChange: (q: string[]) => void }) {

  const update = (i: number, v: string) => onChange(questions.map((q, j) => (j === i ? v : q)))
  const add = () => onChange([...questions, ''])
  const remove = (i: number) => onChange(questions.filter((_, j) => j !== i))
  return (
    <div className="space-y-1">
      {questions.map((q, i) => (
        <div key={i} className="flex items-start gap-2">
          <input className="field-underline flex-1"
                 value={q} onChange={(e) => update(i, e.target.value)} />
          <button onClick={() => remove(i)} className="btn-ghost px-2">×</button>
        </div>
      ))}
      <button onClick={add} className="text-ui-label-sm text-primary hover:text-primary-container">+ add question</button>
    </div>
  )
}

/* ---------- Scripture passages: version-switchable, reorderable, highlightable ---------- */

function PassageEditor({ studyId, day, onChanged }: {
  studyId: number
  day: number
  onChanged: () => void
}) {
  const [list, setList] = useState<PassageOut[]>([])
  const [all, setAll] = useState<TranslationInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [newRef, setNewRef] = useState('')
  const [hlText, setHlText] = useState<string | null>(null)
  const [hlNote, setHlNote] = useState('')

  const load = async () => {
    setBusy(true)
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

  useEffect(() => { load() }, [studyId, day]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadWhenDone = async (p: Promise<unknown>) => {
    await p
    await load()
    onChanged()
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-ui-label-lg text-ui-label-lg text-on-surface">
        <I name="auto_stories" cls="text-[20px] text-primary" /> Primary Texts
      </div>
      {err && <p className="text-ui-label-sm text-error">{err}</p>}
      {busy && <p className="text-ui-label-sm text-on-surface-variant">Loading passages…</p>}
      {list.map((p, i) => (
        <div key={p.id} className="passage-card">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <VerseExpander refText={p.ref} />
            <select
              className="field-underline inline-block w-auto min-w-0"
              value={p.translation}
              onChange={(e) => switchVersion(p.id, e.target.value)}
            >
              {all.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => reorder(p.id, -1)} disabled={i === 0}
                className="btn-ghost px-1.5 disabled:opacity-30"><I name="arrow_upward" cls="text-[16px]" /></button>
              <button onClick={() => reorder(p.id, 1)} disabled={i === list.length - 1}
                className="btn-ghost px-1.5 disabled:opacity-30"><I name="arrow_downward" cls="text-[16px]" /></button>
              <button onClick={() => remove(p.id)}
                className="btn-ghost px-1.5 text-error"><I name="close" cls="text-[16px]" /></button>
            </div>
          </div>
          <textarea readOnly
            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 font-body-reading text-on-surface outline-none"
            rows={Math.max(2, Math.ceil(p.text.length / 70))}
            value={p.text}
            onMouseUp={(e) => captureHighlight(p, e.currentTarget)}
          />
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
                        <span className="text-on-tertiary-container">“{h.text}”</span>
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
          <p className="mb-2 text-ui-label-sm italic text-on-tertiary-container">“{hlText.slice(0, 120)}{hlText.length > 120 ? '…' : ''}”</p>
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
