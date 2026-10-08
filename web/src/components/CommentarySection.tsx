import React, { useState, useEffect } from 'react'

export interface CommentarySectionProps {
  commentary: string
  note?: string
  onSave?: (newCommentary: string) => Promise<void> | void
  onSaveNote?: (newNote: string) => Promise<void> | void
  onAIRefine?: (instruction: string, selection?: string | null) => Promise<void> | void
  isAIRefining?: boolean
  defaultOpen?: boolean
  className?: string
  // Legacy / external editing props:
  editable?: boolean
  value?: string
  onChange?: (val: string) => void
  onMouseUpInEditor?: (el: HTMLTextAreaElement) => void
  onSelectText?: (text: string) => void
}

// Comprehensive regex for Bible book references (e.g., John 3:16, 1 Cor 13:4-8, Matt 6:14-15)
export const BIBLE_REF_REGEX =
  /\b(?:(?:[123]|I|II|III)\s+)?(?:Genesis|Gen|Exodus|Exod|Ex|Leviticus|Lev|Numbers|Num|Deuteronomy|Deut|Dt|Joshua|Josh|Judges|Judg|Jdg|Ruth|Ru|Samuel|Sam|Kings|Kgs|Chronicles|Chron|Chr|Ezra|Ezr|Nehemiah|Neh|Esther|Esth|Est|Job|Jb|Psalms?|Ps|Proverbs|Prov|Pr|Ecclesiastes|Eccl|Eccles|Song\s+of\s+(?:Solomon|Songs)|Songs?|Isaiah|Isa|Jeremiah|Jer|Lamentations|Lam|Ezekiel|Ezek|Eze|Daniel|Dan|Hosea|Hos|Joel|Amos|Am|Obadiah|Obad|Ob|Jonah|Jon|Micah|Mic|Nahum|Nah|Habakkuk|Hab|Zephaniah|Zeph|Zep|Haggai|Hag|Zechariah|Zech|Zec|Malachi|Mal|Matthew|Matt|Mt|Mark|Mk|Luke|Lk|John|Jn|Acts|Ac|Romans|Rom|Ro|Corinthians|Cor|Galatians|Gal|Ephesians|Eph|Philippians|Phil|Colossians|Col|Thessalonians|Thess|Th|Timothy|Tim|Titus|Tit|Philemon|Phlm|Hebrews|Heb|James|Jas|Peter|Pet|Pt|Jude|Jud|Revelation|Rev)\.?\s+\d+(?::\d+(?:[-–]\d+)?)?\b/i

