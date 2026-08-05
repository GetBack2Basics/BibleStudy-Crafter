import { useEffect, useRef, useState } from 'react'
import StatusDock from './components/StatusDock'
import { studies as studyApi, TRADITIONS, type StudyOut, type DayOut, type DayDraft, type ScriptureBlock } from './lib/studies'

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

  const handleSelection = (text: string) => {
    const t = text.trim()
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
        <DraftEditor draft={draft} editing={editing} onChange={setDraft} onSelect={handleSelection} />
      ) : (
        <p className="text-sm text-slate-600">
          {day.status === 'generating' ? 'Working…' : 'Not generated yet.'}
        </p>
      )}
    </article>
  )
}

/* ---------- Read / edit renderer ---------- */

function DraftEditor({ draft, editing, onChange, onSelect }: {
  draft: DayDraft
  editing: boolean
  onChange: (d: DayDraft) => void
  onSelect: (text: string) => void
}) {
  const setField = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {draft.scripture && draft.scripture.length > 0 && (
        <div className="space-y-2">
          {draft.scripture.map((s: ScriptureBlock, i: number) => (
            <blockquote key={i} className="border-l-2 border-emerald-700 pl-3 text-slate-300">
              <div className="text-xs uppercase tracking-wide text-emerald-500">{s.ref}</div>
              <div>{s.text}</div>
              {s.rationale && <div className="mt-1 text-xs italic text-slate-500">Why: {s.rationale}</div>}
            </blockquote>
          ))}
        </div>
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
              onMouseUp={() => onSelect(window.getSelection()?.toString() ?? '')} />
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
