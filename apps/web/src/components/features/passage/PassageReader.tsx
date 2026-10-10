"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"

import { lookUpDictionary, type Segment, segmentText } from "./passage-text"
import type { ReaderBlock, ReaderGlossaryEntry, ReaderWordLookup } from "./types"

export type ReaderFontSize = "lg" | "md" | "sm"

type WordCardState = {
  anchor: { bottom: number, left: number, top: number }
  lemma?: string
  meaningJa?: string
  noteJa?: string
  partOfSpeech?: string
  source: "dictionary" | "glossary" | "not_found"
  surface: string
}

const FONT_SIZE_CLASS: Record<ReaderFontSize, string> = {
  lg: "text-[20px]",
  md: "text-[17px] sm:text-[18px]",
  sm: "text-[16px]",
}

const CODE_TOKEN_PATTERN = /(\/\/.*$)|("[^"]*")|\b(function|const|let|return|import|from|export)\b|\b([A-Za-z_]\w*)(?=\()/gm

/**
 * コードブロックの簡易シンタックスハイライト
 */
function HighlightedCode({ code }: { code: string }) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of code.matchAll(CODE_TOKEN_PATTERN)) {
    const index = match.index ?? 0
    nodes.push(code.slice(cursor, index))
    const colorClass = match[1]
      ? "text-code-comment italic"
      : match[2]
        ? "text-code-string"
        : match[3]
          ? "text-code-keyword"
          : "text-code-fn"
    nodes.push(<span className={colorClass} key={index}>{match[0]}</span>)
    cursor = index + match[0].length
  }
  nodes.push(code.slice(cursor))
  return <>{nodes}</>
}

function SegmentList({ interactive, segments }: { interactive: boolean, segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "code") {
          return (
            <code
              className="rounded border border-line bg-surface px-1 py-px font-code text-[0.82em] text-fg"
              key={index}
            >
              {segment.text}
            </code>
          )
        }
        if (segment.kind !== "word" || !interactive) {
          return <Fragment key={index}>{segment.text}</Fragment>
        }
        return (
          <span
            className="cursor-pointer rounded-[3px] transition-colors hover:bg-amber-wash hover:text-amber-bright data-[active=true]:bg-amber/25 data-[active=true]:text-amber-bright"
            data-glossary-id={segment.glossaryId}
            data-word={segment.text}
            key={index}
          >
            {segment.text}
          </span>
        )
      })}
    </>
  )
}

function WordCard({ card, onClose }: { card: WordCardState, onClose: () => void }) {
  /**
   * カードはクリック後にだけ描画されるので、ここで window を読んでもサーバー描画とずれない
   */
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 640

  const style: React.CSSProperties | undefined = isNarrow
    ? undefined
    : {
      left: Math.min(Math.max(card.anchor.left, 12), window.innerWidth - 352),
      top: card.anchor.bottom + 296 > window.innerHeight ? card.anchor.top - 8 : card.anchor.bottom + 8,
      transform: card.anchor.bottom + 296 > window.innerHeight ? "translateY(-100%)" : undefined,
    }

  return (
    <div
      aria-label={`${card.surface} の意味`}
      className={`fixed z-50 w-auto rounded-xl border border-line-strong bg-raised p-4 shadow-[0_18px_50px_rgb(0_0_0/0.45)] sm:w-[340px] ${
        isNarrow ? "inset-x-3 bottom-3" : ""
      }`}
      data-word-card
      role="dialog"
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-reading text-xl font-semibold text-fg">{card.surface}</p>
          {card.source !== "not_found" && (
            <p className="mt-0.5 text-xs text-fg-muted">
              {card.lemma && card.lemma !== card.surface.toLowerCase() && <span className="mr-2 font-reading italic">{card.lemma}</span>}
              {card.partOfSpeech}
            </p>
          )}
        </div>
        <button
          aria-label="閉じる"
          className="-m-1 rounded p-1 text-fg-faint outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
          onClick={onClose}
          type="button"
        >
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {card.source === "not_found" ? (
        <p className="mt-3 text-sm text-fg-muted">辞書に見つかりませんでした。</p>
      ) : (
        <>
          <p className="mt-3 text-[15px] leading-relaxed text-fg">{card.meaningJa}</p>
          {card.noteJa && <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{card.noteJa}</p>}
        </>
      )}
      <p className={`mt-3 flex items-center gap-1.5 text-[11px] ${card.source === "glossary" ? "text-amber" : "text-fg-faint"}`}>
        <span aria-hidden className={`size-1.5 rounded-full ${card.source === "glossary" ? "bg-amber" : "bg-fg-faint"}`} />
        {card.source === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}
      </p>
    </div>
  )
}

/**
 * 本文を表示する。段落番号の列（エディタの行番号のような gutter）・段落ごとの和訳・単語の意味・根拠のハイライトを持つ
 */
