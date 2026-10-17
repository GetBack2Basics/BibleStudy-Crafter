import catalogData from '../data/historical_maps_index.json'
import type { DayMapsOut, HistoricalPlateRef } from './studies'

export interface HistoricalPlatesResolution {
  bible_ca: HistoricalPlateRef
  knowing_the_bible: HistoricalPlateRef
}

const DEFAULT_BIBLE_CA: HistoricalPlateRef = {
  title: '100 Free Printable Public Use Bible Maps',
  url: 'https://www.bible.ca/maps/',
  source_name: 'Bible.ca',
  source_url: 'https://www.bible.ca/maps/',
  attribution: 'Courtesy of Steve Rudd / Bible.ca (100 Free Printable Public Use Bible Maps for personal & church study).'
}

const DEFAULT_KNOWING_THE_BIBLE: HistoricalPlateRef = {
  title: 'Bible Maps Archive',
  url: 'https://www.knowingthebible.net/bible-maps',
  source_name: 'Knowing The Bible',
  source_url: 'https://www.knowingthebible.net/bible-maps',
  attribution: 'Courtesy of KnowingTheBible.net Bible Maps Archive.'
}

export function resolveHistoricalPlates(mapsData?: DayMapsOut | null): HistoricalPlatesResolution {
  if (mapsData?.historical_plates?.bible_ca && mapsData?.historical_plates?.knowing_the_bible) {
    return {
      bible_ca: mapsData.historical_plates.bible_ca,
      knowing_the_bible: mapsData.historical_plates.knowing_the_bible
    }
  }

  // Client-side fallback matching if historical_plates was not pre-populated in saved data
  const book = (mapsData?.book_name || '').toLowerCase()
  const osis = (mapsData?.osis_code || '').toLowerCase()
  const period = (mapsData?.period || '').toLowerCase()
  const locNames = (mapsData?.locations || []).map(l => l.name.toLowerCase())

  const bcaMaps = catalogData.collections?.bible_ca?.maps || []
  let bestBca: any = null
  let bestBcaScore = 0

  for (const m of bcaMaps) {
    let score = 0
    if (osis && m.osis_codes?.includes(osis)) score += 100
    if (book && m.books?.some((b: string) => b.toLowerCase() === book)) score += 80
    if (period && m.periods?.includes(period)) score += 40
    for (const loc of locNames) {
      if (m.locations?.some((l: string) => l.toLowerCase() === loc)) score += 20
    }
    if (score > bestBcaScore) {
      bestBcaScore = score
      bestBca = m
    }
  }

  const ktbMaps = catalogData.collections?.knowing_the_bible?.maps || []
  let bestKtb: any = null
  let bestKtbScore = 0

  for (const m of ktbMaps) {
    let score = 0
    if (osis && m.osis_codes?.includes(osis)) score += 100
    if (book && m.books?.some((b: string) => b.toLowerCase() === book)) score += 80
    if (period && m.periods?.includes(period)) score += 40
    for (const loc of locNames) {
      if (m.locations?.some((l: string) => l.toLowerCase() === loc)) score += 20
    }
    if (score > bestKtbScore) {
      bestKtbScore = score
      bestKtb = m
    }
  }

  return {
    bible_ca: (bestBca && bestBcaScore >= 40)
      ? {
          title: bestBca.title,
          url: bestBca.url,
          source_name: 'Bible.ca',
          source_url: 'https://www.bible.ca/maps/',
          attribution: 'Courtesy of Steve Rudd / Bible.ca (100 Free Printable Public Use Bible Maps for personal & church study).'
        }
      : DEFAULT_BIBLE_CA,
    knowing_the_bible: (bestKtb && bestKtbScore >= 40)
      ? {
          title: bestKtb.title,
          url: bestKtb.url,
          source_name: 'Knowing The Bible',
          source_url: 'https://www.knowingthebible.net/bible-maps',
          attribution: 'Courtesy of KnowingTheBible.net Bible Maps Archive.'
        }
      : DEFAULT_KNOWING_THE_BIBLE
  }
}
