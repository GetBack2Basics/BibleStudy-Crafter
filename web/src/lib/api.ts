const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type LogEvent = {
  ts: number
  level: 'info' | 'success' | 'warn' | 'error'
  scope: string
  message: string
  cost_usd: number | null
  study_id: number | null
}

export type Meta = {
  build_stamp: string
  git_sha: string
  started_at: number
  version: string
  providers: { text: boolean; ollama: boolean; image: boolean }
  budget_cap_usd: number
}

export const api = {
  url: API,
  meta: (): Promise<Meta> => fetch(`${API}/api/meta`).then((r) => r.json()),
  health: () => fetch(`${API}/health`).then((r) => r.ok),
  eventStream: () => new EventSource(`${API}/api/events`),
}