export default function CommentarySection({
  commentary,
  note = '',
  onSave,
  onSaveNote,
  onAIRefine,
  isAIRefining = false,
  defaultOpen = true,
  className = '',
  editable = false,
  value,
  onChange,
  onMouseUpInEditor,
  onSelectText,
}: CommentarySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isEditing, setIsEditing] = useState(editable)
  const [editText, setEditText] = useState(value ?? commentary)
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // AI Refinement state
  const [refinementText, setRefinementText] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [showNoteEditor, setShowNoteEditor] = useState(Boolean(note))
  const [noteText, setNoteText] = useState(note)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setEditText(value ?? commentary)
    }
  }, [value, commentary, isEditing])

  useEffect(() => {
    setIsEditing(editable)
  }, [editable])

  useEffect(() => {
    setNoteText(note)
    if (note) setShowNoteEditor(true)
  }, [note])

  const handleCopy = async () => {
    const textToCopy = isEditing ? editText : commentary
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleStartEdit = () => {
    setEditText(commentary)
    setIsEditing(true)
    setIsOpen(true)
  }

  const handleCancelEdit = () => {
    setEditText(commentary)
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    if (onSave) {
      setIsSaving(true)
      try {
        await onSave(editText)
        setIsEditing(false)
      } finally {
        setIsSaving(false)
      }
    } else if (onChange) {
      onChange(editText)
      setIsEditing(false)
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
        onSelectText?.(selectedStr)
      }
    }
  }

  const handleRefine = async () => {
    if (!refinementText.trim() || isAIRefining || !onAIRefine) return
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

  const activeText = isEditing ? editText : commentary
  const wordCount = (activeText || '').trim().split(/\s+/).filter(Boolean).length
  const readMinutes = Math.max(1, Math.ceil(wordCount / 180))

  // If called directly inside a legacy wrapper without onSave/onAIRefine, provide lightweight behavior
  const isStandalone = Boolean(onSave || onAIRefine)

  if (!isStandalone && editable) {
    return (
      <div className="space-y-2">
        <textarea
          className="field-underline w-full rounded-xl border border-outline-variant/30 bg-surface-container-high p-4 font-body-reading text-body-reading text-on-surface focus:border-primary focus:outline-none transition-colors"
          rows={8}
          value={value ?? ''}
          placeholder="Write or edit commentary here... Use **bold** for key words, *italics* for verses, and blank lines between paragraphs."
          onChange={(e) => onChange?.(e.target.value)}
          onMouseUp={(e) => onMouseUpInEditor?.(e.currentTarget)}
        />
        <div className="flex items-center justify-between text-ui-label-xs text-on-surface-variant/70 px-1">
          <span>Tip: Separate paragraphs with blank lines. Use **bold** for key words & *italics* for scripture quotes.</span>
          <span>Select text to Revise with AI</span>
        </div>
      </div>
    )
  }

  if (!isStandalone && !editable) {
    if (!commentary) return null
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-outline-variant/15 pb-2 text-ui-label-xs text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-medium">
              <span className="material-symbols-outlined text-[14px] text-primary">schedule</span>
              {readMinutes} min read
            </span>
            <span>·</span>
            <span>{wordCount} words</span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-ui-label-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
            title="Copy commentary text"
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        <div
          className="commentary-body space-y-4 font-body-reading text-body-reading leading-relaxed text-on-surface select-text cursor-text"
          tabIndex={0}
          onMouseUp={handleMouseUp}
          onKeyUp={handleMouseUp}
        >
          <CommentaryContent text={commentary} />
        </div>
      </div>
    )
  }

  // Standalone Full Section with Header Toolbar, Direct Edit/Save, and AI Update Only
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
          <span className="material-symbols-outlined text-[20px] text-primary shrink-0">menu_book</span>
          <span className="min-w-0 truncate font-ui-label-md text-on-surface font-semibold">Commentary</span>
          {wordCount > 0 && (
            <span className="text-ui-label-xs text-on-surface-variant/70 font-normal">
              · {readMinutes} min read ({wordCount} words)
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
                title="Edit commentary"
              >
                <span className="material-symbols-outlined text-[15px]">edit</span>
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-ui-label-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
                title="Copy commentary"
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
          {/* Main Commentary View / Edit Content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                className="field-underline w-full rounded-xl border border-outline-variant/40 bg-surface-container-high p-4 font-body-reading text-body-reading text-on-surface leading-relaxed focus:border-primary focus:outline-none transition-colors cursor-text select-text"
                rows={10}
                value={editText}
                placeholder="Write or edit commentary here... Use **bold** for key words, *italics* for verses, and blank lines between paragraphs."
                onChange={(e) => {
                  setEditText(e.target.value)
                  onChange?.(e.target.value)
                }}
                onKeyDown={handleKeyDownInEditor}
                onSelect={(e) => {
                  const target = e.currentTarget
                  const sel = target.value.slice(target.selectionStart, target.selectionEnd).trim()
                  if (sel) {
                    setSelectedText(sel)
                    onSelectText?.(sel)
                  }
                }}
                onMouseUp={(e) => {
                  const target = e.currentTarget
                  const sel = target.value.slice(target.selectionStart, target.selectionEnd).trim()
                  if (sel) {
                    setSelectedText(sel)
                    onSelectText?.(sel)
                  }
                  onMouseUpInEditor?.(target)
                }}
                onKeyUp={(e) => {
                  const target = e.currentTarget
                  const sel = target.value.slice(target.selectionStart, target.selectionEnd).trim()
                  if (sel) {
                    setSelectedText(sel)
                    onSelectText?.(sel)
                  }
                  onMouseUpInEditor?.(target)
                }}
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-ui-label-xs text-on-surface-variant/70 px-1">
                <span>Tip: Press <kbd className="px-1 py-0.5 rounded bg-surface-container-highest font-mono text-[10px]">Ctrl+Enter</kbd> to save. Separate paragraphs with blank lines.</span>
                <span>{editText.length} chars · {wordCount} words</span>
              </div>
            </div>
          ) : (
            <div
              className="commentary-body space-y-4 font-body-reading text-body-reading leading-relaxed text-on-surface select-text cursor-text"
              tabIndex={0}
              onMouseUp={handleMouseUp}
              onKeyUp={handleMouseUp}
            >
              {commentary ? (
                <CommentaryContent text={commentary} />
              ) : (
                <p className="text-on-surface-variant/70 italic text-sm">
                  No commentary entered yet. Use the AI Update box below or click Edit to write commentary.
                </p>
              )}
            </div>
          )}

          {/* AI Refinement Box (CoverLetter-Crafter Refine Pattern) */}
          {onAIRefine && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-ui-label-xs font-bold uppercase tracking-wider text-primary">
                  <span className="material-symbols-outlined text-[16px] animate-pulse">auto_awesome</span>
                  <span>AI Update Commentary</span>
                </div>
                {selectedText && (
                  <div className="flex items-center gap-1 text-[11px] bg-primary/15 text-primary px-2 py-0.5 rounded-full border border-primary/30 animate-in fade-in">
                    <span className="material-symbols-outlined text-[12px]">edit</span>
                    <span className="max-w-[150px] truncate">Focusing: "{selectedText}"</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedText('')
                        onSelectText?.('')
                      }}
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
                        ? `Refining selected section...`
                        : `Ask for changes (e.g., 'Make the tone warmer', 'Explain historical context', 'Shorten paragraph 2')`
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
          )}

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
                  placeholder="Your personal reflection / takeaway from this commentary"
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

/**
 * Parses raw text into paragraphs, blockquotes, subheadings, and lists with rich inline formatting.
 */
export function CommentaryContent({ text }: { text: string }) {
  const blocks = splitIntoBlocks(text)

  return (
    <>
      {blocks.map((block, idx) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // Subheading: ### or ##
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          const headingText = trimmed.replace(/^#+\s+/, '')
          return (
            <h4
              key={`h-${idx}`}
              className="font-headline-md text-headline-md text-primary font-bold mt-5 mb-2 first:mt-0 tracking-tight"
            >
              {renderInline(headingText)}
            </h4>
          )
        }

        // Blockquote: > quote
        if (trimmed.startsWith('>')) {
          const quoteContent = trimmed
            .split('\n')
            .map((l) => l.replace(/^>\s?/, ''))
            .join(' ')
          return (
            <blockquote
              key={`bq-${idx}`}
              className="my-3 pl-4 py-3 rounded-r-xl border-l-4 border-tertiary-container bg-surface-container-low/70 text-on-surface font-serif italic shadow-xs leading-relaxed"
            >
              {renderInline(quoteContent)}
            </blockquote>
          )
        }

        // Bulleted list: lines starting with * or - or •
        const lines = trimmed.split('\n')
        const isBulletList = lines.every((l) => /^(\*|-|•)\s+/.test(l.trim()))
        if (isBulletList && lines.length > 0) {
          return (
            <ul key={`ul-${idx}`} className="space-y-2 my-3 pl-2">
              {lines.map((l, lIdx) => {
                const itemText = l.trim().replace(/^(\*|-|•)\s+/, '')
                return (
                  <li key={`li-${lIdx}`} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="flex-1">{renderInline(itemText)}</span>
                  </li>
                )
              })}
            </ul>
          )
        }

        // Numbered list: lines starting with 1. 2. etc.
        const isNumList = lines.every((l) => /^\d+\.\s+/.test(l.trim()))
        if (isNumList && lines.length > 0) {
          return (
            <ol key={`ol-${idx}`} className="space-y-2 my-3 pl-1">
              {lines.map((l, lIdx) => {
                const itemText = l.trim().replace(/^\d+\.\s+/, '')
                return (
                  <li key={`nli-${lIdx}`} className="flex items-start gap-2.5">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-ui-label-xs font-bold text-primary">
                      {lIdx + 1}
                    </span>
                    <span className="flex-1 mt-0.5">{renderInline(itemText)}</span>
                  </li>
                )
              })}
            </ol>
          )
        }

        // Bold lead-in paragraph: e.g., "**Key Point:** text..."
        const leadInMatch = trimmed.match(/^(\*\*([^*]+)\*\*|__([^_]+)__)(:\s*|\s+)([\s\S]*)$/)
        if (leadInMatch) {
          const leadTitle = leadInMatch[2] || leadInMatch[3]
          const separator = leadInMatch[4]
          const remainder = leadInMatch[5]
          return (
            <p key={`lead-p-${idx}`} className="leading-relaxed text-body-reading text-on-surface mb-3">
              <strong className="font-semibold text-primary font-serif">
                {leadTitle}
                {separator}
              </strong>
              {renderInline(remainder)}
            </p>
          )
        }

        // Standard Paragraph
        return (
          <p
            key={`p-${idx}`}
            className="leading-relaxed text-body-reading text-on-surface mb-3.5 last:mb-0"
          >
            {renderInline(trimmed)}
          </p>
        )
      })}
    </>
  )
}

