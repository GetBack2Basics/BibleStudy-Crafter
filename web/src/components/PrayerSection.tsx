import React, { useState, useEffect } from 'react'
import { renderInline } from './CommentarySection'

interface PrayerSectionProps {
  title: string
  icon?: string
  prayer: string
  note?: string
  onSavePrayer: (newPrayer: string) => Promise<void> | void
  onSaveNote?: (newNote: string) => Promise<void> | void
  onAIRefine: (instruction: string, selection?: string | null) => Promise<void> | void
  isAIRefining?: boolean
  defaultOpen?: boolean
  className?: string
}

export default function PrayerSection({
  title,
  icon = 'volunteer_activism',
  prayer,
  note = '',
  onSavePrayer,
  onSaveNote,
  onAIRefine,
  isAIRefining = false,
  defaultOpen = true,
  className = '',
}: PrayerSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(prayer)
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // AI Refinement state
  const [refinementText, setRefinementText] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [showNoteEditor, setShowNoteEditor] = useState(Boolean(note))
  const [noteText, setNoteText] = useState(note)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false)

  // Sync external prayer changes into edit state when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditText(prayer)
    }
  }, [prayer, isEditing])

  useEffect(() => {
    setNoteText(note)
    if (note) setShowNoteEditor(true)
  }, [note])

  const handleCopy = async () => {
    const textToCopy = isEditing ? editText : prayer
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleStartEdit = () => {
    setEditText(prayer)
    setIsEditing(true)
    setIsOpen(true)
  }

  const handleCancelEdit = () => {
    setEditText(prayer)
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    setIsSaving(true)
    try {
      await onSavePrayer(editText)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDownInEditor = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    }
  }

  // Handle user selecting text in the formatted view to feed into AI revision
  const handleMouseUp = () => {
    const selection = window.getSelection()
    if (selection) {
      const selectedStr = selection.toString().trim()
      if (selectedStr.length > 0) {
        setSelectedText(selectedStr)
      }
    }
  }

  const handleRefine = async () => {
    if (!refinementText.trim() || isAIRefining) return
    try {
      await onAIRefine(refinementText.trim(), selectedText || null)
      setRefinementText('')
      setSelectedText('')
    } catch {
      // error handled upstream
    }
  }

  const handleSaveNote = async () => {
    if (!onSaveNote) return
    setIsSavingNote(true)
    try {
      await onSaveNote(noteText)
      setNoteSavedFeedback(true)
      setTimeout(() => setNoteSavedFeedback(false), 2000)
    } finally {
      setIsSavingNote(false)
    }
  }

  const wordCount = (isEditing ? editText : prayer).trim().split(/\s+/).filter(Boolean).length

  return (
    <section className={`rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-ambient transition-all ${className}`}>
      {/* Header with Title and CoverLetter-Crafter style Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-outline-variant/10">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined text-[20px] text-primary shrink-0">{icon}</span>
          <span className="min-w-0 truncate font-ui-label-md text-on-surface font-semibold">{title}</span>
          {wordCount > 0 && (
            <span className="text-ui-label-xs text-on-surface-variant/70 font-normal">
              · {wordCount} words
            </span>
          )}
        </button>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-ui-label-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer shadow-xs"
                title={`Edit ${title.toLowerCase()}`}
              >
                <span className="material-symbols-outlined text-[15px]">edit</span>
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-ui-label-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
                title={`Copy ${title.toLowerCase()}`}
              >
                <span className="material-symbols-outlined text-[15px]">
                  {copied ? 'check' : 'content_copy'}
                </span>
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="btn-ghost text-ui-label-xs py-1 px-2.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full text-ui-label-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {isSaving ? 'hourglass_empty' : 'save'}
                </span>
                <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {/* Main Prayer View / Edit Content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                className="field-underline w-full rounded-xl border border-outline-variant/40 bg-surface-container-high p-4 font-serif italic text-body-reading text-on-surface leading-relaxed focus:border-primary focus:outline-none transition-colors cursor-text select-text"
                rows={4}
                value={editText}
                placeholder={`Write or edit ${title.toLowerCase()} here...`}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDownInEditor}
                onSelect={(e) => {
                  const target = e.currentTarget
                  const sel = target.value.slice(target.selectionStart, target.selectionEnd).trim()
                  if (sel) setSelectedText(sel)
                }}
                onMouseUp={(e) => {
                  const target = e.currentTarget
                  const sel = target.value.slice(target.selectionStart, target.selectionEnd).trim()
                  if (sel) setSelectedText(sel)
                }}
                onKeyUp={(e) => {
                  const target = e.currentTarget
                  const sel = target.value.slice(target.selectionStart, target.selectionEnd).trim()
                  if (sel) setSelectedText(sel)
                }}
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-ui-label-xs text-on-surface-variant/70 px-1">
                <span>Tip: Press <kbd className="px-1 py-0.5 rounded bg-surface-container-highest font-mono text-[10px]">Ctrl+Enter</kbd> to save. Use *italics* for scripture quotes.</span>
                <span>{editText.length} chars · {editText.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
          ) : (
            <div
              className="relative group rounded-xl p-4 bg-surface-container/60 border border-outline-variant/15 text-on-surface font-serif italic text-body-reading leading-relaxed select-text cursor-text"
              tabIndex={0}
              onMouseUp={handleMouseUp}
              onKeyUp={handleMouseUp}
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[22px] text-primary/60 shrink-0 mt-0.5 select-none">
                  format_quote
                </span>
                <div className="flex-1 min-w-0 space-y-2">
                  {prayer ? (
                    prayer.split(/\n+/).map((para, pIdx) => (
                      <p key={pIdx} className="leading-relaxed">
                        {renderInline(para.trim())}
                      </p>
                    ))
                  ) : (
                    <p className="text-on-surface-variant/70 not-italic font-sans text-sm">
                      No {title.toLowerCase()} entered yet. Use the AI Refinement box below or click Edit to add one.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI Refinement Box (CoverLetter-Crafter Refine Pattern) */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-ui-label-xs font-bold uppercase tracking-wider text-primary">
                <span className="material-symbols-outlined text-[16px] animate-pulse">auto_awesome</span>
                <span>AI Update {title}</span>
              </div>
              {selectedText && (
                <div className="flex items-center gap-1 text-[11px] bg-primary/15 text-primary px-2 py-0.5 rounded-full border border-primary/30 animate-in fade-in">
                  <span className="material-symbols-outlined text-[12px]">edit</span>
                  <span className="max-w-[150px] truncate">Focusing: "{selectedText}"</span>
                  <button
                    type="button"
                    onClick={() => setSelectedText('')}
                    className="ml-1 hover:text-error font-bold"
                    title="Clear selection focus"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={refinementText}
                  onChange={(e) => setRefinementText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && refinementText.trim() && !isAIRefining) {
                      e.preventDefault()
                      handleRefine()
                    }
                  }}
                  disabled={isAIRefining}
                  placeholder={
                    selectedText
                      ? `Refining selected phrase...`
                      : `Ask for changes (e.g., 'Make it more heartfelt', 'Focus on gratitude', 'Shorten')`
                  }
                  className="field-underline w-full rounded-lg border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 pr-8 text-ui-label-sm text-on-surface focus:border-primary focus:outline-none transition-colors"
                />
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/50 pointer-events-none">
                  chat_bubble
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefine}
                disabled={isAIRefining || !refinementText.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-ui-label-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              >
                {isAIRefining ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    <span>Updating…</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">sparkles</span>
                    <span>Refine with AI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Personal Note Section */}
          <div className="pt-2 border-t border-outline-variant/10">
            <button
              type="button"
              onClick={() => setShowNoteEditor(!showNoteEditor)}
              className="inline-flex items-center gap-1.5 text-ui-label-xs font-semibold text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-tertiary">lightbulb</span>
              <span>{showNoteEditor ? 'Hide reflection note' : note ? 'View reflection note' : '+ Add personal reflection note'}</span>
            </button>

            {showNoteEditor && (
              <div className="mt-2 space-y-2 animate-in fade-in duration-200">
                <textarea
                  className="field-underline w-full rounded-xl border border-outline-variant/30 bg-surface-container-high p-3 text-ui-label-sm text-on-surface focus:border-tertiary focus:outline-none transition-colors"
                  rows={2}
                  value={noteText}
                  placeholder="What stood out to you in this prayer?"
                  onChange={(e) => setNoteText(e.target.value)}
                />
                {onSaveNote && (
                  <div className="flex items-center justify-between text-ui-label-xs">
                    <span className="text-on-surface-variant/70">Personal reflection note</span>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={isSavingNote}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-ui-label-xs font-semibold text-on-tertiary-container bg-tertiary-container hover:bg-tertiary-container/80 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {noteSavedFeedback ? 'check' : 'save'}
                      </span>
                      <span>{noteSavedFeedback ? 'Saved!' : isSavingNote ? 'Saving…' : 'Save Note'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
