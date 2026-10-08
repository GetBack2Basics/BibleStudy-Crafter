import { useState, useEffect, useRef } from 'react'
import { studies, voicePreferences, type DayDraft, type SourceTextResult } from '../lib/studies'

export type AnySource = {
  title: string
  url: string
  snippet?: string
  source: string
  kind?: string
  platform?: string | null
  engagement?: number | null
  sentiment?: 'negative' | 'neutral' | 'positive'
  confidence?: number
}


interface SourceReaderModalProps {
  source: AnySource | null
  studyId: number
  dayNumber: number
  draft?: DayDraft | null
  notes?: Record<string, string>
  onClose: () => void
  onSaveNote: (targetKey: string, noteContent: string) => Promise<void> | void
}

export default function SourceReaderModal({
  source,
  studyId,
  dayNumber,
  draft,
  notes = {},
  onClose,
  onSaveNote,
}: SourceReaderModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullText, setFullText] = useState<string>('')
  const [sourceTitle, setSourceTitle] = useState<string>('')
  const [selectedText, setSelectedText] = useState<string>('')
  const [userComment, setUserComment] = useState<string>('')
  const [targetSection, setTargetSection] = useState<string>('discussions')
  const [savingNote, setSavingNote] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const textContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!source) return
    setSourceTitle(source.title)
    setSelectedText('')
    setUserComment('')
    setError(null)
    setSavedSuccess(false)
    setLoading(true)

    // Set default target section
    if (draft?.questions && draft.questions.length > 0) {
      setTargetSection('question_0')
    } else {
      setTargetSection('discussions')
    }

    studies
      .fetchSourceText(source.url, studyId, dayNumber)
      .then((res: SourceTextResult) => {
        if (res.title && !source.title) setSourceTitle(res.title)
        setFullText(res.text || '')
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not fetch full page text.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [source, studyId, dayNumber, draft])

  if (!source) return null

  // Capture highlighted text within the reader container
  const handleMouseUp = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const text = selection.toString().trim()
    if (text) {
      setSelectedText(text)
    }
  }

  const handleUseSnippet = () => {
    if (source.snippet) {
      setSelectedText(source.snippet)
    }
  }

  const handleSaveToNotes = async () => {
    const quote = selectedText.trim() || source.snippet || ''
    if (!quote && !userComment.trim()) return

    setSavingNote(true)
    try {
      const existing = notes[targetSection] || ''
      const sourceName = source.source || source.platform || 'External Source'
      const attribution = `[From: "${sourceTitle || source.title}" (${sourceName})]`
      
      let newNoteEntry = ''
      if (quote) {
        newNoteEntry += `> "${quote}"\n${attribution}`
      }
      if (userComment.trim()) {
        newNoteEntry += quote ? `\n\nReflection: ${userComment.trim()}` : userComment.trim()
      }

      const combinedNotes = existing
        ? `${existing}\n\n---\n${newNoteEntry}`
        : newNoteEntry

      await onSaveNote(targetSection, combinedNotes)
      setSavedSuccess(true)
      setUserComment('')
      setTimeout(() => setSavedSuccess(false), 3500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note.')
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-scrim/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[92vh] rounded-3xl bg-surface-container-low border border-outline-variant/30 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-outline-variant/20 bg-surface-container-lowest">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                <span className="material-symbols-outlined text-[15px]">
                  {source.kind === 'social' ? 'forum' : 'menu_book'}
                </span>
              </span>
              <span className="font-ui-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                {source.source}
              </span>
              {typeof source.confidence === 'number' && (
                <span className={`rounded-full px-2 py-0.5 font-ui-label-xs font-semibold ${
                  source.sentiment === 'negative'
                    ? 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30'
                    : source.sentiment === 'positive'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {Math.round(source.confidence * 100)}% Confidence
                </span>
              )}
              {source.platform && (
                <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-ui-label-xs text-on-tertiary-container">
                  {source.platform}
                </span>
              )}
              {typeof source.engagement === 'number' && (
                <span className="font-ui-label-xs text-on-surface-variant/70">
                  ▲ {source.engagement}
                </span>
              )}
            </div>
            <h2 className="font-headline-md text-lg font-bold text-on-surface leading-snug">
              {sourceTitle || source.title}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0 pt-1">
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1 text-primary hover:text-primary-container"
              title="Open original website in a new tab"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              <span className="hidden sm:inline">Open original</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Summary Snippet with configurable max length */}
          {source.snippet && (
            <div className="rounded-2xl border border-secondary/20 bg-secondary/5 p-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-secondary">
                <span>Summary (~{voicePreferences.getSummaryLength()} chars limit)</span>
                <button
                  type="button"
                  onClick={handleUseSnippet}
                  className="text-[11px] lowercase tracking-normal text-primary hover:underline cursor-pointer"
                >
                  Quote this summary
                </button>
              </div>
              <p className="font-body-reading text-sm text-on-surface italic leading-relaxed whitespace-pre-line">
                "{source.snippet.length > voicePreferences.getSummaryLength()
                  ? source.snippet.slice(0, voicePreferences.getSummaryLength()) + '…'
                  : source.snippet}"
              </p>
            </div>
          )}


          {/* Full Page Content / Loader */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-ui-label-sm font-semibold uppercase tracking-wide text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">article</span>
                Source Reading
              </span>
              <span className="text-xs text-on-surface-variant/70 italic">
                💡 Select text to quote directly in your notes
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant space-y-2 rounded-2xl bg-surface-container-lowest border border-outline-variant/20">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-ui-label-sm">Loading full source text…</span>
              </div>
            ) : error && !fullText ? (
              <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-5 text-center space-y-3">
                <p className="text-ui-label-sm text-on-surface-variant">
                  This website does not allow automated inline extraction, but the summary is shown above.
                </p>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn-outline text-xs inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                  Read directly on original site
                </a>
              </div>
            ) : (
              <div
                ref={textContainerRef}
                onMouseUp={handleMouseUp}
                className="select-text rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4 sm:p-5 font-body-reading text-sm text-on-surface leading-relaxed max-h-[320px] overflow-y-auto whitespace-pre-wrap selection:bg-primary/20 selection:text-primary"
              >
                {fullText || source.snippet || 'No text extracted.'}
              </div>
            )}
          </div>

          {/* Notes Integration: Select text & add to study notes */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-ui-label-md font-semibold text-primary">
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                <span>Add to Study Notes</span>
              </div>
              {savedSuccess && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full animate-fade-in">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  Saved to notes!
                </span>
              )}
            </div>

            {/* Quoted Text Preview */}
            {selectedText ? (
              <div className="rounded-xl border border-primary-container/40 bg-surface-container-lowest p-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-primary font-medium">
                  <span>Selected Quote:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedText('')}
                    className="text-on-surface-variant hover:text-error text-xs"
                  >
                    Clear selection
                  </button>
                </div>
                <p className="text-xs italic text-on-surface leading-relaxed">
                  "{selectedText}"
                </p>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">
                Highlight text above to quote it, or click{' '}
                <button
                  type="button"
                  onClick={handleUseSnippet}
                  className="text-primary underline font-medium hover:text-primary-container"
                >
                  quote snippet
                </button>{' '}
                to attach this source.
              </p>
            )}

            {/* Destination Selection */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="text-xs font-medium text-on-surface-variant shrink-0">
                Save note to:
              </label>
              <select
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
                className="field-underline flex-1 py-1.5 px-2.5 text-xs rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-on-surface focus:border-primary"
              >
                {draft?.questions?.map((q, idx) => (
                  <option key={`q_${idx}`} value={`question_${idx}`}>
                    Question {idx + 1}: {q.slice(0, 45)}{q.length > 45 ? '…' : ''}
                  </option>
                ))}
                <option value="discussions">Voices / Discussions Note</option>
                <option value="commentary">Commentary Note</option>
                <option value="opening_prayer">Opening Prayer Note</option>
                <option value="closing_prayer">Closing Prayer Note</option>
              </select>
            </div>

            {/* User reflection / comment */}
            <textarea
              className="field-underline w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary outline-none"
              rows={2}
              placeholder="Add your reflection, takeaway, or response to this source…"
              value={userComment}
              onChange={(e) => setUserComment(e.target.value)}
            />

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveToNotes}
                disabled={savingNote || (!selectedText && !userComment.trim() && !source.snippet)}
                className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {savingNote ? 'hourglass_empty' : 'save'}
                </span>
                {savingNote ? 'Saving…' : 'Save to Notes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
