import { useEffect, useState, useRef } from 'react'
import { assets, type AssetOut, type StructuredInfographicOut, type InfographicPillar } from '../lib/studies'

interface InfographicViewerProps {
  studyId: number
  dayNumber: number
  dayTheme?: string
  hasCommentary: boolean
  onOpenPromptCrafter?: (initialTab?: 'presets' | 'assistant' | 'playground' | 'gallery') => void
  activeInfographicAsset?: AssetOut | null
  onAssetChanged?: () => void
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

export default function InfographicViewer({
  studyId,
  dayNumber,
  hasCommentary,
  onOpenPromptCrafter,
  activeInfographicAsset,
  onAssetChanged,
}: InfographicViewerProps) {
  const [data, setData] = useState<StructuredInfographicOut | null>(null)
  const [loading, setLoading] = useState(false)
  const [generatingSvg, setGeneratingSvg] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'poster'>('cards')
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const infographicRef = useRef<HTMLDivElement>(null)

  // Load structured data on mount or when day changes
  const loadStructured = async (forceRefresh = false) => {
    if (!hasCommentary) return
    setLoading(true)
    setErr(null)
    try {
      // Check if active infographic asset has cached meta_json
      if (!forceRefresh && activeInfographicAsset?.meta_json?.pillars) {
        setData(activeInfographicAsset.meta_json)
      } else {
        const res = await assets.structuredInfographic(studyId, dayNumber)
        setData(res)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeInfographicAsset?.meta_json?.pillars) {
      setData(activeInfographicAsset.meta_json)
    } else {
      loadStructured()
    }
  }, [studyId, dayNumber, activeInfographicAsset?.id])

  const handleGenerateSvg = async () => {
    setGeneratingSvg(true)
    setErr(null)
    try {
      const asset = await assets.generateSvgInfographic(studyId, dayNumber)
      if (asset.meta_json) {
        setData(asset.meta_json)
      }
      onAssetChanged?.()
      setViewMode('poster')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setGeneratingSvg(false)
    }
  }

  const handleCopySummary = async () => {
    if (!data) return
    const text = `📖 ${data.title}\n"${data.central_thesis}"\n\n` +
      data.pillars.map((p, i) => `${i + 1}. ${p.title} (${p.scripture_ref || ''})\n   "${p.key_phrase}" — ${p.insight}`).join('\n\n') +
      `\n\n📌 Anchor Verse: ${data.key_verse?.ref} — "${data.key_verse?.text}"\n💡 Walkaway: ${data.practical_walkaway}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownloadImage = () => {
    if (activeInfographicAsset?.id) {
      window.open(assets.mediaUrl(activeInfographicAsset.id, true), '_blank')
    } else {
      handleGenerateSvg()
    }
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-surface-container-low/90 p-4 md:p-6 shadow-ambient transition-all">
      {/* Top Header & Micro Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <I name="insights" cls="text-[20px]" />
          </span>
          <div>
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
              Visual Key Learnings
            </h3>
            <p className="text-ui-label-xs text-on-surface-variant">
              Theological pillars & practical application distilled from today's commentary
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-ui-label-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <I name="dashboard" cls="text-[14px]" /> Interactive Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('poster')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-ui-label-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'poster'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <I name="image" cls="text-[14px]" /> Poster View
            </button>
          </div>

          {/* Action buttons */}
          <button
            type="button"
            onClick={handleCopySummary}
            disabled={!data}
            className="btn-ghost text-ui-label-xs py-1 px-2.5 flex items-center gap-1"
            title="Copy Key Learnings summary"
          >
            <I name={copied ? 'check' : 'content_copy'} cls="text-[14px]" />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadStructured(true)}
            disabled={loading}
            className="btn-outline text-ui-label-xs py-1 px-2.5 flex items-center gap-1"
            title="Refresh AI Key Learnings extraction"
          >
            <I name={loading ? 'hourglass_empty' : 'refresh'} cls={`text-[14px] ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing…' : 'Re-extract'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPromptCrafter?.('presets')}
            className="btn-primary text-ui-label-xs py-1 px-3 flex items-center gap-1.5"
            title="Open Visual Studio / Prompt Crafter"
          >
            <I name="palette" cls="text-[15px]" />
            <span>Craft Visual Art</span>
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-xl border border-error/30 bg-error/10 p-3 text-ui-label-sm text-error">
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-ui-label-md">Extracting theological pillars & core takeaways…</p>
        </div>
      )}