/**
 * Intelligently splits commentary text into paragraphs.
 */
export function splitIntoBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  // Check if double newlines exist
  if (normalized.includes('\n\n')) {
    return normalized.split(/\n\s*\n+/).filter((b) => b.trim().length > 0)
  }

  // Check if single newlines exist
  if (normalized.includes('\n')) {
    return normalized.split(/\n+/).filter((b) => b.trim().length > 0)
  }

  // Monolithic text without line breaks: break long text into ~2-3 sentence paragraphs
  if (normalized.length > 350) {
    const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)
    if (sentences && sentences.length > 3) {
      const chunks: string[] = []
      let currentChunk = ''
      let sentenceCount = 0

      for (const s of sentences) {
        currentChunk += s
        sentenceCount++
        if (sentenceCount >= 3 || currentChunk.length >= 300) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
          sentenceCount = 0
        }
      }
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
      return chunks
    }
  }

  return [normalized]
}

/**
 * Tokenizes and renders inline elements:
 * 1. Bold-Italics: ***text*** or ___text___
 * 2. Bold: **text** or __text__
 * 3. Italics: *text* or _text_
 * 4. Quoted Scripture / Text: “...” or "..."
 * 5. Bible Verse Citations: (e.g., Romans 8:28, John 3:16)
 */
