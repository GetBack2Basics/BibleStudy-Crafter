import { useEffect, useState, useRef } from 'react'
import {
  assets,
  type AssetOut,
  type PresetOut,
} from '../lib/studies'

interface PromptCrafterModalProps {
  isOpen: boolean
  onClose: () => void
  studyId: number
  dayNumber: number
  dayTitle?: string
  initialTab?: 'presets' | 'assistant' | 'playground' | 'gallery'
  onAssetSelected?: () => void
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

export default function PromptCrafterModal({
  isOpen,
  onClose,
  studyId,
  dayNumber,
  dayTitle,
  initialTab = 'presets',
  onAssetSelected,
}: PromptCrafterModalProps) {
  const [activeTab, setActiveTab] = useState<'presets' | 'assistant' | 'playground' | 'gallery'>(initialTab)
  const [presets, setPresets] = useState<PresetOut | null>(null)
  const [dayAssets, setDayAssets] = useState<AssetOut[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)

  // Presets form state
  const [selectedStyle, setSelectedStyle] = useState('classical_oil')
  const [selectedMood, setSelectedMood] = useState('peaceful_contemplative')
  const [customGuidance, setCustomGuidance] = useState('')
  const [targetKind, setTargetKind] = useState<'cover_art' | 'infographic'>('cover_art')
  const [aspectRatio, setAspectRatio] = useState('16:9')

  // Prompt assistant & playground state
  const [suggesting, setSuggesting] = useState(false)
  const [editablePrompt, setEditablePrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [artisticRationale, setArtisticRationale] = useState('')

  // Generation execution state
  const [rendering, setRendering] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
      loadPresets()
      loadAssets()
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [isOpen, studyId, dayNumber])

  const loadPresets = async () => {
    try {
      const p = await assets.presets()
      setPresets(p)
    } catch {
      // fallback handled
    }
  }

  const loadAssets = async () => {
    setLoadingAssets(true)
    try {
      const list = await assets.list(studyId, dayNumber)
      setDayAssets(list)
    } catch {
      setDayAssets([])
    } finally {
      setLoadingAssets(false)
    }
  }

  // Handle AI Prompt Suggestion
  const handleCraftPrompt = async () => {
    setSuggesting(true)
    setErr(null)
    try {
      const res = await assets.suggestPrompt(studyId, dayNumber, {
        style_id: selectedStyle,
        mood_id: selectedMood,
        custom_guidance: customGuidance,
      })
      setEditablePrompt(targetKind === 'cover_art' ? res.cover_art_prompt : res.infographic_art_prompt)
      setNegativePrompt(res.negative_prompt)
      setArtisticRationale(res.artistic_rationale)
      setActiveTab('assistant')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSuggesting(false)
    }
  }

  // Handle Image Render
  const handleStartRender = async () => {
    if (!editablePrompt.trim()) {
      setErr('Please enter an art prompt.')
      return
    }
    setRendering(true)
    setErr(null)
    setStatusMsg('Queuing render…')
    try {
      const res = await assets.renderArt(studyId, dayNumber, {
        kind: targetKind,
        prompt: editablePrompt.trim(),
        style_preset: selectedStyle,
        aspect_ratio: aspectRatio,
        is_active: true,
      })
      setStatusMsg('Rendering image…')
      pollAssetStatus(res.asset_id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setRendering(false)
    }
  }

  const pollAssetStatus = (assetId: number) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = setInterval(async () => {
      try {
        const list = await assets.list(studyId, dayNumber)
        setDayAssets(list)
        const current = list.find((a) => a.id === assetId)
        if (current) {
          if (current.status === 'ready') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            setRendering(false)
            setStatusMsg('Artwork ready!')
            onAssetSelected?.()
            setActiveTab('gallery')
          } else if (current.status === 'failed') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            setRendering(false)
            setErr(current.error || 'Art rendering failed')
          }
        }
      } catch {
        // keep polling
      }
    }, 2000)
  }

  const handleSetActive = async (assetId: number) => {
    try {
      await assets.setActive(studyId, dayNumber, assetId)
      await loadAssets()
      onAssetSelected?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (assetId: number) => {
    try {
      await assets.delete(studyId, dayNumber, assetId)
      await loadAssets()
      onAssetSelected?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl border border-outline-variant/30 bg-surface-container-low shadow-2xl overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-6 py-4 bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
              <I name="palette" cls="text-[20px]" />
            </span>
            <div>
              <h3 className="font-study-title text-headline-sm font-bold text-on-surface">
                Visual Studio & Prompt Crafter
              </h3>
              <p className="text-ui-label-xs text-on-surface-variant">
                Day {dayNumber} · {dayTitle || 'Biblical Imagery & Infographics'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <I name="close" cls="text-[20px]" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-outline-variant/20 bg-surface-container-lowest px-6 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'presets'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <I name="tune" cls="text-[16px]" /> 1. Style & Atmosphere
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assistant')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'assistant'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <I name="auto_awesome" cls="text-[16px]" /> 2. Prompt Playground
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'gallery'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <I name="collections" cls="text-[16px]" /> 3. Day Gallery ({dayAssets.length})
          </button>
        </div>

        {err && (
          <div className="mx-6 mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-ui-label-sm text-error">
            {err}
          </div>
        )}

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PRESETS & TONE */}
          {activeTab === 'presets' && (
            <div className="space-y-6">
              {/* Kind & Aspect Ratio Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                    Artwork Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setTargetKind('cover_art'); setAspectRatio('16:9') }}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        targetKind === 'cover_art'
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                          : 'border-outline-variant/30 bg-surface-container-high text-on-surface hover:border-outline-variant'
                      }`}
                    >
                      <I name="panorama" cls="text-[20px]" />
                      <div>
                        <div className="text-ui-label-sm">Cover Art Banner</div>
                        <div className="text-[11px] text-on-surface-variant font-normal">Landscape (16:9)</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setTargetKind('infographic'); setAspectRatio('3:4') }}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        targetKind === 'infographic'
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                          : 'border-outline-variant/30 bg-surface-container-high text-on-surface hover:border-outline-variant'
                      }`}
                    >
                      <I name="insights" cls="text-[20px]" />
                      <div>
                        <div className="text-ui-label-sm">Infographic Poster</div>
                        <div className="text-[11px] text-on-surface-variant font-normal">Portrait (3:4)</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                    Aspect Ratio
                  </label>
                  <select
                    className="field-underline w-full rounded-xl border border-outline-variant/30 bg-surface-container-high p-3 text-on-surface"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                  >
                    <option value="16:9">Landscape Hero (16:9) — Best for headers</option>
                    <option value="3:4">Portrait Poster (3:4) — Best for infographics</option>
                    <option value="1:1">Square (1:1) — Best for cards & social</option>
                  </select>
                </div>
              </div>

              {/* Visual Styles Grid */}
              <div>
                <label className="block text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2.5">
                  Artistic Style Presets
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(presets?.styles || []).map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyle(style.id)}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        selectedStyle === style.id
                          ? 'border-primary bg-primary/10 text-on-surface ring-2 ring-primary/40 shadow-xs'
                          : 'border-outline-variant/30 bg-surface-container-high hover:border-outline-variant text-on-surface'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-ui-label-md flex items-center justify-between">
                          <span>{style.label}</span>
                          {selectedStyle === style.id && <I name="check_circle" cls="text-[18px] text-primary" />}
                        </div>
                        <p className="text-[12px] text-on-surface-variant mt-1 leading-snug">
                          {style.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mood / Atmosphere Grid */}
              <div>
                <label className="block text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2.5">
                  Mood & Spiritual Atmosphere
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(presets?.moods || []).map((mood) => (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => setSelectedMood(mood.id)}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        selectedMood === mood.id
                          ? 'border-primary bg-primary/10 text-on-surface ring-2 ring-primary/40 shadow-xs'
                          : 'border-outline-variant/30 bg-surface-container-high hover:border-outline-variant text-on-surface'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-ui-label-md flex items-center justify-between">
                          <span>{mood.label}</span>
                          {selectedMood === mood.id && <I name="check_circle" cls="text-[18px] text-primary" />}
                        </div>
                        <p className="text-[12px] text-on-surface-variant mt-1 leading-snug">
                          {mood.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Guidance Textarea */}
              <div>
                <label className="block text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  Personal Vision & Metaphor (Optional)
                </label>
                <textarea
                  className="field-underline w-full rounded-xl border border-outline-variant/30 bg-surface-container-high p-3 font-body-reading text-ui-label-md text-on-surface"
                  rows={2}
                  placeholder="e.g. Include an ancient stone path leading toward sunrise, still waters reflecting dawn..."
                  value={customGuidance}
                  onChange={(e) => setCustomGuidance(e.target.value)}
                />
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleCraftPrompt}
                  disabled={suggesting}
                  className="btn-primary py-2.5 px-6 flex items-center gap-2 text-ui-label-md font-bold shadow-md cursor-pointer"
                >
                  <I name={suggesting ? 'hourglass_empty' : 'auto_awesome'} cls={`text-[18px] ${suggesting ? 'animate-spin' : ''}`} />
                  <span>{suggesting ? 'Crafting Biblical Prompt…' : 'Generate Prompt with AI'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PROMPT PLAYGROUND & RENDER */}
          {activeTab === 'assistant' && (
            <div className="space-y-5">
              {artisticRationale && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-1.5 text-ui-label-xs font-bold uppercase tracking-wider text-primary mb-1">
                    <I name="psychology" cls="text-[16px]" /> Theological Concept & Design Rationale
                  </div>
                  <p className="font-serif italic text-ui-label-sm text-on-surface/90 leading-relaxed">
                    {artisticRationale}
                  </p>
                </div>
              )}

              {/* Editable Prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    Image Generation Prompt
                  </label>
                  <button
                    type="button"
                    onClick={handleCraftPrompt}
                    disabled={suggesting}
                    className="text-ui-label-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <I name="refresh" cls="text-[13px]" /> Re-roll prompt
                  </button>
                </div>
                <textarea
                  className="field-underline w-full rounded-2xl border border-outline-variant/30 bg-surface-container-high p-4 font-body-reading text-body-reading text-on-surface focus:border-primary"
                  rows={4}
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  placeholder="Enter or tweak the detailed visual prompt..."
                />
              </div>

              {/* Negative Prompt */}
              <div>
                <label className="block text-ui-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  Negative Prompt (What to Avoid)
                </label>
                <input
                  className="field-underline w-full rounded-xl border border-outline-variant/30 bg-surface-container-high p-3 text-ui-label-sm text-on-surface"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Elements to avoid (e.g. text, watermarks, distorted faces)..."
                />
              </div>

              {/* Render Control & Progress */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-outline-variant/20">
                <div className="flex items-center gap-3">
                  <span className="text-ui-label-sm text-on-surface-variant">
                    Target: <strong className="text-on-surface capitalize">{targetKind.replace('_', ' ')}</strong> ({aspectRatio})
                  </span>
                  {rendering && (
                    <span className="flex items-center gap-2 text-ui-label-sm text-primary font-semibold animate-pulse">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      {statusMsg}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('presets')}
                    className="btn-ghost text-ui-label-sm"
                  >
                    Back to Styles
                  </button>

                  <button
                    type="button"
                    onClick={handleStartRender}
                    disabled={rendering || !editablePrompt.trim()}
                    className="btn-primary py-2.5 px-6 flex items-center gap-2 font-bold shadow-md cursor-pointer"
                  >
                    <I name={rendering ? 'hourglass_empty' : 'brush'} cls={`text-[18px] ${rendering ? 'animate-spin' : ''}`} />
                    <span>{rendering ? 'Generating Art…' : 'Generate Artwork'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GALLERY & DAY VARIATIONS */}
          {activeTab === 'gallery' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-ui-label-sm text-on-surface-variant">
                  Generated cover art and infographics for Day {dayNumber}. Select your preferred version to display.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('presets')}
                  className="btn-primary text-ui-label-xs py-1.5 px-3 flex items-center gap-1.5"
                >
                  <I name="add" cls="text-[16px]" /> Craft New Artwork
                </button>
              </div>

              {loadingAssets && dayAssets.length === 0 && (
                <div className="py-12 text-center text-on-surface-variant">
                  <p className="text-ui-label-md">Loading day visual history…</p>
                </div>
              )}

              {!loadingAssets && dayAssets.length === 0 && (
                <div className="py-12 text-center rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-high/40">
                  <I name="palette" cls="text-[36px] text-on-surface-variant/60" />
                  <p className="text-ui-label-md font-bold text-on-surface mt-2">No generated artwork yet for this day</p>
                  <p className="text-ui-label-xs text-on-surface-variant max-w-sm mx-auto mt-1 mb-4">
                    Use the Style & Atmosphere tab to design your first tone-setting cover art or infographic.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('presets')}
                    className="btn-primary text-ui-label-sm py-2 px-4"
                  >
                    Create Day Artwork
                  </button>
                </div>
              )}

              {dayAssets.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {dayAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`group relative overflow-hidden rounded-2xl border transition-all ${
                        asset.is_active
                          ? 'border-primary ring-2 ring-primary/40 bg-surface-container-high'
                          : 'border-outline-variant/30 bg-surface-container-lowest hover:border-outline-variant'
                      }`}
                    >
                      {/* Asset Image Preview */}
                      <div className="relative h-44 w-full bg-surface-container-highest overflow-hidden flex items-center justify-center">
                        {asset.status === 'ready' && asset.has_content ? (
                          <img
                            src={assets.mediaUrl(asset.id)}
                            alt={asset.prompt}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : asset.status === 'rendering' ? (
                          <div className="flex flex-col items-center justify-center gap-2 text-primary animate-pulse">
                            <I name="hourglass_empty" cls="text-[28px] animate-spin" />
                            <span className="text-ui-label-xs font-semibold">Rendering…</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-error p-3 text-center">
                            <I name="error" cls="text-[24px]" />
                            <span className="text-[11px] mt-1">{asset.error || 'Failed'}</span>
                          </div>
                        )}

                        {/* Active Badge */}
                        {asset.is_active && (
                          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-on-primary shadow-xs">
                            <I name="check" cls="text-[12px]" /> Active Display
                          </span>
                        )}

                        {/* Kind Badge */}
                        <span className="absolute top-2.5 right-2.5 rounded-full bg-surface-container-highest/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-on-surface uppercase tracking-wider">
                          {asset.kind.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Card Meta & Actions */}
                      <div className="p-3.5 space-y-2">
                        <p className="text-ui-label-xs text-on-surface line-clamp-2 font-medium">
                          {asset.prompt}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/15">
                          <span>{asset.style_preset ? asset.style_preset.replace(/_/g, ' ') : asset.provider}</span>
                          <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          {!asset.is_active && asset.status === 'ready' && (
                            <button
                              type="button"
                              onClick={() => handleSetActive(asset.id)}
                              className="btn-outline text-ui-label-xs py-1 px-2.5 flex-1 flex items-center justify-center gap-1"
                            >
                              <I name="check_circle" cls="text-[14px]" /> Set as Active
                            </button>
                          )}

                          {asset.status === 'ready' && asset.has_content && (
                            <button
                              type="button"
                              onClick={() => window.open(assets.mediaUrl(asset.id, true), '_blank')}
                              className="btn-ghost text-ui-label-xs py-1 px-2 flex items-center gap-1"
                              title="Download full resolution"
                            >
                              <I name="download" cls="text-[14px]" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(asset.id)}
                            className="btn-ghost text-ui-label-xs py-1 px-2 text-on-surface-variant hover:text-error"
                            title="Delete variation"
                          >
                            <I name="delete" cls="text-[14px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
