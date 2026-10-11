import { useState, useEffect, useRef } from 'react'
import { studies, ttsVoicePreferences, type TTSChoice } from '../lib/studies'

interface VoicePickerModalProps {
  isOpen: boolean
  onClose: () => void
  voices: TTSChoice[]
  selectedVoice: TTSChoice | null
  onSelectVoice: (voice: TTSChoice) => void
}

type FilterCategory = 'all' | 'english' | 'biblical' | 'european' | 'asian'

export default function VoicePickerModal({
  isOpen,
  onClose,
  voices,
  selectedVoice,
  onSelectVoice,
}: VoicePickerModalProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<FilterCategory>('all')
  const [samplingVoice, setSamplingVoice] = useState<string | null>(null)
  const [customSampleText, setCustomSampleText] = useState('')
  const [showCustomTester, setShowCustomTester] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Stop sampling audio on modal close or unmount
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      setSamplingVoice(null)
      setSampleError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const getVoiceCategory = (v: TTSChoice): FilterCategory => {
    const s = v.short_name.toLowerCase()
    const l = (v.locale || '').toLowerCase()
    if (s.includes('en') || l.startsWith('en')) return 'english'
    if (s.includes('el') || s.includes('la') || s.includes('iw') || s.includes('he')) return 'biblical'
    if (
      s.includes('es') ||
      s.includes('fr') ||
      s.includes('de') ||
      s.includes('it') ||
      s.includes('pt') ||
      s.includes('nl')
    )
      return 'european'
    if (s.includes('ja') || s.includes('ko') || s.includes('zh')) return 'asian'
    return 'all'
  }

  const getFlag = (v: TTSChoice): string => {
    const s = v.short_name.toLowerCase()
    if (s.includes('us')) return '🇺🇸'
    if (s.includes('gb') || s.includes('uk')) return '🇬🇧'
    if (s.includes('au')) return '🇦🇺'
    if (s.includes('ca')) return '🇨🇦'
    if (s.includes('in')) return '🇮🇳'
    if (s.includes('ie')) return '🇮🇪'
    if (s.includes('za')) return '🇿🇦'
    if (s.includes('mx')) return '🇲🇽'
    if (s.includes('es')) return '🇪🇸'
    if (s.includes('fr')) return '🇫🇷'
    if (s.includes('de')) return '🇩🇪'
    if (s.includes('it')) return '🇮🇹'
    if (s.includes('br')) return '🇧🇷'
    if (s.includes('pt')) return '🇵🇹'
    if (s.includes('el')) return '🇬🇷'
    if (s.includes('la')) return '🏛️'
    if (s.includes('ja')) return '🇯🇵'
    if (s.includes('ko')) return '🇰🇷'
    if (s.includes('zh')) return '🇨🇳'
    if (s.includes('en')) return '🌐'
    return '🎙️'
  }

  const filteredVoices = voices.filter((v) => {
    const matchesSearch =
      !search ||
      v.friendly_name.toLowerCase().includes(search.toLowerCase()) ||
      v.short_name.toLowerCase().includes(search.toLowerCase()) ||
      (v.accent && v.accent.toLowerCase().includes(search.toLowerCase())) ||
      v.locale.toLowerCase().includes(search.toLowerCase())

    if (!matchesSearch) return false

    if (category === 'all') return true
    if (category === 'english') return getVoiceCategory(v) === 'english'
    if (category === 'biblical') return getVoiceCategory(v) === 'biblical'
    if (category === 'european') return getVoiceCategory(v) === 'european'
    if (category === 'asian') return getVoiceCategory(v) === 'asian'
    return true
  })

  const playVoiceSample = (voice: TTSChoice) => {
    setSampleError(null)

    // Toggle off if currently sampling this voice
    if (samplingVoice === voice.short_name) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      setSamplingVoice(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    setSamplingVoice(voice.short_name)

    const sampleUrl = studies.ttsSampleUrl(
      voice.short_name,
      customSampleText.trim() || undefined
    )

    const audio = new Audio(sampleUrl)
    audioRef.current = audio

    audio.onended = () => {
      setSamplingVoice(null)
    }

    audio.onerror = () => {
      // Fallback to browser SpeechSynthesis if backend audio is unreachable
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const text =
          customSampleText.trim() ||
          (voice.locale.startsWith('es')
            ? 'Lámpara es a mis pies tu palabra, y lumbrera a mi camino.'
            : voice.locale.startsWith('fr')
              ? 'Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.'
              : 'The Lord is my shepherd; I shall not want. Faith comes by hearing.')
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = voice.locale || 'en-US'
        utterance.onend = () => setSamplingVoice(null)
        utterance.onerror = () => {
          setSamplingVoice(null)
          setSampleError('Sample playback failed')
        }
        window.speechSynthesis.speak(utterance)
      } else {
        setSamplingVoice(null)
        setSampleError('Sample playback failed')
      }
    }

    audio.play().catch(() => {
      // Browser autoplay restriction fallback or audio error
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const text =
          customSampleText.trim() || 'The Lord is my shepherd; I shall not want.'
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = voice.locale || 'en-US'
        utterance.onend = () => setSamplingVoice(null)
        utterance.onerror = () => setSamplingVoice(null)
        window.speechSynthesis.speak(utterance)
      } else {
        setSamplingVoice(null)
      }
    })
  }

  const handleSelect = (v: TTSChoice) => {
    onSelectVoice(v)
    ttsVoicePreferences.setPreferredVoice(v.short_name)
    onClose()
  }

  return (
    <div
      id="voice-picker-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        id="voice-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-modal-title"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 bg-surface-container-low/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[24px]">graphic_eq</span>
            </div>
            <div>
              <h2
                id="voice-modal-title"
                className="font-headline-md text-headline-md font-bold text-on-surface leading-tight"
              >
                AI Narrator Voices
              </h2>
              <p className="text-ui-label-xs text-on-surface-variant">
                Sample and choose your preferred study voice
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-voice-picker-modal-btn"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Search & Category Filter Chips */}
        <div className="p-4 sm:px-6 border-b border-outline-variant/10 space-y-3 bg-surface-container-lowest">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              id="voice-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by accent, language, or country (e.g. British, US, Greek)..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-ui-label-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              id="filter-all-voices"
              onClick={() => setCategory('all')}
              className={`h-7 px-3 rounded-full text-ui-label-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'all'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              All Voices ({voices.length})
            </button>
            <button
              type="button"
              id="filter-english-voices"
              onClick={() => setCategory('english')}
              className={`h-7 px-3 rounded-full text-ui-label-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'english'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              English Accents
            </button>
            <button
              type="button"
              id="filter-biblical-voices"
              onClick={() => setCategory('biblical')}
              className={`h-7 px-3 rounded-full text-ui-label-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'biblical'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Biblical & Ancient
            </button>
            <button
              type="button"
              id="filter-european-voices"
              onClick={() => setCategory('european')}
              className={`h-7 px-3 rounded-full text-ui-label-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'european'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              European
            </button>
            <button
              type="button"
              id="filter-asian-voices"
              onClick={() => setCategory('asian')}
              className={`h-7 px-3 rounded-full text-ui-label-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'asian'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Asian
            </button>
          </div>
        </div>

        {/* Custom phrase tester drawer toggle */}
        <div className="px-6 py-2 bg-surface-container-low/40 border-b border-outline-variant/10 flex items-center justify-between text-ui-label-xs text-on-surface-variant">
          <button
            type="button"
            id="toggle-custom-sample-btn"
            onClick={() => setShowCustomTester(!showCustomTester)}
            className="flex items-center gap-1 text-primary hover:underline font-semibold cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">
              {showCustomTester ? 'expand_less' : 'tune'}
            </span>
            <span>{showCustomTester ? 'Hide sample tester' : 'Customize sample preview sentence'}</span>
          </button>
          {samplingVoice && (
            <span className="flex items-center gap-1.5 text-primary font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              Sampling audio...
            </span>
          )}
        </div>

        {showCustomTester && (
          <div className="px-6 py-3 bg-surface-container-low/70 border-b border-outline-variant/20 flex gap-2 items-center">
            <input
              type="text"
              id="custom-sample-sentence-input"
              value={customSampleText}
              onChange={(e) => setCustomSampleText(e.target.value)}
              placeholder="e.g. For God so loved the world that He gave His only begotten Son..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-ui-label-sm text-on-surface focus:outline-none focus:border-primary"
            />
            {customSampleText && (
              <button
                type="button"
                onClick={() => setCustomSampleText('')}
                className="text-xs text-on-surface-variant hover:text-on-surface px-2"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {sampleError && (
          <div className="px-6 py-2 bg-error/10 text-error text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{sampleError}</span>
          </div>
        )}

        {/* Voices List */}
        <div
          id="voices-list-container"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 max-h-[55vh]"
        >
          {filteredVoices.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] opacity-40 mb-2">
                sentiment_dissatisfied
              </span>
              <p className="font-ui-label-md">No voices matched "{search}".</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setCategory('all')
                }}
                className="mt-2 text-xs text-primary underline cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filteredVoices.map((voice) => {
              const isSelected = selectedVoice?.short_name === voice.short_name
              const isSampling = samplingVoice === voice.short_name

              return (
                <div
                  key={voice.short_name}
                  id={`voice-card-${voice.short_name}`}
                  className={`group relative p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-primary/5 border-primary/60 shadow-sm'
                      : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/20 hover:border-outline-variant/50'
                  }`}
                >
                  {/* Left: Flag & Voice Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-2xl shrink-0 select-none">{getFlag(voice)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-ui-label-md font-bold text-on-surface truncate">
                          {voice.friendly_name}
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full bg-primary text-on-primary font-caption-caps text-[10px] font-bold tracking-wide uppercase">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-ui-label-xs text-on-surface-variant">
                        {voice.accent && (
                          <span className="px-2 py-0.5 rounded bg-surface-container-high font-medium text-on-surface-variant">
                            {voice.accent}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-secondary">
                          {voice.locale || voice.short_name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Sample Audio Button & Select Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Sample Button */}
                    <button
                      type="button"
                      id={`sample-voice-btn-${voice.short_name}`}
                      onClick={() => playVoiceSample(voice)}
                      className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-ui-label-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                        isSampling
                          ? 'bg-primary text-on-primary shadow-sm animate-pulse'
                          : 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30'
                      }`}
                      title={`Listen to sample of ${voice.friendly_name}`}
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        {isSampling ? 'pause' : 'volume_up'}
                      </span>
                      <span>{isSampling ? 'Playing' : 'Sample'}</span>
                    </button>

                    {/* Choose / Active Button */}
                    <button
                      type="button"
                      id={`select-voice-btn-${voice.short_name}`}
                      onClick={() => handleSelect(voice)}
                      disabled={isSelected}
                      className={`h-9 px-3.5 rounded-full flex items-center gap-1 text-ui-label-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary/20 text-primary cursor-default opacity-90'
                          : 'bg-on-background text-surface hover:opacity-90 active:scale-95 shadow-xs'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isSelected ? 'check' : 'done'}
                      </span>
                      <span>{isSelected ? 'Chosen' : 'Choose'}</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-outline-variant/15 bg-surface-container-low/50 flex items-center justify-between">
          <div className="text-ui-label-xs text-on-surface-variant">
            Current narrator:{' '}
            <strong className="text-on-surface font-semibold">
              {selectedVoice?.friendly_name || selectedVoice?.short_name || 'Google English'}
            </strong>
          </div>
          <button
            type="button"
            id="done-voice-picker-modal-btn"
            onClick={onClose}
            className="btn-primary text-xs py-1.5 px-4 rounded-full font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
