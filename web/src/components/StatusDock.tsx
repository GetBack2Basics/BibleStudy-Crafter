import { useEffect, useRef, useState } from 'react'
import { api, type LogEvent, type Meta } from '../lib/api'

const LEVEL_CLS: Record<LogEvent['level'], string> = {
  info: 'text-slate-300',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
}

const hhmmss = (ts: number) => new Date(ts * 1000).toTimeString().slice(0, 8)

/** Bottom-right dock: build stamp (yyyymmddhhmm) + live activity log. */
export default function StatusDock() {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [events, setEvents] = useState<LogEvent[]>([])
  const [live, setLive] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  // Poll meta so a rebuild is noticed while the tab stays open.
  useEffect(() => {
    const tick = () => api.meta().then(setMeta).catch(() => setMeta(null))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  // SSE with backoff reconnect.
  useEffect(() => {
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout>
    let delay = 1000

    const connect = () => {
      es = api.eventStream()
      es.addEventListener('log', (e) => {
        setEvents((prev) => [...prev, JSON.parse((e as MessageEvent).data)].slice(-200))
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

  return (
    <div className="fixed bottom-3 right-3 z-50 font-mono text-[11px] shadow-2xl">
      {open && (
        <div className="w-[420px] max-h-64 overflow-y-auto rounded-t-lg border border-b-0 border-slate-700 bg-slate-900/95 p-2 backdrop-blur">
          {events.length === 0 && <div className="p-2 text-slate-500">No activity yet.</div>}
          {events.map((e, i) => (
            <div key={i} className="flex gap-2 py-px leading-relaxed">
              <span className="shrink-0 text-slate-600">{hhmmss(e.ts)}</span>
              <span className="shrink-0 text-slate-500">{e.scope}</span>
              <span className={`flex-1 break-words ${LEVEL_CLS[e.level]}`}>{e.message}</span>
              {!!e.cost_usd && <span className="shrink-0 text-amber-300">${e.cost_usd.toFixed(3)}</span>}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={`flex w-[420px] items-center gap-2 border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-slate-300 backdrop-blur hover:bg-slate-800 ${open ? 'rounded-b-lg' : 'rounded-lg'}`}
        title={stale ? 'Rebuilt since this tab loaded - reload' : 'Build stamp'}
      >
        <span className={live ? 'text-emerald-400' : 'text-rose-400'}>●</span>
        <span className={stale ? 'font-bold text-amber-400' : 'text-slate-400'}>
          {meta?.build_stamp ?? '············'}{stale && ' ⟳'}
        </span>
        <span className="ml-auto flex gap-2 text-slate-500">
          {spend > 0 && <span className="text-amber-300">${spend.toFixed(2)}</span>}
          <span>api {meta ? '✓' : '✗'}</span>
          <span>{open ? '▾' : '▴'}</span>
        </span>
      </button>
    </div>
  )
}
