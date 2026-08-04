import { api } from './api'

export type StudyStatus = 'pending' | 'generating' | 'ready' | 'failed'

export type ScriptureBlock = {
  ref: string
  book: string
  text: string
  rationale: string
}

export type DayDraft = {
  heading: string
  opening_prayer: string
  scripture: ScriptureBlock[]
  commentary: string
  questions: string[]
  closing_prayer: string
}

export type DayOut = {
  day_number: number
  title: string
  theme: string
  status: StudyStatus
  context_summary: string
  blocks_json: DayDraft | null
}

export type StudyOut = {
  id: number
  topic: string
  title: string
  minutes_per_day: number
  total_days: number
  tradition: string
  imagery_policy: string
  primary_translation: string
  status: StudyStatus
  days: DayOut[]
}

export type StudyCreate = {
  topic: string
  minutes_per_day?: number
  total_days?: number
  tradition?: string | null
  imagery_policy?: string | null
  primary_translation?: string
}

const j = (r: Response) => {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const studies = {
  list: (): Promise<StudyOut[]> =>
    fetch(`${api.url}/api/studies`).then(j),

  get: (id: number): Promise<StudyOut> =>
    fetch(`${api.url}/api/studies/${id}`).then(j),

  create: (body: StudyCreate): Promise<{ study_id: number; status: string }> =>
    fetch(`${api.url}/api/studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  generateDay: (id: number, day: number): Promise<{ day_number: number; status: string; draft: DayDraft }> =>
    fetch(`${api.url}/api/studies/${id}/days/${day}`, { method: 'POST' }).then(j),
}

export const TRADITIONS = [
  'non_denominational', 'catholic', 'orthodox', 'anglican', 'lutheran',
  'reformed', 'baptist', 'methodist', 'pentecostal', 'dispensational',
  'covenant', 'liberation',
]
