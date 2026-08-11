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

export interface DayOut {
  day_number: number
  title: string
  theme: string
  status: string
  context_summary: string
  notes?: Record<string, string> | null
  discussions?: {
    refs: string[]
    topic: string
    minutes: number
    target_minutes: number
    official_min: number
    social_min: number
    status: string
    official_sources: { title: string; url: string; snippet: string; source: string; kind: string; platform?: string | null; engagement?: number | null }[]
    social_sources: { title: string; url: string; snippet: string; source: string; kind: string; platform?: string | null; engagement?: number | null }[]
    sources: { title: string; url: string; snippet: string; source: string; kind?: string; platform?: string | null; engagement?: number | null }[]
    guide: string
  } | null
  blocks_json?: DayDraft | null
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
  selected_refs?: string[]   // curated verse pool from corpus search
}

const j = (r: Response) => {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export type TranslationInfo = {
  code: string
  name: string
}

export type CompareVerse = {
  translation: string
  book: number
  chapter: number
  verse: number
  text: string
  words_of_jesus?: boolean
}

export type SearchHit = {
  ref: string
  book: string
  chapter: number
  verse: number
  text: string
}

export type PassageOut = {
  id: number
  ref: string
  translation: string
  text: string
  order: number
  rationale: string
  highlights: { text: string; note?: string }[] | null
}

export const passages = {
  list: (studyId: number, day: number): Promise<PassageOut[]> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/passages`).then(j),

  add: (studyId: number, day: number, ref: string, translation?: string): Promise<PassageOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/passages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, translation: translation ?? null }),
    }).then(j),

  update: (studyId: number, day: number, passageId: number, body: {
    translation?: string; order?: number; highlights?: { text: string; note?: string }[]; rationale?: string;
  }): Promise<PassageOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/passages/${passageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  remove: (studyId: number, day: number, passageId: number): Promise<void> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/passages/${passageId}`, {
      method: 'DELETE',
    }).then(() => undefined),
}

export const bible = {
  translations: (): Promise<TranslationInfo[]> =>
    api.fetch(`/api/bible/translations`).then(j).then((d) => d.translations),

  compare: (ref: string, codes: string[]): Promise<{ ref: string; verses: CompareVerse[] }> =>
    api.fetch(`/api/bible/compare?ref=${encodeURIComponent(ref)}&translations=${codes.map((c) => encodeURIComponent(c)).join(',')}`)
      .then(j),

  search: (q: string, translation: string, limit = 50): Promise<SearchHit[]> =>
    api.fetch(`/api/bible/search?q=${encodeURIComponent(q)}&translation=${encodeURIComponent(translation)}&limit=${limit}`)
      .then(j).then((d) => d.results),
}

export const preferences = {
  getTranslations: (): Promise<string[]> =>
    api.fetch(`/api/preferences/translations`).then(j).then((d) => d.translations),

  setTranslations: (codes: string[]): Promise<string[]> =>
    api.fetch(`/api/preferences/translations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translations: codes }),
    }).then(j).then((d) => d.translations),
}

export const studies = {
  list: (): Promise<StudyOut[]> =>
    api.fetch(`/api/studies`).then(j),

  get: (id: number): Promise<StudyOut> =>
    api.fetch(`/api/studies/${id}`).then(j),

  create: (body: StudyCreate): Promise<{ study_id: number; status: string }> =>
    api.fetch(`/api/studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  remove: (id: number): Promise<{ deleted: number }> =>
    api.fetch(`/api/studies/${id}`, { method: 'DELETE' }).then(j),

  removeAll: (): Promise<{ deleted: number }> =>
    api.fetch(`/api/studies/_all`, { method: 'DELETE' }).then(j),

  generateDay: (id: number, day: number): Promise<{ day_number: number; status: string; draft: DayDraft }> =>
    api.fetch(`/api/studies/${id}/days/${day}`, { method: 'POST' }).then(j),

  updateDay: (id: number, day: number, blocks_json: DayDraft, notes?: Record<string, string> | null): Promise<DayOut> => {
    const body: { blocks_json: DayDraft; notes?: Record<string, string> | null } = { blocks_json }
    if (notes !== undefined) body.notes = notes
    return api.fetch(`/api/studies/${id}/days/${day}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j)
  },

  reviseDay: (id: number, day: number, instruction: string, selection?: string | null): Promise<{ day_number: number; revised: string; selection: string | null }> =>
    api.fetch(`/api/studies/${id}/days/${day}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, selection: selection ?? null }),
    }).then(j),

  refreshDiscussions: (id: number, day: number): Promise<{ day_number: number; discussions: DayOut['discussions'] }> =>
    api.fetch(`/api/studies/${id}/days/${day}/discussions`, {
      method: 'POST',
    }).then(j),
}

export const TRADITIONS = [
  'non_denominational', 'catholic', 'orthodox', 'anglican', 'lutheran',
  'reformed', 'baptist', 'methodist', 'pentecostal', 'dispensational',
  'covenant', 'liberation',
]
