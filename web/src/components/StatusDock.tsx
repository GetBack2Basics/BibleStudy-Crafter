import { useEffect, useRef, useState } from 'react'
import { api, type LogEvent, type Meta } from '../lib/api'

const LEVEL_CLS: Record<LogEvent['level'], string> = {
  info: 'text-slate-300',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
}

const LEVEL_BADGE: Record<LogEvent['level'], string> = {
  info: 'bg-slate-800 text-slate-400 border-slate-700',
  success: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  warn: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  error: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
}

const hhmmss = (ts: number) => new Date(ts * 1000).toTimeString().slice(0, 8)

/** Bottom-right dock: build stamp (yyyymmddhhmm) + live activity log from page load. */
export default function StatusDock() {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [events, setEvents] = useState<LogEvent[]>([])
  const [live, setLive] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const sessionStartTs = useRef(Date.now() / 1000 - 0.5)

  // Poll meta so a rebuild is noticed while the tab stays open.
  useEffect(() => {
    const tick = () => api.meta().then(setMeta).catch(() => setMeta(null))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  // SSE with backoff reconnect. Filter to only show events since page opened.
  useEffect(() => {
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout>
    let delay = 1000

    const connect = () => {
      es = api.eventStream()
      es.addEventListener('log', (e) => {
        try {
          const ev: LogEvent = JSON.parse((e as MessageEvent).data)
          // Only show events that happened after this tab opened
          if (ev.ts >= sessionStartTs.current) {
            setEvents((prev) => {
              // Deduplicate if event has an id
              if (ev.id && prev.some((p) => p.id === ev.id)) return prev
              return [...prev, ev].slice(-200)
            })
          }
        } catch {
          /* ignore parse error */
        }
      })
      es.onopen = () => { setLive(true); delay = 1000 }
      es.onerror = () => {
        setLive(false)
        es?.close()
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 30_000)
      }
    }
    connect()
    return () => { es?.close(); clearTimeout(retry) }
  }, [])

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events, open])

  // Frontend was built at __BUILD_STAMP__; api reports its own. Mismatch = stale tab.
  const stale = !!meta && __BUILD_STAMP__ !== 'dev' && meta.build_stamp !== __BUILD_STAMP__
  const spend = events.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0)

  const clearLog = (e: React.MouseEvent) => {
    e.stopPropagation()
    sessionStartTs.current = Date.now() / 1000
    setEvents([])
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 font-mono text-[11px] shadow-2xl">
      {open && (
        <div className="w-[460px] max-h-72 overflow-y-auto rounded-t-lg border border-b-0 border-slate-700 bg-slate-900/95 p-2 backdrop-blur">
          <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
              Live Activity Log ({events.length})
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">since page open</span>
              <button
                onClick={clearLog}
                className="rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white"
                title="Clear current session log"
              >
                Clear
              </button>
            </div>
          </div>
          {events.length === 0 && <div className="p-3 text-center text-slate-500">No activity in this session yet.</div>}
          {events.map((e, i) => (
            <div key={e.id ?? i} className="flex items-start gap-1.5 py-1 leading-snug border-b border-slate-800/40 last:border-0">
              <span className="shrink-0 text-slate-500 text-[10px]">{hhmmss(e.ts)}</span>
              <span className={`shrink-0 rounded border px-1 py-px text-[9px] uppercase tracking-wider ${LEVEL_BADGE[e.level] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {e.scope}
              </span>
              <span className={`flex-1 break-words ${LEVEL_CLS[e.level]}`}>{e.message}</span>
              {!!e.cost_usd && <span className="shrink-0 text-amber-300 font-semibold">${e.cost_usd.toFixed(3)}</span>}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={`flex w-[460px] items-center gap-2 border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-slate-300 backdrop-blur hover:bg-slate-800 ${open ? 'rounded-b-lg' : 'rounded-lg'}`}
        title={stale ? 'Rebuilt since this tab loaded - reload' : 'Build stamp & Activity Log'}
      >
        <span className={live ? 'text-emerald-400' : 'text-rose-400'}>●</span>
        <span className={stale ? 'font-bold text-amber-400' : 'text-slate-400'}>
          {meta?.build_stamp ?? '············'}{stale && ' ⟳'}
        </span>
        <span className="ml-auto flex items-center gap-2 text-slate-500">
          {events.length > 0 && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
              {events.length} event{events.length === 1 ? '' : 's'}
            </span>
          )}
          {spend > 0 && <span className="text-amber-300 font-semibold">${spend.toFixed(2)}</span>}
          <span>api {meta ? '✓' : '✗'}</span>
          <span>{open ? '▾' : '▴'}</span>
        </span>
      </button>
    </div>
  )
}
