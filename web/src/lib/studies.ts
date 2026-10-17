import { api } from './api'
import { auth } from './auth'

export type StudyStatus = 'pending' | 'generating' | 'ready' | 'failed'

export type ScriptureBlock = {
  ref: string
  book: string
  text: string
  rationale: string
}

export interface BiblicalLocation {
  name: string
  ancient_name: string
  modern_name: string
  modern_country: string
  lat: number
  lng: number
  period?: string
  biblical_region?: string
  description?: string
  elevation_m?: number
  scripture_ref?: string
  // OpenBible authoritative geocoding & photo metadata
  openbible_id?: string
  openbible_slug?: string
  openbible_url?: string
  modern_basis_id?: string
  confidence_score?: number
  photo_url?: string
  photo_credit?: string
  photo_credit_url?: string
  photo_license?: string
  photo_caption?: string
  photos?: Array<{
    image_id?: string
    thumb_url: string
    full_url?: string
    credit?: string
    credit_url?: string
    license?: string
    caption?: string
  }>
}

export interface HistoricalPlateRef {
  title: string
  url: string
  source_name: string
  source_url: string
  attribution?: string
}

export interface DayMapsOut {
  status: string
  has_locations: boolean
  period: string
  period_title: string
  historical_summary: string
  modern_summary: string
  locations: BiblicalLocation[]
  center: [number, number]
  zoom: number
  bounds?: [[number, number], [number, number]]
  ancient_map_url?: string
  modern_map_url?: string
  map_crafter_url?: string
  historical_plates?: {
    bible_ca?: HistoricalPlateRef
    knowing_the_bible?: HistoricalPlateRef
  }
  public_maps_refs?: Array<{
    title: string
    url: string
    source_name?: string
    source_url?: string
    attribution?: string
  }>
  gcp_engine?: any
  // OpenBible Book-Level KML & Chapter Preview
  book_name?: string
  chapter?: number
  osis_code?: string
  book_kml_url?: string
  openbible_preview_url?: string
}

export type DayDraft = {
  heading: string
  opening_prayer: string
  scripture: ScriptureBlock[]
  commentary: string
  questions: string[]
  closing_prayer: string
  maps?: DayMapsOut | null
}

