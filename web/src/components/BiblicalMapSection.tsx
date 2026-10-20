import { useEffect, useState, useRef } from 'react'
import { studies, type BiblicalLocation, type DayMapsOut, type ParsedLocationMatch } from '../lib/studies'
import { resolveHistoricalPlates } from '../lib/historicalPlates'

interface BiblicalMapSectionProps {
  studyId: number
  dayNumber: number
  commentary?: string
  hasCommentary: boolean
  cachedMaps?: DayMapsOut | null
  onMapsLoaded?: (maps: DayMapsOut) => void
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

export default function BiblicalMapSection({
  studyId,
  dayNumber,
  hasCommentary,
  cachedMaps,
  onMapsLoaded,
}: BiblicalMapSectionProps) {
  const [mapsData, setMapsData] = useState<DayMapsOut | null>(cachedMaps ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'side_by_side' | 'historical' | 'modern' | 'split_slider'>('side_by_side')
  const [selectedPlace, setSelectedPlace] = useState<BiblicalLocation | null>(null)
  const [splitSliderPercent, setSplitSliderPercent] = useState<number>(50)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const sliderContainerRef = useRef<HTMLDivElement>(null)

  // Photo Carousel & Lightbox State
  const [photoIndex, setPhotoIndex] = useState(0)
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string
    caption?: string
    credit?: string
    credit_url?: string
    license?: string
  } | null>(null)

  // Parse Text / Scripture Modal State
  const [showParseModal, setShowParseModal] = useState(false)
  const [pastedText, setPastedText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isAddingLocations, setIsAddingLocations] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedResults, setParsedResults] = useState<ParsedLocationMatch[] | null>(null)
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [replaceAll, setReplaceAll] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Era Mode: 'study' (default study era data) vs 'none' (No Eras / clean map with no data shown)
  const [eraFilter, setEraFilter] = useState<'study' | 'none'>('study')
  const [customAddedLocations, setCustomAddedLocations] = useState<BiblicalLocation[]>([])

  const PRESET_VERSES = [
    {
      label: 'Acts 2:7-12 (Pentecost Pilgrims)',
      text: '7 Utterly amazed, they asked: “Aren’t all these who are speaking Galileans? 8 Then how is it that each of us hears them in our native language? 9 Parthians, Medes and Elamites; residents of Mesopotamia, Judea and Cappadocia, Pontus and Asia, 10 Phrygia and Pamphylia, Egypt and the parts of Libya near Cyrene; visitors from Rome 11 (both Jews and converts to Judaism); Cretans and Arabs—we hear them declaring the wonders of God in our own tongues!” 12 Amazed and perplexed, they asked one another, “What does this mean?”',
    },
    {
      label: "Acts 13:4-14 (Paul's 1st Journey)",
      text: 'So being sent out by the Holy Spirit, they went down to Seleucia, and from there they sailed to Cyprus. When they arrived at Salamis, they proclaimed the word of God... When they had gone through the whole island as far as Paphos... Paul and his companions set sail from Paphos and came to Perga in Pamphylia... they went on from Perga and arrived at Antioch in Pisidia.',
    },
    {
      label: 'Luke 24:13-35 (Road to Emmaus)',
      text: 'Now that same day two of them were going to a village called Emmaus, about seven miles from Jerusalem... When he was at the table with them, he took bread, gave thanks, broke it and began to give it to them. Then their eyes were opened and they recognized him... They got up and returned at once to Jerusalem.',
    },
    {
      label: 'Genesis 12:1-9 (Abraham)',
      text: 'The Lord had said to Abram, "Go from your country, your people and your father’s household to the land I will show you... So Abram went from Haran... Abram traveled through the land as far as the site of the great tree of Moreh at Shechem... From there he went on toward the hills east of Bethel and pitched his tent, with Bethel on the west and Ai on the east... Then Abram set out and continued toward the Negev."',
    },
  ]

  const handleScanText = async () => {
    if (!pastedText.trim()) return
    setIsParsing(true)
    setParseError(null)
    try {
      const res = await studies.parseMapText(studyId, dayNumber, pastedText)
      setParsedResults(res.locations || [])
      const toSelect = new Set<string>()
      res.locations.forEach((loc) => {
        toSelect.add(loc.name)
      })
      setSelectedToAdd(toSelect)
    } catch (err) {
      console.error('Failed to parse text for locations:', err)
      setParseError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsParsing(false)
    }
  }

  const handleAddSelectedToMap = async () => {
    if (!parsedResults) return
    const locsToAdd = parsedResults.filter((l) => selectedToAdd.has(l.name))
    if (locsToAdd.length === 0) return

    setIsAddingLocations(true)
    setParseError(null)
    try {
      const updated = await studies.addMapLocations(studyId, dayNumber, locsToAdd, replaceAll)
      setMapsData(updated)
      setCustomAddedLocations((prev) => (replaceAll ? locsToAdd : [...prev, ...locsToAdd]))
      if (locsToAdd.length > 0) {
        setSelectedPlace(locsToAdd[0])
      }
      onMapsLoaded?.(updated)
      setShowParseModal(false)
      setParsedResults(null)
      setPastedText('')
      setToastMessage(`Successfully added ${locsToAdd.length} biblical location(s) to the map!`)
      setTimeout(() => setToastMessage(null), 6000)
    } catch (err) {
      console.error('Failed to add locations to map:', err)
      setParseError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAddingLocations(false)
    }
  }

  useEffect(() => {
    setPhotoIndex(0)
  }, [selectedPlace?.name])

  const loadMaps = async (forceRefresh = false) => {
    if (!hasCommentary) return
    setLoading(true)
    setError(null)
    try {
      let res: DayMapsOut
      if (forceRefresh) {
        res = await studies.refreshMaps(studyId, dayNumber)
      } else if (cachedMaps && cachedMaps.status === 'ready') {
        res = cachedMaps
      } else {
        res = await studies.getMaps(studyId, dayNumber)
      }
      setMapsData(res)
      if (res.locations && res.locations.length > 0) {
        setSelectedPlace((prev) => prev ?? res.locations[0])
      }
      onMapsLoaded?.(res)
    } catch (err) {
      console.error('Failed to load biblical maps:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (cachedMaps && cachedMaps.status === 'ready') {
      setMapsData(cachedMaps)
      if (cachedMaps.locations?.length) {
        setSelectedPlace((prev) => prev ?? cachedMaps.locations[0])
      }
    } else {
      loadMaps()
    }
  }, [studyId, dayNumber, cachedMaps])

