import { useEffect, useRef, useState } from 'react'
import StatusDock from './components/StatusDock'
import { studies as studyApi, TRADITIONS, type StudyOut, type DayOut, type DayDraft } from './lib/studies'

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
          <DayCard key={d.day_number} day={d} onGenerate={() => genDay(d.day_number)} />
        ))}
      </div>
    </div>
  )
}

function DayCard({ day, onGenerate }: { day: DayOut; onGenerate: () => void }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">
          Day {day.day_number}{day.title ? ` — ${day.title}` : ''}
          {day.theme && <span className="ml-2 text-xs font-normal text-slate-500">· {day.theme}</span>}
        </h3>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${STATUS_CLS[day.status]}`}>{day.status}</span>
          {day.status !== 'generating' && (
            <button onClick={onGenerate}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">
              {day.blocks_json ? 'Regenerate' : 'Generate'}
            </button>
          )}
        </div>
      </div>
      {day.blocks_json ? <Draft draft={day.blocks_json} /> : (
        <p className="text-sm text-slate-600">
          {day.status === 'generating' ? 'Working…' : 'Not generated yet.'}
        </p>
      )}
    </article>
  )
}

function Draft({ draft }: { draft: DayDraft }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {draft.scripture?.length > 0 && (
        <div className="space-y-2">
          {draft.scripture.map((s, i) => (
            <blockquote key={i} className="border-l-2 border-emerald-700 pl-3 text-slate-300">
              <div className="text-xs uppercase tracking-wide text-emerald-500">{s.ref}</div>
              <div>{s.text}</div>
              {s.rationale && <div className="mt-1 text-xs italic text-slate-500">Why: {s.rationale}</div>}
            </blockquote>
          ))}
        </div>
      )}
      {draft.opening_prayer && <p><span className="text-slate-500">Prayer · </span>{draft.opening_prayer}</p>}
      {draft.commentary && <p className="text-slate-200">{draft.commentary}</p>}
      {draft.questions?.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-slate-300">
          {draft.questions.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      )}
      {draft.closing_prayer && <p><span className="text-slate-500">Closing · </span>{draft.closing_prayer}</p>}
    </div>
  )
}
