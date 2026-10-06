import { useState } from 'react'
import { assets, type AssetOut } from '../lib/studies'

interface DayHeroBannerProps {
  studyId?: number
  dayNumber: number
  dayTitle?: string
  dayHeading?: string
  dayTheme?: string
  scriptureRefs?: string[]
  activeCoverAsset?: AssetOut | null
  onOpenPromptCrafter: (initialTab?: 'presets' | 'assistant' | 'playground' | 'gallery') => void
  isGenerating?: boolean
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

export default function DayHeroBanner({
  dayNumber,
  dayTitle,
  dayHeading,
  dayTheme,
  scriptureRefs = [],
  activeCoverAsset,
  onOpenPromptCrafter,
  isGenerating = false,
}: DayHeroBannerProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const hasCover = Boolean(activeCoverAsset && activeCoverAsset.status === 'ready' && activeCoverAsset.has_content)
  const isRendering = activeCoverAsset?.status === 'rendering' || isGenerating

  const imageUrl = hasCover ? assets.mediaUrl(activeCoverAsset!.id) : null

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-outline-variant/30 shadow-ambient transition-all">
      {/* Background Cover Image or Ambient Gradient */}
      <div className="relative h-64 md:h-80 w-full bg-surface-container-lowest overflow-hidden">
        {hasCover && imageUrl && (
          <>
            <img
              src={imageUrl}
              alt={activeCoverAsset?.prompt || `Day ${dayNumber} Cover Art`}
              className={`h-full w-full object-cover transition-opacity duration-700 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
            />
            {/* Scrim overlays for maximum text legibility & rich aesthetic depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
          </>
        )}

        {(!hasCover || isRendering) && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-container/30 via-surface-container-high to-tertiary-container/20">
            {/* Ambient decorative lighting */}
            <div className="absolute -top-12 -right-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-tertiary/15 blur-2xl" />
          </div>
        )}

        {/* Content Container positioned over the image */}
        <div className="absolute inset-0 flex flex-col justify-between p-6 md:p-8">
          {/* Top Bar: Day Badge + Quick Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/90 px-3.5 py-1 text-ui-label-xs font-bold uppercase tracking-wider text-on-primary shadow-xs backdrop-blur-md">
                <I name="auto_stories" cls="text-[14px]" />
                Day {dayNumber}
              </span>

              {activeCoverAsset?.style_preset && (
                <span className="hidden sm:inline-flex items-center rounded-full bg-surface-container-high/80 px-3 py-1 text-ui-label-xs font-medium text-on-surface backdrop-blur-md border border-outline-variant/30">
                  <I name="palette" cls="text-[13px] mr-1 text-primary" />
                  {activeCoverAsset.style_preset.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {/* Top Right Action Buttons */}
            <div className="flex items-center gap-2">
              {hasCover && (
                <button
                  type="button"
                  onClick={() => window.open(assets.mediaUrl(activeCoverAsset!.id, true), '_blank')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high/80 text-on-surface hover:text-primary hover:bg-surface-container-highest transition-all backdrop-blur-md border border-outline-variant/30 shadow-xs cursor-pointer"
                  title="Download Cover Art"
                  aria-label="Download Cover Art"
                >
                  <I name="download" cls="text-[16px]" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenPromptCrafter('presets')}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high/90 px-3.5 py-1.5 text-ui-label-xs font-semibold text-on-surface hover:text-primary hover:bg-surface-container-highest transition-all backdrop-blur-md border border-outline-variant/40 shadow-xs cursor-pointer"
              >
                <I name="palette" cls="text-[15px] text-primary" />
                <span>{hasCover ? 'Customize Art' : 'Craft Cover Art'}</span>
              </button>
            </div>
          </div>

          {/* Bottom Area: Title, Focus, Scripture Badges */}
          <div className="space-y-2 max-w-3xl">
            {scriptureRefs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {scriptureRefs.map((ref, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md bg-surface-container-highest/80 px-2.5 py-0.5 font-serif text-ui-label-xs font-semibold text-primary backdrop-blur-sm border border-primary/20"
                  >
                    <I name="menu_book" cls="text-[12px]" />
                    {ref}
                  </span>
                ))}
              </div>
            )}

            <h2 className="font-study-title text-headline-md md:text-headline-lg font-bold text-on-surface tracking-tight leading-tight">
              {dayHeading || dayTitle || `Day ${dayNumber}`}
            </h2>

            {dayTheme && (
              <p className="text-body-reading text-on-surface-variant font-medium line-clamp-2 leading-snug">
                {dayTheme}
              </p>
            )}

            {/* Rendering Progress Indicator */}
            {isRendering && (
              <div className="pt-2 flex items-center gap-2 text-ui-label-xs text-primary font-semibold animate-pulse">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>Generating custom cover artwork…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
