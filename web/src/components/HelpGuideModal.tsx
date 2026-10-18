import { useEffect } from 'react'

interface HelpGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function HelpGuideModal({ isOpen, onClose }: HelpGuideModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-scrim/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-surface rounded-3xl shadow-2xl border border-outline-variant/20 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 bg-surface-container/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[24px]">help</span>
            </div>
            <div>
              <h2 id="help-guide-title" className="font-headline-sm text-headline-sm text-on-surface font-serif">
                How to Use BibleStudy-Crafter
              </h2>
              <p className="text-caption text-on-surface-variant">
                Visual ELI10 walkthrough • Exploring studies, interactive atlas, visual infographics, Voices on Verses, & BYOK
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/how_to_use_guide.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              title="Open raw markdown document"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              Raw Markdown
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              aria-label="Close Guide"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </header>

        {/* Quick Jump Bar */}
        <nav aria-label="Guide Sections" className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-low/70 border-b border-outline-variant/10 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant shrink-0">
            Jump to:
          </span>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-philosophy')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            📜 Scripture First
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-existing-study')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🌟 Sanctuary
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-maps')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors shrink-0 shadow-xs"
          >
            🗺️ Inline Maps & Sources
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-map-crafter')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-teal-600 hover:bg-teal-500/10 transition-colors shrink-0 shadow-xs"
          >
            🧭 Bible Map Crafter
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-infographics')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-amber-600 hover:bg-amber-500/10 transition-colors shrink-0 shadow-xs"
          >
            📊 Infographics
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-imagery-studio')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🎨 Imagery & Prompt Crafter
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-prayers-selah')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-purple-600 hover:bg-purple-500/10 transition-colors shrink-0 shadow-xs"
          >
            ✍️ Prayers & Journal
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-voices')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-sky-600 hover:bg-sky-500/10 transition-colors shrink-0 shadow-xs"
          >
            🗣️ Voices on Verses
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-account')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            👤 Account
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-apikey')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🔑 Free API Key
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('guide-sec-craft-study')}
            className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-on-surface hover:text-primary hover:bg-primary/10 transition-colors shrink-0 shadow-xs"
          >
            🛠️ Craft Study
          </button>
        </nav>

        {/* Scrollable Guide Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-10 leading-relaxed text-on-surface font-serif">
          {/* Section 0: Philosophy */}
          <section id="guide-sec-philosophy" className="p-5 sm:p-6 rounded-2xl bg-amber-500/10 border-l-4 border-amber-600 text-on-surface space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              Core Philosophy: Scripture Comes First
            </div>
            <p className="text-sm font-sans text-on-surface/90">
              In <strong>BibleStudy-Crafter</strong>, the Holy Scripture always comes <strong>FIRST</strong>. We never want anyone’s commentary—whether written by a scholar or generated by AI—to pollute or distract from the pure Word of God. You encounter the inspired text in its unaltered beauty before exploring outside reflections.
            </p>
          </section>

          {/* Section 1: In an Already Created Study */}
          <section id="guide-sec-existing-study" className="space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 1</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">The Scripture Sanctuary</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Explore an interactive study sanctuary with translation comparisons, audio narration, memory verses, and sacred artwork.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/02_study_day1_scripture.png"
                alt="Scripture Sanctuary with Memory Verse & Translations"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 1: The Scripture Sanctuary — Pure Bible Text, Memory Verse, Translation Switchers, Audio Narration, and Sacred Vector Art.
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 font-sans text-sm">
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[20px]">auto_stories</span>
                  Pure Scripture
                </div>
                <p className="text-xs text-on-surface-variant">
                  Highlight key phrases, write margin notes, or copy verses directly with one tap without outside clutter.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[20px]">translate</span>
                  Compare Versions
                </div>
                <p className="text-xs text-on-surface-variant">
                  Switch instantly between KJV, ASV, PEV 1611, BBE, and WEB to compare ancient translations side-by-side.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[20px]">volume_up</span>
                  AI Voice Reader
                </div>
                <p className="text-xs text-on-surface-variant">
                  Listen to the whole day or specific sections (prayers, commentary, verses) in realistic voices with adjustable speed.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Biblical Geography & Inline Atlas */}
          <section id="guide-sec-maps" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Part 2</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">Biblical Geography & Interactive Inline Atlas</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Ground biblical narratives in real-world geography with 4 interactive view modes, key site inspection chips, elevation data, archaeological photo carousels, and authoritative external source links.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/02c_biblical_geography_maps.png"
                alt="Biblical Geography and Interactive Map Atlas"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 2: Historical Setting & Present-Day Context — Dual-Layer Ancient Plates & Modern Satellite, OpenBible Scholarly Gazetteer, Altitude, and Coordinates.
              </div>
            </div>

            <div className="space-y-4 font-sans text-sm">
              <h4 className="font-serif font-bold text-base text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">layers</span>
                1. Four Interactive Map View Modes
              </h4>
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                  <strong className="text-primary flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">view_column</span>
                    Side-by-Side Dual View
                  </strong>
                  <p className="text-xs text-on-surface-variant">
                    Places the historical biblical era (ancient topography, ancient kingdoms, physical relief) directly next to the present-day satellite view (modern roads, cities, geopolitical borders) for instant comparison.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                  <strong className="text-emerald-600 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">compare</span>
                    Peel Slider (Split-Wipe)
                  </strong>
                  <p className="text-xs text-on-surface-variant">
                    An interactive draggable divider (0% to 100%). Drag horizontally to peel back millennia of history—revealing modern satellite terrain directly beneath ancient settlements and walls.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                  <strong className="text-amber-600 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">auto_stories</span>
                    Historical Setting View
                  </strong>
                  <p className="text-xs text-on-surface-variant">
                    Dedicated full-width focus on vintage cartographic plates, historical trade corridors (<em>Via Maris</em>, <em>King's Highway</em>), ancient territorial borders, and bathymetric depth contours.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                  <strong className="text-sky-600 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">satellite_alt</span>
                    Present-Day Context View
                  </strong>
                  <p className="text-xs text-on-surface-variant">
                    Dedicated full-width view using high-resolution ESRI Earth satellite imagery, topological terrain relief, and contemporary geopolitical boundaries.
                  </p>
                </div>
              </div>

              <h4 className="font-serif font-bold text-base text-on-surface flex items-center gap-2 pt-2">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">pin_drop</span>
                2. Key Sites Chips, Toponyms, & Archaeological Inspection
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Above the map, <strong>Key Sites filter chips</strong> automatically highlight every location cited in today's reading (e.g. <em>Jerusalem</em>, <em>Valley of Hinnom</em>, <em>King's Pool</em>, <em>Brook Kidron</em>). Selecting any site displays its comprehensive dossier:
              </p>
              <div className="grid sm:grid-cols-3 gap-3 font-sans text-xs">
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                  <span className="font-bold text-on-surface">Ancient vs. Modern Names</span>
                  <p className="text-on-surface-variant">
                    Compares ancient Hebrew/Greek toponyms (e.g. <em>Yerushalayim</em> during the Persian period) with present-day geography (<em>Al-Quds / Jerusalem</em>).
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                  <span className="font-bold text-on-surface">Altitude & GPS Coordinates</span>
                  <p className="text-on-surface-variant">
                    Precise elevation in meters (e.g. <em>754m</em> above sea level, or negative values for the Dead Sea basin), illuminating biblical expressions like "going <em>up</em> to Jerusalem".
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                  <span className="font-bold text-on-surface">Excavation Photos & Lightbox</span>
                  <p className="text-on-surface-variant">
                    Multi-photo carousel of authentic archaeological ruins, gates, and artifacts from Wikimedia Commons with 1-click fullscreen lightbox zoom.
                  </p>
                </div>
              </div>

              <h4 className="font-serif font-bold text-base text-on-surface flex items-center gap-2 pt-2">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">link</span>
                3. Links to Authoritative External Source Maps
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Every map toolbar and location card connects you directly to the world's most authoritative biblical geography archives:
              </p>
              <ul className="list-disc list-inside space-y-2 text-xs text-on-surface/90">
                <li>
                  <strong>OpenBible.info Chapter Atlas:</strong> Click the <strong>OpenBible Atlas</strong> button in the toolbar to explore an interactive scholarly atlas filtered specifically to the chapter you are studying.
                </li>
                <li>
                  <strong>Book KML Download:</strong> Download the complete vector KML dataset for the biblical book (e.g. <em>Nehemiah.kml</em>) to load directly into <strong>Google Earth</strong>, <strong>ArcGIS</strong>, or <strong>QGIS</strong> for 3D aerial flyovers.
                </li>
                <li>
                  <strong>Bible.ca Archaeological Atlas:</strong> Direct footer links to curated archaeological survey plates by Steve Rudd (e.g. Nehemiah's 12 gates and Jerusalem wall rebuild, Persian royal roads, temple mount excavations).
                </li>
                <li>
                  <strong>Knowing The Bible Historical Plates:</strong> Direct links to high-resolution plate scans depicting ancient tribal allotments, empire boundaries, and migration journeys.
                </li>
                <li>
                  <strong>Google Maps & High-Res JPG Exports:</strong> Jump directly to modern Google Maps for live street views and navigation, or click <strong>Ancient JPG</strong> / <strong>Satellite JPG</strong> to download publication-ready map images.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 2b: Bible Map Crafter Studio */}
          <section id="guide-sec-map-crafter" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">Deep Dive</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">Bible Map Crafter / Map Crafter Studio (GCS)</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                The upstream geospatial engine that powers BibleStudy-Crafter's custom cartography.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-teal-500/10 border-l-4 border-teal-600 text-on-surface space-y-3 font-sans text-sm">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-bold text-xs uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">tune</span>
                What is Map Crafter Studio?
              </div>
              <p className="text-on-surface/90 text-xs sm:text-sm leading-relaxed">
                In the map toolbar, the <strong>"Map Crafter Studio (GCS)"</strong> button opens the dedicated Biblical Map Crafter web application hosted on Google Cloud Storage (<code>https://storage.googleapis.com/biblestudy-map-crafter/index.html</code>). 
              </p>
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 space-y-1">
                  <strong className="text-teal-700 dark:text-teal-400 text-xs">For Teachers, Pastors, & Scholars:</strong>
                  <p className="text-[11px] text-on-surface-variant">
                    Customize cartographic styling templates (antique parchment vs. modern ESRI satellite), add archaeological excavation markers, draw journey routes (e.g. Paul's voyages, the Persian Royal Road), and trace territorial borders.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 space-y-1">
                  <strong className="text-teal-700 dark:text-teal-400 text-xs">Publication-Grade Dual JPG Exports:</strong>
                  <p className="text-[11px] text-on-surface-variant">
                    Generate matched, identical camera-angle Ancient and Modern JPG plates at native high resolution for church study bulletins, academic papers, and projection screens.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Visual Key Learnings & Infographics */}
          <section id="guide-sec-infographics" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Part 3</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">Key Learnings & Sacred Infographics</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Visual summaries condensing each day's theological essence into structured learning pillars, thesis statements, and daily walkaways.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/02b_visual_infographic.png"
                alt="Key Learnings and Visual Infographics"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 3: Visual Key Learnings — Structured Theological Pillars, Core Thesis, Anchor Verse, and Practical Daily Walkaway.
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 font-sans text-sm">
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">view_column</span>
                  3-4 Core Pillars
                </div>
                <p className="text-xs text-on-surface-variant">
                  Each day breaks down into Scripture Foundation, Theological Core, and Heart Application with verified quotes.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">lightbulb</span>
                  Central Thesis
                </div>
                <p className="text-xs text-on-surface-variant">
                  A distilled, memorable theological thesis clarifying what God's Word teaches for that specific devotional session.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">directions_walk</span>
                  Practical Walkaway
                </div>
                <p className="text-xs text-on-surface-variant">
                  Actionable spiritual step (e.g., 3 minutes of quiet prayer, an act of encouragement) to live out the truth immediately.
                </p>
              </div>
            </div>

            <div className="space-y-2 font-sans text-xs text-on-surface/90">
              <p>
                <strong>Interactive Cards vs. Poster View:</strong> Toggle between responsive interactive cards and a printable poster view.
              </p>
              <p>
                <strong>1-Click Copy Summary:</strong> Click <strong>"Copy"</strong> to copy a formatted summary complete with emojis and scripture references for study handouts, messaging apps, or church bulletins.
              </p>
              <p>
                <strong>"Re-extract" Button:</strong> Click <strong>"Re-extract"</strong> if you edit your study day or want a fresh theological synthesis from the commentary.
              </p>
            </div>
          </section>

          {/* Section 3b: Visual Studio & Prompt Crafter */}
          <section id="guide-sec-imagery-studio" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 3B</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">Sacred Artwork & Visual Prompt Crafter</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Craft custom sacred artwork banners and infographic posters using curated style presets, mood atmospheres, AI prompt assistance, and gallery revision history.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/08_visual_prompt_crafter_modal.png"
                alt="Visual Studio and Prompt Crafter Modal"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 4: Visual Studio & Prompt Crafter — Style & Atmosphere Presets, Mood Selection, Prompt Playground, and Day Gallery.
              </div>
            </div>

            <div className="space-y-4 font-sans text-sm">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Click <strong>"Customize Art"</strong> beneath any study day cover banner or <strong>"Craft Visual Art"</strong> in the Key Learnings section to open the Visual Studio.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 font-sans text-xs">
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-primary text-sm">
                    <span className="material-symbols-outlined text-[18px]">palette</span>
                    Artistic Style Presets
                  </div>
                  <ul className="space-y-1 text-on-surface-variant list-disc list-inside">
                    <li><strong>Classical Oil Painting:</strong> Warm chiaroscuro, golden light, reverent museum masterwork.</li>
                    <li><strong>Luminous Watercolor:</strong> Soft translucent washes, atmospheric and contemplative.</li>
                    <li><strong>Cathedral Stained Glass:</strong> Radiant jewel tones, devotional sacred aesthetic.</li>
                    <li><strong>Illuminated Woodcut:</strong> Medieval engraving, illuminated manuscript detailing.</li>
                    <li><strong>Modern Minimalist:</strong> Clean editorial illustration, peaceful geometric harmony.</li>
                    <li><strong>Cinematic Golden Hour:</strong> Volumetric rays of dawn light, grand biblical landscape.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-primary text-sm">
                    <span className="material-symbols-outlined text-[18px]">spa</span>
                    Spiritual Mood & Atmosphere
                  </div>
                  <ul className="space-y-1 text-on-surface-variant list-disc list-inside">
                    <li><strong>Peaceful & Contemplative:</strong> Quiet stillness, gentle dawn, peaceful prayer.</li>
                    <li><strong>Majestic & Triumphant:</strong> Radiant praise, grand victory, sunburst through clouds.</li>
                    <li><strong>Somber & Reverent:</strong> Deep solemnity, humble prayer in the wilderness.</li>
                    <li><strong>Hope & Renewal:</strong> Blossoming desert, living water, fresh green shoots.</li>
                    <li><strong>Prophetic Wonder:</strong> Vast star-filled heavens, mystery of divine promise.</li>
                  </ul>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 font-sans text-xs">
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                  <span className="font-bold text-on-surface">Artwork Types & Ratios</span>
                  <p className="text-on-surface-variant">
                    Generate Landscape Cover Art (16:9 widescreen) for headers or Infographic Posters (3:4 portrait or 1:1 square) for study handouts.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                  <span className="font-bold text-on-surface">Personal Vision & Metaphors</span>
                  <p className="text-on-surface-variant">
                    Add optional custom symbolic prompts (e.g. <em>"an ancient stone path leading toward sunrise, still waters reflecting dawn"</em>).
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                  <span className="font-bold text-on-surface">Day Gallery & History</span>
                  <p className="text-on-surface-variant">
                    Review past generations, set any rendered image as active, or download full-resolution artwork directly.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Guided Prayers & Selah Journal */}
          <section id="guide-sec-prayers-selah" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 4</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">Guided Prayers, "Refine with AI", & Personal Journal</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Ground your devotional time with liturgical prayers, AI prayer refinement, and cloud-synced reflection journaling.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
                <img
                  src="/guide_images/03_study_day1_commentary.png"
                  alt="Opening and Closing Prayers with AI Wand"
                  className="w-full object-cover"
                  loading="lazy"
                />
                <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                  Figure 5: Opening and Closing Prayers with the 'Refine with AI' wand and illuminated scripture text.
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
                <img
                  src="/guide_images/03b_reflection_questions.png"
                  alt="Interactive Reflection Questions and Selah Pause"
                  className="w-full object-cover"
                  loading="lazy"
                />
                <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                  Figure 6: Selah Pause & Reflection Questions with private cloud-synced text answers.
                </div>
              </div>
            </div>

            <div className="space-y-3 font-sans text-sm">
              <p className="text-on-surface/90">
                <strong>Grounding Prayers:</strong> Every study day opens and closes with liturgical, evangelical, and contemplative prayer options. You can read them aloud, listen via the audio narration dock, or customize them to your situation.
              </p>
              <p className="text-on-surface/90">
                <strong>The "Refine with AI" Wand:</strong> Type a revision prompt (e.g., <em>"Make it more focused on peace during trials"</em> or <em>"Shorter for family devotional"</em>) and tap <strong>Refine with AI</strong> to adapt the prayer seamlessly.
              </p>
              <p className="text-on-surface/90">
                <strong>Selah Pause & Private Journal:</strong> Answer deep reflection prompts directly in the app. Entries save automatically to your private cloud profile so you can revisit your spiritual growth over time.
              </p>
            </div>
          </section>

          {/* Section 5: Voices on Verses */}
          <section id="guide-sec-voices" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Part 5</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">The 'Voices on Verses' Feature</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Breaking echo chambers and algorithmic silos through real community dialogue and authoritative scholarly commentaries.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-sky-500/10 border-l-4 border-sky-600 text-on-surface space-y-2">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-bold text-xs uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">hub</span>
                Why We Need Diverse Perspectives
              </div>
              <p className="text-sm font-sans text-on-surface/90">
                Modern social algorithms silo people into echo chambers, stoking division. True spiritual maturity and gentle witness (<em>1 Peter 3:15</em>) require understanding what others think, doubt, or question. By engaging diverse viewpoints while remaining grounded in scripture, we build empathy and clarity without compromise.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/05_voices_on_verses_expanded.png"
                alt="Voices on Verses Sentiment Controls and Real Discussions"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 7: Voices on Verses — Tunable Sentiment Quota Bar, Commentary Sources, and Real Community Discussions.
              </div>
            </div>

            <div className="space-y-3 font-sans text-sm">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15">
                <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-600 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                  🔴
                </div>
                <div>
                  <strong className="text-on-surface">Critical & Skeptical Perspectives:</strong>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Real objections, doubts, and apparent contradictions. Addressing honest questions strengthens our convictions and prepares us for real conversations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                  🟡
                </div>
                <div>
                  <strong className="text-on-surface">Neutral & Scholarly Context:</strong>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Historical background, linguistics, original Greek/Hebrew nuances, and archaeological evidence.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                  🟢
                </div>
                <div>
                  <strong className="text-on-surface">Positive & Devotional Voices:</strong>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Pastoral reflections, historical church fathers, and encouraging sermons on the verses.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6: Creating an Account */}
          <section id="guide-sec-account" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 6</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">How to Create an Account</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Keep your notes, highlighted verses, and crafted studies synchronized across devices.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest max-w-xl mx-auto">
              <img
                src="/guide_images/01_login_signup_screen.png"
                alt="Account Sign Up and Demo Mode"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 8: Sign In and Account Registration Screen with Instant 1-Click Demo Access.
              </div>
            </div>

            <ol className="list-decimal list-inside space-y-2 font-sans text-sm text-on-surface/90">
              <li>Open BibleStudy-Crafter in your browser.</li>
              <li>Click <strong>"Don't have an account? Create one"</strong>.</li>
              <li>Enter your Name, Email address, and Password (at least 6 characters).</li>
              <li>Click <strong>Create Account</strong> to begin.</li>
              <li><em>(Demo mode tip):</em> Click <strong>"Use Demo Account"</strong> on the sign-in card if you want to explore instantly without registering.</li>
            </ol>
          </section>

          {/* Section 7: Getting Free API Key */}
          <section id="guide-sec-apikey" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 7</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">How to Get a Free Google Gemini API Key</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Google provides a 100% free Gemini API key with generous limits so you can craft unlimited studies without subscription fees.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/07_byok_api_keys_modal.png"
                alt="Profile BYOK API Key Settings"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 9: Profile & BYOK (Bring Your Own Key) Settings Modal.
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 font-sans text-sm space-y-2.5">
              <p className="font-semibold text-on-surface">Step-by-Step Instructions:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-on-surface-variant">
                <li>
                  Open{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline font-semibold"
                  >
                    Google AI Studio (aistudio.google.com/app/apikey)
                  </a>{' '}
                  in a new tab.
                </li>
                <li>Sign in with your Google or Gmail account.</li>
                <li>Click the blue <strong>"+ Create API key"</strong> button.</li>
                <li>Copy the key string (starts with <code className="bg-surface px-1 py-0.5 rounded">AIzaSy...</code>).</li>
                <li>In BibleStudy-Crafter, tap your <strong>Profile Avatar</strong> 👤 in the top right.</li>
                <li>Select the <strong>API Keys & BYOK</strong> tab.</li>
                <li>Paste your key into the <strong>Google Gemini API Key</strong> box and click <strong>Test</strong>.</li>
                <li>Click <strong>Save API Key Settings</strong>. You're ready to craft!</li>
              </ol>
            </div>
          </section>

          {/* Section 8: Crafting a Study */}
          <section id="guide-sec-craft-study" className="space-y-6 pt-6 border-t border-outline-variant/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Part 8</span>
              <h3 className="text-2xl font-bold font-serif text-on-surface">How to Craft a Brand New Study Plan</h3>
              <p className="text-sm text-on-surface-variant font-sans mt-1">
                Design custom curriculum for personal devotions, family studies, or small group ministry.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 shadow-md bg-surface-container-lowest">
              <img
                src="/guide_images/06_study_library.png"
                alt="Sanctuary Crafter Library and Generation Form"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="px-4 py-2.5 bg-surface-container/50 text-xs text-on-surface-variant font-sans italic text-center border-t border-outline-variant/15">
                Figure 10: Sanctuary Crafter — Subject of Inquiry & Study Generation Dashboard.
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5 font-sans text-xs">
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">1. Subject of Inquiry</span>
                <p className="text-on-surface-variant">
                  Type your book, theme, or character (e.g. <em>"The Parables of Jesus"</em>, <em>"Wisdom in Proverbs"</em>) or click a suggestion.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">2. Time Commitment</span>
                <p className="text-on-surface-variant">
                  Pick daily reading duration (5 to 120 mins) and plan length (1 to 90 days).
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">3. Theological Lens & Translation</span>
                <p className="text-on-surface-variant">
                  Select Non-denominational, Reformed, Catholic, Orthodox, etc., and primary Bible version (KJV, ASV, PEV, WEB).
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-1">
                <span className="font-bold text-on-surface">4. Curate Focal Verses</span>
                <p className="text-on-surface-variant">
                  Click <em>"Find relevant verses"</em> to search the Bible and check specific passages to anchor into your study.
                </p>
              </div>
            </div>
          </section>

          {/* Workflow Summary Table */}
          <section className="space-y-4 pt-6 border-t border-outline-variant/20 font-sans">
            <h4 className="text-lg font-bold font-serif text-on-surface">Workflow at a Glance</h4>
            <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="w-full text-xs text-left">
                <thead className="bg-primary text-on-primary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                    <th className="px-4 py-3 font-semibold">What You Do</th>
                    <th className="px-4 py-3 font-semibold">Why It Matters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 bg-surface-container-lowest">
                  <tr>
                    <td className="px-4 py-3 font-bold text-primary">1. Scripture First</td>
                    <td className="px-4 py-3 text-on-surface">Read the pure text & listen to narration without bias.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Protects the Word from human/AI dilution.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-emerald-600">2. Biblical Atlas</td>
                    <td className="px-4 py-3 text-on-surface">Explore ancient maps, gazetteers, and satellite terrain.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Anchors scripture in verified archaeological and historical reality.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-amber-600">3. Infographics</td>
                    <td className="px-4 py-3 text-on-surface">Review structured learning pillars, thesis, and daily walkaways.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Accelerates retention and clarifies theological principles.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-primary">3B. Sacred Imagery</td>
                    <td className="px-4 py-3 text-on-surface">Customize banners & infographics with artistic presets and AI prompt crafter.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Elevates visual immersion and creates publication-grade devotional assets.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-purple-600">4. Reflect & Pray</td>
                    <td className="px-4 py-3 text-on-surface">Pray liturgical prayers, refine with AI, and write journal entries.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Internalizes God's Word into daily character and action.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-sky-600">5. Voices on Verses</td>
                    <td className="px-4 py-3 text-on-surface">Explore skeptical, neutral, and devotional viewpoints.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Breaks algorithmic silos, builds empathy and clarity.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-rose-600">6. Craft & Share</td>
                    <td className="px-4 py-3 text-on-surface">Create tailored multi-day plans on any Biblical topic.</td>
                    <td className="px-4 py-3 text-on-surface-variant">Equips personal, family, and group discipleship.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between px-6 py-3.5 border-t border-outline-variant/15 bg-surface-container/60 backdrop-blur-md">
          <div className="text-xs text-on-surface-variant font-sans">
            Have questions or ideas? Grounded in prayer & Scripture.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
          >
            Got It
          </button>
        </footer>
      </div>
    </div>
  )
}
