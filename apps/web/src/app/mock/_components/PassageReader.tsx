"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"

import type { MockGlossaryEntry, MockPassageBlock, MockWordLookup } from "@/libs/mock-data"

import { lookUpDictionary, type Segment, segmentText } from "./passage-text"
import type { ReadAloudState } from "./ReadAloud"

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
 * コードブロックの簡易シンタックスハイライト（モック用）
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

/**
 * 読み上げ中の単語の印：琥珀の下線と淡い背景（単語のカードを開いた単語の表示とは別にする）
 */
const READING_WORD_CLASS = "bg-amber/15 shadow-[inset_0_-2px_0_var(--color-amber)]"

function SegmentList({
  interactive,
  readingWordIndex = null,
  segments,
  wordOffset = 0,
}: {
  interactive: boolean
  readingWordIndex?: number | null
  segments: Segment[]
  wordOffset?: number
}) {
  /**
   * 単語だけに通し番号を振る（読み上げ中の単語の位置と対応させる）
   */
  const wordOrdinals: (number | null)[] = []
  let nextOrdinal = wordOffset
  for (const segment of segments) {
    wordOrdinals.push(segment.kind === "word" ? nextOrdinal++ : null)
  }
  return (
    <>
      {segments.map((segment, index) => {
        const isReading = wordOrdinals[index] !== null && wordOrdinals[index] === readingWordIndex
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
            className={`cursor-pointer rounded-[3px] transition-colors hover:bg-amber-wash hover:text-amber-bright data-[active=true]:bg-amber/25 data-[active=true]:text-amber-bright ${
              isReading ? READING_WORD_CLASS : ""
            }`}
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

const countWords = (segments: Segment[]) => segments.filter(segment => segment.kind === "word").length

/**
 * 根拠のハイライトを含む段落。前・根拠・後の 3 つに分けても、読み上げ中の単語の位置が通しで合うようにする
 */
function HighlightedParagraph({
  glossary,
  quote,
  readingWordIndex,
  text,
}: {
  glossary: MockGlossaryEntry[]
  quote: string
  readingWordIndex: number | null
  text: string
}) {
  const start = text.indexOf(quote)
  const before = segmentText(text.slice(0, start), glossary)
  const middle = segmentText(quote, glossary)
  const after = segmentText(text.slice(start + quote.length), glossary)
  return (
    <>
      <SegmentList interactive readingWordIndex={readingWordIndex} segments={before} />
      <mark className="rounded-sm bg-amber/20 px-0.5 text-fg ring-1 ring-amber/50">
        <SegmentList interactive readingWordIndex={readingWordIndex} segments={middle} wordOffset={countWords(before)} />
      </mark>
      <SegmentList interactive readingWordIndex={readingWordIndex} segments={after} wordOffset={countWords(before) + countWords(middle)} />
    </>
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
  isReadAloudAvailable = true,
  readAloud = null,
  showAllTranslations = false,
  translatedBlocks,
  onLookup,
  onPlayBlock,
  onToggleTranslation,
}: {
  blocks: MockPassageBlock[]
  dictionary: Record<string, string>
  fontSize?: ReaderFontSize
  glossary: MockGlossaryEntry[]
  hiddenGlossaryIds?: number[]
  highlight?: { blockIndex: number, quote: string } | null
  isReadAloudAvailable?: boolean
  readAloud?: ReadAloudState | null
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  onLookup?: (lookup: MockWordLookup) => void
  onPlayBlock?: (blockIndex: number) => void
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
          const isReadingBlock = readAloud?.blockIndex === blockIndex
          /**
           * 読み上げ中の段落は、和訳を表示していても英文で出す（音声とハイライトを英文に合わせる）
           */
          const isTranslated = !isCode && !isReadingBlock && (showAllTranslations || translatedBlocks.has(blockIndex))
          const blockHighlight = highlight?.blockIndex === blockIndex ? highlight.quote : null
          const isPlayingBlock = isReadingBlock && readAloud?.mode === "block" && readAloud.isPlaying
          const readingWordIndex = isReadingBlock ? (readAloud?.wordIndex ?? null) : null

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
                {!isCode && onPlayBlock && (
                  <button
                    aria-label={isPlayingBlock ? "この段落の読み上げを一時停止" : "この段落を読み上げ"}
                    aria-pressed={isPlayingBlock}
                    className={`grid h-[22px] w-[22px] place-items-center rounded border outline-none transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-amber/60 disabled:pointer-events-none ${
                      isReadingBlock
                        ? "border-amber/50 bg-amber-wash text-amber opacity-100"
                        : "border-line-strong text-fg-muted opacity-0 hover:text-fg group-hover:opacity-100 disabled:group-hover:opacity-40 [@media(hover:none)]:opacity-60"
                    }`}
                    disabled={!isReadAloudAvailable}
                    onClick={(event) => {
                      event.stopPropagation()
                      onPlayBlock(blockIndex)
                    }}
                    type="button"
                  >
                    {isPlayingBlock ? (
                      <svg aria-hidden className="size-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                    ) : (
                      <svg aria-hidden className="size-2.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
                    )}
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
                    <SegmentList interactive readingWordIndex={readingWordIndex} segments={segmentText(block.text, visibleGlossary)} />
                  </h1>
                ) : (
                  <p className="mb-[1.15em]" lang="en">
                    {blockHighlight && block.text.includes(blockHighlight) ? (
                      <HighlightedParagraph
                        glossary={visibleGlossary}
                        quote={blockHighlight}
                        readingWordIndex={readingWordIndex}
                        text={block.text}
                      />
                    ) : (
                      <SegmentList interactive readingWordIndex={readingWordIndex} segments={segmentText(block.text, visibleGlossary)} />
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