  // Split-wipe mouse/touch handlers
  const handleSliderMove = (clientX: number) => {
    if (!sliderContainerRef.current) return
    const rect = sliderContainerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percent = Math.max(10, Math.min(90, (x / rect.width) * 100))
    setSplitSliderPercent(percent)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDraggingSlider && e.touches[0]) {
      handleSliderMove(e.touches[0].clientX)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingSlider) {
      handleSliderMove(e.clientX)
    }
  }

  if (!hasCommentary) return null

  const allLocations = Array.isArray(mapsData?.locations) ? mapsData.locations : []
  const locations = eraFilter === 'none' ? customAddedLocations : allLocations
  const eraTitle = eraFilter === 'none' ? 'No Eras (Clean Map)' : (mapsData?.period_title || 'Biblical Setting')

  const getMapCrafterStudioUrl = () => {
    const rawUrl = mapsData?.map_crafter_url || 'https://storage.googleapis.com/biblestudy-map-crafter/index.html'
    if (eraFilter === 'none') {
      if (rawUrl.includes('period=')) {
        return rawUrl.replace(/period=[^&]*/, 'period=none')
      }
      return rawUrl.includes('?') ? `${rawUrl}&period=none` : `${rawUrl}?period=none`
    }
    return rawUrl
  }

  return (
    <section
      id="biblical-map-section"
      className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-5 mt-6 transition-all"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 text-tertiary flex items-center justify-center shadow-inner">
            <I name="explore" cls="text-[22px]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-caption-caps text-caption-caps tracking-widest text-tertiary uppercase font-bold text-[11px]">
                BIBLICAL GEOGRAPHY & ATLAS
              </span>
              <span className="text-outline/40">·</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                eraFilter === 'none'
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/40'
              }`}>
                <I name={eraFilter === 'none' ? 'layers_clear' : 'history_edu'} cls="text-[14px] text-tertiary" />
                {eraTitle}
              </span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface font-semibold flex items-center gap-2 mt-0.5">
              Historical Setting & Present-Day Context
            </h3>
          </div>
        </div>

        {/* Action Controls & View Mode Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Era Filter: Study Era vs No Eras */}
          <div className="inline-flex items-center bg-surface-container-low rounded-xl p-1 border border-outline-variant/30 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setEraFilter('study')
                const allLocs = Array.isArray(mapsData?.locations) ? mapsData.locations : []
                setSelectedPlace(allLocs.length > 0 ? allLocs[0] : null)
                setToastMessage(`Switched to Study Era: ${mapsData?.period_title || 'Biblical Setting'}`)
                setTimeout(() => setToastMessage(null), 4000)
              }}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                eraFilter === 'study'
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
              title={`Show historical era data for ${mapsData?.period_title || 'this study'}`}
            >
              <I name="history_edu" cls="text-[16px] text-tertiary" />
              <span className="hidden sm:inline">{mapsData?.period_title ? mapsData.period_title.split('(')[0].trim() : 'Study Era'}</span>
              <span className="sm:hidden">Era</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEraFilter('none')
                setSelectedPlace(customAddedLocations.length > 0 ? customAddedLocations[0] : null)
                setToastMessage('🗺️ No Eras: Clean map active (no historical data shown)')
                setTimeout(() => setToastMessage(null), 4000)
              }}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                eraFilter === 'none'
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
              title="No Eras: Clean map with no historical data shown"
            >
              <I name="layers_clear" cls="text-[16px] text-tertiary" />
              <span>No Eras (Clean)</span>
            </button>
          </div>

          {/* Mode switch buttons */}
          <div className="inline-flex items-center bg-surface-container-low rounded-xl p-1 border border-outline-variant/30 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('side_by_side')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'side_by_side'
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
              title="View ancient era and present day side-by-side"
            >
              <I name="view_column" cls="text-[16px]" />
              <span className="hidden sm:inline">Side-by-Side</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('split_slider')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'split_slider'
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
              title="Interactive peel / split-wipe slider"
            >
              <I name="compare" cls="text-[16px]" />
              <span className="hidden sm:inline">Peel Slider</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('historical')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'historical'
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
              title="Historical biblical era only"
            >
              <I name="auto_stories" cls="text-[16px]" />
              <span className="hidden sm:inline">Historical</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('modern')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'modern'
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
              title="Modern satellite context only"
            >
              <I name="satellite_alt" cls="text-[16px]" />
              <span className="hidden sm:inline">Present Day</span>
            </button>
          </div>

          {/* OpenBible Chapter Atlas */}
          {mapsData?.openbible_preview_url && (
            <a
              href={mapsData.openbible_preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-primary/30"
              title={`Explore OpenBible interactive scholarly atlas for ${mapsData.book_name || 'Scripture'} ${mapsData.chapter || ''}`}
            >
              <I name="menu_book" cls="text-[16px]" />
              <span className="hidden lg:inline">{mapsData.book_name || 'Book'} {mapsData.chapter || ''} OpenBible</span>
              <span className="lg:hidden">Atlas</span>
              <I name="open_in_new" cls="text-[13px]" />
            </a>
          )}

          {/* Book KML Download */}
          {mapsData?.book_kml_url && (
            <a
              href={mapsData.book_kml_url}
              download={`${mapsData.osis_code || 'bible'}.kml`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-primary text-xs font-medium flex items-center gap-1.5 transition-colors border border-outline-variant/40"
              title={`Download authoritative OpenBible vector KML file for ${mapsData.book_name || 'Book'} for Google Earth or GIS`}
            >
              <I name="download" cls="text-[16px] text-tertiary" />
              <span className="hidden xl:inline">{mapsData.book_name || 'Book'} KML</span>
              <span className="xl:hidden">KML</span>
            </a>
          )}

          {/* GCS Map Crafter Studio Admin Link */}
          <a
            href={getMapCrafterStudioUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-tertiary/10 text-tertiary hover:bg-tertiary/20 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-tertiary/30"
            title="Open Biblical Map Crafter on Google Cloud Storage to modify templates, add archaeological sites, or export 2 JPGs"
          >
            <I name="tune" cls="text-[16px]" />
            <span className="hidden md:inline">Map Crafter Studio (GCS)</span>
            <I name="open_in_new" cls="text-[13px]" />
          </a>

          {/* Add locations Button */}
          <button
            type="button"
            onClick={() => {
              setShowParseModal(true)
              setParseError(null)
            }}
            className="px-3 py-1.5 rounded-xl bg-tertiary text-on-tertiary hover:opacity-90 active:scale-95 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
            title="Paste scripture verses or text to parse for locations and add them to this map"
          >
            <I name="add_location_alt" cls="text-[16px]" />
            <span>Add locations</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => loadMaps(true)}
            disabled={loading}
            className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface-container-low transition-colors disabled:opacity-50"
            title="Re-scan commentary and refresh geographical coordinates"
          >
            <I name="refresh" cls={`text-[18px] ${loading ? 'animate-spin text-tertiary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-primary/95 text-on-primary px-4 py-2.5 rounded-xl shadow-md flex items-center justify-between gap-3 text-xs font-medium animate-fadeIn">
          <div className="flex items-center gap-2">
            <I name="check_circle" cls="text-[17px] text-green-300" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-on-primary/80 hover:text-on-primary font-bold text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="bg-error-container/20 border border-error/30 text-error rounded-xl p-3 text-xs flex items-center gap-2">
          <I name="error" cls="text-[16px]" />
          <span>Error loading biblical map: {error}</span>
        </div>
      )}

      {/* Location Filter Chips & LHS Add Locations Button */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          type="button"
          onClick={() => {
            setShowParseModal(true)
            setParseError(null)
          }}
          className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 bg-tertiary/15 text-tertiary hover:bg-tertiary/25 border border-tertiary/40 shrink-0"
          title="Paste text or verse to parse and add locations"
        >
          <I name="add_location_alt" cls="text-[14px]" />
          <span>Add locations</span>
        </button>

        {eraFilter === 'none' && locations.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-secondary py-1 px-3 bg-surface-container-low rounded-xl border border-outline-variant/30 shrink-0">
            <I name="info" cls="text-[16px] text-tertiary" />
            <span>Clean basemap active (no era data shown). Click &quot;Add locations&quot; to parse verses and plot sites.</span>
            <button
              type="button"
              onClick={() => {
                setEraFilter('study')
                const allLocs = Array.isArray(mapsData?.locations) ? mapsData.locations : []
                setSelectedPlace(allLocs.length > 0 ? allLocs[0] : null)
              }}
              className="text-primary hover:underline font-semibold ml-1 cursor-pointer whitespace-nowrap"
            >
              Show Study Era
            </button>
          </div>
        )}

        {locations.length > 0 && (
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shrink-0 ml-1">
            <I name="location_on" cls="text-[14px] text-tertiary" />
            {eraFilter === 'none' ? 'Added Sites:' : 'Key Sites:'}
          </span>
        )}
          {locations.map((loc, idx) => {
            const locName = loc.name || loc.ancient_name || loc.modern_name || `Site ${idx + 1}`
            const isSelected = (selectedPlace?.name || '').toLowerCase() === locName.toLowerCase()
            return (
              <button
                key={locName + idx}
                type="button"
                onClick={() => setSelectedPlace(loc)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-tertiary text-on-tertiary shadow-xs font-semibold scale-102'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/30'
                }`}
              >
                <span>{locName}</span>
                {loc.modern_country && (
                  <span className="text-[10px] opacity-75">({loc.modern_country})</span>
                )}
              </button>
            )
          })}
        </div>

      {/* Map Views Container */}
      <div className="relative rounded-2xl overflow-hidden border border-outline-variant/40 bg-surface-container-low min-h-[360px]">
        {loading && (
          <div className="absolute inset-0 z-30 bg-surface-container-lowest/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
            <div className="w-9 h-9 border-3 border-tertiary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-medium text-secondary">
              Resolving biblical coordinates & historical atlas layers…
            </p>
          </div>
        )}

        {/* View Mode 1: SIDE BY SIDE */}
        {viewMode === 'side_by_side' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-outline-variant/30">
            {/* Left: Historical Map Card */}
            <MapPane
              variant="historical"
              eraTitle={eraTitle}
              locations={locations}
              selectedPlace={selectedPlace}
              onSelectPlace={setSelectedPlace}
              mapImageUrl={mapsData?.ancient_map_url}
            />
            {/* Right: Modern Context Map Card */}
            <MapPane
              variant="modern"
              eraTitle="Present-Day Context"
              locations={locations}
              selectedPlace={selectedPlace}
              onSelectPlace={setSelectedPlace}
              mapImageUrl={mapsData?.modern_map_url}
            />
          </div>
        )}

        {/* View Mode 2: SPLIT-WIPE SLIDER */}
        {viewMode === 'split_slider' && (
          <div
            ref={sliderContainerRef}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDraggingSlider(false)}
            onMouseLeave={() => setIsDraggingSlider(false)}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setIsDraggingSlider(false)}
            className="relative h-[440px] w-full select-none overflow-hidden cursor-ew-resize"
          >
            {/* Bottom Layer: Modern Context Map */}
            <div className="absolute inset-0 z-0">
              <MapPane
                variant="modern"
                eraTitle="Present-Day Context (2026)"
                locations={locations}
                selectedPlace={selectedPlace}
                onSelectPlace={setSelectedPlace}
                mapImageUrl={mapsData?.modern_map_url}
                isFull
              />
            </div>

            {/* Top Layer: Historical Biblical Map (clipped to splitSliderPercent) */}
            <div
              className="absolute inset-0 z-10 overflow-hidden border-r-2 border-tertiary shadow-xl"
              style={{ width: `${splitSliderPercent}%` }}
            >
              <div style={{ width: sliderContainerRef.current?.clientWidth || '100%', height: '100%' }}>
                <MapPane
                  variant="historical"
                  eraTitle={`Historical Setting (${eraTitle})`}
                  locations={locations}
                  selectedPlace={selectedPlace}
                  onSelectPlace={setSelectedPlace}
                  mapImageUrl={mapsData?.ancient_map_url}
                  isFull
                />
              </div>
            </div>

            {/* Draggable Divider Handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                setIsDraggingSlider(true)
              }}
              onTouchStart={() => setIsDraggingSlider(true)}
              className="absolute top-0 bottom-0 z-20 w-8 -ml-4 flex items-center justify-center cursor-ew-resize group"
              style={{ left: `${splitSliderPercent}%` }}
            >
              <div className="w-8 h-8 rounded-full bg-surface-container-lowest border-2 border-tertiary shadow-lg flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform">
                <I name="unfold_more" cls="text-[18px] rotate-90" />
              </div>
            </div>

            {/* Floating indicator badges */}
            <div className="absolute top-3 left-3 z-20 pointer-events-none bg-black/60 backdrop-blur-xs text-white text-[11px] font-semibold px-2.5 py-1 rounded-md">
              📜 Ancient Biblical Era
            </div>
            <div className="absolute top-3 right-3 z-20 pointer-events-none bg-black/60 backdrop-blur-xs text-white text-[11px] font-semibold px-2.5 py-1 rounded-md">
              🛰️ Present-Day Reality
            </div>
          </div>
        )}

        {/* View Mode 3: HISTORICAL ONLY */}
        {viewMode === 'historical' && (
          <MapPane
            variant="historical"
            eraTitle={eraTitle}
            locations={locations}
            selectedPlace={selectedPlace}
            onSelectPlace={setSelectedPlace}
            mapImageUrl={mapsData?.ancient_map_url}
            isFull
          />
        )}

        {/* View Mode 4: MODERN ONLY */}
        {viewMode === 'modern' && (
          <MapPane
            variant="modern"
            eraTitle="Present-Day Context"
            locations={locations}
            selectedPlace={selectedPlace}
            onSelectPlace={setSelectedPlace}
            mapImageUrl={mapsData?.modern_map_url}
            isFull
          />
        )}
      </div>


      {/* Selected Location Card & Archaeological Insight */}
      {selectedPlace && (
        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 flex flex-col md:flex-row md:items-start justify-between gap-4 transition-all animate-fadeIn">
          {/* Left / Thumbnail Photo Preview with Multi-Photo Carousel */}
          {(() => {
            const photos = (selectedPlace.photos && selectedPlace.photos.length > 0)
              ? selectedPlace.photos
              : (selectedPlace.photo_url ? [{
                  thumb_url: selectedPlace.photo_url,
                  full_url: selectedPlace.photo_url,
                  credit: selectedPlace.photo_credit,
                  credit_url: selectedPlace.photo_credit_url,
                  license: selectedPlace.photo_license,
                  caption: selectedPlace.photo_caption,
                }] : [])

            if (photos.length === 0) return null
            const curIdx = photoIndex % photos.length
            const curPhoto = photos[curIdx] ?? photos[0]
            const hasMultiple = photos.length > 1

            return (
              <div className="relative group shrink-0 w-full md:w-52 h-40 md:h-40 rounded-xl overflow-hidden border border-outline-variant/40 bg-surface-container shadow-xs">
                <img
                  src={curPhoto.thumb_url}
                  alt={selectedPlace.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-zoom-in"
                  loading="lazy"
                  onClick={() => setLightboxPhoto({
                    url: curPhoto.full_url || curPhoto.thumb_url,
                    caption: curPhoto.caption || selectedPlace.name,
                    credit: curPhoto.credit,
                    credit_url: curPhoto.credit_url,
                    license: curPhoto.license,
                  })}
                  title="Click to view full photograph"
                />

                {hasMultiple && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)
                      }}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-primary text-white flex items-center justify-center text-sm font-bold shadow-md transition-all z-10"
                      title="Previous photograph"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPhotoIndex((prev) => (prev + 1) % photos.length)
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-primary text-white flex items-center justify-center text-sm font-bold shadow-md transition-all z-10"
                      title="Next photograph"
                    >
                      ›
                    </button>
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/70 text-[9px] font-mono text-white/90 z-10 pointer-events-none">
                      {curIdx + 1} / {photos.length}
                    </div>
                  </>
                )}

                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-end p-2.5 text-white cursor-pointer"
                  onClick={() => setLightboxPhoto({
                    url: curPhoto.full_url || curPhoto.thumb_url,
                    caption: curPhoto.caption || selectedPlace.name,
                    credit: curPhoto.credit,
                    credit_url: curPhoto.credit_url,
                    license: curPhoto.license,
                  })}
                >
                  {curPhoto.caption && (
                    <span className="text-[10px] font-medium leading-tight line-clamp-1">
                      {curPhoto.caption}
                    </span>
                  )}
                  {curPhoto.credit && (
                    <div className="flex items-center justify-between text-[8px] text-white/80 mt-1">
                      {curPhoto.credit_url ? (
                        <a
                          href={curPhoto.credit_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-tertiary truncate max-w-[130px]"
                          onClick={(e) => e.stopPropagation()}
                          title={`View photo on Wikimedia Commons by ${curPhoto.credit}`}
                        >
                          © {curPhoto.credit}
                        </a>
                      ) : (
                        <span className="truncate max-w-[130px]">© {curPhoto.credit}</span>
                      )}
                      {curPhoto.license && (
                        <span className="text-[7.5px] uppercase font-mono bg-black/40 px-1 py-0.5 rounded">
                          {curPhoto.license}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <div className="flex items-start gap-3 flex-1">
            <div className="w-9 h-9 rounded-xl bg-tertiary/15 text-tertiary flex items-center justify-center mt-0.5 shrink-0">
              <I name="pin_drop" cls="text-[20px]" />
            </div>
            <div className="flex flex-col gap-1 w-full">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  {selectedPlace.name}
                </h4>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-secondary border border-outline-variant/30">
                  {selectedPlace.modern_country}
                </span>
                {selectedPlace.elevation_m !== undefined && (
                  <span className="text-[11px] text-outline font-mono">
                    Alt: {selectedPlace.elevation_m}m {selectedPlace.elevation_m < 0 ? '(Below Sea Level)' : ''}
                  </span>
                )}
                {selectedPlace.confidence_score !== undefined && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
                    <I name="verified" cls="text-[12px]" />
                    Score {selectedPlace.confidence_score}
                  </span>
                )}
              </div>

              {/* Ancient vs Modern Comparison Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-1">
                <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/20">
                  <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider block">
                    ANCIENT TOPONYM ({selectedPlace.period || 'Biblical Era'})
                  </span>
                  <p className="font-serif text-on-surface font-medium mt-0.5">
                    {selectedPlace.ancient_name}
                  </p>
                  {selectedPlace.biblical_region && (
                    <span className="text-[11px] text-secondary">
                      Region: {selectedPlace.biblical_region}
                    </span>
                  )}
                </div>

                <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/20">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">
                    PRESENT-DAY GEOGRAPHY (2026)
                  </span>
                  <p className="font-sans text-on-surface font-medium mt-0.5">
                    {selectedPlace.modern_name}
                  </p>
                  <span className="text-[11px] text-secondary">
                    Coordinates: {selectedPlace.lat.toFixed(4)}°N, {selectedPlace.lng.toFixed(4)}°E
                  </span>
                </div>
              </div>

              {selectedPlace.description && (
                <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                  {selectedPlace.description}
                </p>
              )}
            </div>
          </div>

          {/* Quick coordinate pill & direct actions */}
          <div className="shrink-0 flex flex-wrap sm:flex-col items-center sm:items-end gap-2 text-xs">
            {selectedPlace.openbible_url && (
              <a
                href={selectedPlace.openbible_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary/15 hover:bg-tertiary/25 text-tertiary border border-tertiary/40 transition-colors text-xs font-semibold shadow-2xs"
                title="View authoritative OpenBible.info scholarly dossier with textual references and modern identifications"
              >
                <I name="auto_stories" cls="text-[15px]" />
                <span>OpenBible Dossier</span>
                <I name="open_in_new" cls="text-[12px]" />
              </a>
            )}
            {selectedPlace.photo_credit_url && (
              <a
                href={selectedPlace.photo_credit_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/40 transition-colors text-xs font-medium"
                title="View full-resolution photo and licensing details on Wikimedia Commons"
              >
                <I name="photo_camera" cls="text-[15px] text-primary" />
                <span>Wikimedia Photo</span>
                <I name="open_in_new" cls="text-[12px]" />
              </a>
            )}
            {mapsData?.ancient_map_url && (
              <a
                href={mapsData.ancient_map_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-tertiary border border-outline-variant/40 transition-colors text-xs font-medium"
                title="Open or download high-resolution Ancient Historical JPG"
              >
                <I name="image" cls="text-[15px]" />
                <span>Ancient JPG</span>
              </a>
            )}
            {mapsData?.modern_map_url && (
              <a
                href={mapsData.modern_map_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary border border-outline-variant/40 transition-colors text-xs font-medium"
                title="Open or download high-resolution Modern Satellite JPG"
              >
                <I name="satellite_alt" cls="text-[15px]" />
                <span>Satellite JPG</span>
              </a>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${selectedPlace.lat},${selectedPlace.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/40 transition-colors text-xs font-medium"
            >
              <I name="open_in_new" cls="text-[15px]" />
              <span>Google Maps</span>
            </a>
          </div>
        </div>
      )}

      {/* Cartographic Reference Footer */}
      {(() => {
        const plates = resolveHistoricalPlates(mapsData)
        return (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-secondary border-t border-outline-variant/20 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <I name="hub" cls="text-[15px] text-tertiary select-none" />
              <span>
                Map Engine:{' '}
                <a
                  href={mapsData?.map_crafter_url || "https://storage.googleapis.com/biblestudy-map-crafter/index.html"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline text-primary hover:text-primary-dark"
                  title="Biblical Map Crafter interactive geospatial studio"
                >
                  Biblical Map Crafter
                </a>{' '}
                + High-Res Satellite &amp; Physical Plates
              </span>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-outline/60 hidden sm:inline">Historical Plates Reference:</span>
              <a
                href={plates.bible_ca.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors inline-flex items-center gap-1 underline underline-offset-2 max-w-[260px] sm:max-w-[320px] truncate"
                title={`${plates.bible_ca.title} — ${plates.bible_ca.attribution || ''} (Direct plate link)`}
              >
                <span className="truncate">Bible.ca: {plates.bible_ca.title}</span>
                <I name="arrow_outward" cls="text-[13px] shrink-0 select-none" />
              </a>
              <a
                href={plates.knowing_the_bible.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors inline-flex items-center gap-1 underline underline-offset-2 max-w-[260px] sm:max-w-[320px] truncate"
                title={`${plates.knowing_the_bible.title} — ${plates.knowing_the_bible.attribution || ''} (Direct plate link)`}
              >
                <span className="truncate">Knowing The Bible: {plates.knowing_the_bible.title}</span>
                <I name="arrow_outward" cls="text-[13px] shrink-0 select-none" />
              </a>
              <span className="text-[11px] text-outline/50 hidden lg:inline select-none">
                (Source:{' '}
                <a
                  href={plates.bible_ca.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-1"
                  title="Steve Rudd / Bible.ca 100 Free Printable Bible Maps Homepage"
                >
                  Bible.ca
                </a>
                {' '}&bull;{' '}
                <a
                  href={plates.knowing_the_bible.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-1"
                  title="KnowingTheBible.net Bible Maps Archive Homepage"
                >
                  Knowing The Bible
                </a>
                )
              </span>
            </div>
          </div>
        )
      })()}

      {/* Fullscreen Photograph Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col bg-surface-container rounded-2xl overflow-hidden shadow-2xl border border-outline-variant/30 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/70 hover:bg-error text-white flex items-center justify-center text-sm font-bold transition-all shadow-md"
              title="Close (Esc)"
            >
              ✕
            </button>
            <div className="bg-black flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.caption || selectedPlace?.name || 'Biblical Site'}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low border-t border-outline-variant/20">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-on-surface">
                  {selectedPlace?.name}
                </span>
                {lightboxPhoto.caption && (
                  <span className="text-xs text-on-surface-variant">
                    {lightboxPhoto.caption}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-outline flex-wrap">
                {lightboxPhoto.credit && (
                  <span>© {lightboxPhoto.credit}</span>
                )}
                {lightboxPhoto.license && (
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface">
                    {lightboxPhoto.license}
                  </span>
                )}
                {lightboxPhoto.credit_url && (
                  <a
                    href={lightboxPhoto.credit_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-semibold ml-1 inline-flex items-center gap-0.5"
                  >
                    <span>Commons</span>
                    <I name="open_in_new" cls="text-[12px]" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Parse Scripture & Text for Locations Modal */}
      {showParseModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
          onClick={() => setShowParseModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 overflow-hidden animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-tertiary/15 text-tertiary flex items-center justify-center shadow-xs shrink-0">
                  <I name="add_location_alt" cls="text-[22px]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                    Parse Scripture &amp; Text for Locations
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Paste Bible verses or text to detect ancient sites, regions &amp; peoples and pin them to the map.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowParseModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface flex items-center justify-center text-sm font-semibold transition-colors shrink-0"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Preset Verse Buttons */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-secondary uppercase tracking-wider flex items-center gap-1">
                    <I name="bolt" cls="text-[14px] text-tertiary" />
                    Quick Presets / Examples:
                  </label>
                  {pastedText && (
                    <button
                      type="button"
                      onClick={() => {
                        setPastedText('')
                        setParsedResults(null)
                        setParseError(null)
                      }}
                      className="text-[11px] text-error hover:underline flex items-center gap-0.5"
                    >
                      <I name="backspace" cls="text-[12px]" />
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_VERSES.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPastedText(preset.text)
                        setParsedResults(null)
                        setParseError(null)
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary border border-outline-variant/30 transition-all text-left"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Input Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-on-surface">
                    Paste Scripture Verses or Text:
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const clip = await navigator.clipboard.readText()
                        if (clip) {
                          setPastedText(clip)
                          setParsedResults(null)
                          setParseError(null)
                        }
                      } catch (err) {
                        console.warn('Clipboard read failed:', err)
                      }
                    }}
                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    <I name="content_paste" cls="text-[14px]" />
                    Paste from Clipboard
                  </button>
                </div>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste scripture verses, chapter extracts, or passages here (e.g. Acts 2:7-12: 'Parthians, Medes and Elamites; residents of Mesopotamia, Judea and Cappadocia, Pontus and Asia, Phrygia and Pamphylia, Egypt and the parts of Libya near Cyrene; visitors from Rome; Cretans and Arabs...')"
                  rows={4}
                  className="w-full text-xs p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 focus:border-tertiary focus:ring-1 focus:ring-tertiary outline-none resize-none text-on-surface leading-relaxed placeholder:text-outline/50 transition-colors"
                />
                <div className="flex items-center justify-between text-[11px] text-secondary">
                  <span>Footnotes, BibleGateway link markup, and demonyms (e.g. Galileans, Parthians) are automatically handled.</span>
                  <span>{pastedText.length} chars</span>
                </div>
              </div>

              {/* Scan Action Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleScanText}
                  disabled={isParsing || !pastedText.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-tertiary text-on-tertiary font-semibold text-xs flex items-center justify-center gap-2 shadow-xs hover:opacity-90 active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <I name={isParsing ? 'hourglass_top' : 'travel_explore'} cls={`text-[17px] ${isParsing ? 'animate-spin' : ''}`} />
                  <span>{isParsing ? 'Parsing & Matching Ancient Gazetteer…' : 'Scan & Extract Locations'}</span>
                </button>
              </div>

              {/* Error Alert */}
              {parseError && (
                <div className="bg-error-container/20 border border-error/30 text-error rounded-xl p-3 text-xs flex items-center gap-2">
                  <I name="error" cls="text-[16px] shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Parsed Locations Review */}
              {parsedResults !== null && (
                <div className="border border-outline-variant/30 rounded-xl p-3.5 bg-surface-container-low/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                        <I name="check_circle" cls="text-[16px] text-tertiary" />
                        Found {parsedResults.length} Location{parsedResults.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold border border-emerald-500/30">
                        {parsedResults.filter((l) => !l.is_already_on_map).length} New
                      </span>
                      {parsedResults.some((l) => l.is_already_on_map) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-secondary border border-outline-variant/30">
                          {parsedResults.filter((l) => l.is_already_on_map).length} Already on Map
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const all = new Set(parsedResults.map((l) => l.name))
                          setSelectedToAdd(all)
                        }}
                        className="text-primary hover:underline font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-outline/40">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newOnly = new Set(parsedResults.filter((l) => !l.is_already_on_map).map((l) => l.name))
                          setSelectedToAdd(newOnly)
                        }}
                        className="text-primary hover:underline font-medium"
                      >
                        Select New Only
                      </button>
                      <span className="text-outline/40">·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedToAdd(new Set())}
                        className="text-secondary hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {parsedResults.length === 0 ? (
                    <p className="text-xs text-secondary text-center py-4">
                      No matching biblical places found in the pasted text. Try pasting a Bible verse or checking spelling.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                      {parsedResults.map((loc) => {
                        const isChecked = selectedToAdd.has(loc.name)
                        return (
                          <div
                            key={loc.name}
                            onClick={() => {
                              setSelectedToAdd((prev) => {
                                const next = new Set(prev)
                                if (next.has(loc.name)) {
                                  next.delete(loc.name)
                                } else {
                                  next.add(loc.name)
                                }
                                return next
                              })
                            }}
                            className={`p-2 rounded-lg border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-surface-container-lowest border-tertiary/60 shadow-2xs'
                                : 'bg-surface-container/50 border-outline-variant/30 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // Handled by parent div
                              className="mt-0.5 rounded text-tertiary focus:ring-tertiary cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-on-surface truncate">
                                  {loc.name}
                                </span>
                                {loc.is_already_on_map ? (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface-container text-secondary shrink-0 font-medium">
                                    On Map
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 font-bold shrink-0">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-secondary truncate mt-0.5">
                                {loc.ancient_name !== loc.name ? `${loc.ancient_name} · ` : ''}
                                {loc.modern_country}
                              </div>
                              {loc.matched_term && (
                                <div className="text-[9.5px] text-tertiary font-mono mt-0.5 truncate">
                                  Matched: "{loc.matched_term}"
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Options & Action Controls */}
                  {parsedResults.length > 0 && (
                    <div className="pt-2 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={replaceAll}
                          onChange={(e) => setReplaceAll(e.target.checked)}
                          className="rounded text-tertiary focus:ring-tertiary"
                        />
                        <span>Replace existing map locations (instead of appending)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowParseModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleAddSelectedToMap}
                disabled={isAddingLocations || !parsedResults || selectedToAdd.size === 0}
                className="px-5 py-2 rounded-xl bg-tertiary text-on-tertiary text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-95 active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <I name={isAddingLocations ? 'hourglass_top' : 'add_location'} cls={`text-[16px] ${isAddingLocations ? 'animate-spin' : ''}`} />
                <span>
                  {isAddingLocations
                    ? 'Updating Map…'
                    : `Add ${selectedToAdd.size} Location${selectedToAdd.size === 1 ? '' : 's'} to Map`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ------------------------------------------------------------- Map Pane Component
// Renders either the Historical Parchment Canvas or the Modern Satellite View
interface MapPaneProps {
  variant: 'historical' | 'modern'
  eraTitle: string
  locations: BiblicalLocation[]
  selectedPlace: BiblicalLocation | null
  onSelectPlace: (loc: BiblicalLocation) => void
  isFull?: boolean
  mapImageUrl?: string
}

function MapPane({
  variant,
  eraTitle,
  locations,
  selectedPlace,
  onSelectPlace,
  isFull = false,
  mapImageUrl,
}: MapPaneProps) {
  const isHist = variant === 'historical'

  // Bounding box for visual pin placement normalization (Levant & Near East viewport)
  // Default Levant bounds approx: lat 30.5 to 33.6, lng 34.0 to 36.6
  const safeLocations = Array.isArray(locations) ? locations : []
  const lats = safeLocations
    .map((l) => (typeof l.lat === 'number' ? l.lat : typeof (l as any).latitude === 'number' ? (l as any).latitude : null))
    .filter((v): v is number => v !== null && !isNaN(v))
  const lngs = safeLocations
    .map((l) => (typeof l.lng === 'number' ? l.lng : typeof (l as any).longitude === 'number' ? (l as any).longitude : null))
    .filter((v): v is number => v !== null && !isNaN(v))
  const minLat = lats.length ? Math.min(...lats) : 31.0
  const maxLat = lats.length ? Math.max(...lats) : 33.5
  const minLng = lngs.length ? Math.min(...lngs) : 34.5
  const maxLng = lngs.length ? Math.max(...lngs) : 36.5

  const latSpan = Math.max(1.8, maxLat - minLat + 0.8)
  const lngSpan = Math.max(1.8, maxLng - minLng + 0.8)
  const midLat = (minLat + maxLat) / 2
  const midLng = (minLng + maxLng) / 2

  // Transform lat/lng to percentage in container
  const getPositionPercent = (lat: number, lng: number) => {
    // Note: latitude goes UP (north), CSS top goes DOWN
    const top = 100 - ((lat - (midLat - latSpan / 2)) / latSpan) * 100
    const left = ((lng - (midLng - lngSpan / 2)) / lngSpan) * 100
    return {
      top: `${Math.max(8, Math.min(92, top))}%`,
      left: `${Math.max(8, Math.min(92, left))}%`,
    }
  }

  return (
    <div
      className={`relative ${
        isFull ? 'h-full min-h-[440px]' : 'h-[380px]'
      } overflow-hidden flex flex-col justify-between p-4 transition-colors ${
        isHist
          ? 'bg-[#f4ebe1] text-[#3e2723]' // Antique parchment palette
          : 'bg-[#18232c] text-[#e0e0e0]' // Modern satellite/slate palette
      }`}
      style={{
        backgroundImage: isHist
          ? `radial-gradient(#8d6e63 0.75px, transparent 0.75px), radial-gradient(#d7ccc8 0.75px, #f4ebe1 0.75px)`
          : `radial-gradient(#37474f 0.75px, transparent 0.75px), radial-gradient(#263238 0.75px, #18232c 0.75px)`,
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 12px 12px',
      }}
    >
      {/* Real High-Resolution Raster Map Imagery (Ancient Physical Relief / Modern Satellite) */}
      {mapImageUrl && (
        <img
          src={mapImageUrl}
          alt={isHist ? 'Ancient Historical Map Plate' : 'Modern Satellite Context'}
          className={`absolute inset-0 w-full h-full object-cover select-none pointer-events-none transition-opacity duration-300 ${
            isHist
              ? 'opacity-85 mix-blend-multiply filter sepia-[0.35] contrast-[1.08] brightness-[0.98]'
              : 'opacity-90 contrast-[1.05]'
          }`}
          loading="lazy"
        />
      )}

      {/* Top Banner Tag */}
      <div className="z-10 flex items-center justify-between pointer-events-none">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8.5px] font-bold uppercase tracking-wider shadow-xs ${
            isHist
              ? 'bg-[#e2d5c5] text-[#4e342e] border border-[#d7ccc8]'
              : 'bg-[#263238]/90 text-[#eceff1] border border-[#455a64]'
          }`}
        >
          <I name={isHist ? 'history' : 'public'} cls="text-[11px]" />
          {isHist ? `📜 Historical (${eraTitle})` : `🛰️ Present-Day (${eraTitle})`}
        </span>

        <span
          className={`text-[7px] font-medium px-1.5 py-0.5 rounded-md ${
            isHist ? 'text-[#6d4c41] bg-[#efebe9]/60' : 'text-[#90a4ae] bg-[#212121]/60'
          }`}
        >
          {locations.length === 0 ? 'Clean Basemap (0 Sites)' : `${locations.length} Sites Loaded`}
        </span>
      </div>

      {/* Empty State Banner if No Sites Loaded (e.g. No Eras / Clean Map) */}
      {safeLocations.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15 text-center shadow-2xl max-w-sm">
            <span className="text-xs font-bold text-white flex items-center justify-center gap-1.5">
              <I name="layers_clear" cls="text-[16px] text-amber-400" />
              Clean Basemap &bull; No Eras Active
            </span>
            <span className="text-[10.5px] text-white/80 block mt-1 leading-relaxed">
              No historical data or sites are shown. Click <strong>Add locations</strong> to paste scripture or text to plot specific sites.
            </span>
          </div>
        </div>
      )}

      {/* Decorative Cartographic Coordinate Compass & Grid Marks */}
      <div className="absolute inset-0 pointer-events-none opacity-20 flex items-center justify-center">
        <div
          className={`w-48 h-48 rounded-full border-2 border-dashed ${
            isHist ? 'border-[#8d6e63]' : 'border-[#607d8b]'
          } flex items-center justify-center`}
        >
          <div
            className={`w-32 h-32 rounded-full border ${
              isHist ? 'border-[#8d6e63]' : 'border-[#607d8b]'
            }`}
          ></div>
        </div>
      </div>

      {/* Region labels on the canvas - only displayed when focused on the Levant and not in No Eras clean mode */}
      {!eraTitle.includes('No Eras') && latSpan < 7.0 && lngSpan < 7.0 && (
        <div className="absolute inset-0 pointer-events-none z-0">
          {isHist ? (
            <>
              <span className="absolute top-[20%] left-[65%] text-[6.5px] font-serif font-bold tracking-widest text-[#8d6e63]/40 uppercase select-none">
                GALILEE / DECAPOLIS
              </span>
              <span className="absolute top-[45%] left-[55%] text-[6.5px] font-serif font-bold tracking-widest text-[#8d6e63]/40 uppercase select-none">
                SAMARIA
              </span>
              <span className="absolute top-[68%] left-[45%] text-[6.5px] font-serif font-bold tracking-widest text-[#8d6e63]/40 uppercase select-none">
                JUDEA
              </span>
              <span className="absolute bottom-[10%] left-[20%] text-[5.5px] font-serif text-[#8d6e63]/40 uppercase select-none">
                MEDITERRANEAN SEA (GREAT SEA)
              </span>
            </>
          ) : (
            <>
              <span className="absolute top-[18%] left-[62%] text-[6px] font-sans font-semibold tracking-wider text-[#78909c]/40 uppercase select-none">
                NORTHERN DISTRICT (ISRAEL)
              </span>
              <span className="absolute top-[48%] left-[58%] text-[6px] font-sans font-semibold tracking-wider text-[#78909c]/40 uppercase select-none">
                WEST BANK
              </span>
              <span className="absolute top-[72%] left-[48%] text-[6px] font-sans font-semibold tracking-wider text-[#78909c]/40 uppercase select-none">
                JERUSALEM DISTRICT
              </span>
              <span className="absolute bottom-[10%] left-[20%] text-[5.5px] font-sans text-[#78909c]/40 uppercase select-none">
                EASTERN MEDITERRANEAN
              </span>
            </>
          )}
        </div>
      )}

      {/* Render Location Pins */}
      <div className="absolute inset-0 z-10 pointer-events-auto">
        {safeLocations.map((loc, idx) => {
          const locName = loc.name || loc.ancient_name || loc.modern_name || `Site ${idx + 1}`
          const isSelected = (selectedPlace?.name || '').toLowerCase() === locName.toLowerCase()
          const locLat = typeof loc.lat === 'number' ? loc.lat : typeof (loc as any).latitude === 'number' ? (loc as any).latitude : 0
          const locLng = typeof loc.lng === 'number' ? loc.lng : typeof (loc as any).longitude === 'number' ? (loc as any).longitude : 0
          const pos = getPositionPercent(locLat, locLng)

          return (
            <div
              key={locName + idx}
              style={{ top: pos.top, left: pos.left }}
              className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
              onClick={() => onSelectPlace(loc)}
            >
              {/* Outer pulsing ring for selected pin */}
              {isSelected && (
                <div
                  className={`absolute -inset-1 rounded-full animate-ping opacity-50 ${
                    isHist ? 'bg-[#b71c1c]' : 'bg-[#00bcd4]'
                  }`}
                ></div>
              )}

              {/* Simple Small Round Icon with Ancient/Modern Name */}
              <div
                className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded-full shadow-xs transition-all duration-200 group-hover:scale-115 ${
                  isSelected
                    ? isHist
                      ? 'bg-[#fdfbf7] text-[#3e2723] ring-1.5 ring-[#b71c1c] shadow-sm'
                      : 'bg-[#0f172a] text-[#f8fafc] ring-1.5 ring-[#00e5ff] shadow-sm'
                    : isHist
                    ? 'bg-[#fefcf8]/90 hover:bg-[#ffffff] text-[#4e342e] border border-[#d7ccc8]'
                    : 'bg-[#0f172a]/90 hover:bg-[#1e293b] text-[#f1f5f9] border border-[#334155]'
                }`}
              >
                {/* Small Round Dot Icon */}
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                    isSelected
                      ? isHist
                        ? 'bg-[#b71c1c] ring-1 ring-[#ffebee]'
                        : 'bg-[#00e5ff] ring-1 ring-[#e0f7fa]'
                      : isHist
                      ? 'bg-[#b71c1c] ring-0.5 ring-[#fff]'
                      : 'bg-[#00e5ff] ring-0.5 ring-[#004d40]'
                  }`}
                />

                {/* Ancient or Modern Name Label - Reduced by 50% from 11px to 6.5px */}
                <span
                  className={`text-[6.5px] leading-none select-none tracking-tight ${
                    isSelected ? 'font-bold' : 'font-semibold'
                  } ${isHist ? 'font-serif text-[#3e2723]' : 'font-sans text-[#f8fafc]'}`}
                >
                  {isHist
                    ? (loc.ancient_name || loc.name || '').split('/')[0].trim()
                    : (loc.modern_name || loc.name || '').split('/')[0].trim()}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom Legend Pill */}
      <div className="z-10 flex items-center justify-between text-[7.5px] pointer-events-none mt-auto">
        <span
          className={`px-2 py-1 rounded backdrop-blur-xs font-mono ${
            isHist ? 'bg-[#efebe9]/80 text-[#5d4037]' : 'bg-[#212121]/80 text-[#90a4ae]'
          }`}
        >
          {isHist ? 'Style: Historical Biblical Plates' : 'Style: Modern Political / Satellite Topo'}
        </span>

        <span
          className={`px-2 py-1 rounded backdrop-blur-xs font-medium ${
            isHist ? 'bg-[#efebe9]/80 text-[#5d4037]' : 'bg-[#212121]/80 text-[#90a4ae]'
          }`}
        >
          Click pins or chips to inspect
        </span>
      </div>
    </div>
  )
}
