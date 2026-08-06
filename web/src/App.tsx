import { useEffect, useRef, useState } from 'react'
import StatusDock from './components/StatusDock'
import { studies as studyApi, bible, preferences, passages, TRADITIONS, type StudyOut, type DayOut, type DayDraft, type TranslationInfo, type CompareVerse, type PassageOut } from './lib/studies'

type View = { kind: 'list' } | { kind: 'detail'; id: number }

const STATUS_CLS: Record<string, string> = {
  pending: 'text-slate-400',
  generating: 'text-amber-400',
  ready: 'text-emerald-400',
  failed: 'text-rose-400',
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [studiesList, setStudiesList] = useState<StudyOut[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const refreshList = () => {
    setLoadingList(true)
    studyApi.list().then(setStudiesList).catch(() => setStudiesList([])).finally(() => setLoadingList(false))
  }

  useEffect(() => { refreshList() }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-slate-800 px-6 py-4">
        <button className="text-lg font-semibold tracking-tight hover:text-emerald-300"
                onClick={() => setView({ kind: 'list' })}>
          BibleStudy-Crafter
        </button>
        {view.kind === 'detail' && (
          <span className="text-sm text-slate-500">/ study #{view.id}</span>
        )}
      </header>

      <main className="mx-auto max-w-4xl p-6">
        {view.kind === 'list' ? (
          <StudyList
            studies={studiesList}
            loading={loadingList}
            onRefresh={refreshList}
            onCreate={() => setView({ kind: 'list' })}
            onOpen={(id) => setView({ kind: 'detail', id })}
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

function StudyList({ studies, loading, onRefresh, onCreate, onOpen }: {
  studies: StudyOut[]
  loading: boolean
  onRefresh: () => void
  onCreate: () => void
  onOpen: (id: number) => void
}) {
  const [topic, setTopic] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [days, setDays] = useState(7)
  const [tradition, setTradition] = useState('non_denominational')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!topic.trim()) { setErr('Topic is required'); return }
    setBusy(true)
    try {
      const res = await studyApi.create({ topic: topic.trim(), minutes_per_day: minutes, total_days: days, tradition })
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
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="mb-4 text-base font-semibold">New study</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 block text-sm">
            <span className="mb-1 block text-slate-400">Topic</span>
            <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-emerald-500"
                   placeholder="e.g. Forgiveness" value={topic}
                   onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Minutes / day</span>
            <input type="number" min={5} max={120} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-emerald-500"
                   value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Days</span>
            <input type="number" min={1} max={90} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-emerald-500"
                   value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-400">Tradition lens</span>
            <select className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-emerald-500"
                    value={tradition} onChange={(e) => setTradition(e.target.value)}>
              {TRADITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {err && <p className="sm:col-span-2 text-sm text-rose-400">{err}</p>}
          <button type="submit" disabled={busy}
                  className="sm:col-span-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create study'}
          </button>
        </form>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Studies</h2>
          <button onClick={onRefresh} className="text-sm text-slate-400 hover:text-slate-200">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {studies.length === 0 ? (
          <p className="text-sm text-slate-500">No studies yet — create one above.</p>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
            {studies.map((s) => (
              <li key={s.id}>
                <button onClick={() => onOpen(s.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-900/60">
                  <span className={`text-xs ${STATUS_CLS[s.status]}`}>●</span>
                  <span className="flex-1">
                    <span className="font-medium">{s.title || s.topic}</span>
                    <span className="ml-2 text-xs text-slate-500">{s.total_days}d · {s.minutes_per_day}m/day · {s.tradition}</span>
                  </span>
                  <span className="text-xs text-slate-600">#{s.id}</span>
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
    return () => { if (timer.current) clearInterval(timer.current) }
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

  if (err && !study) return <div className="text-rose-400">{err}</div>
  if (!study) return <p className="text-slate-500">Loading…</p>

  const readyDays = study.days.filter((d) => d.status === 'ready').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200">← All studies</button>
        <span className={`text-sm ${STATUS_CLS[study.status]}`}>
          {study.status} · {readyDays}/{study.total_days} days ready
        </span>
      </div>

      <h1 className="text-2xl font-semibold">{study.title || study.topic}</h1>
      <p className="text-sm text-slate-500">{study.total_days} days · {study.minutes_per_day} min/day · {study.tradition} · {study.primary_translation}</p>

      {study.status === 'generating' && (
        <p className="text-sm text-amber-400">Generating outline & day 1… (auto-refreshing)</p>
      )}

      <div className="space-y-4">
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
  const [draft, setDraft] = useState<DayDraft | null>(day.blocks_json)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const draftRef = useRef<DayDraft | null>(draft)
  draftRef.current = draft

  // select-to-revise (JobHunt_Crafter pattern): capture highlighted text
  const [selectedText, setSelectedText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [revBusy, setRevBusy] = useState(false)

  // keep local draft in sync with the server ONLY when not actively editing,
  // so the 2s poll doesn't clobber in-progress edits
  useEffect(() => { if (!editing) setDraft(day.blocks_json) }, [day.blocks_json, editing])

  const startEdit = () => { setDraft(day.blocks_json); setErr(null); setEditing(true) }
  const cancel = () => { setDraft(day.blocks_json); setEditing(false) }

  const save = async () => {
    const current = draftRef.current
    if (!current) return
    setSaving(true)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, current)
      setDraft(updated.blocks_json)
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
        setDraft(updated.blocks_json)
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
    <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">
          Day {day.day_number}{draft?.heading ? ` — ${draft.heading}` : (day.title ? ` — ${day.title}` : '')}
          {day.theme && <span className="ml-2 text-xs font-normal text-slate-500">· {day.theme}</span>}
        </h3>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${STATUS_CLS[day.status]}`}>{day.status}</span>
          {!editing && day.status !== 'generating' && (
            <>
              <button onClick={startEdit}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Edit</button>
              <button onClick={onGenerate}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">
                {day.blocks_json ? 'Regenerate' : 'Generate'}
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={cancel}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {err && <p className="mb-2 text-xs text-rose-400">{err}</p>}

      {/* Revise-with-AI panel (mirrors JobHunt_Crafter select-to-revise) */}
      {editing && (
        <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Revise with AI
              {selectedText && (
                <span className="rounded-full border border-emerald-700/40 bg-emerald-900/30 px-2 py-0.5 text-emerald-300">
                  Focusing on selection
                </span>
              )}
            </div>
            {selectedText && (
              <button onClick={() => setSelectedText('')} className="text-xs text-slate-500 hover:text-rose-400">× clear</button>
            )}
          </div>
          {selectedText && (
            <p className="mb-2 text-xs italic text-slate-500">Selected: "{selectedText.slice(0, 80)}{selectedText.length > 80 ? '…' : ''}"</p>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
              placeholder={selectedText ? 'Refining selected section…' : "Ask for changes (e.g. 'make it warmer', 'shorten this')"}
              value={instruction} onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && instruction.trim()) doRevise() }}
            />
            <button onClick={doRevise} disabled={revBusy || !instruction.trim()}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {revBusy ? 'Revising…' : 'Revise'}
            </button>
          </div>
        </div>
      )}

      {draft ? (
        <DraftEditor draft={draft} studyId={studyId} day={day.day_number} editing={editing} onChange={setDraft} onSelect={handleSelection} />
      ) : (
        <p className="text-sm text-slate-600">
          {day.status === 'generating' ? 'Working…' : 'Not generated yet.'}
        </p>
      )}
    </article>
  )
}

/* ---------- Read / edit renderer ---------- */

function DraftEditor({ draft, editing, onChange, onSelect, studyId, day }: {
  draft: DayDraft
  editing: boolean
  onChange: (d: DayDraft) => void
  onSelect: (el: HTMLTextAreaElement | null) => void
  studyId: number
  day: number
}) {
  const setField = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <PassageEditor studyId={studyId} day={day} onChanged={() => { /* passage changes are server-side; nothing to sync into draft */ }} />

      {draft.scripture && draft.scripture.length > 0 && (
        <p className="text-xs text-slate-500">Note: the scripture above is now managed as reorderable, version-switchable passages. The quoted text below is a read-only snapshot from generation.</p>
      )}

      {editing ? (
        <>
          <Labeled label="Opening prayer">
            <textarea className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 outline-none focus:border-emerald-500"
              rows={2} value={draft.opening_prayer ?? ''}
              onChange={(e) => setField({ opening_prayer: e.target.value })} />
          </Labeled>
          <Labeled label="Commentary (select text, then Revise with AI)">
            <textarea className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 outline-none focus:border-emerald-500"
              rows={6} value={draft.commentary ?? ''}
              onChange={(e) => setField({ commentary: e.target.value })}
  onMouseUp={(e) => onSelect(e.currentTarget)} />
          </Labeled>
          <Labeled label="Closing prayer">
            <textarea className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 outline-none focus:border-emerald-500"
              rows={2} value={draft.closing_prayer ?? ''}
              onChange={(e) => setField({ closing_prayer: e.target.value })} />
          </Labeled>
          <Labeled label="Reflection questions">
            <QuestionsEditor questions={draft.questions ?? []} onChange={(q) => setField({ questions: q })} />
          </Labeled>
        </>
      ) : (
        <>
          {draft.opening_prayer && <p><span className="text-slate-500">Prayer · </span>{draft.opening_prayer}</p>}
          {draft.commentary && <p className="text-slate-200">{draft.commentary}</p>}
          {draft.questions && draft.questions.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-slate-300">
              {draft.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          )}
          {draft.closing_prayer && <p><span className="text-slate-500">Closing · </span>{draft.closing_prayer}</p>}
        </>
      )}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">{label}</div>
      {children}
    </div>
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
        className="text-xs font-semibold uppercase tracking-wide text-emerald-400 hover:text-emerald-300"
      >
        {refText} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
          {busy && <p className="text-xs text-slate-500">Loading versions…</p>}
          {!busy && rows.length === 0 && (
            <p className="text-xs text-slate-500">No text found for {refText}.</p>
          )}
          {rows.map((v, i) => (
            <div key={i} className="text-sm">
              <div className="text-xs font-medium text-emerald-300">
                {v.translation}
                {v.words_of_jesus && <span className="ml-1 text-rose-400">✦</span>}
              </div>
              <div className="text-slate-200">{v.text}</div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-500">Switch version:</span>
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
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
            <span className="text-xs text-slate-600">
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
          <input className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 outline-none focus:border-emerald-500"
                 value={q} onChange={(e) => update(i, e.target.value)} />
          <button onClick={() => remove(i)}
                  className="rounded border border-slate-700 px-2 text-xs hover:bg-slate-800">×</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-emerald-400 hover:text-emerald-300">+ add question</button>
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

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {busy && <p className="text-xs text-slate-500">Loading passages…</p>}
      {list.map((p, i) => (
        <div key={p.id} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <VerseExpander refText={p.ref} />
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs outline-none focus:border-emerald-500"
              value={p.translation}
              onChange={(e) => switchVersion(p.id, e.target.value)}
            >
              {all.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
            </select>
            <span className="text-xs text-slate-500">{p.translation}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => reorder(p.id, -1)} disabled={i === 0}
                      className="rounded border border-slate-700 px-1.5 text-xs hover:bg-slate-800 disabled:opacity-30">↑</button>
              <button onClick={() => reorder(p.id, 1)} disabled={i === list.length - 1}
                      className="rounded border border-slate-700 px-1.5 text-xs hover:bg-slate-800 disabled:opacity-30">↓</button>
              <button onClick={() => remove(p.id)}
                      className="rounded border border-slate-700 px-1.5 text-xs text-rose-400 hover:bg-slate-800">×</button>
            </div>
          </div>
          <textarea readOnly
            className="w-full rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-sm text-slate-200 outline-none"
            rows={Math.max(2, Math.ceil(p.text.length / 70))}
            value={p.text}
            onMouseUp={(e) => captureHighlight(p, e.currentTarget)}
          />
          {p.rationale && <div className="mt-1 text-xs italic text-slate-500">Why: {p.rationale}</div>}
          {p.highlights && p.highlights.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs uppercase tracking-wide text-amber-500">Personal reflection</div>
              {p.highlights.map((h, hi) => (
                <div key={hi} className="rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1 text-xs">
                  <span className="text-amber-300">“{h.text}”</span>
                  {h.note && <span className="text-slate-400"> — {h.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
          placeholder="Add a scripture ref (e.g. John 3:16)"
          value={newRef} onChange={(e) => setNewRef(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button onClick={add} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500">Add</button>
      </div>

      {hlText && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/20 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-400">Highlight for reflection</div>
          <p className="mb-2 text-xs italic text-amber-200">“{hlText.slice(0, 120)}{hlText.length > 120 ? '…' : ''}”</p>
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
            placeholder="Optional note…"
            value={hlNote} onChange={(e) => setHlNote(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveHighlight} className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500">Save highlight</button>
            <button onClick={() => { setHlText(null); setHlNote(''); setHlPid(null) }} className="text-xs text-slate-500 hover:text-rose-400">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
