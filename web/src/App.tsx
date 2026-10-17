import { useEffect, useRef, useState, createContext, useContext } from 'react'
import { Link, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import StatusDock from './components/StatusDock'
import AuthScreen from './components/AuthScreen'
import ProfileModal from './components/ProfileModal'
import { api } from './lib/api'
import { auth, type AuthUser } from './lib/auth'
import { studies as studyApi, bible, preferences, passages, TRADITIONS, voicePreferences, ttsVoicePreferences, type StudyOut, type DayOut, type DayDraft, type TranslationInfo, type CompareVerse, type PassageOut, type SearchHit, type TTSChoice, ttsDefaultVoices } from './lib/studies'

import SourceReaderModal, { type AnySource } from './components/SourceReaderModal'
import QuestionsSection from './components/QuestionsSection'
import CommentarySection from './components/CommentarySection'
import BiblicalMapSection from './components/BiblicalMapSection'
import PrayerSection from './components/PrayerSection'
import InfographicViewer from './components/InfographicViewer'
import PromptCrafterModal from './components/PromptCrafterModal'
import VoicePickerModal from './components/VoicePickerModal'
import DayGenerationProgress from './components/DayGenerationProgress'
import HelpGuideModal from './components/HelpGuideModal'
import { assets as assetApi, type AssetOut } from './lib/studies'
import { initAppearance, getStoredTheme, getStoredFontScale, applyTheme, applyFontScale, type ThemeMode } from './lib/theme'
import { keysApi } from './lib/keys'

const STATUS_CLS: Record<string, string> = {
  pending: 'text-outline',
  generating: 'text-tertiary',
  ready: 'text-primary',
  failed: 'text-error',
}

const StudyTitleCtx = createContext<{ title: string | null; dayNum?: number; totalDays?: number; tradition?: string } | null>(null)
const SetStudyTitleCtx = createContext<((v: { title: string; dayNum?: number; totalDays?: number; tradition?: string } | null) => void) | null>(null)
export const OpenProfileCtx = createContext<(tab?: 'profile' | 'byok' | 'admin') => void>(() => {})
export const OpenHelpCtx = createContext<() => void>(() => {})

export interface AudioControllerState {
  hasAudio: boolean
  isPlaying: boolean
  isRendering: boolean
  isExpanded: boolean
  togglePlay: () => void
  setIsExpanded: (expanded: boolean) => void
  toggleExpanded: () => void
  section?: string
}

export const AudioControllerCtx = createContext<{
  state: AudioControllerState
  register: (ctrl: Partial<AudioControllerState> | null) => void
}>({
  state: {
    hasAudio: false,
    isPlaying: false,
    isRendering: false,
    isExpanded: false,
    togglePlay: () => {},
    setIsExpanded: () => {},
    toggleExpanded: () => {},
  },
  register: () => {},
})

export function isKeyError(errText?: string | null): boolean {
  if (!errText) return false
  const lower = errText.toLowerCase()
  return (
    lower.includes('key_required') ||
    lower.includes('no text provider') ||
    lower.includes('all providers failed') ||
    lower.includes('all text providers failed') ||
    lower.includes('api key') ||
    lower.includes('402') ||
    lower.includes('noprovideravailable') ||
    lower.includes('openrouter_free') ||
    lower.includes('gemini_free') ||
    lower.includes('exhausted')
  )
}

export function ApiKeyAlert({ error, className = '', onDismiss }: { error?: string | null; className?: string; onDismiss?: () => void }) {
  const openProfile = useContext(OpenProfileCtx)
  const [hasKey, setHasKey] = useState<boolean>(() => {
    return localStorage.getItem('has_custom_api_key') === 'true'
  })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true
    const checkStatus = async () => {
      try {
        const s = await keysApi.getStatus()
        const userHasKey = Boolean(s.use_custom_keys || s.has_gemini || s.has_openrouter || s.has_anthropic)
        if (mounted) {
          setHasKey(userHasKey)
          localStorage.setItem('has_custom_api_key', userHasKey ? 'true' : 'false')
        }
      } catch {
        // ignore
      }
    }
    checkStatus()

    const onUpdated = () => {
      checkStatus()
    }
    window.addEventListener('apikey_updated', onUpdated)
    return () => {
      mounted = false
      window.removeEventListener('apikey_updated', onUpdated)
    }
  }, [])

  if (hasKey || dismissed) {
    return null
  }

  return (
    <div className={`relative rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-ambient ${className}`}>
      <button
        type="button"
        onClick={() => {
          setDismissed(true)
          if (onDismiss) onDismiss()
        }}
        className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition-colors cursor-pointer"
        title="Dismiss alert"
      >
        <I name="close" cls="text-[16px]" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="material-symbols-outlined text-2xl text-amber-400 shrink-0">key</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-headline-sm text-sm font-bold text-amber-300">
            API Key Required for AI Generation
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
            {error && error.includes('KEY_REQUIRED')
              ? error.replace(/^.*KEY_REQUIRED:\s*/i, '')
              : 'The free AI model pool could not be reached or quota was exhausted. Please configure your free Google Gemini or OpenRouter API key to continue generating study content.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openProfile('byok')}
              className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow cursor-pointer"
            >
              <I name="key" cls="text-[16px]" /> Add API Key (Free)
            </button>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline hover:text-primary-container inline-flex items-center gap-1"
            >
              Get free Gemini Key <I name="open_in_new" cls="text-[13px]" />
            </a>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-on-surface-variant underline hover:text-on-surface inline-flex items-center gap-1"
            >
              Get free OpenRouter Key <I name="open_in_new" cls="text-[13px]" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

const I = ({ name, cls = 'text-[18px]' }: { name: string; cls?: string }) => (
  <span className={`material-symbols-outlined ${cls}`}>{name}</span>
)

/* Reusable collapsible block. Header is a div so the optional `right` slot
   (e.g. a Refresh button) is a sibling, NOT a nested <button> (invalid HTML).
   Clicking the title or the chevron toggles; `right` is independent. */
function CollapsibleSection({ title, icon, defaultOpen = true, children, right, className = '' }: {
  title: React.ReactNode
  icon?: string
  defaultOpen?: boolean
  children: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => !o)
  return (
    <section className={`rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-ambient ${className}`}>
      <div className="flex items-center gap-2 rounded-2xl px-4 py-3 transition-colors hover:bg-surface-container-high border-b border-outline-variant/10">
        <button type="button" onClick={toggle} aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer hover:opacity-80 transition-opacity">
          {icon && <span className="material-symbols-outlined text-[20px] text-primary shrink-0">{icon}</span>}
          <span className="min-w-0 flex-1 truncate font-ui-label-md text-on-surface font-semibold">{title}</span>
        </button>
        {right}
        <button type="button" onClick={toggle} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}
                className="shrink-0 text-on-surface-variant transition-transform cursor-pointer p-1 rounded-full hover:bg-surface-container-high">
          <span className="material-symbols-outlined text-[20px]">{open ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>
      {open && <div className="p-4">{children}</div>}
    </section>
  )
}


export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => auth.accessToken() !== null)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [profileTab, setProfileTab] = useState<'profile' | 'byok' | 'admin'>('profile')
  const [studiesList, setStudiesList] = useState<StudyOut[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [studyTitle, setStudyTitle] = useState<{ title: string; dayNum?: number; totalDays?: number; tradition?: string } | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [fontScale, setFontScale] = useState<number>(() => getStoredFontScale())
  const [showTypographyMenu, setShowTypographyMenu] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)

  useEffect(() => {
    initAppearance()
  }, [])

  const handleDecreaseFont = () => {
    const newScale = Math.max(0.75, Math.round((fontScale - 0.1) * 100) / 100)
    setFontScale(newScale)
    applyFontScale(newScale)
  }

  const handleIncreaseFont = () => {
    const newScale = Math.min(1.5, Math.round((fontScale + 0.1) * 100) / 100)
    setFontScale(newScale)
    applyFontScale(newScale)
  }

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const openProfile = (tab: 'profile' | 'byok' | 'admin' = 'profile') => {
    setProfileTab(tab)
    setIsProfileOpen(true)
  }

  const refreshList = () => {
    setLoadingList(true)
    studyApi.list().then(setStudiesList).catch(() => setStudiesList([])).finally(() => setLoadingList(false))
  }

  const loadUser = () => {
    auth.me().then(setCurrentUser).catch(() => {})
  }

  const handleLogout = async () => {
    await auth.logout()
    setAuthed(false)
    setCurrentUser(null)
    setStudiesList([])
    window.history.back()
  }

  // Any unrecoverable 401 (e.g. refresh expired) drops the user to the login screen.
  useEffect(() => {
    api.setUnauthorizedHandler(() => { setAuthed(false); setCurrentUser(null); setStudiesList([]) })
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this study? This cannot be undone.')) return
    await studyApi.remove(id)
    refreshList()
    loadUser()
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL studies? The Bible translations and verses are kept.')) return
    await studyApi.removeAll()
    window.history.back()
    refreshList()
    loadUser()
  }

  useEffect(() => {
    if (authed) {
      refreshList()
      loadUser()
    }
  }, [authed])

  const [audioState, setAudioState] = useState<AudioControllerState>({
    hasAudio: false,
    isPlaying: false,
    isRendering: false,
    isExpanded: false,
    togglePlay: () => {},
    setIsExpanded: () => {},
    toggleExpanded: () => {},
  })

  const registerAudioController = (ctrl: Partial<AudioControllerState> | null) => {
    if (!ctrl) {
      setAudioState((prev) => ({
        ...prev,
        hasAudio: false,
        isPlaying: false,
        isRendering: false,
        isExpanded: false,
      }))
    } else {
      setAudioState((prev) => ({
        ...prev,
        ...ctrl,
        hasAudio: true,
      }))
    }
  }

  if (!authed) {
    return <AuthScreen onAuthed={() => { setAuthed(true); loadUser() }} />
  }

  return (
    <AudioControllerCtx.Provider value={{ state: audioState, register: registerAudioController }}>
    <OpenHelpCtx.Provider value={() => setIsHelpOpen(true)}>
    <OpenProfileCtx.Provider value={openProfile}>
    <SetStudyTitleCtx.Provider value={setStudyTitle}>
    <StudyTitleCtx.Provider value={studyTitle}>
    <div className="bg-surface text-on-surface antialiased flex flex-col min-h-screen">
      {/* Fixed Apple HIG Top Navigation Bar */}
      <header className="fixed top-0 w-full z-50 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)] border-b border-outline-variant/15">
        <div className="h-14 px-gutter flex items-center justify-between max-w-5xl mx-auto">
          {/* Left: Back to Study/Library */}
          <div className="flex items-center min-w-[80px]">
            {studyTitle ? (
              <button
                onClick={() => window.history.back()}
                className="min-h-[44px] min-w-[44px] -ml-2 flex items-center gap-0.5 text-primary active:opacity-60 transition-opacity cursor-pointer"
                type="button"
                aria-label="Go back"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
                <span className="font-body-ui text-body-ui font-medium">Study</span>
              </button>
            ) : (
              <Link to="/" className="flex items-center gap-1.5 text-primary font-bold tracking-tight hover:opacity-80 transition-opacity">
                <span className="material-symbols-outlined text-[22px]">menu_book</span>
                <span className="font-headline-md text-headline-md leading-none">Crafter</span>
              </Link>
            )}
          </div>

          {/* Center: Session / Study Title */}
          <div className="flex-1 flex flex-col items-center justify-center px-space-xs text-center min-w-0">
            <span className="font-caption-caps text-caption-caps text-secondary tracking-widest uppercase truncate max-w-[260px] sm:max-w-md">
              {studyTitle?.dayNum ? `DAY ${studyTitle.dayNum} · ${studyTitle.title || 'STUDY'}` : 'BIBLE STUDY CRAFTER'}
            </span>
            <span className="font-headline-md text-[17px] sm:text-headline-md text-on-surface truncate max-w-[280px] sm:max-w-md font-serif">
              {studyTitle?.title ? (studyTitle.dayNum ? 'Scripture Reading' : studyTitle.title) : 'Daily Scripture Sanctuary'}
            </span>
          </div>

          {/* Right: Action toolbar (Audio, Typography, Bookmark, Theme, Avatar) */}
          <div className="flex items-center justify-end gap-1 min-w-[80px]">
            {/* Typography settings */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTypographyMenu(!showTypographyMenu)}
                aria-label="Reader typography settings"
                title="Typography & Text Size"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface active:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="font-body-ui text-body-ui font-medium tracking-tight">aA</span>
              </button>

              {showTypographyMenu && (
                <div className="absolute right-0 top-12 w-48 rounded-2xl bg-surface-container-lowest p-3 shadow-lg border border-outline-variant/20 z-50 flex flex-col gap-2">
                  <div className="text-caption-caps font-caption-caps text-secondary uppercase font-semibold">Text Size</div>
                  <div className="flex items-center justify-between rounded-xl bg-surface-container p-1">
                    <button
                      type="button"
                      onClick={handleDecreaseFont}
                      className="px-3 py-1 rounded-lg text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors"
                      title="Smaller Text"
                    >
                      A-
                    </button>
                    <span className="font-caption-caps text-caption-caps font-bold">{Math.round(fontScale * 100)}%</span>
                    <button
                      type="button"
                      onClick={handleIncreaseFont}
                      className="px-3 py-1 rounded-lg text-sm font-bold text-on-surface hover:bg-surface-container-high transition-colors"
                      title="Larger Text"
                    >
                      A+
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bookmark button */}
            <button
              type="button"
              onClick={() => setBookmarked(!bookmarked)}
              aria-label="Bookmark and save"
              title={bookmarked ? 'Bookmarked' : 'Bookmark this study'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface active:bg-surface-container transition-colors cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[20px] ${bookmarked ? 'text-primary' : ''}`}>
                {bookmarked ? 'bookmark' : 'bookmark_border'}
              </span>
            </button>

            {/* Help / Guide button */}
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              title="How to Use BibleStudy-Crafter (Visual Guide)"
              aria-label="How to Use Guide"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface active:bg-surface-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">help_outline</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={handleToggleTheme}
              title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface active:bg-surface-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] text-amber-500">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* User Profile Avatar */}
            <button
              type="button"
              onClick={() => openProfile('profile')}
              title={`Account Settings (${currentUser?.display_name || currentUser?.email || 'Profile'})`}
              className="w-8 h-8 ml-1 rounded-full bg-primary flex items-center justify-center flex-shrink-0 cursor-pointer overflow-hidden shadow-xs"
            >
              {currentUser?.picture_url ? (
                <img src={currentUser.picture_url} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Study Content Area */}
      <main className="flex flex-col relative w-full pt-14 pb-24 bg-surface min-h-screen">
        <Routes>
          <Route path="/" element={<StudyList studies={studiesList} loading={loadingList} onRefresh={refreshList} onDelete={handleDelete} onDeleteAll={handleDeleteAll} />} />
          <Route path="/study/:id" element={<StudyDetail />} />
          <Route path="/study/:id/day/:day" element={<DayDetail />} />
        </Routes>
      </main>

      {/* Fixed Bottom Navigation Bar (Apple HIG mobile tab bar) */}
      <nav className="fixed bottom-0 w-full z-50 pb-safe bg-surface/85 backdrop-blur-xl shadow-[0_-1px_8px_rgba(0,0,0,0.03)] border-t border-outline-variant/15">
        <div className="h-14 px-gutter flex items-center justify-around max-w-lg mx-auto">
          <Link
            to={studyTitle?.dayNum ? `/study/${window.location.pathname.split('/')[2]}/day/${studyTitle.dayNum}` : '/'}
            className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors text-primary font-semibold"
            aria-label="Scripture Reading"
          >
            <span className="material-symbols-outlined text-[22px]">menu_book</span>
            <span className="font-caption-caps text-caption-caps capitalize">Read</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('selah-reflection-card') || document.getElementById('questions-section')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Reflection"
          >
            <span className="material-symbols-outlined text-[22px]">edit_note</span>
            <span className="font-caption-caps text-caption-caps capitalize">Reflect</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('voices-discussions-section')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Voices Discussion"
          >
            <span className="material-symbols-outlined text-[22px]">forum</span>
            <span className="font-caption-caps text-caption-caps capitalize">Discuss</span>
          </button>

          {/* Voice Synthesizer / Audio Reader Icon in Footer */}
          <button
            type="button"
            id="nav-audio-synthesizer-btn"
            onClick={() => {
              if (audioState.hasAudio) {
                if (!audioState.isExpanded) {
                  audioState.setIsExpanded(true)
                } else {
                  audioState.togglePlay()
                }
              }
            }}
            disabled={!audioState.hasAudio}
            className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              !audioState.hasAudio
                ? 'opacity-30 cursor-not-allowed text-on-surface-variant'
                : audioState.isPlaying
                ? 'text-primary font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            aria-label={audioState.isPlaying ? 'Pause Narration' : 'Play Narration'}
            title={
              !audioState.hasAudio
                ? 'Audio narrator available in studies'
                : audioState.isExpanded
                ? audioState.isPlaying
                  ? 'Pause audio'
                  : 'Play audio'
                : audioState.isPlaying
                ? 'Audio playing · Click to show full controls'
                : 'Click to show voice narration controls'
            }
          >
            <div className="relative flex items-center justify-center">
              <span className={`material-symbols-outlined text-[22px] ${audioState.isRendering ? 'animate-spin' : ''}`}>
                {audioState.isRendering
                  ? 'sync'
                  : audioState.isPlaying
                  ? 'pause'
                  : 'play_arrow'}
              </span>
              {audioState.isPlaying && (
                <span className="absolute -top-0.5 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              )}
            </div>
            <span className="font-caption-caps text-caption-caps capitalize">
              {audioState.isRendering ? 'Loading' : audioState.isPlaying ? 'Pause' : 'Listen'}
            </span>
          </button>

          <Link
            to="/"
            className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Library"
          >
            <span className="material-symbols-outlined text-[22px]">local_library</span>
            <span className="font-caption-caps text-caption-caps capitalize">Library</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            aria-label="How to Use & Help"
          >
            <span className="material-symbols-outlined text-[22px]">help_outline</span>
            <span className="font-caption-caps text-caption-caps capitalize">Help</span>
          </button>
        </div>
      </nav>

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false)
          setTheme(getStoredTheme())
          setFontScale(getStoredFontScale())
        }}
        currentUser={currentUser}
        onUserUpdated={(u) => setCurrentUser(u)}
        initialTab={profileTab}
        onLogout={handleLogout}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <HelpGuideModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      <StatusDock />
    </div>
    </StudyTitleCtx.Provider>
    </SetStudyTitleCtx.Provider>
    </OpenProfileCtx.Provider>
    </OpenHelpCtx.Provider>
    </AudioControllerCtx.Provider>
  )
}

/* ---------- Create form + list ---------- */

function StudyList({ studies, loading, onRefresh, onDelete, onDeleteAll }: {
  studies: StudyOut[]
  loading: boolean
  onRefresh: () => void
  onDelete: (id: number) => void
  onDeleteAll: () => void
}) {
  const navigate = useNavigate()
  const openHelp = useContext(OpenHelpCtx)
  const [topic, setTopic] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [days, setDays] = useState(7)
  const [tradition, setTradition] = useState('non_denominational')
  const [version, setVersion] = useState('KJV')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // verse pool: search the corpus for the topic and let the user pick
  const [allTranslations, setAllTranslations] = useState<TranslationInfo[]>([])
  const [hits, setHits] = useState<SearchHit[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    bible.translations().then(setAllTranslations).catch(() => setAllTranslations([]))
  }, [])

  const runSearch = async () => {
    if (!topic.trim()) { setErr('Enter a topic first to find relevant verses'); return }
    setSearching(true)
    try {
      const results = await bible.search(topic.trim(), version, 50)
      setHits(results)
      setSearched(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  const toggle = (ref: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref); else next.add(ref)
      return next
    })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!topic.trim()) { setErr('Topic is required'); return }
    setBusy(true)
    try {
      const res = await studyApi.create({
        topic: topic.trim(), minutes_per_day: minutes, total_days: days,
        tradition, primary_translation: version,
        selected_refs: picked.size > 0 ? [...picked] : undefined,
      })
      navigate(`/study/${res.study_id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Step 1: Subject */}
      <section className="bg-surface-container rounded-3xl p-8 shadow-ambient">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="step-badge">1</div>
            <h2 className="font-headline-md text-headline-md text-on-surface">Subject of Inquiry</h2>
          </div>
          <button
            type="button"
            onClick={openHelp}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/20 cursor-pointer shadow-2xs"
            title="Open visual How to Use Guide"
          >
            <span className="material-symbols-outlined text-[16px]">help</span>
            How to Use Guide
          </button>
        </div>
        <form onSubmit={submit} className="space-y-6">
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm focus-within:shadow-md transition-shadow">
            <label className="mb-1 block font-ui-label-sm text-ui-label-sm uppercase tracking-wider text-on-surface-variant" htmlFor="study-topic">
              Primary Topic, Book, or Theme
            </label>
            <input id="study-topic"
              className="w-full bg-transparent border-0 outline-none font-body-reading text-body-reading text-on-surface placeholder:text-outline/50"
              placeholder="e.g. The concept of Grace in Romans, or Isaiah 53"
              value={topic}
              onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="font-ui-label-sm text-on-surface-variant py-1">Suggestions:</span>
            {['Sermon on the Mount', 'Pauline Justification', 'Wisdom Literature'].map((s) => (
              <button key={s} type="button"
                className="font-ui-label-sm text-primary bg-primary-container/30 hover:bg-primary-container px-3 py-1 rounded-full transition-colors text-on-primary-container"
                onClick={() => setTopic(s)}>{s}</button>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Minutes / day</span>
              <input type="number" min={5} max={120}
                className="field-underline"
                value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Days</span>
              <input type="number" min={1} max={90}
                className="field-underline"
                value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Theological Lens</span>
              <select
                className="field-underline"
                value={tradition} onChange={(e) => setTradition(e.target.value)}>
                {TRADITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-ui-label-sm uppercase tracking-wider text-on-surface-variant">Preferred Bible version</span>
              <select
                className="field-underline"
                value={version} onChange={(e) => setVersion(e.target.value)}>
                {allTranslations.length > 0
                  ? allTranslations.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)
                  : <option value="KJV">KJV</option>}
              </select>
            </label>
          </div>

          <div className="flex items-end gap-3">
            <button type="button" onClick={runSearch} disabled={searching}
              className="btn-outline disabled:opacity-50">
              <I name="search" cls="text-[18px]" /> {searching ? 'Searching…' : 'Find relevant verses'}
            </button>
            <span className="text-ui-label-sm text-on-surface-variant">Searches the Bible for your topic; tick the verses you want to build the study from.</span>
          </div>

          {hits.length > 0 ? (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-sm">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-ui-label-sm text-on-surface-variant">Showing {hits.length} verses in {version}. Tick to include ({picked.size} selected).</p>
                <button type="button" onClick={() => setPicked(picked.size === hits.length ? new Set() : new Set(hits.map((h) => h.ref)))}
                  className="text-ui-label-sm text-primary hover:text-primary-container">
                  {picked.size === hits.length ? 'Select none' : 'Select all verses'}
                </button>
              </div>
              {hits.map((h) => (
                <label key={h.ref + h.text} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-surface-container-high">
                  <input type="checkbox" className="mt-1 accent-primary" checked={picked.has(h.ref)} onChange={() => toggle(h.ref)} />
                  <span className="text-body-reading"><span className="font-semibold text-primary">{h.ref}</span> — {h.text}</span>
                </label>
              ))}
            </div>
          ) : searched ? (
            <p className="text-ui-label-sm text-on-surface-variant">No verses found for "{topic.trim()}" in {version}. Try a different word.</p>
          ) : null}

          {err && (
            isKeyError(err) ? (
              <ApiKeyAlert error={err} className="my-3" />
            ) : (
              <p className="text-ui-label-sm text-error">{err}</p>
            )
          )}
          <div>
            <button type="submit" disabled={busy}
              className="btn-primary px-8 py-3 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create study'} <I name="arrow_forward" cls="text-[18px]" />
            </button>
          </div>
        </form>
      </section>

      {/* Studies library */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">My Library</h2>
          <div className="flex items-center gap-3">
            {studies.length > 0 && (
              <button onClick={onDeleteAll} className="text-ui-label-md text-error hover:text-error-container">
                Delete all
              </button>
            )}
            <button onClick={onRefresh} className="btn-ghost">
              <I name="refresh" cls="text-[16px]" /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {studies.length === 0 ? (
          <p className="text-ui-label-sm text-on-surface-variant">No studies yet — create one above.</p>
        ) : (
          <ul className="overflow-hidden rounded-3xl border border-outline-variant/20 bg-surface-container-lowest shadow-ambient">
            {studies.map((s) => (
              <li key={s.id} className="group flex items-center border-b border-outline-variant/10 last:border-0">
                <Link to={`/study/${s.id}`}
                  className="flex flex-1 items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-container-high">
                  <span className={`text-[10px] ${STATUS_CLS[s.status]}`}>●</span>
                  <span className="flex-1">
                    <span className="font-ui-label-lg text-on-surface">{s.title || s.topic}</span>
                    <span className="ml-2 text-ui-label-sm text-on-surface-variant">{s.total_days}d · {s.minutes_per_day}m/day · {s.tradition}</span>
                  </span>
                  <span className="text-ui-label-sm text-on-surface-variant">#{s.id}</span>
                </Link>
                <button onClick={() => onDelete(s.id)} title="Delete study"
                  className="px-4 py-4 text-on-surface-variant hover:text-error transition-colors">
                  <I name="delete" cls="text-[18px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ---------- Study detail (poll + render days) ---------- */

function StudyDetail() {
  const params = useParams<{ id: string }>()
  const studyId = Number(params.id)
  const [study, setStudy] = useState<StudyOut | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Live generation progress fed by the SSE event stream.
  const [progress, setProgress] = useState<number | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [dayProgressMap, setDayProgressMap] = useState<Record<number, { progress: number; message: string; step?: string }>>({})
  const esRef = useRef<EventSource | null>(null)
  const setTitle = useContext(SetStudyTitleCtx)

  // Floating Audio Dock & Narration state for study view
  const [activeAudioDayNum, setActiveAudioDayNum] = useState<number>(1)
  const [activeAudioSection, setActiveAudioSection] = useState<string>('all')
  const [audioTrigger, setAudioTrigger] = useState<{ section: string; timestamp: number } | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [playingAudioSection, setPlayingAudioSection] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<TTSChoice | null>(null)
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false)
  const [voices, setVoices] = useState<TTSChoice[]>(ttsDefaultVoices)

  const handlePlayDaySection = (dayNumber: number, sec: string) => {
    setActiveAudioDayNum(dayNumber)
    setActiveAudioSection(sec)
    setAudioTrigger({ section: sec, timestamp: Date.now() })
  }

  const load = () => {
    studyApi.get(studyId).then(setStudy).catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    if (!Number.isInteger(studyId) || studyId < 1) {
      setErr('Invalid study.')
      return
    }
    load()
    timer.current = setInterval(() => {
      studyApi.get(studyId).then((s) => {
        setStudy(s)
        if (s.status === 'ready' || s.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
        }
      }).catch(() => {})
    }, 2000)

    // Stream real-time progress events for this study.
    const es = new EventSource(`${api.url}/api/events`)
    esRef.current = es
    const handleEventData = (raw: string) => {
      try {
        const data = JSON.parse(raw)
        if (data?.study_id === studyId && typeof data.progress === 'number') {
          if (typeof data.day_number === 'number') {
            setDayProgressMap((prev) => ({
              ...prev,
              [data.day_number]: {
                progress: data.progress,
                message: data.message || '',
                step: data.step,
              },
            }))
          }
          setProgress(data.progress)
          setProgressMsg(data.message || '')
        }
      } catch { /* ignore malformed */ }
    }

    es.addEventListener('log', (ev) => handleEventData((ev as MessageEvent).data))
    es.onmessage = (ev) => handleEventData(ev.data)

    return () => {
      if (timer.current) clearInterval(timer.current)
      if (esRef.current) esRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId])

  useEffect(() => {
    if (study) setTitle?.({ title: study.title || study.topic })
    return () => setTitle?.(null)
  }, [study, setTitle])

  const genDay = async (day: number) => {
    setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === day ? { ...d, status: 'generating' } : d) }) : s)
    setDayProgressMap((prev) => ({
      ...prev,
      [day]: { progress: 12, message: `Initiating Day ${day} study generator…`, step: 'init' },
    }))

    const simTimer = setInterval(() => {
      setDayProgressMap((prev) => {
        const cur = prev[day]
        if (!cur || cur.progress >= 92) return prev
        const increment = Math.max(1, Math.round((92 - cur.progress) / 6))
        return {
          ...prev,
          [day]: { ...cur, progress: Math.min(92, cur.progress + increment) },
        }
      })
    }, 1200)

    try {
      const res = await studyApi.generateDay(studyId, day)
      clearInterval(simTimer)
      setDayProgressMap((prev) => ({
        ...prev,
        [day]: { progress: 100, message: `Day ${day} generated successfully!`, step: 'complete' },
      }))
      setTimeout(() => {
        setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === day ? { ...d, status: 'ready', blocks_json: res.draft } : d) }) : s)
      }, 450)
    } catch (e) {
      clearInterval(simTimer)
      setErr(e instanceof Error ? e.message : String(e))
      setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === day ? { ...d, status: 'failed' } : d) }) : s)
    }
  }

  if (err && !study) return <div className="text-error">{err}</div>
  if (!study) return <p className="text-on-surface-variant">Loading…</p>

  const activeAudioDay = study.days.find((d) => d.day_number === activeAudioDayNum && d.blocks_json) ||
                         study.days.find((d) => d.blocks_json) ||
                         study.days[0]

  return (
    <div className="w-full flex flex-col items-center pb-24">
      {study.status === 'failed' && (
        <ApiKeyAlert
          error="AI Generation Failed: The AI provider was unreachable or free quota was exhausted. Please configure your free Gemini or OpenRouter key below to continue."
          className="my-3 w-full max-w-[98%]"
        />
      )}

      {err && (
        isKeyError(err) ? (
          <ApiKeyAlert error={err} className="my-3 w-full max-w-[98%]" />
        ) : (
          <div className="text-error my-3 w-full max-w-[98%]">{err}</div>
        )
      )}

      {study.status === 'generating' && (
        <div className="w-full max-w-[98%] mb-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-ambient">
          <div className="mb-2 flex items-center justify-between text-ui-label-md">
            <span className="text-tertiary">{progressMsg || 'Generating outline & day 1…'}</span>
            <span className="text-on-surface-variant">{progress != null ? `${progress}%` : 'working…'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-outline-variant/30">
            <div className="h-full rounded-full bg-primary transition-all duration-500"
                 style={{ width: `${progress != null ? progress : 8}%` }} />
          </div>
        </div>
      )}

      <div className="w-full max-w-[98%] space-y-4">
        {study.days.map((d) => (
          <DayCard
            key={d.day_number}
            studyId={studyId}
            day={d}
            defaultOpen={d.day_number === 1}
            totalDays={study.total_days}
            studyTopic={study.title || study.topic}
            primaryTranslation={study.primary_translation}
            dayProgress={dayProgressMap[d.day_number] || (study.status === 'generating' && d.day_number === 1 ? { progress: progress ?? 15, message: progressMsg } : undefined)}
            onGenerate={() => genDay(d.day_number)}
            onPlaySection={(sec) => handlePlayDaySection(d.day_number, sec)}
            playingSection={activeAudioDayNum === d.day_number && isPlayingAudio ? playingAudioSection : null}
            isPlayingAudio={activeAudioDayNum === d.day_number && isPlayingAudio}
            selectedVoice={selectedVoice}
            onOpenVoicePicker={() => setIsVoicePickerOpen(true)}
          />
        ))}
      </div>

      {/* Floating Apple Dock Audio Player for Study View */}
      {activeAudioDay && (
        <DayTTS
          studyId={studyId}
          day={activeAudioDay}
          voices={voices}
          setVoices={setVoices}
          selectedVoice={selectedVoice}
          onSelectVoice={setSelectedVoice}
          activeSection={activeAudioSection}
          onChangeSection={setActiveAudioSection}
          externalTrigger={audioTrigger}
          isVoicePickerOpen={isVoicePickerOpen}
          onOpenVoicePicker={() => setIsVoicePickerOpen(true)}
          onCloseVoicePicker={() => setIsVoicePickerOpen(false)}
          onAudioStateChange={(playing, sec) => {
            setIsPlayingAudio(playing)
            setPlayingAudioSection(sec)
          }}
        />
      )}
    </div>
  )
}

/* ---------- Day card with inline editing + select-to-revise ---------- */

/* ---------- Day card with inline editing + select-to-revise ---------- */

function DayCard({
  studyId,
  day,
  onGenerate,
  defaultOpen = false,
  totalDays = 7,
  studyTopic = 'Study',
  primaryTranslation = 'KJV',
  dayProgress,
  onPlaySection,
  playingSection,
  isPlayingAudio,
  selectedVoice,
  onOpenVoicePicker,
}: {
  studyId: number
  day: DayOut
  onGenerate: () => void
  defaultOpen?: boolean
  totalDays?: number
  studyTopic?: string
  primaryTranslation?: string
  dayProgress?: { progress: number; message: string; step?: string }
  onPlaySection?: (section: string) => void
  playingSection?: string | null
  isPlayingAudio?: boolean
  selectedVoice?: TTSChoice | null
  onOpenVoicePicker?: () => void
}) {
  const dayLink = `/study/${studyId}/day/${day.day_number}`
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DayDraft | null>(day.blocks_json ?? null)
  const [notes, setNotes] = useState<Record<string, string>>(day.notes ?? {})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'scripture' | 'commentary' | 'journal' | 'questions' | 'voices' | 'prayer'>('scripture')
  const [isGeneratingClosingPrayer, setIsGeneratingClosingPrayer] = useState(false)
  const draftRef = useRef<DayDraft | null>(draft)
  draftRef.current = draft
  const notesRef = useRef<Record<string, string>>(notes)
  notesRef.current = notes

  // day-level collapse
  const [dayOpen, setDayOpen] = useState(defaultOpen)

  const isGenerating = day.status === 'generating' || Boolean(dayProgress && dayProgress.progress < 100)

  useEffect(() => {
    if (isGenerating) {
      setDayOpen(true)
    }
  }, [isGenerating])

  // Visual Assets & Prompt Crafter State
  const [dayAssets, setDayAssets] = useState<AssetOut[]>([])
  const [isCrafterOpen, setIsCrafterOpen] = useState(false)
  const [crafterInitialTab, setCrafterInitialTab] = useState<'presets' | 'assistant' | 'playground' | 'gallery'>('presets')

  const loadDayAssets = async () => {
    try {
      const list = await assetApi.list(studyId, day.day_number)
      setDayAssets(list)
    } catch {
      setDayAssets([])
    }
  }

  useEffect(() => {
    if (dayOpen) {
      loadDayAssets()
    }
  }, [dayOpen, studyId, day.day_number])

  const activeCover = dayAssets.find((a) => (a.kind === 'cover_art' || a.kind === 'image') && a.is_active) || null
  const activeInfographic = dayAssets.find((a) => a.kind === 'infographic' && a.is_active) || null

  const handleOpenCrafter = (tab: 'presets' | 'assistant' | 'playground' | 'gallery' = 'presets') => {
    setCrafterInitialTab(tab)
    setIsCrafterOpen(true)
  }

  useEffect(() => { if (!editing) setDraft(day.blocks_json ?? null) }, [day.blocks_json, editing])
  useEffect(() => { if (!editing) setNotes(day.notes ?? {}) }, [day.notes, editing])

  const startEdit = () => { setDraft(day.blocks_json ?? null); setErr(null); setEditing(true) }
  const cancel = () => { setDraft(day.blocks_json ?? null); setEditing(false) }

  const save = async () => {
    const current = draftRef.current
    if (!current) return
    setSaving(true)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, current, notesRef.current)
      setDraft(updated.blocks_json ?? null)
      setNotes(updated.notes ?? {})
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async (updatedNotes: Record<string, string>) => {
    const current = draftRef.current
    if (!current) return
    setNotes(updatedNotes)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, current, updatedNotes)
      setNotes(updated.notes ?? updatedNotes)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const [refiningSection, setRefiningSection] = useState<'opening_prayer' | 'commentary' | 'closing_prayer' | null>(null)

  const handleSaveSection = async (section: 'opening_prayer' | 'commentary' | 'closing_prayer', newText: string) => {
    const current = draftRef.current
    if (!current) return
    const updatedDraft = { ...current, [section]: newText }
    setDraft(updatedDraft)
    try {
      const updated = await studyApi.updateDay(studyId, day.day_number, updatedDraft, notesRef.current)
      setDraft(updated.blocks_json ?? updatedDraft)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAIRefineSection = async (section: 'opening_prayer' | 'commentary' | 'closing_prayer', inst: string, sel?: string | null) => {
    setRefiningSection(section)
    setErr(null)
    try {
      const res = await studyApi.reviseDay(studyId, day.day_number, inst, sel || null, section)
      if (res.blocks_json) {
        setDraft(res.blocks_json)
      } else {
        const current = draftRef.current
        if (current) {
          setDraft({ ...current, [section]: res.revised })
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRefiningSection(null)
    }
  }

  const handleGenerateClosingPrayer = async (instruction?: string) => {
    setIsGeneratingClosingPrayer(true)
    setErr(null)
    try {
      const res = await studyApi.generateClosingPrayer(studyId, day.day_number, notes, instruction)
      if (res && res.closing_prayer) {
        const current = draft || day.blocks_json
        if (current) {
          setDraft({ ...current, closing_prayer: res.closing_prayer })
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setIsGeneratingClosingPrayer(false)
    }
  }

  const scrollToTab = (tab: 'scripture' | 'commentary' | 'journal' | 'questions' | 'voices' | 'prayer') => {
    setActiveTab(tab)
    const map: Record<string, string> = {
      scripture: 'scripture-reading-section',
      commentary: 'commentary-section',
      journal: 'selah-reflection-card',
      questions: 'questions-section',
      voices: 'voices-discussions-section',
      prayer: 'closing-prayer-section',
    }
    const targetId = map[tab]
    const el = document.getElementById(targetId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="w-full flex flex-col items-center">
      <article className="w-full max-w-[98%] bg-transparent flex flex-col gap-6">
        {/* Day Card Header Bar (When in study list view) */}
        {!defaultOpen && (
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDayOpen((o) => !o)}
                aria-expanded={dayOpen}
                className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container cursor-pointer"
              >
                <I name={dayOpen ? 'expand_less' : 'expand_more'} cls="text-[22px]" />
              </button>
              <Link to={dayLink} className="min-w-0 flex-1">
                <h3 className="font-headline-md text-headline-md text-on-surface truncate">
                  <span className="text-primary font-semibold">Day {day.day_number}</span>
                  {draft?.heading ? ` — ${draft.heading}` : day.title ? ` — ${day.title}` : ''}
                  {day.theme && <span className="ml-2 font-caption-caps text-secondary text-caption-caps">· {day.theme}</span>}
                </h3>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {isGenerating ? (
                  <span className="text-caption-caps font-caption-caps px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center gap-1.5 animate-pulse font-semibold">
                    <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                    Generating · {dayProgress?.progress != null ? `${dayProgress.progress}%` : 'Working…'}
                  </span>
                ) : (
                  <span className={`text-caption-caps font-caption-caps px-2 py-0.5 rounded bg-secondary-container ${STATUS_CLS[day.status]}`}>
                    {day.status}
                  </span>
                )}
                {!editing && !isGenerating && (
                  <>
                    <button onClick={startEdit} className="btn-outline text-xs py-1 px-2.5">
                      <I name="edit" cls="text-[14px]" /> Edit
                    </button>
                    <button
                      onClick={() => {
                        setDayOpen(true)
                        onGenerate()
                      }}
                      className="btn-outline text-xs py-1 px-2.5"
                    >
                      <I name={day.blocks_json ? 'autorenew' : 'add'} cls="text-[14px]" />
                      {day.blocks_json ? 'Regenerate' : 'Generate'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {isGenerating && (
              <div className="w-full pt-0.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${dayProgress?.progress != null ? dayProgress.progress : 15}%` }}
                  />
                </div>
                {dayProgress?.message && (
                  <p className="text-[11px] text-primary font-medium truncate mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-ping" />
                    {dayProgress.message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {dayOpen && (
          <div className="flex flex-col gap-6 w-full">
            {err && (
              isKeyError(err) ? (
                <ApiKeyAlert error={err} className="mb-2" />
              ) : (
                <p className="mb-2 text-ui-label-sm text-error">{err}</p>
              )
            )}

            {/* Top Apple HIG 32px Segmented Control */}
            <div className="w-full flex justify-center pt-1 pb-2">
              <div className="w-full max-w-[520px] bg-surface-container rounded-xl p-1 flex items-center shadow-inner" role="tablist">
                <button
                  type="button"
                  onClick={() => scrollToTab('scripture')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-center font-label-nav text-label-nav transition-all cursor-pointer ${
                    activeTab === 'scripture'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Scripture
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTab('commentary')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-center font-label-nav text-label-nav transition-all cursor-pointer ${
                    activeTab === 'commentary'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Commentary
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTab('journal')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-center font-label-nav text-label-nav transition-all cursor-pointer ${
                    activeTab === 'journal'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Journal
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTab('questions')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-center font-label-nav text-label-nav transition-all cursor-pointer ${
                    activeTab === 'questions'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Questions
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTab('voices')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-center font-label-nav text-label-nav transition-all cursor-pointer ${
                    activeTab === 'voices'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Voices
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTab('prayer')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-center font-label-nav text-label-nav transition-all cursor-pointer ${
                    activeTab === 'prayer'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Prayer
                </button>
              </div>
            </div>

            {editing && (
              <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3.5 border border-primary/30 shadow-sm">
                <span className="text-body-ui font-medium text-primary flex items-center gap-1.5">
                  <I name="edit_note" cls="text-[18px]" /> Editing Study Day Content
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={cancel} disabled={saving} className="btn-outline text-xs py-1.5 px-3">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs py-1.5 px-3.5">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Session Editorial Header */}
            <header className="flex flex-col pt-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                <span className="font-caption-caps text-caption-caps text-primary tracking-widest uppercase font-semibold">
                  DAY {day.day_number} OF {totalDays} · {studyTopic.toUpperCase()}
                </span>
              </div>
              <h1 className="font-headline-display-mobile md:font-headline-display text-on-surface tracking-tight mb-2">
                {draft?.heading || day.title || `Day ${day.day_number}`}
              </h1>
              {day.theme && (
                <p className="font-headline-md text-headline-md text-secondary font-normal mb-3.5 leading-snug">
                  {day.theme}
                </p>
              )}
              {/* Micro metadata pill row */}
              <div className="flex items-center flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  className="h-[28px] pl-3 pr-2.5 rounded-full bg-surface-container flex items-center gap-1 text-on-surface hover:bg-surface-container-high transition-colors active:scale-95 cursor-pointer shadow-xs border border-outline-variant/20"
                >
                  <span className="font-caption-caps text-caption-caps font-semibold">
                    {primaryTranslation} 1611
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-secondary">expand_more</span>
                </button>
                <span className="inline-flex items-center gap-1 text-secondary font-label-nav text-label-nav">
                  <span className="material-symbols-outlined text-[15px]">schedule</span>
                  6 min read
                </span>
                <span className="text-outline-variant font-body-ui text-[12px]">•</span>
                <button
                  type="button"
                  id="editorial-voice-picker-btn"
                  onClick={onOpenVoicePicker}
                  className="inline-flex items-center gap-1.5 text-tertiary hover:text-primary font-label-nav text-label-nav transition-colors cursor-pointer bg-surface-container/60 hover:bg-surface-container px-2.5 py-0.5 rounded-full border border-outline-variant/20 shadow-xs"
                  title="Choose AI narrator voice"
                >
                  <span className="material-symbols-outlined text-[15px]">graphic_eq</span>
                  <span>{selectedVoice?.friendly_name || selectedVoice?.short_name || 'AI Voice'} Narration</span>
                  <span className="material-symbols-outlined text-[14px]">expand_more</span>
                </button>
              </div>
            </header>

            {draft ? (
              <>
                {isGenerating && (
                  <DayGenerationProgress
                    dayNumber={day.day_number}
                    totalDays={totalDays}
                    studyTopic={studyTopic}
                    progress={dayProgress?.progress ?? 25}
                    message={dayProgress?.message}
                    step={dayProgress?.step}
                    isRegenerating={true}
                    className="mb-4"
                  />
                )}
                <DraftEditor
                  draft={draft}
                  studyId={studyId}
                  day={day.day_number}
                  editing={editing}
                  onChange={setDraft}
                  notes={notes}
                  onNotesChange={setNotes}
                  onSaveNotes={handleSaveNotes}
                  activeCoverAsset={activeCover}
                  activeInfographicAsset={activeInfographic}
                  onOpenPromptCrafter={handleOpenCrafter}
                  onRefreshAssets={loadDayAssets}
                  onSaveSection={handleSaveSection}
                  onAIRefineSection={handleAIRefineSection}
                  refiningSection={refiningSection}
                  primaryTranslation={primaryTranslation}
                  onPlaySection={onPlaySection}
                  playingSection={playingSection}
                  isPlayingAudio={isPlayingAudio}
                />
              </>
            ) : isGenerating ? (
              <DayGenerationProgress
                dayNumber={day.day_number}
                totalDays={totalDays}
                studyTopic={studyTopic}
                progress={dayProgress?.progress ?? 20}
                message={dayProgress?.message}
                step={dayProgress?.step}
                className="my-2"
              />
            ) : (
              <div className="bg-surface-container-lowest rounded-2xl p-8 text-center shadow-sm border border-outline-variant/20">
                <p className="text-body-reading text-on-surface-variant mb-4">
                  This study day is ready to generate.
                </p>
                <button
                  onClick={() => {
                    setDayOpen(true)
                    onGenerate()
                  }}
                  className="btn-primary px-6 py-2.5"
                >
                  <I name="auto_awesome" cls="text-[18px]" /> Generate Day {day.day_number}
                </button>
              </div>
            )}

            <div id="voices-discussions-section">
              <Discussions
                studyId={studyId}
                day={day}
                draft={draft}
                notes={notes}
                onSaveNotes={handleSaveNotes}
              />
            </div>

            {/* Closing Prayer: positioned at the end of the day, generated on demand grounded in notes & voices */}
            <div id="closing-prayer-section" className="w-full">
              {draft?.closing_prayer ? (
                <div className="flex flex-col gap-3">
                  <PrayerSection
                    title="Closing prayer"
                    icon="volunteer_activism"
                    prayer={draft.closing_prayer}
                    note={notes.closing_prayer}
                    onSavePrayer={async (text) => {
                      await handleSaveSection('closing_prayer', text)
                    }}
                    onSaveNote={async (noteVal) => {
                      const nextNotes = { ...notes, closing_prayer: noteVal }
                      await handleSaveNotes(nextNotes)
                    }}
                    onAIRefine={async (inst, sel) => {
                      await handleAIRefineSection('closing_prayer', inst, sel)
                    }}
                    isAIRefining={refiningSection === 'closing_prayer'}
                    onReadAloud={() => onPlaySection?.('closing_prayer')}
                    isReading={isPlayingAudio && playingSection === 'closing_prayer'}
                  />
                  <div className="flex justify-end pr-2">
                    <button
                      type="button"
                      disabled={isGeneratingClosingPrayer}
                      onClick={() => handleGenerateClosingPrayer()}
                      className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer py-1 px-3 rounded-full hover:bg-surface-container"
                      title="Regenerate closing prayer incorporating latest notes and voices"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isGeneratingClosingPrayer ? 'sync' : 'auto_awesome'}
                      </span>
                      <span>{isGeneratingClosingPrayer ? 'Regenerating prayer…' : 'Regenerate Prayer from Notes & Voices'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <section className="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm border border-outline-variant/20 flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-secondary-container/60 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[28px]">volunteer_activism</span>
                  </div>
                  <div className="max-w-lg">
                    <h3 className="font-headline-md text-headline-md text-on-surface">Closing Prayer</h3>
                    <p className="mt-1.5 text-body-reading text-on-surface-variant text-sm leading-relaxed">
                      Conclude your study with a personal closing prayer of response. When you are ready, generate a prayer deeply grounded in today's scripture readings, your personal reflection notes, and the community discussions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateClosingPrayer()}
                    disabled={isGeneratingClosingPrayer}
                    className="btn-primary px-6 py-2.5 flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px] animate-pulse">
                      {isGeneratingClosingPrayer ? 'sync' : 'auto_awesome'}
                    </span>
                    <span>
                      {isGeneratingClosingPrayer
                        ? 'Crafting prayer from notes & scripture…'
                        : 'Generate Closing Prayer'}
                    </span>
                  </button>
                </section>
              )}
            </div>
          </div>
        )}

        {/* Prompt Crafter Studio Modal */}
        <PromptCrafterModal
          isOpen={isCrafterOpen}
          onClose={() => setIsCrafterOpen(false)}
          studyId={studyId}
          dayNumber={day.day_number}
          dayTitle={draft?.heading || day.title || `Day ${day.day_number}`}
          initialTab={crafterInitialTab}
          onAssetSelected={loadDayAssets}
        />
      </article>
    </div>
  )
}

/* ---------- Read / edit renderer ---------- */

function DraftEditor({
  draft,
  editing,
  onChange,
  studyId,
  day,
  notes,
  onNotesChange,
  onSaveNotes,
  activeCoverAsset,
  activeInfographicAsset,
  onOpenPromptCrafter,
  onRefreshAssets,
  onSaveSection,
  onAIRefineSection,
  refiningSection,
  primaryTranslation = 'KJV',
  onPlaySection,
  playingSection,
  isPlayingAudio,
}: {
  draft: DayDraft
  editing: boolean
  onChange: (d: DayDraft) => void
  studyId: number
  day: number
  notes: Record<string, string>
  onNotesChange: (n: Record<string, string>) => void
  onSaveNotes?: (n: Record<string, string>) => Promise<void> | void
  activeCoverAsset?: AssetOut | null
  activeInfographicAsset?: AssetOut | null
  onOpenPromptCrafter?: (initialTab?: 'presets' | 'assistant' | 'playground' | 'gallery') => void
  onRefreshAssets?: () => void
  onSaveSection?: (section: 'opening_prayer' | 'commentary' | 'closing_prayer', newText: string) => Promise<void> | void
  onAIRefineSection?: (section: 'opening_prayer' | 'commentary' | 'closing_prayer', instruction: string, selection?: string | null) => Promise<void> | void
  refiningSection?: 'opening_prayer' | 'commentary' | 'closing_prayer' | null
  primaryTranslation?: string
  onPlaySection?: (section: string) => void
  playingSection?: string | null
  isPlayingAudio?: boolean
}) {
  const setField = (patch: Partial<DayDraft>) => onChange({ ...draft, ...patch })
  const saveNotesHandler = onSaveNotes || onNotesChange
  const [copiedMemoryVerse, setCopiedMemoryVerse] = useState(false)
  const [selahNote, setSelahNote] = useState(notes.selah ?? '')
  const [savedSelahFeedback, setSavedSelahFeedback] = useState(false)
  const [memoryVerseHighlighted, setMemoryVerseHighlighted] = useState<boolean>(
    () => notes.memory_verse_highlighted === 'true'
  )

  // Primary memory verse extraction
  const memoryVerseRef = draft.scripture?.[0]?.ref || 'ACTS 1:8'
  const memoryVerseText =
    draft.scripture?.[0]?.text ||
    '“But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.”'

  const toggleMemoryVerseHighlight = async () => {
    const next = !memoryVerseHighlighted
    setMemoryVerseHighlighted(next)
    const nextNotes = { ...notes, memory_verse_highlighted: String(next) }
    if (saveNotesHandler) await saveNotesHandler(nextNotes)
  }

  const handleCopyMemoryVerse = async () => {
    try {
      await navigator.clipboard.writeText(`${memoryVerseRef} — ${memoryVerseText}`)
      setCopiedMemoryVerse(true)
      setTimeout(() => setCopiedMemoryVerse(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleSaveSelah = async () => {
    const nextNotes = { ...notes, selah: selahNote }
    if (saveNotesHandler) await saveNotesHandler(nextNotes)
    setSavedSelahFeedback(true)
    setTimeout(() => setSavedSelahFeedback(false), 2500)
  }

  const activeArtworkUrl =
    activeCoverAsset && activeCoverAsset.status === 'ready' && activeCoverAsset.has_content
      ? assetApi.mediaUrl(activeCoverAsset.id)
      : 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlwjjFWGLJyNg1evmXVgz9BDI7LgN0qaf6C77zZddgIkhEYBxbr3Ixcxh_3koHw1fPhQXfKYaaaCZw-SrUcwEl0qJnNVC-xYnFd5_5UJInle3j_lsOhoxwK5NG9YBDwvG_xFWuv1uoNfgTWQ2mI_t6yXBuW3dli063RejSo6KVWQHvj1RlYuiYtg2lMVgzfiss1UsoSxbq_2u-r_GBMiJ5uzkLeXJinXeEeihIoH3p6QFTMUaBW6eDPA'

  return (
    <div className="flex flex-col gap-6 text-body-reading text-on-surface">
      {/* Optional Day Heading Edit */}
      {editing && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-3">
          <Labeled label="Day Heading">
            <input
              type="text"
              className="field-underline w-full rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-2 text-ui-label-md font-semibold text-on-surface focus:border-primary focus:outline-none"
              value={draft.heading ?? ''}
              onChange={(e) => setField({ heading: e.target.value })}
              placeholder="e.g. Walking in Grace, The Beatitudes..."
            />
          </Labeled>
        </div>
      )}

      {/* Anchor Scripture Card (Apple Journal Style) */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-caption-caps text-caption-caps tracking-wider text-primary font-semibold uppercase">
            MEMORY VERSE · {memoryVerseRef}
          </span>
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
        </div>
        <blockquote
          className={`font-body-reading text-body-reading italic text-on-surface leading-relaxed select-text transition-all ${
            memoryVerseHighlighted
              ? 'bg-primary/10 rounded-xl p-3 border-l-4 border-primary shadow-xs'
              : 'pl-1'
          }`}
        >
          {memoryVerseText.startsWith('“') ? memoryVerseText : `“${memoryVerseText}”`}
        </blockquote>
        {/* Micro Action Toolbar (28px height buttons) */}
        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
          {onPlaySection && (
            <button
              type="button"
              id="read-aloud-memory-verse-btn"
              onClick={() => onPlaySection('scripture')}
              className={`h-7 px-2.5 rounded-full flex items-center gap-1 active:scale-95 transition-all cursor-pointer ${
                isPlayingAudio && playingSection === 'scripture'
                  ? 'bg-primary text-on-primary shadow-xs animate-pulse'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
              }`}
              title={isPlayingAudio && playingSection === 'scripture' ? 'Pause scripture narration' : 'Listen to scripture reading'}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isPlayingAudio && playingSection === 'scripture' ? 'graphic_eq' : 'volume_up'}
              </span>
              <span className="font-label-nav text-label-nav font-medium">
                {isPlayingAudio && playingSection === 'scripture' ? 'Playing' : 'Listen'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleMemoryVerseHighlight}
            className={`h-7 px-2.5 rounded-full flex items-center gap-1 active:scale-95 transition-all cursor-pointer ${
              memoryVerseHighlighted
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
            }`}
            title={memoryVerseHighlighted ? 'Remove highlight' : 'Highlight memory verse'}
          >
            <span
              className={`material-symbols-outlined text-[14px] ${
                memoryVerseHighlighted ? 'text-on-primary' : 'text-primary'
              }`}
            >
              brush
            </span>
            <span className="font-label-nav text-label-nav font-medium">
              {memoryVerseHighlighted ? 'Highlighted' : 'Highlight'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('selah-reflection-card')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="h-7 px-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">edit_note</span>
            <span className="font-label-nav text-label-nav font-medium">Note</span>
          </button>
          <button
            type="button"
            onClick={handleCopyMemoryVerse}
            className="h-7 px-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">content_copy</span>
            <span className="font-label-nav text-label-nav font-medium">
              {copiedMemoryVerse ? 'Copied!' : 'Copy'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleCopyMemoryVerse}
            aria-label="Share Verse"
            className="h-7 w-7 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center active:scale-95 transition-transform ml-auto cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">ios_share</span>
          </button>
        </div>
      </section>

      {/* Visual Narrative: Sacred Art Piece */}
      <figure className="flex flex-col gap-2">
        <div className="relative w-full h-48 sm:h-64 rounded-2xl overflow-hidden shadow-sm bg-surface-container-high border border-outline-variant/20">
          <img
            className="w-full h-full object-cover object-center"
            alt={activeCoverAsset?.prompt || 'Biblical atmosphere narrative art'}
            src={activeArtworkUrl}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-on-background/50 via-transparent to-transparent"></div>
          <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-surface-container-lowest/85 backdrop-blur-md text-on-surface font-caption-caps text-caption-caps shadow-xs">
            JERUSALEM · C. 33 A.D.
          </span>
        </div>
        <figcaption className="font-body-ui text-label-nav text-secondary flex items-center justify-between px-1">
          <span>{draft.heading || 'Sacred Atmosphere & Scripture Context'}</span>
          <button
            type="button"
            onClick={() => onOpenPromptCrafter?.('presets')}
            className="text-primary font-medium hover:underline text-label-nav cursor-pointer"
          >
            {activeCoverAsset ? 'Customize Art' : 'Expand Art'}
          </button>
        </figcaption>
      </figure>

      {/* Opening Prayer */}
      {draft.opening_prayer && (
        <PrayerSection
          title="Opening prayer"
          icon="volunteer_activism"
          prayer={draft.opening_prayer ?? ''}
          note={notes.opening_prayer}
          onSavePrayer={async (text) => {
            if (onSaveSection) await onSaveSection('opening_prayer', text)
            else setField({ opening_prayer: text })
          }}
          onSaveNote={async (noteVal) => {
            const nextNotes = { ...notes, opening_prayer: noteVal }
            if (saveNotesHandler) await saveNotesHandler(nextNotes)
          }}
          onAIRefine={async (inst, sel) => {
            if (onAIRefineSection) await onAIRefineSection('opening_prayer', inst, sel)
          }}
          isAIRefining={refiningSection === 'opening_prayer'}
          onReadAloud={() => onPlaySection?.('opening_prayer')}
          isReading={Boolean(isPlayingAudio && playingSection === 'opening_prayer')}
        />
      )}

      {/* Primary Scripture Passage Reader (with drop cap & verse numbering) */}
      <div id="scripture-reading-section">
        <PassageEditor
          studyId={studyId}
          day={day}
          fallbackScripture={draft.scripture}
          onChanged={() => {}}
          primaryTranslation={primaryTranslation}
          onReadAloud={() => onPlaySection?.('scripture')}
          isReading={Boolean(isPlayingAudio && playingSection === 'scripture')}
        />
      </div>

      {/* Sleek Inset Disclosure Group (HIG Table View Rows) */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden flex flex-col">
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('scripture-reading-section')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-surface-container transition-colors text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[17px]">menu_book</span>
            </div>
            <div className="flex flex-col">
              <span className="font-body-ui text-body-ui font-medium text-on-surface">
                Read Full Passage ({memoryVerseRef})
              </span>
              <span className="font-label-nav text-label-nav text-secondary">
                The apostolic witness and foundational scripture
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-secondary group-hover:translate-x-0.5 transition-transform text-[18px]">
            chevron_right
          </span>
        </button>
        <div className="h-[1px] bg-surface-container-high ml-14"></div>
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('commentary-section')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-surface-container transition-colors text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[17px]">lightbulb</span>
            </div>
            <div className="flex flex-col">
              <span className="font-body-ui text-body-ui font-medium text-on-surface">
                Theological Insight: {draft.heading || 'Academic Commentary'}
              </span>
              <span className="font-label-nav text-label-nav text-secondary">
                Historical context, linguistic nuances, and hermeneutics
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-secondary group-hover:translate-x-0.5 transition-transform text-[18px]">
            chevron_right
          </span>
        </button>
      </section>

      {/* Commentary Section */}
      <div id="commentary-section">
        <CommentarySection
          commentary={draft.commentary ?? ''}
          note={notes.commentary}
          onSave={async (text) => {
            if (onSaveSection) await onSaveSection('commentary', text)
            else setField({ commentary: text })
          }}
          onSaveNote={async (noteVal) => {
            const nextNotes = { ...notes, commentary: noteVal }
            if (saveNotesHandler) await saveNotesHandler(nextNotes)
          }}
          onAIRefine={async (inst, sel) => {
            if (onAIRefineSection) await onAIRefineSection('commentary', inst, sel)
          }}
          isAIRefining={refiningSection === 'commentary'}
          onReadAloud={() => onPlaySection?.('commentary')}
          isReading={Boolean(isPlayingAudio && playingSection === 'commentary')}
        />
      </div>

      {/* Biblical Geography & Setting: Historical Period & Modern Context Maps */}
      {draft.commentary && (
        <BiblicalMapSection
          studyId={studyId}
          dayNumber={day}
          commentary={draft.commentary}
          hasCommentary={Boolean(draft.commentary)}
          cachedMaps={draft.maps}
          onMapsLoaded={(maps) => setField({ maps })}
        />
      )}

      {/* Key Learnings & Infographic */}
      {draft.commentary && (
        <CollapsibleSection title="Key Learnings & Visual Infographic" icon="insights" defaultOpen>
          <InfographicViewer
            studyId={studyId}
            dayNumber={day}
            dayTheme={draft.heading}
            hasCommentary={Boolean(draft.commentary)}
            onOpenPromptCrafter={onOpenPromptCrafter}
            activeInfographicAsset={activeInfographicAsset}
            onAssetChanged={onRefreshAssets}
          />
        </CollapsibleSection>
      )}

      {/* Selah Contemplative Pause & Quick Reflection */}
      <section id="selah-reflection-card" className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/20 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-tertiary"></span>
          <span className="font-caption-caps text-caption-caps tracking-widest text-tertiary uppercase font-semibold">
            SELAH · DAILY REFLECTION
          </span>
        </div>
        <p className="font-headline-md text-headline-md text-on-surface leading-snug">
          Where is God calling you to step forward with faith and boldness today?
        </p>
        <div className="bg-surface-container-low rounded-xl p-3.5 flex flex-col gap-2.5">
          <textarea
            className="w-full bg-transparent resize-none outline-none font-body-journal text-body-journal text-on-surface placeholder:text-secondary placeholder:font-body-journal"
            placeholder="Jot down a prompt reflection, personal prayer, or insight on your heart…"
            rows={3}
            value={selahNote}
            onChange={(e) => setSelahNote(e.target.value)}
          />
          <div className="flex items-center justify-between pt-1">
            <span className="font-caption-caps text-caption-caps text-secondary">
              {savedSelahFeedback ? 'Saved to your study journal ✓' : 'Private & Synced with your account'}
            </span>
            <button
              type="button"
              onClick={handleSaveSelah}
              className="h-[30px] px-3.5 rounded-full bg-on-background text-surface hover:opacity-90 active:scale-95 transition-all font-label-nav text-label-nav font-medium flex items-center gap-1 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
              <span>Save Entry</span>
            </button>
          </div>
        </div>
      </section>

      {/* Reflection Questions */}
      <div id="questions-section">
        <CollapsibleSection title="Reflection questions" icon="help" defaultOpen>
          <QuestionsSection
            questions={draft.questions ?? []}
            notes={notes}
            onSaveNotes={saveNotesHandler}
            editing={editing}
            onQuestionsChange={(q) => setField({ questions: q })}
            onReadAloud={() => onPlaySection?.('questions')}
            isReading={Boolean(isPlayingAudio && playingSection === 'questions')}
          />
        </CollapsibleSection>
      </div>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-ui-label-sm uppercase tracking-wide text-on-surface-variant">{label}</div>
      {children}
    </div>
  )
}

/* ---------- Day detail view for /study/:id/day/:day ---------- */

function DayDetail() {
  const params = useParams<{ id: string; day: string }>()
  const studyId = Number(params.id)
  const dayNum = Number(params.day)

  const [study, setStudy] = useState<StudyOut | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [dayProgress, setDayProgress] = useState<{ progress: number; message: string; step?: string } | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const setTitle = useContext(SetStudyTitleCtx)

  const load = () => {
    if (!Number.isInteger(studyId) || studyId < 1) return
    studyApi.get(studyId).then(setStudy).catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    if (!Number.isInteger(studyId) || studyId < 1) {
      setErr('Invalid study.')
      return
    }
    load()
    timer.current = setInterval(() => {
      studyApi.get(studyId).then((s) => {
        setStudy(s)
        if (s.status === 'ready' || s.status === 'failed') {
          if (timer.current) clearInterval(timer.current)
        }
      }).catch(() => {})
    }, 2000)

    const es = new EventSource(`${api.url}/api/events`)
    esRef.current = es
    const handleEventData = (raw: string) => {
      try {
        const data = JSON.parse(raw)
        if (data?.study_id === studyId && typeof data.progress === 'number') {
          if (data.day_number === dayNum || (data.day_number == null && study?.status === 'generating')) {
            setDayProgress({
              progress: data.progress,
              message: data.message || '',
              step: data.step,
            })
          }
          setProgress(data.progress)
          setProgressMsg(data.message || '')
        }
      } catch { /* ignore malformed */ }
    }

    es.addEventListener('log', (ev) => handleEventData((ev as MessageEvent).data))
    es.onmessage = (ev) => handleEventData(ev.data)

    return () => {
      if (timer.current) clearInterval(timer.current)
      if (esRef.current) esRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, dayNum])

  useEffect(() => {
    if (study) setTitle?.({ title: study.title || study.topic, dayNum, totalDays: study.total_days, tradition: study.tradition })
    return () => setTitle?.(null)
  }, [study, setTitle, dayNum])

  const day = study?.days.find((d) => d.day_number === dayNum)

  const [activeAudioSection, setActiveAudioSection] = useState<string>('all')
  const [audioTrigger, setAudioTrigger] = useState<{ section: string; timestamp: number } | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [playingAudioSection, setPlayingAudioSection] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<TTSChoice | null>(null)
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false)
  const [voices, setVoices] = useState<TTSChoice[]>(ttsDefaultVoices)

  const handlePlaySection = (sec: string) => {
    setActiveAudioSection(sec)
    setAudioTrigger({ section: sec, timestamp: Date.now() })
  }

  if (err && !study) return <div className="text-error p-4">{err}</div>
  if (!study) return <p className="text-on-surface-variant p-4">Loading study sanctuary…</p>
  if (!day) return <div className="text-error p-4">Day {dayNum} not found in this study.</div>

  const effectiveDayProgress = dayProgress || (study.status === 'generating' ? { progress: progress ?? 15, message: progressMsg } : undefined)

  return (
    <div className="w-full flex flex-col items-center px-1 sm:px-2 pb-8">
      {study.status === 'generating' && (
        <div className="w-full max-w-[98%] mb-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-ui-label-md">
            <span className="text-tertiary">{progressMsg || 'Crafting study day…'}</span>
            <span className="text-on-surface-variant">{progress != null ? `${progress}%` : 'working…'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-outline-variant/30">
            <div className="h-full rounded-full bg-primary transition-all duration-500"
                 style={{ width: `${progress != null ? progress : 8}%` }} />
          </div>
        </div>
      )}

      <DayCard
        studyId={studyId}
        day={day}
        defaultOpen
        totalDays={study.total_days}
        studyTopic={study.title || study.topic}
        primaryTranslation={study.primary_translation}
        dayProgress={effectiveDayProgress}
        onGenerate={async () => {
          setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === dayNum ? { ...d, status: 'generating' } : d) }) : s)
          setDayProgress({ progress: 12, message: `Initiating Day ${dayNum} study generator…`, step: 'init' })

          const simTimer = setInterval(() => {
            setDayProgress((prev) => {
              if (!prev || prev.progress >= 92) return prev
              const increment = Math.max(1, Math.round((92 - prev.progress) / 6))
              return { ...prev, progress: Math.min(92, prev.progress + increment) }
            })
          }, 1200)

          try {
            const res = await studyApi.generateDay(studyId, dayNum)
            clearInterval(simTimer)
            setDayProgress({ progress: 100, message: `Day ${dayNum} generated successfully!`, step: 'complete' })
            setTimeout(() => {
              setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === dayNum ? { ...d, status: 'ready', blocks_json: res.draft } : d) }) : s)
            }, 450)
          } catch (e) {
            clearInterval(simTimer)
            setErr(e instanceof Error ? e.message : String(e))
            setStudy((s) => s ? ({ ...s, days: s.days.map((d) => d.day_number === dayNum ? { ...d, status: 'failed' } : d) }) : s)
          }
        }}
        onPlaySection={handlePlaySection}
        playingSection={isPlayingAudio ? playingAudioSection : null}
        isPlayingAudio={isPlayingAudio}
        selectedVoice={selectedVoice}
        onOpenVoicePicker={() => setIsVoicePickerOpen(true)}
      />

      {/* Floating Apple Dock Audio Player */}
      <DayTTS
        studyId={studyId}
        day={day}
        voices={voices}
        setVoices={setVoices}
        selectedVoice={selectedVoice}
        onSelectVoice={setSelectedVoice}
        activeSection={activeAudioSection}
        onChangeSection={setActiveAudioSection}
        externalTrigger={audioTrigger}
        isVoicePickerOpen={isVoicePickerOpen}
        onOpenVoicePicker={() => setIsVoicePickerOpen(true)}
        onCloseVoicePicker={() => setIsVoicePickerOpen(false)}
        onAudioStateChange={(playing, sec) => {
          setIsPlayingAudio(playing)
          setPlayingAudioSection(sec)
        }}
      />
    </div>
  )
}

/* ---------- Read aloud: TTS for a day's content (Apple HIG Floating Audio Dock) ---------- */

const SECTION_OPTIONS = [
  { id: 'all', label: 'Entire Day Study', icon: 'auto_stories' },
  { id: 'opening_prayer', label: 'Opening Prayer', icon: 'volunteer_activism' },
  { id: 'scripture', label: 'Scripture Reading', icon: 'menu_book' },
  { id: 'commentary', label: 'Theological Commentary', icon: 'lightbulb' },
  { id: 'questions', label: 'Reflection Questions', icon: 'help' },
  { id: 'closing_prayer', label: 'Closing Prayer', icon: 'volunteer_activism' },
]

function DayTTS({
  studyId,
  day,
  voices = ttsDefaultVoices,
  setVoices,
  selectedVoice,
  onSelectVoice,
  activeSection = 'all',
  onChangeSection,
  externalTrigger,
  isVoicePickerOpen = false,
  onOpenVoicePicker,
  onCloseVoicePicker,
  onAudioStateChange,
}: {
  studyId: number
  day: DayOut
  voices?: TTSChoice[]
  setVoices?: React.Dispatch<React.SetStateAction<TTSChoice[]>>
  selectedVoice?: TTSChoice | null
  onSelectVoice?: (v: TTSChoice) => void
  activeSection?: string
  onChangeSection?: (sec: string) => void
  externalTrigger?: { section: string; timestamp: number } | null
  isVoicePickerOpen?: boolean
  onOpenVoicePicker?: () => void
  onCloseVoicePicker?: () => void
  onAudioStateChange?: (isPlaying: boolean, section: string | null) => void
}) {
  const { register } = useContext(AudioControllerCtx)
  const [internalVoices, setInternalVoices] = useState<TTSChoice[]>(voices.length ? voices : ttsDefaultVoices)
  const [internalVoice, setInternalVoice] = useState<TTSChoice | null>(selectedVoice ?? null)
  const [internalModalOpen, setInternalModalOpen] = useState(false)
  const [currentSection, setCurrentSection] = useState<string>(activeSection || 'all')
  const [isSectionMenuOpen, setIsSectionMenuOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [ttsStatus, setTtsStatus] = useState<{ asset_id?: number; status?: string } | null>(null)
  const [loadingRender, setLoadingRender] = useState(false)
  const ttsRendering = ttsStatus?.status === 'rendering' || loadingRender
  const [err, setErr] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(360)
  const [speed, setSpeed] = useState<number>(1.0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const assetPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sectionMenuRef = useRef<HTMLDivElement | null>(null)

  const effectiveVoices = voices.length ? voices : internalVoices
  const effectiveVoice = selectedVoice !== undefined ? selectedVoice : internalVoice
  const effectiveModalOpen = isVoicePickerOpen !== undefined ? isVoicePickerOpen : internalModalOpen

  const handleVoiceSelect = (v: TTSChoice) => {
    if (onSelectVoice) onSelectVoice(v)
    else setInternalVoice(v)
    setTtsStatus(null)
  }

  const handleOpenModal = () => {
    if (onOpenVoicePicker) onOpenVoicePicker()
    else setInternalModalOpen(true)
  }

  const handleCloseModal = () => {
    if (onCloseVoicePicker) onCloseVoicePicker()
    else setInternalModalOpen(false)
  }

  // Load and cache voices
  useEffect(() => {
    const initVoices = async () => {
      try {
        const res = await studyApi.ttsVoices()
        const list = res.voices.length ? res.voices : ttsDefaultVoices
        if (setVoices) setVoices(list)
        setInternalVoices(list)
        const pref = ttsVoicePreferences.getPreferredVoice()
        const match = list.find((v) => v.short_name === pref)
        if (match) {
          handleVoiceSelect(match)
        } else if (!effectiveVoice) {
          handleVoiceSelect(list[0] ?? ttsDefaultVoices[0] ?? null)
        }
      } catch {
        if (setVoices) setVoices(ttsDefaultVoices)
        setInternalVoices(ttsDefaultVoices)
        if (!effectiveVoice) {
          handleVoiceSelect(ttsDefaultVoices[0] ?? null)
        }
      }
    }
    initVoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync section with parent
  useEffect(() => {
    if (activeSection && activeSection !== currentSection) {
      setCurrentSection(activeSection)
      setTtsStatus(null)
    }
  }, [activeSection])

  // External trigger (clicking Listen on any card)
  useEffect(() => {
    if (externalTrigger && externalTrigger.section) {
      setCurrentSection(externalTrigger.section)
      setIsExpanded(true)
      startRender(externalTrigger.section)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTrigger?.timestamp])

  // Notify parent of playing state
  useEffect(() => {
    onAudioStateChange?.(isPlaying, isPlaying ? currentSection : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSection])

  // Register with footer audio controller
  useEffect(() => {
    register({
      hasAudio: true,
      isPlaying,
      isRendering: ttsRendering,
      isExpanded,
      section: currentSection,
      togglePlay,
      setIsExpanded,
      toggleExpanded: () => setIsExpanded((prev) => !prev),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, ttsRendering, isExpanded, currentSection])

  useEffect(() => {
    return () => {
      register(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Click outside listener for section menu
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node)) {
        setIsSectionMenuOpen(false)
      }
    }
    if (isSectionMenuOpen) {
      document.addEventListener('mousedown', handleDocClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleDocClick)
    }
  }, [isSectionMenuOpen])

  const startRender = async (sectionToRender?: string) => {
    const sec = sectionToRender || currentSection || 'all'
    const voiceToUse = effectiveVoice || effectiveVoices[0] || ttsDefaultVoices[0]
    if (!voiceToUse) return

    setLoadingRender(true)
    setTtsStatus(null)
    setErr(null)
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)

    try {
      const res = await studyApi.ttsRender(studyId, day.day_number, voiceToUse.short_name, sec)
      setTtsStatus(res)
      if (res.status === 'rendering') {
        pollAsset(res.asset_id)
      } else if (res.status === 'ready') {
        startPlayback(res.asset_id)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRender(false)
    }
  }

  const pollAsset = (assetId: number) => {
    if (assetPollRef.current) clearInterval(assetPollRef.current)
    assetPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${api.url}/api/tts/asset/${assetId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${auth.accessToken()}` },
        })
        if (r.status === 200) {
          if (assetPollRef.current) clearInterval(assetPollRef.current)
          setTtsStatus({ asset_id: assetId, status: 'ready' })
          startPlayback(assetId)
        } else if (r.status === 409) {
          if (assetPollRef.current) clearInterval(assetPollRef.current)
          setTtsStatus({ asset_id: assetId, status: 'failed' })
          setErr('Voice rendering failed')
        }
      } catch {
        // keep polling
      }
    }, 1500)
  }

  const startPlayback = (assetId: number) => {
    if (assetPollRef.current) clearInterval(assetPollRef.current)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    const token = auth.accessToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    const src = `${api.url}/api/tts/asset/${assetId}${qs}`
    const audio = new Audio(src)
    audioRef.current = audio
    audio.playbackRate = speed

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime)
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    })
    audio.addEventListener('play', () => setIsPlaying(true))
    audio.addEventListener('pause', () => setIsPlaying(false))
    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setCurrentTime(0)
    })
    audio.addEventListener('error', () => setErr('Playback failed'))
    audio.play().catch(() => {})
  }

  const togglePlay = () => {
    if (!ttsStatus || ttsStatus.status !== 'ready') {
      startRender()
      return
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch(() => {})
      }
    }
  }

  const handleSelectSection = (sec: string) => {
    setCurrentSection(sec)
    onChangeSection?.(sec)
    setTtsStatus(null)
    startRender(sec)
  }

  const skip = (deltaSec: number) => {
    if (!audioRef.current || !duration) return
    const next = Math.max(0, Math.min(duration, audioRef.current.currentTime + deltaSec))
    audioRef.current.currentTime = next
    setCurrentTime(next)
  }

  const cycleSpeed = () => {
    const next = speed === 1.0 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 2.0 : 1.0
    setSpeed(next)
    if (audioRef.current) {
      audioRef.current.playbackRate = next
    }
  }

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const newTime = pos * duration
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const currentSectionMeta = SECTION_OPTIONS.find((s) => s.id === currentSection) || SECTION_OPTIONS[0]

  return (
    <>
      <audio ref={audioRef} />

      {/* Voice Picker Modal */}
      <VoicePickerModal
        isOpen={effectiveModalOpen}
        onClose={handleCloseModal}
        voices={effectiveVoices}
        selectedVoice={effectiveVoice}
        onSelectVoice={handleVoiceSelect}
      />

      {/* Full Control Floating Dock (Positioned cleanly ABOVE the footer) */}
      {isExpanded && (
        <aside
          id="day-tts-player-dock"
          className="fixed bottom-[68px] sm:bottom-[76px] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.25rem)] max-w-[640px] pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {/* Popover for Section Selection */}
          {isSectionMenuOpen && (
            <div
              ref={sectionMenuRef}
              id="tts-section-menu-popover"
              className="mb-2 p-2 rounded-2xl bg-surface-container-lowest/95 backdrop-blur-xl border border-outline-variant/30 shadow-2xl flex flex-col gap-1 text-ui-label-xs animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              <div className="px-3 py-1.5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between border-b border-outline-variant/10">
                <span>Read Section On Demand</span>
                <button
                  type="button"
                  onClick={() => setIsSectionMenuOpen(false)}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
              {SECTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  id={`select-audio-section-${opt.id}`}
                  onClick={() => {
                    setIsSectionMenuOpen(false)
                    handleSelectSection(opt.id)
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                    currentSection === opt.id
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'hover:bg-surface-container text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] opacity-80">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </div>
                  {currentSection === opt.id && (
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Main Glassmorphic Dock */}
          <div className="backdrop-blur-xl bg-surface-container-lowest/95 rounded-2xl sm:rounded-full px-3.5 py-2.5 sm:py-2 flex flex-col sm:flex-row items-center justify-between shadow-2xl border border-outline-variant/30 gap-2 sm:gap-2.5">
            {/* Play/Pause Button & Selectors */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="tts-play-pause-btn"
                  onClick={togglePlay}
                  disabled={ttsRendering}
                  aria-label={isPlaying ? 'Pause Narration' : 'Play Narration'}
                  className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center active:scale-95 transition-transform flex-shrink-0 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {ttsRendering ? 'sync' : isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>

                {/* Quick Section Picker Pill */}
                <button
                  type="button"
                  id="tts-section-picker-btn"
                  onClick={() => setIsSectionMenuOpen(!isSectionMenuOpen)}
                  className="h-7 px-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-semibold flex items-center gap-1 border border-outline-variant/20 transition-all cursor-pointer"
                  title="Change section to read"
                >
                  <span className="material-symbols-outlined text-[14px] text-primary">
                    {currentSectionMeta.icon}
                  </span>
                  <span className="truncate max-w-[95px]">{currentSectionMeta.label}</span>
                  <span className="material-symbols-outlined text-[13px] text-secondary">
                    {isSectionMenuOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </div>

              {/* Quick Voice Picker Pill */}
              <button
                type="button"
                id="tts-voice-picker-btn"
                onClick={handleOpenModal}
                className="h-7 px-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-semibold flex items-center gap-1 border border-outline-variant/20 transition-all cursor-pointer"
                title="Sample & choose AI voices"
              >
                <span className="material-symbols-outlined text-[14px] text-tertiary">graphic_eq</span>
                <span className="truncate max-w-[105px]">
                  {effectiveVoice?.friendly_name || effectiveVoice?.short_name || 'AI Voice'}
                </span>
                <span className="material-symbols-outlined text-[13px] text-secondary">tune</span>
              </button>
            </div>

            {/* Center: Scrubber & Progress */}
            <div className="flex-1 w-full sm:px-1.5 flex flex-col justify-center min-w-0">
              <div className="flex items-center justify-between text-caption-caps font-caption-caps mb-1">
                <span className="font-label-nav text-label-nav text-on-surface font-medium truncate">
                  {ttsRendering
                    ? 'Rendering narration…'
                    : `${day.title || `Day ${day.day_number}`} · ${currentSectionMeta.label}`}
                </span>
                <span className="text-secondary tabular-nums ml-2 font-mono text-[11px]">
                  {formatTime(currentTime)} / {formatTime(duration || 360)}
                </span>
              </div>
              <div
                id="tts-scrubber-track"
                className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden cursor-pointer"
                onClick={handleSeek}
              >
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    ttsRendering ? 'bg-primary/50 animate-pulse' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, (currentTime / (duration || 1)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Right Controls: Rewind, Speed, Forward, Stop, and Minimize */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                type="button"
                id="tts-skip-back-btn"
                onClick={() => skip(-10)}
                aria-label="Rewind 10 seconds"
                title="Rewind 10s"
                className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-on-surface transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">replay_10</span>
              </button>

              <button
                type="button"
                id="tts-speed-btn"
                onClick={cycleSpeed}
                className="h-6 px-1.5 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-nav text-[11px] font-semibold cursor-pointer"
                title="Playback speed"
              >
                {speed}×
              </button>

              <button
                type="button"
                id="tts-skip-forward-btn"
                onClick={() => skip(10)}
                aria-label="Forward 10 seconds"
                title="Forward 10s"
                className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-on-surface transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">forward_10</span>
              </button>

              <button
                type="button"
                id="tts-stop-btn"
                onClick={stopPlayback}
                aria-label="Stop playback"
                title="Stop"
                className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-on-surface transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">stop</span>
              </button>

              <button
                type="button"
                id="tts-minimize-btn"
                onClick={() => setIsExpanded(false)}
                aria-label="Minimize player"
                title="Minimize player to footer"
                className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-on-surface transition-colors cursor-pointer ml-0.5"
              >
                <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
              </button>
            </div>
          </div>

          {err && <p className="text-center text-xs text-error mt-1">{err}</p>}
        </aside>
      )}
    </>
  )
}

/* ---------- Discussions: real, cited reading material about the verses ---------- */

function SourceGrid({
  sources,
  empty,
  onOpenSource,
}: {
  sources: AnySource[]
  empty: string
  onOpenSource: (s: AnySource) => void
}) {
  if (!sources.length) {
    return <p className="text-ui-label-sm text-on-surface-variant/80">{empty}</p>
  }
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {sources.map((s, i) => {
        const summary = (s.snippet || '').trim()
        const borderColor =
          s.sentiment === 'negative'
            ? 'border-l-4 border-l-red-500 hover:border-l-red-400'
            : s.sentiment === 'positive'
              ? 'border-l-4 border-l-emerald-500 hover:border-l-emerald-400'
              : 'border-l-4 border-l-amber-400 hover:border-l-amber-300'

        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenSource(s)}
            className={`voice-card text-left transition-all group w-full cursor-pointer flex flex-col justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/20 hover:shadow-md hover:bg-surface-container ${borderColor}`}
          >
            <div className="w-full">
              <h4 className="font-ui-label-md font-bold text-on-surface group-hover:text-primary leading-snug line-clamp-2">
                {s.title}
              </h4>
              {summary && (
                <p className="mt-2 text-xs text-on-surface-variant/90 line-clamp-3 leading-relaxed font-body-reading">
                  {summary}
                </p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Discussions({
  studyId,
  day,
  draft,
  notes = {},
  onSaveNotes,
}: {
  studyId: number
  day: DayOut
  draft?: DayDraft | null
  notes?: Record<string, string>
  onSaveNotes?: (n: Record<string, string>) => Promise<void> | void
}) {
  const [data, setData] = useState<DayOut['discussions']>(day.discussions ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeSource, setActiveSource] = useState<AnySource | null>(null)
  const [counts, setCounts] = useState(voicePreferences.getCounts())

  const totalVoices = counts.negative + counts.neutral + counts.positive

  const reload = async () => {
    const dayNum = Number(day?.day_number)
    if (!Number.isInteger(dayNum) || dayNum < 1) {
      setErr("Cannot identify which day to fetch discussions for.")
      return
    }
    setBusy(true); setErr(null)
    try {
      const res = await studyApi.refreshDiscussions(studyId, dayNum, {
        negative_count: counts.negative,
        neutral_count: counts.neutral,
        positive_count: counts.positive,
      })
      setData(res.discussions)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const d = data

  const handleOpenSource = (s: AnySource) => {
    setActiveSource(s)
  }

  const handleSaveModalNote = async (targetKey: string, formattedNoteContent: string) => {
    const nextNotes = {
      ...notes,
      [targetKey]: formattedNoteContent,
    }
    if (onSaveNotes) {
      await onSaveNotes(nextNotes)
    }
  }

  return (
    <>
      <CollapsibleSection
        title="Voices on verses"
        icon="forum"
        defaultOpen={false}
        className="mt-6"
      >

        {/* Sentiment Quota Adjuster Bar */}
        <div className="mb-4 rounded-2xl bg-surface-container-low border border-outline-variant/20 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">tune</span>
              Voices Mix:
            </span>

            {/* Negative Stepper */}
            <div className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-700 dark:text-red-400">
              <span className="font-semibold">Negative:</span>
              <button
                type="button"
                onClick={() => setCounts({ ...counts, negative: Math.max(0, counts.negative - 1) })}
                className="hover:bg-red-500/20 rounded px-1 text-xs font-bold cursor-pointer"
              >
                -
              </button>
              <span className="font-bold min-w-[14px] text-center">{counts.negative}</span>
              <button
                type="button"
                onClick={() => setCounts({ ...counts, negative: counts.negative + 1 })}
                className="hover:bg-red-500/20 rounded px-1 text-xs font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Neutral Stepper */}
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Neutral:</span>
              <button
                type="button"
                onClick={() => setCounts({ ...counts, neutral: Math.max(0, counts.neutral - 1) })}
                className="hover:bg-amber-500/20 rounded px-1 text-xs font-bold cursor-pointer"
              >
                -
              </button>
              <span className="font-bold min-w-[14px] text-center">{counts.neutral}</span>
              <button
                type="button"
                onClick={() => setCounts({ ...counts, neutral: counts.neutral + 1 })}
                className="hover:bg-amber-500/20 rounded px-1 text-xs font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Positive Stepper */}
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-400">
              <span className="font-semibold">Positive:</span>
              <button
                type="button"
                onClick={() => setCounts({ ...counts, positive: Math.max(0, counts.positive - 1) })}
                className="hover:bg-emerald-500/20 rounded px-1 text-xs font-bold cursor-pointer"
              >
                -
              </button>
              <span className="font-bold min-w-[14px] text-center">{counts.positive}</span>
              <button
                type="button"
                onClick={() => setCounts({ ...counts, positive: counts.positive + 1 })}
                className="hover:bg-emerald-500/20 rounded px-1 text-xs font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            <span className="text-xs text-on-surface-variant/80 font-medium">
              (Total: <strong className="text-on-surface">{totalVoices}</strong>)
            </span>
          </div>

          <button
            type="button"
            onClick={reload}
            disabled={busy}
            className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-xl disabled:opacity-50 cursor-pointer"
          >
            <I name="refresh" cls="text-[15px]" />
            {busy ? 'Fetching…' : d ? 'Regenerate Mix' : 'Find Discussions'}
          </button>
        </div>

        {!d && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-ui-label-sm text-on-surface-variant">Real discussion about these verses classified by BERT sentiment. Click "Find Discussions" to load.</p>
          </div>
        )}
        {d && d.status === 'empty' && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-ui-label-sm text-on-surface-variant">No external discussion could be fetched right now. Engage the Scripture directly.</p>
          </div>
        )}
        {d && d.status === 'ok' && (() => {
          const offList = (d.official_sources && d.official_sources.length > 0)
            ? d.official_sources
            : (d.sources || []).filter(s => s.kind === 'official' || (!s.platform && s.kind !== 'social'))

          const socList = (d.social_sources && d.social_sources.length > 0)
            ? d.social_sources
            : (d.sources || []).filter(s => s.kind === 'social' || Boolean(s.platform))

          return (
            <div className="space-y-6">
              {/* 1. Commentary Sources */}
              <div>
                <div className="mb-2.5 flex items-center gap-2 font-ui-label-sm uppercase tracking-wide text-on-surface-variant font-semibold">
                  <I name="menu_book" cls="text-[18px] text-primary" />
                  <span>Commentary Sources</span>
                </div>
                <SourceGrid
                  sources={offList.length > 0 ? offList : (socList.length === 0 ? (d.sources ?? []) : [])}
                  empty="No commentary sources found."
                  onOpenSource={handleOpenSource}
                />
              </div>

              {/* 2. Social Media Sources */}
              <div className="border-t border-outline-variant/20 pt-4">
                <div className="mb-2.5 flex items-center gap-2 font-ui-label-sm uppercase tracking-wide text-on-surface-variant font-semibold">
                  <I name="forum" cls="text-[18px] text-primary" />
                  <span>Social Media Sources</span>
                  <span className="font-ui-label-xs normal-case tracking-normal text-on-surface-variant/70 font-normal">(Reddit · YouTube · Quora · Forums)</span>
                </div>
                {socList.length > 0 ? (
                  <SourceGrid
                    sources={socList}
                    empty="No social media sources found."
                    onOpenSource={handleOpenSource}
                  />
                ) : (
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container/50 p-4 text-center">
                    <p className="text-xs text-on-surface-variant mb-2">No social media perspectives loaded yet for these verses.</p>
                    <button
                      type="button"
                      onClick={reload}
                      disabled={busy}
                      className="btn-primary text-xs py-1.5 px-3 rounded-lg cursor-pointer"
                    >
                      {busy ? 'Fetching…' : 'Fetch Social Media Voices'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        {err && <p className="mt-2 text-ui-label-sm text-error">{err}</p>}
      </CollapsibleSection>

      {/* Pop-up source reader modal within the site */}

      {activeSource && (
        <SourceReaderModal
          source={activeSource}
          studyId={studyId}
          dayNumber={day.day_number}
          draft={draft}
          notes={notes}
          onClose={() => setActiveSource(null)}
          onSaveNote={handleSaveModalNote}
        />
      )}
    </>
  )
}

/* ---------- Verse expander: click a ref to compare versions ---------- */

function VerseExpander({ refText }: { refText: string }) {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<string[]>([])
  const [all, setAll] = useState<TranslationInfo[]>([])
  const [rows, setRows] = useState<CompareVerse[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const p = await preferences.getTranslations()
    const a = await bible.translations()
    setPrefs(p)
    setAll(a)
    setBusy(true)
    try {
      const cmp = await bible.compare(refText, p)
      setRows(cmp.verses)
    } finally {
      setBusy(false)
    }
  }

  const toggle = () => {
    if (!open) load()
    setOpen((o) => !o)
  }

  const switchVersion = async (code: string) => {
    // move chosen version to front of preferences (most-used)
    const next = [code, ...prefs.filter((c) => c !== code)].slice(0, 3)
    const saved = await preferences.setTranslations(next)
    setPrefs(saved)
    setBusy(true)
    try {
      const cmp = await bible.compare(refText, saved)
      setRows(cmp.verses)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-2">
      <button
        onClick={toggle}
        className="font-ui-label-sm font-semibold uppercase tracking-wide text-primary hover:text-primary-container transition-colors"
      >
        {refText} <I name={open ? 'expand_less' : 'expand_more'} cls="text-[16px] align-middle" />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-3">
          {busy && <p className="text-ui-label-sm text-on-surface-variant">Loading versions…</p>}
          {!busy && rows.length === 0 && (
            <p className="text-ui-label-sm text-on-surface-variant">No text found for {refText}.</p>
          )}
          {rows.map((v, i) => (
            <div key={i} className="text-body-reading">
              <div className="font-ui-label-sm font-medium text-primary">
                {v.translation}
                {v.words_of_jesus && <span className="ml-1 text-error">✦</span>}
              </div>
              <div className="text-on-surface">{v.text}</div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/15">
            <div className="flex items-center gap-2">
              <span className="text-ui-label-xs text-on-surface-variant">Switch version:</span>
              <select
                className="text-[11px] font-mono py-0.5 px-2 rounded-md border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition-colors cursor-pointer"
                value=""
                onChange={(e) => { if (e.target.value) switchVersion(e.target.value) }}
              >
                <option value="">Choose…</option>
                {all.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-ui-label-xs text-on-surface-variant/80">
              Top: {prefs.join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}


/* ---------- Scripture passages: version-switchable, reorderable, highlightable ---------- */

function renderPassageHighlights(text: string, highlights?: { text: string; note?: string }[] | null) {
  if (!highlights || highlights.length === 0) return text
  let parts: Array<{ text: string; isHl: boolean }> = [{ text, isHl: false }]
  for (const h of highlights) {
    if (!h.text) continue
    const newParts: Array<{ text: string; isHl: boolean }> = []
    for (const part of parts) {
      if (part.isHl) {
        newParts.push(part)
        continue
      }
      const idx = part.text.toLowerCase().indexOf(h.text.toLowerCase())
      if (idx >= 0) {
        if (idx > 0) newParts.push({ text: part.text.slice(0, idx), isHl: false })
        newParts.push({ text: part.text.slice(idx, idx + h.text.length), isHl: true })
        if (idx + h.text.length < part.text.length) {
          newParts.push({ text: part.text.slice(idx + h.text.length), isHl: false })
        }
      } else {
        newParts.push(part)
      }
    }
    parts = newParts
  }

  return (
    <>
      {parts.map((p, idx) =>
        p.isHl ? (
          <mark
            key={idx}
            className="bg-primary/20 text-on-surface font-medium rounded px-1 py-0.5 not-italic border-b border-primary/40"
          >
            {p.text}
          </mark>
        ) : (
          p.text
        )
      )}
    </>
  )
}

function PassageEditor({
  studyId,
  day,
  fallbackScripture,
  onChanged,
  primaryTranslation = 'KJV',
  onReadAloud,
  isReading = false,
}: {
  studyId: number
  day: number
  fallbackScripture?: Array<{ ref: string; translation?: string; text?: string; rationale?: string }>
  onChanged: () => void
  primaryTranslation?: string
  onReadAloud?: () => void
  isReading?: boolean
}) {
  const [list, setList] = useState<PassageOut[]>([])
  const [all, setAll] = useState<TranslationInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [newRef, setNewRef] = useState('')
  const [hlText, setHlText] = useState<string | null>(null)
  const [hlNote, setHlNote] = useState('')
  const [copiedPid, setCopiedPid] = useState<number | null>(null)

  const load = async () => {
    setBusy(true)
    setErr(null)
    try {
      const [ps, ts] = await Promise.all([
        passages.list(studyId, day),
        bible.translations(),
      ])
      setList(ps.sort((a, b) => a.order - b.order))
      setAll(ts)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const scriptureKey = JSON.stringify(fallbackScripture?.map((s) => s.ref) ?? [])
  useEffect(() => { load() }, [studyId, day, scriptureKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadWhenDone = async (p: Promise<unknown>) => {
    await p
    await load()
    onChanged()
  }

  const seedFromDraft = async () => {
    if (!fallbackScripture || fallbackScripture.length === 0) return
    setSeeding(true)
    try {
      for (const item of fallbackScripture) {
        if (item.ref) {
          await passages.add(studyId, day, item.ref, item.rationale, item.translation)
        }
      }
      await load()
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSeeding(false)
    }
  }

  const switchVersion = (id: number, code: string) =>
    reloadWhenDone(passages.update(studyId, day, id, { translation: code }))

  const reorder = (id: number, dir: -1 | 1) =>
    reloadWhenDone(passages.update(studyId, day, id, { order: (list.find((p) => p.id === id)?.order ?? 0) + dir }))

  const remove = (id: number) =>
    reloadWhenDone(passages.remove(studyId, day, id))

  const add = () => {
    const ref = newRef.trim()
    if (!ref) return
    setNewRef('')
    reloadWhenDone(passages.add(studyId, day, ref))
  }

  const [hlPid, setHlPid] = useState<number | null>(null)

  const captureHighlight = (p: PassageOut) => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : null
    if (sel) {
      setHlText(sel)
      setHlPid(p.id)
    }
  }

  const handleHighlightPassage = (p: PassageOut) => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : null
    const target = sel || p.text
    setHlText(target)
    setHlPid(p.id)
  }

  const handleCopyPassage = async (p: PassageOut) => {
    try {
      await navigator.clipboard.writeText(`${p.ref} (${p.translation || primaryTranslation}) — ${p.text}`)
      setCopiedPid(p.id)
      setTimeout(() => setCopiedPid(null), 2000)
    } catch {
      // ignore
    }
  }

  const saveHighlight = () => {
    if (!hlText || hlPid == null) return
    const p = list.find((x) => x.id === hlPid)
    if (!p) return
    const highlights = [...(p.highlights ?? []), { text: hlText, note: hlNote }]
    setHlText(null); setHlNote(''); setHlPid(null)
    reloadWhenDone(passages.update(studyId, day, hlPid, { highlights }))
  }

  const [editHl, setEditHl] = useState<{ pid: number; idx: number; text: string; note: string } | null>(null)
  const startEditHl = (pid: number, idx: number, text: string, note: string) =>
    setEditHl({ pid, idx, text, note })
  const saveEditHl = async () => {
    if (!editHl) return
    const p = list.find((x) => x.id === editHl.pid)
    if (!p) return
    const highlights = (p.highlights ?? []).map((h, i) =>
      i === editHl.idx ? { text: editHl.text, note: editHl.note } : h)
    setEditHl(null)
    reloadWhenDone(passages.update(studyId, day, editHl.pid, { highlights }))
  }
  const deleteHl = (pid: number, idx: number) => {
    const p = list.find((x) => x.id === pid)
    if (!p) return
    const highlights = (p.highlights ?? []).filter((_, i) => i !== idx)
    reloadWhenDone(passages.update(studyId, day, pid, { highlights }))
  }

  const hasFallback = fallbackScripture && fallbackScripture.length > 0
  const activePassages = list.length > 0 ? list : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="font-caption-caps text-caption-caps tracking-widest text-secondary uppercase font-semibold">
            PRIMARY SCRIPTURE READING
          </span>
          <span className="text-caption-caps font-caption-caps px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-medium">
            AUTHORIZED TEXT
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onReadAloud && (
            <button
              type="button"
              id="read-aloud-scripture"
              onClick={onReadAloud}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-ui-label-xs font-semibold transition-all cursor-pointer shadow-xs ${
                isReading
                  ? 'bg-primary text-on-primary animate-pulse'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-primary border border-outline-variant/30'
              }`}
              title={isReading ? 'Pause scripture narration' : 'Listen to scripture reading'}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isReading ? 'graphic_eq' : 'volume_up'}
              </span>
              <span>{isReading ? 'Playing' : 'Listen'}</span>
            </button>
          )}
          {list.length === 0 && hasFallback && !busy && (
            <button
              onClick={seedFromDraft}
              disabled={seeding}
              className="btn-outline text-[12px] py-1 px-2.5 flex items-center gap-1.5 cursor-pointer"
              title="Import scriptures into the interactive passages editor"
            >
              <I name="sync" cls={`text-[15px] ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Importing…' : 'Make Interactive'}
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="flex items-center justify-between rounded-xl bg-error/10 border border-error/30 p-2.5 text-ui-label-sm text-error">
          <span>{err}</span>
          <button onClick={load} className="btn-ghost text-error underline text-xs">Retry</button>
        </div>
      )}

      {busy && (
        <p className="text-ui-label-sm text-on-surface-variant flex items-center gap-2">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading passage texts…
        </p>
      )}

      {/* Render active passages */}
      {activePassages.map((p, i) => {
        const text = p.text.trim()
        const firstChar = text.charAt(0)
        const restOfText = text.slice(1)

        return (
          <article key={p.id} className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/20 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-outline-variant/10">
              <div className="flex items-center gap-2">
                <VerseExpander refText={p.ref} />
                <span className="text-caption-caps font-caption-caps px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-mono">
                  {p.translation || primaryTranslation}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* Version switcher */}
                <select
                  className="text-[11px] font-mono font-medium py-1 px-2 rounded-md border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition-colors cursor-pointer"
                  value={p.translation || primaryTranslation}
                  onChange={(e) => switchVersion(p.id, e.target.value)}
                  title="Choose Bible Version"
                >
                  {all.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code}
                    </option>
                  ))}
                </select>

                <button onClick={() => reorder(p.id, -1)} disabled={i === 0}
                  className="btn-ghost px-1.5 disabled:opacity-30" title="Move Up"><I name="arrow_upward" cls="text-[16px]" /></button>
                <button onClick={() => reorder(p.id, 1)} disabled={i === list.length - 1}
                  className="btn-ghost px-1.5 disabled:opacity-30" title="Move Down"><I name="arrow_downward" cls="text-[16px]" /></button>
                <button onClick={() => remove(p.id)}
                  className="btn-ghost px-1.5 text-error" title="Remove Passage"><I name="close" cls="text-[16px]" /></button>
              </div>
            </div>

            {/* Reading Body with Drop Cap and Verse styling (Single Clean Render with selection highlighting) */}
            <div
              onMouseUp={() => captureHighlight(p)}
              onTouchEnd={() => captureHighlight(p)}
              className="font-body-reading text-body-reading text-on-surface leading-loose tracking-wide select-text cursor-text"
            >
              <p className="mb-1">
                {i === 0 ? (
                  <>
                    <span className="float-left text-[46px] leading-[40px] font-headline-display pr-2 pt-1 text-primary font-normal select-none">
                      {firstChar}
                    </span>
                    {renderPassageHighlights(restOfText, p.highlights)}
                  </>
                ) : (
                  <>
                    <sup className="font-verse-num text-verse-num text-primary font-semibold mr-1 select-none">{i + 1}</sup>
                    {renderPassageHighlights(text, p.highlights)}
                  </>
                )}
              </p>
            </div>

            {/* Micro Action Toolbar for passage */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-outline-variant/10">
              <button
                type="button"
                onClick={() => handleHighlightPassage(p)}
                className={`h-7 px-2.5 rounded-full flex items-center gap-1 active:scale-95 transition-all cursor-pointer ${
                  p.highlights && p.highlights.length > 0
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                }`}
                title="Highlight selected phrase or full passage"
              >
                <span className="material-symbols-outlined text-[14px] text-primary">brush</span>
                <span className="font-label-nav text-label-nav font-medium">Highlight</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopyPassage(p)}
                className="h-7 px-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                <span className="font-label-nav text-label-nav font-medium">
                  {copiedPid === p.id ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>

            {p.rationale && (
              <div className="text-ui-label-sm italic text-secondary bg-surface-container-low p-2 rounded-lg">
                Context: {p.rationale}
              </div>
            )}

            {/* Highlights Drawer */}
            {p.highlights && p.highlights.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/10">
                <div className="font-caption-caps text-caption-caps uppercase tracking-wider text-primary font-semibold">
                  Personal Reflections & Highlights
                </div>
                {p.highlights.map((h, hi) => (
                  editHl && editHl.pid === p.id && editHl.idx === hi ? (
                    <div key={hi} className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
                      <textarea
                        className="field-underline w-full"
                        rows={2}
                        value={editHl.text}
                        onChange={(e) => setEditHl({ ...editHl, text: e.target.value })}
                      />
                      <input
                        className="field-underline w-full"
                        placeholder="Your personal note…"
                        value={editHl.note}
                        onChange={(e) => setEditHl({ ...editHl, note: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button onClick={saveEditHl} className="btn-primary px-3 py-1 text-xs">Save</button>
                        <button onClick={() => setEditHl(null)} className="btn-ghost text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div key={hi} className="group rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-ui-label-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-primary font-medium font-serif italic">"{h.text}"</span>
                          {h.note && <span className="text-on-surface-variant"> — {h.note}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => startEditHl(p.id, hi, h.text, h.note ?? '')}
                            className="btn-ghost px-1.5" title="Edit reflection">
                            <I name="edit" cls="text-[15px]" />
                          </button>
                          <button onClick={() => deleteHl(p.id, hi)}
                            className="btn-ghost px-1.5 text-error" title="Delete reflection">
                            <I name="delete" cls="text-[15px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </article>
        )
      })}

      {/* Fallback view when no database DayPassage rows exist yet */}
      {!busy && list.length === 0 && hasFallback && (
        <div className="space-y-3">
          {fallbackScripture!.map((fs, i) => (
            <article key={i} className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/20 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-1 border-b border-outline-variant/10">
                <span className="font-headline-md text-headline-md font-semibold text-primary">{fs.ref}</span>
                {fs.translation && (
                  <span className="text-caption-caps font-caption-caps px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-mono">
                    {fs.translation}
                  </span>
                )}
              </div>
              {fs.text && (
                <div className="font-body-reading text-body-reading text-on-surface leading-loose tracking-wide">
                  {i === 0 ? (
                    <p>
                      <span className="float-left text-[46px] leading-[40px] font-headline-display pr-2 pt-1 text-primary font-normal">
                        {fs.text.charAt(0)}
                      </span>
                      {fs.text.slice(1)}
                    </p>
                  ) : (
                    <p>{fs.text}</p>
                  )}
                </div>
              )}
              {fs.rationale && <div className="text-ui-label-sm italic text-secondary">Context: {fs.rationale}</div>}
            </article>
          ))}
        </div>
      )}

      {/* Add Scripture Reference Form */}
      <div className="flex items-center gap-2 mt-2 bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/20 shadow-xs">
        <input
          className="field-underline flex-1 py-1 text-sm"
          placeholder="Add another scripture ref (e.g. Acts 2:1-4, Romans 8:28)..."
          value={newRef} onChange={(e) => setNewRef(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button onClick={add} className="btn-primary px-4 py-1.5 text-xs">Add Passage</button>
      </div>

      {hlText && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-sm">
          <div className="mb-1 font-caption-caps text-caption-caps font-semibold uppercase tracking-wider text-primary">
            Capture Highlight For Reflection
          </div>
          <p className="mb-2 text-ui-label-sm italic text-on-primary-container font-serif">
            "{hlText.slice(0, 140)}{hlText.length > 140 ? '…' : ''}"
          </p>
          <input
            className="field-underline w-full text-sm"
            placeholder="Write a personal note or prayer on this verse…"
            value={hlNote} onChange={(e) => setHlNote(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={saveHighlight} className="btn-primary px-4 py-1.5 text-xs">Save Highlight</button>
            <button onClick={() => { setHlText(null); setHlNote(''); setHlPid(null) }} className="btn-ghost text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