      {/* Main Content Area */}
      {!loading && data && (
        <div className="mt-5 space-y-6" ref={infographicRef}>
          {viewMode === 'cards' ? (
            <>
              {/* Infographic Thesis Banner */}
              <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-tertiary/10 to-surface-container-high p-4 md:p-5">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-ui-label-xs uppercase tracking-wider font-bold text-primary">
                    <I name="auto_awesome" cls="text-[15px]" /> Core Thesis
                  </div>
                  <h4 className="font-study-title text-headline-sm md:text-headline-md font-bold text-on-surface mt-1">
                    {data.title}
                  </h4>
                  <p className="font-serif italic text-body-reading text-on-surface/90 mt-2 leading-relaxed">
                    "{data.central_thesis}"
                  </p>
                </div>
              </div>

              {/* Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.pillars.map((pillar, idx) => (
                  <PillarCard key={idx} pillar={pillar} index={idx + 1} />
                ))}
              </div>

              {/* Anchor Verse & Practical Walkaway Footer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Anchor Verse */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-ui-label-xs font-bold uppercase tracking-wider text-amber-500">
                      <I name="menu_book" cls="text-[16px]" /> Anchor Verse
                    </div>
                    <div className="font-serif font-bold text-on-surface mt-1.5 text-headline-xs">
                      {data.key_verse?.ref}
                    </div>
                    <p className="font-serif italic text-body-reading text-on-surface/85 mt-2 leading-relaxed">
                      "{data.key_verse?.text}"
                    </p>
                  </div>
                </div>

                {/* Practical Walkaway */}
                <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-ui-label-xs font-bold uppercase tracking-wider text-sky-400">
                      <I name="explore" cls="text-[16px]" /> Daily Walkaway
                    </div>
                    <p className="font-body-reading text-body-reading font-medium text-on-surface mt-2 leading-relaxed">
                      {data.practical_walkaway}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <span className="text-ui-label-xs text-sky-400 font-semibold flex items-center gap-1">
                      Action Step <I name="arrow_forward" cls="text-[14px]" />
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Poster View */
            <div className="flex flex-col items-center justify-center space-y-4">
              {activeInfographicAsset && activeInfographicAsset.status === 'ready' && activeInfographicAsset.has_content ? (
                <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
                  <img
                    src={assets.mediaUrl(activeInfographicAsset.id)}
                    alt={activeInfographicAsset.prompt || 'Infographic Poster'}
                    className="w-full h-auto object-contain rounded-2xl"
                  />
                </div>
              ) : (
                <div className="w-full max-w-2xl py-12 px-6 rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-lowest flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <I name="image" cls="text-[28px]" />
                  </div>
                  <h4 className="font-headline-md text-on-surface font-bold">No Rendered Poster Yet</h4>
                  <p className="text-ui-label-sm text-on-surface-variant max-w-md mt-1 mb-4">
                    Generate an instant high-resolution SVG infographic poster or craft custom AI visual artwork.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleGenerateSvg}
                      disabled={generatingSvg}
                      className="btn-primary flex items-center gap-2"
                    >
                      <I name={generatingSvg ? 'hourglass_empty' : 'brush'} cls="text-[18px]" />
                      <span>{generatingSvg ? 'Generating SVG…' : 'Generate Free SVG Poster'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPromptCrafter?.('presets')}
                      className="btn-outline flex items-center gap-2"
                    >
                      <I name="auto_awesome" cls="text-[18px]" />
                      <span>AI Art Studio</span>
                    </button>
                  </div>
                </div>
              )}

              {activeInfographicAsset && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="btn-outline text-ui-label-sm flex items-center gap-1.5"
                  >
                    <I name="download" cls="text-[16px]" />
                    <span>Download Poster</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSvg}
                    disabled={generatingSvg}
                    className="btn-ghost text-ui-label-sm flex items-center gap-1.5"
                  >
                    <I name="replay" cls="text-[16px]" />
                    <span>Regenerate Poster</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PillarCard({ pillar, index }: { pillar: InfographicPillar; index: number }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-high/60 p-4 transition-all hover:bg-surface-container-high hover:border-primary/40 shadow-xs">
      <div>
        {/* Top badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/20 text-primary font-bold text-ui-label-xs">
              {index}
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-surface-container-lowest text-primary">
              <I name={pillar.icon || 'star'} cls="text-[16px]" />
            </span>
          </div>
          {pillar.scripture_ref && (
            <span className="rounded-full bg-secondary-container/60 px-2 py-0.5 font-serif text-[11px] font-semibold text-on-secondary-container">
              {pillar.scripture_ref}
            </span>
          )}
        </div>

        {/* Title */}
        <h5 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          {pillar.title}
        </h5>

        {/* Highlight Phrase */}
        {pillar.key_phrase && (
          <div className="my-2 inline-block rounded-lg bg-primary/10 dark:bg-primary/20 px-2 py-1 text-ui-label-xs font-semibold text-primary italic">
            "{pillar.key_phrase}"
          </div>
        )}

        {/* Insight Description */}
        <p className="font-body-reading text-ui-label-sm text-on-surface-variant leading-relaxed mt-1.5">
          {pillar.insight}
        </p>
      </div>
    </div>
  )
}
