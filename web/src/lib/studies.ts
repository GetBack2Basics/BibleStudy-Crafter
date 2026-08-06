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
    fetch(`${api.url}/api/studies/${studyId}/days/${day}/passages`).then(j),

  add: (studyId: number, day: number, ref: string, translation?: string): Promise<PassageOut> =>
    fetch(`${api.url}/api/studies/${studyId}/days/${day}/passages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, translation: translation ?? null }),
    }).then(j),

  update: (studyId: number, day: number, passageId: number, body: {
    translation?: string; order?: number; highlights?: { text: string; note?: string }[]; rationale?: string;
  }): Promise<PassageOut> =>
    fetch(`${api.url}/api/studies/${studyId}/days/${day}/passages/${passageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  remove: (studyId: number, day: number, passageId: number): Promise<void> =>
    fetch(`${api.url}/api/studies/${studyId}/days/${day}/passages/${passageId}`, {
      method: 'DELETE',
    }).then(() => undefined),
}

export const bible = {
  translations: (): Promise<TranslationInfo[]> =>
    fetch(`${api.url}/api/bible/translations`).then(j).then((d) => d.translations),

  compare: (ref: string, codes: string[]): Promise<{ ref: string; verses: CompareVerse[] }> =>
    fetch(`${api.url}/api/bible/compare?ref=${encodeURIComponent(ref)}&translations=${codes.map((c) => encodeURIComponent(c)).join(',')}`)
      .then(j),
}

export const preferences = {
  getTranslations: (): Promise<string[]> =>
    fetch(`${api.url}/api/preferences/translations`).then(j).then((d) => d.translations),

  setTranslations: (codes: string[]): Promise<string[]> =>
    fetch(`${api.url}/api/preferences/translations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translations: codes }),
    }).then(j).then((d) => d.translations),
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

  updateDay: (id: number, day: number, blocks_json: DayDraft): Promise<DayOut> =>
    fetch(`${api.url}/api/studies/${id}/days/${day}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks_json }),
    }).then(j),

  reviseDay: (id: number, day: number, instruction: string, selection?: string | null): Promise<{ day_number: number; revised: string; selection: string | null }> =>
    fetch(`${api.url}/api/studies/${id}/days/${day}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, selection: selection ?? null }),
    }).then(j),
}

export const TRADITIONS = [
  'non_denominational', 'catholic', 'orthodox', 'anglican', 'lutheran',
  'reformed', 'baptist', 'methodist', 'pentecostal', 'dispensational',
  'covenant', 'liberation',
]