export function PassageReader({
  blocks,
  dictionary,
  fontSize = "md",
  glossary,
  hiddenGlossaryIds = [],
  highlight = null,
  showAllTranslations = false,
  translatedBlocks,
  onLookup,
  onToggleTranslation,
}: {
  blocks: ReaderBlock[]
  dictionary: Record<string, string>
  fontSize?: ReaderFontSize
  glossary: ReaderGlossaryEntry[]
  hiddenGlossaryIds?: number[]
  highlight?: { blockIndex: number, quote: string } | null
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  onLookup?: (lookup: ReaderWordLookup) => void
  onToggleTranslation?: (blockIndex: number) => void
}) {
  const [card, setCard] = useState<WordCardState | null>(null)
  const activeWordRef = useRef<HTMLElement | null>(null)

  const visibleGlossary = useMemo(
    () => glossary.filter(entry => !hiddenGlossaryIds.includes(entry.id)),
    [glossary, hiddenGlossaryIds],
  )

  useEffect(() => {
    if (!card) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCard(null)
    }
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest("[data-word-card]") && !target.closest("[data-word]")) setCard(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    window.addEventListener("mousedown", closeOnOutside)
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("mousedown", closeOnOutside)
    }
  }, [card])

  useEffect(() => {
    if (activeWordRef.current) activeWordRef.current.dataset.active = card ? "true" : "false"
  }, [card])

  const openWordCard = (event: React.MouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-word]")
    if (!target) return
    if (activeWordRef.current) activeWordRef.current.dataset.active = "false"
    activeWordRef.current = target

    const rect = target.getBoundingClientRect()
    const anchor = { bottom: rect.bottom, left: rect.left, top: rect.top }
    const surface = target.dataset.word ?? ""
    const entry = visibleGlossary.find(item => String(item.id) === target.dataset.glossaryId)

    if (entry) {
      setCard({ anchor, lemma: entry.lemma, meaningJa: entry.meaningJa, noteJa: entry.noteJa, partOfSpeech: entry.partOfSpeech, source: "glossary", surface })
      onLookup?.({ meaningJa: entry.meaningJa, source: "glossary", surface })
      return
    }
    const result = lookUpDictionary(surface, dictionary)
    if (result) {
      setCard({ anchor, lemma: result.lemma, meaningJa: result.meaningJa, source: "dictionary", surface })
      onLookup?.({ meaningJa: result.meaningJa, source: "dictionary", surface })
      return
    }
    setCard({ anchor, source: "not_found", surface })
  }

  /**
   * 段落番号（見出しとコードは数えない）。設問の "paragraph 2" と対応させる
   */
  const paragraphNumbers = useMemo(() => {
    let count = 0
    return blocks.map(block => (block.type === "code" || block.type === "heading" ? null : ++count))
  }, [blocks])

  return (
    <>
      <article className={`font-reading leading-[1.8] text-fg ${FONT_SIZE_CLASS[fontSize]}`} onClick={openWordCard}>
        {blocks.map((block, blockIndex) => {
          const isCode = block.type === "code"
          const isHeading = block.type === "heading"
          const isTranslated = !isCode && (showAllTranslations || translatedBlocks.has(blockIndex))
          const blockHighlight = highlight?.blockIndex === blockIndex ? highlight.quote : null

          return (
            <section
              className="group grid scroll-mt-24 grid-cols-[2.75rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)]"
              id={`block-${blockIndex}`}
              key={blockIndex}
            >
              <div className={`flex flex-col items-end gap-1.5 pr-3 font-code text-[12px] leading-none text-fg-faint sm:pr-4 ${isHeading ? "pt-[0.55em]" : "pt-[0.5em]"}`}>
                {isHeading && <span aria-hidden>#</span>}
                {paragraphNumbers[blockIndex] !== null && <span aria-label={`第 ${paragraphNumbers[blockIndex]} 段落`}>{paragraphNumbers[blockIndex]}</span>}
                {!isCode && onToggleTranslation && (
                  <button
                    aria-label={isTranslated ? "英文に戻す" : "この段落を和訳で表示"}
                    aria-pressed={isTranslated}
                    className={`rounded border px-1 py-0.5 font-ui text-[11px] outline-none transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-amber/60 ${
                      isTranslated
                        ? "border-amber/50 bg-amber-wash text-amber opacity-100"
                        : "border-line-strong text-fg-muted opacity-0 hover:text-fg group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleTranslation(blockIndex)
                    }}
                    type="button"
                  >
                    訳
                  </button>
                )}
              </div>

              <div className="min-w-0 max-w-[68ch]">
                {isCode ? (
                  <pre className="my-5 overflow-x-auto rounded-lg border border-line bg-surface p-4 font-code text-[13.5px] leading-[1.7] text-fg">
                    <code><HighlightedCode code={block.text} /></code>
                  </pre>
                ) : isTranslated ? (
                  <p
                    className={`border-l-2 border-amber/50 pl-4 font-ui text-[0.92em] leading-[1.95] text-fg ${isHeading ? "mt-1 mb-5 font-semibold" : "mb-[1.15em]"}`}
                    lang="ja"
                  >
                    <SegmentList interactive={false} segments={segmentText(block.translationJa ?? "", [])} />
                  </p>
                ) : isHeading ? (
                  <h1 className="mb-5 text-[1.55em] font-semibold leading-tight tracking-[-0.01em] text-fg">
                    <SegmentList interactive segments={segmentText(block.text, visibleGlossary)} />
                  </h1>
                ) : (
                  <p className="mb-[1.15em]" lang="en">
                    {blockHighlight && block.text.includes(blockHighlight) ? (
                      <>
                        <SegmentList interactive segments={segmentText(block.text.slice(0, block.text.indexOf(blockHighlight)), visibleGlossary)} />
                        <mark className="rounded-sm bg-amber/20 px-0.5 text-fg ring-1 ring-amber/50">
                          <SegmentList interactive segments={segmentText(blockHighlight, visibleGlossary)} />
                        </mark>
                        <SegmentList interactive segments={segmentText(block.text.slice(block.text.indexOf(blockHighlight) + blockHighlight.length), visibleGlossary)} />
                      </>
                    ) : (
                      <SegmentList interactive segments={segmentText(block.text, visibleGlossary)} />
                    )}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </article>
      {card && <WordCard card={card} onClose={() => setCard(null)} />}
    </>
  )
}
