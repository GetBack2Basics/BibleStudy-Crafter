import React, { useState, useEffect } from 'react'
import { auth, type AuthUser } from '../lib/auth'
import { keysApi, type KeyStatus, type TestKeyResult } from '../lib/keys'
import { getStoredTheme, getStoredFontScale, applyTheme, applyFontScale, type ThemeMode } from '../lib/theme'
import { voicePreferences } from '../lib/studies'

type Tab = 'profile' | 'study_settings' | 'byok' | 'admin'


interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
  currentUser: AuthUser | null
  onUserUpdated: (user: AuthUser) => void
  initialTab?: Tab
  onLogout?: () => void
}

export default function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  initialTab = 'profile',
  onLogout,
}: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
      setCurrentTheme(getStoredTheme())
      setCurrentFontScale(getStoredFontScale())
    }
  }, [isOpen, initialTab])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Appearance State
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getStoredTheme())
  const [currentFontScale, setCurrentFontScale] = useState<number>(getStoredFontScale())

  const handleThemeToggle = (t: ThemeMode) => {
    setCurrentTheme(t)
    applyTheme(t)
  }

  const handleFontScaleChange = (scale: number) => {
    setCurrentFontScale(scale)
    applyFontScale(scale)
  }

  // Profile Form state
  const [displayName, setDisplayName] = useState('')
  const [organization, setOrganization] = useState('')
  const [phone, setPhone] = useState('')
  const [pictureUrl, setPictureUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // BYOK State
  const [_keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [useCustomKeys, setUseCustomKeys] = useState(false)
  const [preferredProvider, setPreferredProvider] = useState('auto')
  const [geminiKey, setGeminiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [falKey, setFalKey] = useState('')
  const [replicateKey, setReplicateKey] = useState('')
  const [byokSaving, setByokSaving] = useState(false)
  const [byokMsg, setByokMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestKeyResult>>({})

  // Admin Tab State
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [adminMsg, setAdminMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Study & Voices Settings State
  const [summaryLength, setSummaryLength] = useState<number>(voicePreferences.getSummaryLength())
  const [voiceCounts, setVoiceCounts] = useState(voicePreferences.getCounts())
  const [studyMsg, setStudyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isAdmin = currentUser?.is_admin || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN'

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.display_name || '')
      setOrganization(currentUser.organization || '')
      setPhone(currentUser.phone || '')
      setPictureUrl(currentUser.picture_url || '')
      setNotes(currentUser.notes || '')
    }
  }, [currentUser])

  useEffect(() => {
    if (isOpen) {
      loadKeyStatus()
      setSummaryLength(voicePreferences.getSummaryLength())
      setVoiceCounts(voicePreferences.getCounts())
      if (isAdmin && activeTab === 'admin') {
        loadAdminUsers()
      }
    }
  }, [isOpen, activeTab, isAdmin])

  const handleSaveStudySettings = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      voicePreferences.setSummaryLength(summaryLength)
      voicePreferences.setCounts(voiceCounts)
      setStudyMsg({ type: 'success', text: 'Study & voices preferences saved successfully!' })
      setTimeout(() => setStudyMsg(null), 3000)
    } catch (err: any) {
      setStudyMsg({ type: 'error', text: err.message || 'Failed to save study settings' })
    }
  }


  const loadKeyStatus = async () => {
    try {
      const status = await keysApi.getStatus()
      setKeyStatus(status)
      setUseCustomKeys(status.use_custom_keys)
      setPreferredProvider(status.preferred_provider)
      if (status.masked_keys.gemini) setGeminiKey(status.masked_keys.gemini)
      if (status.masked_keys.openrouter) setOpenrouterKey(status.masked_keys.openrouter)
      if (status.masked_keys.anthropic) setAnthropicKey(status.masked_keys.anthropic)
      if (status.masked_keys.fal) setFalKey(status.masked_keys.fal)
      if (status.masked_keys.replicate) setReplicateKey(status.masked_keys.replicate)
    } catch {
      // silent
    }
  }

  const loadAdminUsers = async () => {
    setLoadingUsers(true)
    try {
      const list = await auth.listAdminUsers()
      setAdminUsers(list)
    } catch (err: any) {
      setAdminMsg({ type: 'error', text: err.message || 'Failed to load user list' })
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const updated = await auth.updateProfile({
        display_name: displayName,
        organization,
        phone,
        picture_url: pictureUrl,
        notes,
      })
      onUserUpdated(updated)
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' })
      setTimeout(() => setProfileMsg(null), 3000)
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Failed to update profile' })
    } finally {
      setProfileSaving(false)
    }
  }

  const handleSaveKeys = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setByokSaving(true)
    setByokMsg(null)
    const hasKeys = Boolean(
      (geminiKey && !geminiKey.startsWith('****')) ||
      (openrouterKey && !openrouterKey.startsWith('****')) ||
      (anthropicKey && !anthropicKey.startsWith('****')) ||
      (falKey && !falKey.startsWith('****')) ||
      (replicateKey && !replicateKey.startsWith('****')) ||
      _keyStatus?.has_gemini ||
      _keyStatus?.has_openrouter ||
      _keyStatus?.has_anthropic
    )
    const shouldEnableCustom = useCustomKeys || hasKeys
    try {
      const updated = await keysApi.saveSettings({
        use_custom_keys: shouldEnableCustom,
        preferred_provider: preferredProvider,
        gemini_api_key: geminiKey,
        openrouter_api_key: openrouterKey,
        anthropic_api_key: anthropicKey,
        fal_key: falKey,
        replicate_api_token: replicateKey,
      })
      setKeyStatus(updated)
      setUseCustomKeys(updated.use_custom_keys)
      setByokMsg({
        type: 'success',
        text: updated.use_custom_keys
          ? 'API Keys saved! BYOK Mode is active — your custom keys will now be used.'
          : 'API Key preferences saved (Free Mode active).',
      })
      setTimeout(() => setByokMsg(null), 4000)
    } catch (err: any) {
      setByokMsg({ type: 'error', text: err.message || 'Failed to save API keys' })
    } finally {
      setByokSaving(false)
    }
  }

  const handleTestKey = async (provider: string, rawKey: string) => {
    if (!rawKey || rawKey.startsWith('****')) {
      setByokMsg({ type: 'error', text: `Please enter a valid ${provider} API key to test.` })
      return
    }
    setTestingProvider(provider)
    try {
      const res = await keysApi.testKey({ provider, api_key: rawKey })
      setTestResults((prev) => ({ ...prev, [provider]: res }))
      if (res.success) {
        setUseCustomKeys(true)
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { success: false, latency_ms: 0, message: err.message || 'Test failed', error: String(err) },
      }))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const updated = await auth.updateUserRole(userId, newRole)
      setAdminUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
      setAdminMsg({ type: 'success', text: `Role updated for ${updated.email}` })
      setTimeout(() => setAdminMsg(null), 2500)
    } catch (err: any) {
      setAdminMsg({ type: 'error', text: err.message || 'Failed to change role' })
    }
  }

  const handleStatusToggle = async (userId: number, currentActive: boolean) => {
    try {
      const updated = await auth.updateUserStatus(userId, !currentActive)
      setAdminUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
    } catch (err: any) {
      setAdminMsg({ type: 'error', text: err.message || 'Failed to update status' })
    }
  }

  const handleDeleteUser = async (userId: number, email: string) => {
    if (!confirm(`Are you sure you want to permanently delete account ${email}?`)) return
    try {
      await auth.deleteUser(userId)
      setAdminUsers((prev) => prev.filter((u) => u.id !== userId))
      setAdminMsg({ type: 'success', text: `Deleted ${email}` })
      setTimeout(() => setAdminMsg(null), 2500)
    } catch (err: any) {
      setAdminMsg({ type: 'error', text: err.message || 'Failed to delete user' })
    }
  }

  if (!isOpen) return null

  const roleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-400 border border-purple-500/30">
            <span className="material-symbols-outlined text-[14px]">shield_with_heart</span> Super Admin
          </span>
        )
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30">
            <span className="material-symbols-outlined text-[14px]">verified_user</span> Admin
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
            <span className="material-symbols-outlined text-[14px]">person</span> Member
          </span>
        )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-6 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl border border-outline-variant/30 bg-surface-container-low shadow-2xl overflow-hidden">
        {/* Pinned Top Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-6 py-4 bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-lg border border-primary/20 overflow-hidden">
              {currentUser?.picture_url ? (
                <img src={currentUser.picture_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span>{(currentUser?.display_name || currentUser?.email || 'U')[0].toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-lg font-bold text-on-surface">
                  {currentUser?.display_name || 'My Account'}
                </h2>
                {roleBadge(currentUser?.role || 'MEMBER')}
              </div>
              <p className="text-xs text-on-surface-variant font-mono">{currentUser?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
            title="Close modal (Esc)"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Pinned Tab Bar */}
        <div className="flex border-b border-outline-variant/20 bg-surface-container-lowest px-6 gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">account_circle</span>
            Profile & Style
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('study_settings')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'study_settings'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            Study & Voices
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('byok')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'byok'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">key</span>
            API Keys & BYOK
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-ui-label-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'admin'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
              User Management
            </button>
          )}
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tab 1: Profile Details */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileMsg && (
              <div
                className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                  profileMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {profileMsg.type === 'success' ? 'check_circle' : 'error'}
                </span>
                {profileMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Pastor John"
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Organization / Church
                </label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. Grace Fellowship"
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Profile Avatar URL
                </label>
                <input
                  type="url"
                  value={pictureUrl}
                  onChange={(e) => setPictureUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                Personal Notes / Bio
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Study interests, favorite Bible topics, theological focus..."
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {/* Appearance & Reading Style */}
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <span className="material-symbols-outlined text-[18px]">palette</span>
                Appearance & Reading Style
              </div>

              {/* Theme Mode Selection */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-2">
                  Theme Style
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleThemeToggle('light')}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      currentTheme === 'light'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
                      <span className="material-symbols-outlined text-[18px]">light_mode</span>
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-on-surface">Light Style</div>
                      <div className="text-[10px] text-on-surface-variant">Parchment & Ink</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeToggle('dark')}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      currentTheme === 'dark'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
                      <span className="material-symbols-outlined text-[18px]">dark_mode</span>
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-on-surface">Dark Style</div>
                      <div className="text-[10px] text-on-surface-variant">Midnight Sanctuary</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Font Size Scaling */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-on-surface-variant">
                    Font Size Scaling
                  </label>
                  <span className="text-xs font-semibold text-primary">
                    {Math.round(currentFontScale * 100)}%
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: 'Small (75%)', scale: 0.75 },
                    { label: 'Compact (85%)', scale: 0.85 },
                    { label: 'Medium (100%)', scale: 1.0 },
                    { label: 'Large (115%)', scale: 1.15 },
                    { label: 'Extra Large (130%)', scale: 1.3 },
                  ].map((preset) => (
                    <button
                      key={preset.scale}
                      type="button"
                      onClick={() => handleFontScaleChange(preset.scale)}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                        Math.abs(currentFontScale - preset.scale) < 0.04
                          ? 'bg-primary text-on-primary border-primary font-semibold shadow-xs'
                          : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container-high/40 p-4 border border-outline-variant/20 flex items-center justify-between">
              <div>
                <span className="text-xs text-on-surface-variant">Account Info:</span>
                <p className="text-xs text-on-surface mt-0.5">
                  Auth: <strong>{currentUser?.auth_provider}</strong> · Studies created:{' '}
                  <strong>{currentUser?.study_count ?? 0}</strong>
                </p>
              </div>
              <button
                type="submit"
                disabled={profileSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

            {/* Account Sign Out */}
            <div className="rounded-2xl border border-error/30 bg-error/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-error">Account Session</span>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Signed in as <strong>{currentUser?.email || currentUser?.display_name || 'User'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onLogout?.()
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-error/40 bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-error hover:bg-error/15 transition-all shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Sign out
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Study & Voices Settings */}
        {activeTab === 'study_settings' && (
          <form onSubmit={handleSaveStudySettings} className="mt-5 space-y-5">
            {studyMsg && (
              <div
                className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                  studyMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {studyMsg.type === 'success' ? 'check_circle' : 'error'}
                </span>
                {studyMsg.text}
              </div>
            )}

            {/* Voices Sentiment Quotas Card */}
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">psychology</span>
                    Voices Sentiment Mix (Default: 4 Negative, 2 Neutral, 2 Positive)
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Configure default balance for BERT-analyzed external commentary and discussion sources.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceCounts({ negative: 4, neutral: 2, positive: 2 })}
                  className="btn-ghost px-2.5 py-1 text-xs text-primary hover:underline cursor-pointer"
                >
                  Reset 4+2+2
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Negative (Red)
                    </span>
                    <span className="text-xs font-bold text-on-surface">{voiceCounts.negative}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={voiceCounts.negative}
                    onChange={(e) => setVoiceCounts({ ...voiceCounts, negative: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/30 px-3 py-1.5 text-xs text-on-surface focus:border-red-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-on-surface-variant/80 mt-1.5">Critical, skeptical & objections</span>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Neutral (Yellow)
                    </span>
                    <span className="text-xs font-bold text-on-surface">{voiceCounts.neutral}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={voiceCounts.neutral}
                    onChange={(e) => setVoiceCounts({ ...voiceCounts, neutral: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/30 px-3 py-1.5 text-xs text-on-surface focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-[11px] text-on-surface-variant/80 mt-1.5">Historical, linguistic & academic</span>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Positive (Green)
                    </span>
                    <span className="text-xs font-bold text-on-surface">{voiceCounts.positive}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={voiceCounts.positive}
                    onChange={(e) => setVoiceCounts({ ...voiceCounts, positive: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/30 px-3 py-1.5 text-xs text-on-surface focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-on-surface-variant/80 mt-1.5">Devotional, encouraging & practical</span>
                </div>
              </div>

              <div className="text-xs text-on-surface-variant/90 pt-1 flex items-center justify-between border-t border-outline-variant/20">
                <span>Total voices requested per day:</span>
                <strong className="text-sm text-primary font-bold">{voiceCounts.negative + voiceCounts.neutral + voiceCounts.positive} voices</strong>
              </div>
            </div>

            {/* Detail Card Summary Length Slider */}
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">subject</span>
                    Detail Card Summary Length
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Controls maximum characters previewed in the source reader modal before full article.
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary">
                  {summaryLength} characters
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <input
                  type="range"
                  min={200}
                  max={2000}
                  step={50}
                  value={summaryLength}
                  onChange={(e) => setSummaryLength(parseInt(e.target.value, 10))}
                  className="w-full h-2 rounded-lg bg-surface-container-highest appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[11px] text-on-surface-variant">
                  <span>200 chars (Brief)</span>
                  <span className="font-semibold text-primary">800 chars (Default)</span>
                  <span>2000 chars (Extended)</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container-high/40 p-4 border border-outline-variant/20 flex items-center justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
              >
                Save Study Preferences
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: BYOK & API Keys */}
        {activeTab === 'byok' && (
          <form onSubmit={handleSaveKeys} className="mt-5 space-y-4">
            {byokMsg && (
              <div
                className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                  byokMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {byokMsg.type === 'success' ? 'check_circle' : 'error'}
                </span>
                {byokMsg.text}
              </div>
            )}

            {/* Mode Selector Card */}
            <div
              onClick={() => setUseCustomKeys(!useCustomKeys)}
              className={`cursor-pointer rounded-2xl border p-4 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                useCustomKeys
                  ? 'border-emerald-500/40 bg-emerald-500/10 shadow-sm'
                  : 'border-primary/20 bg-primary/5'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-bold flex items-center gap-1.5 ${useCustomKeys ? 'text-emerald-400' : 'text-primary'}`}>
                    <span className="material-symbols-outlined text-[18px]">{useCustomKeys ? 'vpn_key' : 'bolt'}</span>
                    AI Generation Tier: {useCustomKeys ? 'BYOK Mode Active' : 'Free Tier Mode'}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      useCustomKeys
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-primary/20 text-primary border border-primary/30'
                    }`}
                  >
                    {useCustomKeys ? 'Custom Keys Used' : 'Server Pool'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1 max-w-lg">
                  {useCustomKeys
                    ? 'Your configured API keys (Gemini, OpenRouter, Anthropic) will be directly used for all outline and study generation.'
                    : 'Using Free Tier Model Pool (Default). Zero keys required — powered by free models and server pool.'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={useCustomKeys}
                  onChange={(e) => setUseCustomKeys(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                <span className="ml-2 text-xs font-semibold text-on-surface">
                  {useCustomKeys ? 'BYOK Mode' : 'Free Mode'}
                </span>
              </label>
            </div>

            {/* Provider Preference Selector */}
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">tune</span>
                  Preferred AI Provider & Model
                </label>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Choose your primary provider (automatically falls over to other available models on high demand or errors).
                </p>
              </div>
              <select
                value={preferredProvider}
                onChange={(e) => setPreferredProvider(e.target.value)}
                className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none shrink-0"
              >
                <option value="auto">Auto (Best Available + Auto-Failover)</option>
                <option value="gemini">Google Gemini (Gemini Flash)</option>
                <option value="openrouter">OpenRouter (Multi-Model Pool)</option>
                <option value="anthropic">Anthropic (Claude 3.5 Haiku)</option>
              </select>
            </div>

            {/* Keys Input List */}
            <div className="space-y-3">
              {/* Google Gemini Key */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                    Google Gemini API Key
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    Get Free Key <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => {
                      setGeminiKey(e.target.value)
                      if (e.target.value) setUseCustomKeys(true)
                    }}
                    placeholder="AIzaSy..."
                    className="flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={testingProvider === 'gemini'}
                    onClick={() => handleTestKey('gemini', geminiKey)}
                    className="rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                  >
                    {testingProvider === 'gemini' ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {testResults['gemini'] && (
                  <p
                    className={`mt-1.5 text-[11px] ${
                      testResults['gemini'].success ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {testResults['gemini'].message} ({testResults['gemini'].latency_ms}ms)
                  </p>
                )}
              </div>

              {/* OpenRouter Key */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-tertiary">hub</span>
                    OpenRouter API Key
                  </label>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    Get OpenRouter Key <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={openrouterKey}
                    onChange={(e) => {
                      setOpenrouterKey(e.target.value)
                      if (e.target.value) setUseCustomKeys(true)
                    }}
                    placeholder="sk-or-v1-..."
                    className="flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={testingProvider === 'openrouter'}
                    onClick={() => handleTestKey('openrouter', openrouterKey)}
                    className="rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                  >
                    {testingProvider === 'openrouter' ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {testResults['openrouter'] && (
                  <p
                    className={`mt-1.5 text-[11px] ${
                      testResults['openrouter'].success ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {testResults['openrouter'].message} ({testResults['openrouter'].latency_ms}ms)
                  </p>
                )}
              </div>

              {/* Anthropic Key */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">psychology</span>
                    Anthropic API Key (Claude)
                  </label>
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    Console <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={anthropicKey}
                    onChange={(e) => {
                      setAnthropicKey(e.target.value)
                      if (e.target.value) setUseCustomKeys(true)
                    }}
                    placeholder="sk-ant-..."
                    className="flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={testingProvider === 'anthropic'}
                    onClick={() => handleTestKey('anthropic', anthropicKey)}
                    className="rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                  >
                    {testingProvider === 'anthropic' ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {testResults['anthropic'] && (
                  <p
                    className={`mt-1.5 text-[11px] ${
                      testResults['anthropic'].success ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {testResults['anthropic'].message} ({testResults['anthropic'].latency_ms}ms)
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={byokSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {byokSaving ? 'Saving Keys...' : 'Save API Key Settings'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Admin User Management */}
        {activeTab === 'admin' && isAdmin && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-on-surface">Registered User Accounts</h3>
              <button
                type="button"
                onClick={loadAdminUsers}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span> Refresh
              </button>
            </div>

            {adminMsg && (
              <div
                className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                  adminMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {adminMsg.type === 'success' ? 'check_circle' : 'error'}
                </span>
                {adminMsg.text}
              </div>
            )}

            {loadingUsers ? (
              <div className="py-8 text-center text-xs text-on-surface-variant">Loading user directory...</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-container">
                <table className="w-full text-left text-xs text-on-surface">
                  <thead className="border-b border-outline-variant/20 bg-surface-container-high/60 text-on-surface-variant">
                    <tr>
                      <th className="px-3.5 py-2.5">User / Email</th>
                      <th className="px-3.5 py-2.5">Role</th>
                      <th className="px-3.5 py-2.5">Studies</th>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {adminUsers.map((u) => {
                      const isSuper = u.role === 'SUPER_ADMIN'
                      return (
                        <tr key={u.id} className="hover:bg-surface-container-high/30 transition-colors">
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-on-surface">{u.display_name || u.email.split('@')[0]}</div>
                            <div className="text-[11px] text-on-surface-variant font-mono">{u.email}</div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            {isSuper ? (
                              <span className="font-bold text-purple-400">SUPER_ADMIN</span>
                            ) : (
                              <select
                                value={u.role || 'MEMBER'}
                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-2 py-1 text-xs text-on-surface focus:border-primary focus:outline-none"
                              >
                                <option value="MEMBER">MEMBER</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono">{u.study_count ?? 0}</td>
                          <td className="px-3.5 py-2.5">
                            <button
                              type="button"
                              disabled={isSuper}
                              onClick={() => handleStatusToggle(u.id, u.is_active)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                u.is_active
                                  ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {u.is_active ? 'check' : 'block'}
                              </span>
                              {u.is_active ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            {!isSuper && u.id !== currentUser?.id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="rounded-lg p-1 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                                title="Delete user"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Pinned Bottom Action Bar */}
        <div className="flex items-center justify-between border-t border-outline-variant/20 px-6 py-3.5 bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2 text-xs truncate max-w-[50%]">
            {activeTab === 'profile' && profileMsg && (
              <span className={`truncate font-medium ${profileMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {profileMsg.text}
              </span>
            )}
            {activeTab === 'byok' && byokMsg && (
              <span className={`truncate font-medium ${byokMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {byokMsg.text}
              </span>
            )}
            {activeTab === 'admin' && adminMsg && (
              <span className={`truncate font-medium ${adminMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {adminMsg.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Close
            </button>
            {activeTab === 'profile' && (
              <button
                type="button"
                onClick={() => handleSaveProfile()}
                disabled={profileSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            )}
            {activeTab === 'byok' && (
              <button
                type="button"
                onClick={() => handleSaveKeys()}
                disabled={byokSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">vpn_key</span>
                {byokSaving ? 'Saving Keys...' : 'Save API Keys'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

