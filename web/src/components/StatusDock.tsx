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

/** Bottom-right compact dock: a little "log" button on the bottom right that opens the live activity log */
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
          if (ev.ts >= sessionStartTs.current) {
            setEvents((prev) => {
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

  const stale = !!meta && __BUILD_STAMP__ !== 'dev' && meta.build_stamp !== __BUILD_STAMP__
  const spend = events.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0)

  const clearLog = (e: React.MouseEvent) => {
    e.stopPropagation()
    sessionStartTs.current = Date.now() / 1000
    setEvents([])
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 font-mono text-[11px] shadow-2xl flex flex-col items-end">
      {open && (
        <div className="mb-2 w-[340px] sm:w-[440px] max-h-80 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900/95 p-3 backdrop-blur shadow-2xl animate-fade-in">
          <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 text-slate-400">
            <div className="flex items-center gap-2">
              <span className={live ? 'text-emerald-400' : 'text-rose-400'}>●</span>
              <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-300">
                Activity Log ({events.length})
              </span>
              {meta?.build_stamp && (
                <span className="text-[9px] text-slate-500">v{meta.build_stamp}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {spend > 0 && <span className="text-amber-300 font-semibold text-[10px]">${spend.toFixed(2)}</span>}
              <button
                type="button"
                onClick={clearLog}
                className="rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white"
                title="Clear current session log"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white px-1 text-xs"
                title="Close log"
              >
                ✕
              </button>
            </div>
          </div>

          {events.length === 0 && (
            <div className="p-4 text-center text-slate-500 text-[10px]">
              No activity in this session yet.
            </div>
          )}

          <div className="space-y-1">
            {events.map((e, i) => (
              <div key={e.id ?? i} className="flex items-start gap-1.5 py-1 leading-snug border-b border-slate-800/40 last:border-0">
                <span className="shrink-0 text-slate-500 text-[9px]">{hhmmss(e.ts)}</span>
                <span className={`shrink-0 rounded border px-1 py-px text-[8px] uppercase tracking-wider ${LEVEL_BADGE[e.level] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {e.scope}
                </span>
                <span className={`flex-1 break-words ${LEVEL_CLS[e.level]}`}>{e.message}</span>
                {!!e.cost_usd && <span className="shrink-0 text-amber-300 font-semibold text-[9px]">${e.cost_usd.toFixed(3)}</span>}
              </div>
            ))}
          </div>
          <div ref={bottom} />
        </div>
      )}

      {/* Little "log" button on bottom right */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-xs text-slate-300 shadow-md backdrop-blur transition-all hover:bg-slate-800 hover:text-white hover:border-slate-500 active:scale-95 ${
          open ? 'ring-1 ring-primary' : ''
        }`}
        title={stale ? 'Rebuilt since this tab loaded - reload' : 'Activity Log'}
      >
        <span className={`text-[8px] ${live ? 'text-emerald-400' : 'text-rose-400'}`}>●</span>
        <span className="font-sans font-semibold tracking-wide lowercase">log</span>
        {events.length > 0 && !open && (
          <span className="ml-0.5 rounded-full bg-slate-800 px-1.5 py-0.2 text-[9px] text-slate-300 border border-slate-700 font-mono">
            {events.length}
          </span>
        )}
      </button>
    </div>
  )
}