export function renderInline(text: string): React.ReactNode[] {
  const tokenRegex = new RegExp(
    `(\\*\\*\\*([^*]+)\\*\\*\\*|___([^_]+)___)|(\\*\\*([^*]+)\\*\\*|__([^_]+)__)|(\\*([^*]+)\\*|_([^_]+)_)|([“"][^”"\\n]{3,}[”"])|(${BIBLE_REF_REGEX.source})`,
    'gi'
  )

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(text)) !== null) {
    const matchIndex = match.index
    if (matchIndex > lastIndex) {
      nodes.push(text.substring(lastIndex, matchIndex))
    }

    const fullMatch = match[0]

    if (match[1]) {
      const inner = match[2] || match[3]
      nodes.push(
        <strong key={`bi-${matchIndex}`} className="font-bold text-on-surface">
          <em className="italic font-serif">{inner}</em>
        </strong>
      )
    } else if (match[4]) {
      const inner = match[5] || match[6]
      nodes.push(
        <strong key={`b-${matchIndex}`} className="font-semibold text-on-surface">
          {inner}
        </strong>
      )
    } else if (match[7]) {
      const inner = match[8] || match[9]
      nodes.push(
        <em key={`i-${matchIndex}`} className="italic font-serif text-on-surface/90">
          {inner}
        </em>
      )
    } else if (match[10]) {
      const quoteText = match[10]
      nodes.push(
        <span
          key={`q-${matchIndex}`}
          className="font-serif italic text-on-surface/90 font-medium px-0.5"
        >
          {quoteText}
        </span>
      )
    } else if (match[11]) {
      const refText = match[11]
      nodes.push(
        <span
          key={`ref-${matchIndex}`}
          className="font-serif italic font-semibold text-primary bg-primary/10 dark:bg-primary/20 px-1.5 py-0.5 rounded text-[0.95em] inline-flex items-center gap-0.5 my-0.5 transition-colors"
          title={`Bible Reference: ${refText}`}
        >
          <span className="material-symbols-outlined text-[12px] opacity-70">menu_book</span>
          {refText}
        </span>
      )
    } else {
      nodes.push(fullMatch)
    }

    lastIndex = matchIndex + fullMatch.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex))
  }

  return nodes
}
