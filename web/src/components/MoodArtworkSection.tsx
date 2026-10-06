import { useState, useRef, useEffect } from 'react'
import { assets, type AssetOut } from '../lib/studies'

interface MoodArtworkSectionProps {
  studyId: number
  dayNumber: number
  dayTitle?: string
  dayTheme?: string
  scriptureRefs?: string[]
  activeArtwork?: AssetOut | null
  onOpenPromptCrafter?: (initialTab?: 'presets' | 'assistant' | 'playground' | 'gallery') => void
  onAssetChanged?: () => void
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

const QUICK_PRESETS = [
  {
    id: 'classical_oil',
    label: 'Classical Oil',
    icon: 'palette',
    description: 'Chiaroscuro & golden light',
    accent: 'from-amber-950/40 to-surface-container-high border-amber-500/30 text-amber-300',
  },
  {
    id: 'watercolor',
    label: 'Luminous Watercolor',
    icon: 'water_drop',
    description: 'Soft translucent washes',
    accent: 'from-sky-950/40 to-surface-container-high border-sky-500/30 text-sky-300',
  },
  {
    id: 'stained_glass',
    label: 'Cathedral Glass',
    icon: 'church',
    description: 'Radiant jewel-toned light',
    accent: 'from-purple-950/40 to-surface-container-high border-purple-500/30 text-purple-300',
  },
  {
    id: 'cinematic_light',
    label: 'Cinematic Dawn',
    icon: 'wb_sunny',
    description: 'Majestic volumetric rays',
    accent: 'from-orange-950/40 to-surface-container-high border-orange-500/30 text-orange-300',
  },
]

export default function MoodArtworkSection({
  studyId,
  dayNumber,
  dayTitle,
  dayTheme,
  scriptureRefs = [],
  activeArtwork,
  onOpenPromptCrafter,
  onAssetChanged,
}: MoodArtworkSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState('')
  const [imgLoaded, setImgLoaded] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasArtwork = Boolean(activeArtwork && activeArtwork.status === 'ready' && activeArtwork.has_content)
  const isRendering = activeArtwork?.status === 'rendering' || isGenerating

  // Poll for rendering completion
  useEffect(() => {
    if (activeArtwork?.status === 'rendering' || isGenerating) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      pollTimerRef.current = setInterval(async () => {
        try {
          const list = await assets.list(studyId, dayNumber)
          const current = list.find((a) => (a.kind === 'cover_art' || a.kind === 'image') && a.is_active)
          if (current && current.status === 'ready') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            setIsGenerating(false)
            onAssetChanged?.()
          } else if (current && current.status === 'failed') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            setIsGenerating(false)
            setErrorMsg(current.error || 'Rendering failed')
            onAssetChanged?.()
          }
        } catch {
          // keep polling
        }
      }, 2500)
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [activeArtwork?.status, isGenerating, studyId, dayNumber, onAssetChanged])

