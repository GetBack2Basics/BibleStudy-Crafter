import React from 'react'
import type { AnySource } from './SourceReaderModal'

interface VoicesGuideRendererProps {
  guide: string
  sources: AnySource[]
  onOpenSource: (source: AnySource) => void
}

export default function VoicesGuideRenderer({
  guide,
  sources,
  onOpenSource,
}: VoicesGuideRendererProps) {
  if (!guide) return null

  // Helper to find or build a source by URL or 1-based index
  const getSourceByIndex = (indexOneBased: number): AnySource => {
    const idx = indexOneBased - 1
    if (sources[idx]) return sources[idx]
    return {
      title: `Source [${indexOneBased}]`,
      url: '',
      snippet: '',
      source: `Source ${indexOneBased}`,
    }
  }

  const getSourceByUrl = (url: string, title?: string): AnySource => {
    const cleanUrl = url.trim()
    const found = sources.find(
      (s) => s.url.toLowerCase() === cleanUrl.toLowerCase() || s.url.includes(cleanUrl)
    )
    if (found) return found

    let host = ''
    try {
      host = new URL(cleanUrl).hostname.replace(/^www\./, '')
    } catch {
      host = 'External link'
    }

    return {
      title: title || host,
      url: cleanUrl,
      snippet: '',
      source: host,
    }
  }

  // Parse a single text line/paragraph for bold, citations [1], links [title](url), and (http://...)
  const renderInlineContent = (text: string): React.ReactNode[] => {
    // Regex matching:
    // 1. Bracketed numbers: [1] or [1, 2] or [1, 3]
    // 2. Markdown links: [Title](url)
    // 3. Parenthesized URLs: (http://...)
    // 4. Bold text: **text**
    const tokenRegex =
      /(\[(\d+(?:\s*,\s*\d+)*)\])|(\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\))|(\((https?:\/\/[^\s\)]+)\))|(\*\*([^*]+)\*\*)/g

    const nodes: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = tokenRegex.exec(text)) !== null) {
      const matchIndex = match.index
      // Add plain text preceding this match
      if (matchIndex > lastIndex) {
        nodes.push(text.substring(lastIndex, matchIndex))
      }

      if (match[1]) {
        // [1] or [1, 2]
        const numList = match[2].split(',').map((n) => parseInt(n.trim(), 10))
        numList.forEach((num, nIdx) => {
          if (isNaN(num)) return
          const s = getSourceByIndex(num)
          nodes.push(
            <button
              key={`cite-${matchIndex}-${num}-${nIdx}`}
              type="button"
              onClick={() => onOpenSource(s)}
              className="inline-flex items-center justify-center min-w-[20px] h-[19px] px-1.5 mx-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold hover:bg-primary hover:text-on-primary transition-all cursor-pointer shadow-xs align-baseline"
              title={s.title ? `${s.title} (${s.source})` : `Open source [${num}]`}
            >
              [{num}]
            </button>
          )
        })
      } else if (match[3]) {
        // [Title](url)
        const anchorTitle = match[4]
        const anchorUrl = match[5]
        const s = getSourceByUrl(anchorUrl, anchorTitle)
        nodes.push(
          <button
            key={`mdlink-${matchIndex}`}
            type="button"
            onClick={() => onOpenSource(s)}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-container underline underline-offset-2 transition-colors cursor-pointer text-left"
            title={`View source: ${s.title}`}
          >
            <span>{anchorTitle}</span>
            <span className="material-symbols-outlined text-[13px]">visibility</span>
          </button>
        )
      } else if (match[6]) {
        // (https://...)
        const rawUrl = match[7]
        const s = getSourceByUrl(rawUrl)
        nodes.push(
          <button
            key={`urllink-${matchIndex}`}
            type="button"
            onClick={() => onOpenSource(s)}
            className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-md bg-surface-container text-primary hover:bg-primary hover:text-on-primary text-xs font-medium transition-colors cursor-pointer"
            title={`Open source: ${s.source}`}
          >
            <span className="material-symbols-outlined text-[12px]">link</span>
            <span>{s.source}</span>
          </button>
        )
      } else if (match[8]) {
        // **bold**
        const boldText = match[9]
        nodes.push(
          <strong key={`bold-${matchIndex}`} className="font-semibold text-on-surface">
            {boldText}
          </strong>
        )
      }

      lastIndex = tokenRegex.lastIndex
    }

    if (lastIndex < text.length) {
      nodes.push(text.substring(lastIndex))
    }

    return nodes
  }

  // Split lines and render paragraphs / headers
  const lines = guide.split('\n')

  return (
    <div className="space-y-3 font-body-reading text-on-surface leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />
        }

        // Section headers
        if (trimmed.startsWith('## ')) {
          const headerText = trimmed.replace(/^##\s+/, '')
          const isOfficial = headerText.toLowerCase().includes('official')
          const isSocial = headerText.toLowerCase().includes('social')
          return (
            <div
              key={idx}
              className="mt-4 mb-2 pt-2 first:mt-0 flex items-center gap-2 border-b border-outline-variant/20 pb-1.5"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">
                {isSocial ? 'forum' : isOfficial ? 'menu_book' : 'bookmark'}
              </span>
              <h3 className="font-headline-sm text-sm font-bold uppercase tracking-wider text-on-surface">
                {headerText}
              </h3>
            </div>
          )
        }

        if (trimmed.startsWith('### ')) {
          const subText = trimmed.replace(/^###\s+/, '')
          return (
            <h4
              key={idx}
              className="font-ui-label-md font-semibold text-on-surface mt-2 mb-1"
            >
              {subText}
            </h4>
          )
        }

        return (
          <p key={idx} className="text-on-surface leading-relaxed">
            {renderInlineContent(line)}
          </p>
        )
      })}
    </div>
  )
}