export type DiscussionSource = {
  title: string
  url: string
  snippet: string
  source: string
  kind?: string
  platform?: string | null
  engagement?: number | null
  sentiment?: 'negative' | 'neutral' | 'positive'
  confidence?: number
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
    official_sources: DiscussionSource[]
    social_sources: DiscussionSource[]
    sources: DiscussionSource[]
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

export type TTSChoice = {
  short_name: string
  gender: string
  friendly_name: string
  locale: string
  accent?: string
  category?: string
}

export const ttsDefaultVoices: TTSChoice[] = [
  { short_name: 'gtts-en', gender: 'Female', friendly_name: 'Google English (General)', locale: 'en', accent: 'Standard' },
  { short_name: 'gtts-en_US', gender: 'Female', friendly_name: 'Google English (United States)', locale: 'en-US', accent: 'American' },
  { short_name: 'gtts-en_GB', gender: 'Female', friendly_name: 'Google English (United Kingdom)', locale: 'en-GB', accent: 'British' },
  { short_name: 'gtts-en_AU', gender: 'Female', friendly_name: 'Google English (Australia)', locale: 'en-AU', accent: 'Australian' },
  { short_name: 'gtts-en_CA', gender: 'Female', friendly_name: 'Google English (Canada)', locale: 'en-CA', accent: 'Canadian' },
  { short_name: 'gtts-en_IN', gender: 'Female', friendly_name: 'Google English (India)', locale: 'en-IN', accent: 'Indian' },
  { short_name: 'gtts-en_IE', gender: 'Female', friendly_name: 'Google English (Ireland)', locale: 'en-IE', accent: 'Irish' },
  { short_name: 'gtts-en_ZA', gender: 'Female', friendly_name: 'Google English (South Africa)', locale: 'en-ZA', accent: 'South African' },
  { short_name: 'gtts-es', gender: 'Female', friendly_name: 'Google Spanish (Spain)', locale: 'es-ES', accent: 'Castilian' },
  { short_name: 'gtts-es_MX', gender: 'Female', friendly_name: 'Google Spanish (Mexico)', locale: 'es-MX', accent: 'Mexican' },
  { short_name: 'gtts-fr', gender: 'Female', friendly_name: 'Google French (France)', locale: 'fr-FR', accent: 'French' },
  { short_name: 'gtts-de', gender: 'Female', friendly_name: 'Google German (Germany)', locale: 'de-DE', accent: 'German' },
  { short_name: 'gtts-it', gender: 'Female', friendly_name: 'Google Italian (Italy)', locale: 'it-IT', accent: 'Italian' },
  { short_name: 'gtts-pt', gender: 'Female', friendly_name: 'Google Portuguese (Portugal)', locale: 'pt-PT', accent: 'European Portuguese' },
  { short_name: 'gtts-el', gender: 'Female', friendly_name: 'Google Greek (Biblical / Modern)', locale: 'el-GR', accent: 'Greek' },
  { short_name: 'gtts-la', gender: 'Female', friendly_name: 'Google Latin (Traditional)', locale: 'la', accent: 'Latin' },
  { short_name: 'gtts-ja', gender: 'Female', friendly_name: 'Google Japanese', locale: 'ja-JP', accent: 'Japanese' },
  { short_name: 'gtts-ko', gender: 'Female', friendly_name: 'Google Korean', locale: 'ko-KR', accent: 'Korean' },
  { short_name: 'gtts-zh', gender: 'Female', friendly_name: 'Google Chinese (Mandarin)', locale: 'zh-CN', accent: 'Mandarin' },
]

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

  add: (studyId: number, day: number, ref: string, rationale?: string, translation?: string): Promise<PassageOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/passages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, rationale: rationale ?? '', translation: translation ?? null }),
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

  reviseDay: (id: number, day: number, instruction: string, selection?: string | null, target_field?: 'commentary' | 'opening_prayer' | 'closing_prayer' | string): Promise<{ day_number: number; revised: string; selection: string | null; target_field?: string; blocks_json?: DayDraft }> =>
    api.fetch(`/api/studies/${id}/days/${day}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, selection: selection ?? null, target_field: target_field ?? 'commentary' }),
    }).then(j),

  refreshDiscussions: (
    id: number,
    day: number,
    counts?: { negative_count?: number; neutral_count?: number; positive_count?: number }
  ): Promise<{ day_number: number; discussions: DayOut['discussions'] }> =>
    api.fetch(`/api/studies/${id}/days/${day}/discussions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: counts ? JSON.stringify(counts) : undefined,
    }).then(j),

  generateClosingPrayer: (
    id: number,
    day: number,
    notes?: Record<string, string> | null,
    instruction?: string
  ): Promise<{ day_number: number; closing_prayer: string; blocks_json: DayDraft }> =>
    api.fetch(`/api/studies/${id}/days/${day}/closing-prayer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes ?? null, instruction: instruction ?? null }),
    }).then(j),



  ttsVoices: (): Promise<{ voices: TTSChoice[]; count: number }> =>
    api.fetch(`/api/tts/voices`).then(j),

  ttsSampleUrl: (voice: string, text?: string): string => {
    const qs = new URLSearchParams()
    if (voice) qs.set('voice', voice)
    if (text) qs.set('text', text)
    return `${api.url}/api/tts/sample?${qs.toString()}`
  },

  ttsRender: (
    id: number,
    day: number,
    voice: string,
    section: string = 'all',
    customText?: string
  ): Promise<{ asset_id: number; status: string }> =>
    api.fetch(`/api/tts/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        study_id: id,
        day_number: day,
        voice,
        section: section || 'all',
        custom_text: customText || null,
      }),
    }).then(j),

  fetchSourceText: (url: string, studyId?: number, dayNumber?: number): Promise<{ title: string; text: string; source: string; note?: string }> => {
    const utf8Bytes = new TextEncoder().encode(url)
    let binary = ''
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i])
    }
    const safeB64 = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const params = new URLSearchParams()
    if (studyId) params.set('study_id', String(studyId))
    if (dayNumber) params.set('day_number', String(dayNumber))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return api.fetch(`/api/studies/sources/${safeB64}/text${qs}`).then(j)
  },

  getMaps: (studyId: number, dayNumber: number): Promise<DayMapsOut> =>
    api.fetch(`/api/studies/${studyId}/days/${dayNumber}/maps`).then(j),

  refreshMaps: (studyId: number, dayNumber: number): Promise<DayMapsOut> =>
    api.fetch(`/api/studies/${studyId}/days/${dayNumber}/maps/refresh`, { method: 'POST' }).then(j),
}

export interface SourceTextResult {
  title: string
  text: string
  source: string
  note?: string
}

export interface AssetOut {
  id: number
  study_day_id: number
  kind: 'cover_art' | 'infographic' | 'image' | 'audio' | string
  provider: string
  model: string
  prompt: string
  style_preset: string
  media_type: string
  is_active: boolean
  status: 'queued' | 'rendering' | 'ready' | 'failed'
  error?: string | null
  cost_usd: number
  meta_json?: any
  has_content: boolean
  created_at: string
}