  const handleQuickRender = async (presetId: string, label: string) => {
    setIsGenerating(true)
    setGeneratingLabel(label)
    setErrorMsg(null)
    try {
      // 1. Get prompt suggestion
      const suggested = await assets.suggestPrompt(studyId, dayNumber, {
        style_id: presetId,
        mood_id: 'peaceful_contemplative',
      })

      // 2. Launch render
      await assets.renderArt(studyId, dayNumber, {
        kind: 'cover_art',
        prompt: suggested.cover_art_prompt,
        style_preset: presetId,
        aspect_ratio: '16:9',
        is_active: true,
      })

      onAssetChanged?.()
    } catch (err) {
      setIsGenerating(false)
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate artwork.')
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low shadow-ambient transition-all">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <I name="palette" cls="text-[17px]" />
          </span>
          <div>
            <h3 className="font-ui-title text-ui-title-sm font-bold text-on-surface flex items-center gap-2">
              Visual Atmosphere & Mood
              {hasArtwork && activeArtwork?.style_preset && (
                <span className="rounded-full bg-surface-container-highest px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant capitalize">
                  {activeArtwork.style_preset.replace(/_/g, ' ')}
                </span>
              )}
            </h3>
            <p className="text-[12px] text-on-surface-variant">
              {dayTheme ? `Sacred visual reflection for "${dayTheme}"` : "Sacred visual reflection anchored in today's passage"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasArtwork && (
            <button
              type="button"
              onClick={() => window.open(assets.mediaUrl(activeArtwork!.id, true), '_blank')}
              className="btn-ghost text-ui-label-xs py-1.5 px-2.5 flex items-center gap-1.5"
              title="Download High Resolution"
            >
              <I name="download" cls="text-[15px]" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenPromptCrafter?.('presets')}
            className="btn-outline text-ui-label-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <I name="brush" cls="text-[15px] text-primary" />
            <span>{hasArtwork ? 'Customize Style' : 'Open Art Studio'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 md:p-5">
        {errorMsg && (
          <div className="mb-4 rounded-xl border border-error/30 bg-error-container/20 p-3 text-ui-label-xs text-error flex items-center gap-2">
            <I name="error" cls="text-[18px]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {hasArtwork && (
          <div className="group relative overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-container-highest flex items-center justify-center">
              <img
                src={assets.mediaUrl(activeArtwork!.id)}
                alt={activeArtwork!.prompt || `${dayTitle || 'Day'} visual mood artwork`}
                className={`h-full w-full object-cover group-hover:scale-102 transition-all duration-700 ${
                  imgLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImgLoaded(true)}
              />

              {/* Scrim Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

              {/* Text Caption at Bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 flex flex-col justify-end">
                {scriptureRefs.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {scriptureRefs.map((r, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-surface-container-highest/90 px-2 py-0.5 font-serif text-[11px] font-semibold text-primary backdrop-blur-md border border-primary/20"
                      >
                        📖 {r}
                      </span>
                    ))}
                  </div>
                )}
                <p className="font-display-scripture text-ui-label-sm md:text-body-reading text-on-surface font-medium italic line-clamp-2">
                  "{activeArtwork!.prompt}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rendering state */}
        {isRendering && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/5 py-12 px-6 text-center animate-pulse">
            <div className="h-12 w-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3">
              <I name="auto_awesome" cls="text-[28px] animate-spin" />
            </div>
            <h4 className="font-ui-title text-ui-title-md font-bold text-on-surface">
              Crafting Sacred Artwork…
            </h4>
            <p className="text-ui-label-sm text-on-surface-variant max-w-md mt-1">
              {generatingLabel ? `Rendering ${generatingLabel} style…` : 'Applying biblical visual principles and lighting…'}
            </p>
          </div>
        )}

        {/* Empty state with 1-Click Quick Preset Buttons */}
        {!hasArtwork && !isRendering && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-lowest p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                <I name="photo_spark" cls="text-[28px]" />
              </div>
              <h4 className="font-ui-title text-ui-title-md font-bold text-on-surface">
                Set the Visual Atmosphere
              </h4>
              <p className="text-ui-label-sm text-on-surface-variant max-w-lg mx-auto mt-1 mb-5">
                Generate an evocative fine-art piece reflecting today's themes to deepen contemplation and prayer.
              </p>

              {/* 1-Click Preset Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl mx-auto text-left">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleQuickRender(preset.id, preset.label)}
                    className={`group relative flex flex-col justify-between rounded-xl border bg-gradient-to-b p-3.5 transition-all hover:scale-[1.02] hover:shadow-ambient cursor-pointer ${preset.accent}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <I name={preset.icon} cls="text-[20px]" />
                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 group-hover:opacity-100">
                          1-Click
                        </span>
                      </div>
                      <h5 className="font-ui-title text-ui-title-xs font-bold text-on-surface">
                        {preset.label}
                      </h5>
                      <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">
                        {preset.description}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                      <span>Create</span>
                      <I name="arrow_forward" cls="text-[13px]" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
