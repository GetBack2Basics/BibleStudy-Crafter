import React, { useState } from 'react'

interface CommentarySectionProps {
  commentary: string
  onSelectText?: (text: string) => void
  editable?: boolean
  value?: string
  onChange?: (val: string) => void
  onMouseUpInEditor?: (el: HTMLTextAreaElement) => void
}

// Comprehensive regex for Bible book references (e.g., John 3:16, 1 Cor 13:4-8, Matt 6:14-15)
const BIBLE_REF_REGEX =
  /\b(?:(?:[123]|I|II|III)\s+)?(?:Genesis|Gen|Exodus|Exod|Ex|Leviticus|Lev|Numbers|Num|Deuteronomy|Deut|Dt|Joshua|Josh|Judges|Judg|Jdg|Ruth|Ru|Samuel|Sam|Kings|Kgs|Chronicles|Chron|Chr|Ezra|Ezr|Nehemiah|Neh|Esther|Esth|Est|Job|Jb|Psalms?|Ps|Proverbs|Prov|Pr|Ecclesiastes|Eccl|Eccles|Song\s+of\s+(?:Solomon|Songs)|Songs?|Isaiah|Isa|Jeremiah|Jer|Lamentations|Lam|Ezekiel|Ezek|Eze|Daniel|Dan|Hosea|Hos|Joel|Amos|Am|Obadiah|Obad|Ob|Jonah|Jon|Micah|Mic|Nahum|Nah|Habakkuk|Hab|Zephaniah|Zeph|Zep|Haggai|Hag|Zechariah|Zech|Zec|Malachi|Mal|Matthew|Matt|Mt|Mark|Mk|Luke|Lk|John|Jn|Acts|Ac|Romans|Rom|Ro|Corinthians|Cor|Galatians|Gal|Ephesians|Eph|Philippians|Phil|Colossians|Col|Thessalonians|Thess|Th|Timothy|Tim|Titus|Tit|Philemon|Phlm|Hebrews|Heb|James|Jas|Peter|Pet|Pt|Jude|Jud|Revelation|Rev)\.?\s+\d+(?::\d+(?:[-–]\d+)?)?\b/i

export default function CommentarySection({
  commentary,
  onSelectText,
  editable = false,
  value,
  onChange,
  onMouseUpInEditor,
}: CommentarySectionProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const textToCopy = editable ? (value ?? commentary) : commentary
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  // Handle user selecting text in the formatted view to feed into AI revision
  const handleMouseUp = () => {
    if (!onSelectText) return
    const selection = window.getSelection()
    if (selection) {
      const selectedStr = selection.toString().trim()
      if (selectedStr.length > 0) {
        onSelectText(selectedStr)
      }
    }
  }

  if (editable) {
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

  if (!commentary) return null

  // Calculate stats
  const wordCount = commentary.trim().split(/\s+/).filter(Boolean).length
  const readMinutes = Math.max(1, Math.ceil(wordCount / 180))

  return (
    <div className="space-y-3">
      {/* Top micro-toolbar: reading metadata & quick copy */}
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

      {/* Formatted commentary content */}
      <div
        className="commentary-body space-y-4 font-body-reading text-body-reading leading-relaxed text-on-surface selection:bg-primary/20 selection:text-on-surface"
        onMouseUp={handleMouseUp}
      >
        <CommentaryContent text={commentary} />
      </div>
    </div>
  )
}

/**
 * Parses raw text into paragraphs, blockquotes, subheadings, and lists with rich inline formatting.
 */
function CommentaryContent({ text }: { text: string }) {
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
 * If double newlines exist, splits by paragraphs.
 * If single newlines exist, splits by lines.
 * If it's a monolithic single block without newlines (>350 chars with multiple sentences),
 * splits into natural paragraphs of 2-3 sentences each.
 */
function splitIntoBlocks(text: string): string[] {
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
    // Match sentences (ending in .!?) followed by space and capital letter
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
function renderInline(text: string): React.ReactNode[] {
  // Regex that captures formatting tokens in order of precedence
  const tokenRegex = new RegExp(
    `(\\*\\*\\*([^*]+)\\*\\*\\*|___([^_]+)___)|(\\*\\*([^*]+)\\*\\*|__([^_]+)__)|(\\*([^*]+)\\*|_([^_]+)_)|([“"][^”"\\n]{3,}[”"])|(${BIBLE_REF_REGEX.source})`,
    'gi'
  )

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(text)) !== null) {
    const matchIndex = match.index
    // Push preceding plain text
    if (matchIndex > lastIndex) {
      nodes.push(text.substring(lastIndex, matchIndex))
    }

    const fullMatch = match[0]

    if (match[1]) {
      // Bold + Italic: ***text***
      const inner = match[2] || match[3]
      nodes.push(
        <strong key={`bi-${matchIndex}`} className="font-bold text-on-surface">
          <em className="italic font-serif">{inner}</em>
        </strong>
      )
    } else if (match[4]) {
      // Bold: **text**
      const inner = match[5] || match[6]
      nodes.push(
        <strong key={`b-${matchIndex}`} className="font-semibold text-on-surface">
          {inner}
        </strong>
      )
    } else if (match[7]) {
      // Italic: *text*
      const inner = match[8] || match[9]
      nodes.push(
        <em key={`i-${matchIndex}`} className="italic font-serif text-on-surface/90">
          {inner}
        </em>
      )
    } else if (match[10]) {
      // Quoted scripture phrase: “...” or "..."
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
      // Bible Reference Citation: John 3:16, Romans 8:28, etc.
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

  // Push remaining text after the last match
  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex))
  }

  return nodes
}