export interface PresetOut {
  styles: { id: string; label: string; description: string; prompt_suffix: string }[]
  moods: { id: string; label: string; description: string; prompt_cue: string }[]
  aspect_ratios: { id: string; label: string; width: number; height: number; best_for: string }[]
}

export interface SuggestPromptIn {
  style_id?: string
  mood_id?: string
  custom_guidance?: string
}

export interface SuggestPromptOut {
  cover_art_prompt: string
  infographic_art_prompt: string
  artistic_rationale: string
  negative_prompt: string
  style_id: string
  mood_id: string
}

export interface RenderArtIn {
  kind: 'cover_art' | 'infographic' | 'image'
  prompt: string
  style_preset?: string
  aspect_ratio?: string
  is_active?: boolean
}

export interface InfographicPillar {
  title: string
  subtitle?: string
  icon: string
  insight: string
  scripture_ref: string
  key_phrase: string
}

export interface InfographicKeyVerse {
  ref: string
  text: string
}

export interface StructuredInfographicOut {
  title: string
  central_thesis: string
  pillars: InfographicPillar[]
  key_verse: InfographicKeyVerse
  practical_walkaway: string
}

export const assets = {
  presets: (): Promise<PresetOut> => api.fetch('/api/art/presets').then(j),

  list: (studyId: number, day: number): Promise<AssetOut[]> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/assets`).then(j),

  suggestPrompt: (studyId: number, day: number, body: SuggestPromptIn): Promise<SuggestPromptOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/art/suggest-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  renderArt: (studyId: number, day: number, body: RenderArtIn): Promise<{ asset_id: number; status: string; message: string }> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/art/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  structuredInfographic: (studyId: number, day: number): Promise<StructuredInfographicOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/infographic/structured`, {
      method: 'POST',
    }).then(j),

  generateSvgInfographic: (studyId: number, day: number): Promise<AssetOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/infographic/svg`, {
      method: 'POST',
    }).then(j),

  mediaUrl: (assetId: number, download: boolean = false): string => {
    const token = auth.accessToken()
    const params = new URLSearchParams()
    if (download) params.set('download', '1')
    if (token) params.set('token', token)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return `${api.url}/api/assets/${assetId}${qs}`
  },

  setActive: (studyId: number, day: number, assetId: number): Promise<AssetOut> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/assets/${assetId}/active`, {
      method: 'PUT',
    }).then(j),

  delete: (studyId: number, day: number, assetId: number): Promise<{ deleted: boolean; asset_id: number }> =>
    api.fetch(`/api/studies/${studyId}/days/${day}/assets/${assetId}`, {
      method: 'DELETE',
    }).then(j),
}

export const TRADITIONS = [
  'non_denominational', 'catholic', 'orthodox', 'anglican', 'lutheran',
  'reformed', 'baptist', 'methodist', 'pentecostal', 'dispensational',
  'covenant', 'liberation',
]

export const voicePreferences = {
  getSummaryLength: (): number => {
    try {
      const val = localStorage.getItem('study_voice_summary_length')
      if (val) {
        const parsed = parseInt(val, 10)
        if (!isNaN(parsed) && parsed >= 200 && parsed <= 3000) return parsed
      }
    } catch {
      // ignore
    }
    return 800
  },
  setSummaryLength: (len: number): void => {
    try {
      localStorage.setItem('study_voice_summary_length', String(len))
    } catch {
      // ignore
    }
  },
  getCounts: (): { negative: number; neutral: number; positive: number } => {
    try {
      const val = localStorage.getItem('study_voice_counts')
      if (val) {
        const parsed = JSON.parse(val)
        if (
          typeof parsed.negative === 'number' &&
          typeof parsed.neutral === 'number' &&
          typeof parsed.positive === 'number'
        ) {
          return {
            negative: Math.max(0, parsed.negative),
            neutral: Math.max(0, parsed.neutral),
            positive: Math.max(0, parsed.positive),
          }
        }
      }
    } catch {
      // ignore
    }
    return { negative: 4, neutral: 2, positive: 2 }
  },
  setCounts: (counts: { negative: number; neutral: number; positive: number }): void => {
    try {
      localStorage.setItem('study_voice_counts', JSON.stringify(counts))
    } catch {
      // ignore
    }
  },
}

export const ttsVoicePreferences = {
  getPreferredVoice: (): string => {
    try {
      return localStorage.getItem('study_preferred_voice') || 'gtts-en'
    } catch {
      return 'gtts-en'
    }
  },
  setPreferredVoice: (voiceShortName: string): void => {
    try {
      localStorage.setItem('study_preferred_voice', voiceShortName)
    } catch {
      // ignore
    }
  },
}

