import { useEffect, useState, useRef } from 'react'
import { studies, type BiblicalLocation, type DayMapsOut } from '../lib/studies'
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

  const locations = Array.isArray(mapsData?.locations) ? mapsData.locations : []
  const eraTitle = mapsData?.period_title || 'Biblical Setting'

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
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/40">
                <I name="history_edu" cls="text-[14px] text-tertiary" />
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
            href={mapsData?.map_crafter_url || "https://storage.googleapis.com/biblestudy-map-crafter/index.html"}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-tertiary/10 text-tertiary hover:bg-tertiary/20 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-tertiary/30"
            title="Open Biblical Map Crafter on Google Cloud Storage to modify templates, add archaeological sites, or export 2 JPGs"
          >
            <I name="tune" cls="text-[16px]" />
            <span className="hidden md:inline">Map Crafter Studio (GCS)</span>
            <I name="open_in_new" cls="text-[13px]" />
          </a>

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

      {/* Error Alert */}
      {error && (
        <div className="bg-error-container/20 border border-error/30 text-error rounded-xl p-3 text-xs flex items-center gap-2">
          <I name="error" cls="text-[16px]" />
          <span>Error loading biblical map: {error}</span>
        </div>
      )}

      {/* Location Filter Chips */}
      {locations.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
            <I name="location_on" cls="text-[14px] text-tertiary" />
            Key Sites:
          </span>
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
      )}

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
          {isHist ? `📜 Historical (${eraTitle})` : '🛰️ Present-Day Modern Context'}
        </span>

        <span
          className={`text-[7px] font-medium px-1.5 py-0.5 rounded-md ${
            isHist ? 'text-[#6d4c41] bg-[#efebe9]/60' : 'text-[#90a4ae] bg-[#212121]/60'
          }`}
        >
          {locations.length} Sites Loaded
        </span>
      </div>

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

      {/* Region labels on the canvas */}
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
