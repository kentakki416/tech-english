"use client"

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { AttemptBlock, AttemptGlossaryEntry, PassageSegmentResponse } from "@repo/api-schema"

import type { WordLookupRecord } from "@/features/attempt/attempt-progress"

import { splitDictionarySenses, splitInlineCode } from "./passage-text"
import type { LookupDictionary } from "./use-dictionary-lookup"

export type ReaderFontSize = "lg" | "md" | "sm"

/**
 * 根拠のハイライト。blockIndex のブロックで、セグメントの添字が [segmentStart, segmentEnd) の範囲
 */
export type ReaderHighlight = {
  blockIndex: number
  segmentEnd: number
  segmentStart: number
}

/**
 * 読み上げ（解答画面・結果画面だけ渡す。ログイン画面のデモは渡さない）
 */
export type ReaderReadAloud = {
  /**
   * 読み上げ中（一時停止中を含む）のブロック。待機中は null
   */
  activeBlockIndex: number | null
  /**
   * false のとき段落の再生ボタンを無効にする（準備中・失敗・取得中）
   */
  isAvailable: boolean
  /**
   * 段落だけを再生している最中のブロック（その段落の再生ボタンを一時停止のアイコンにする）
   */
  playingBlockIndex: number | null
  /**
   * 読み上げ中の単語のハイライト。blockIndex のブロックで、セグメントの添字が [segmentStart, segmentEnd) の範囲
   */
  reading: { blockIndex: number, segmentEnd: number, segmentStart: number } | null
  /**
   * 親が useCallback で参照を固定する（memo したブロックに渡すため）
   */
  onPlayBlock: (blockIndex: number) => void
}

/**
 * 単語のカードの意味の部分。辞書は結果を待つ間 loading で、届いたら埋める
 */
type WordMeaning =
  | { lemma: string, meaningJa: string, noteJa: string | null, partOfSpeech: string | null, status: "glossary" }
  | { lemma: string, meaningJa: string, status: "dictionary" }
  | { status: "failed" }
  | { status: "loading" }
  | { status: "not_found" }

type WordCardState = {
  anchor: { bottom: number, left: number, top: number }
  meaning: WordMeaning
  surface: string
}

const FONT_SIZE_CLASS: Record<ReaderFontSize, string> = {
  lg: "text-[20px]",
  md: "text-[17px] sm:text-[18px]",
  sm: "text-[16px]",
}

const CODE_TOKEN_PATTERN = /(\/\/.*$)|("[^"]*")|\b(function|const|let|return|import|from|export)\b|\b([A-Za-z_]\w*)(?=\()/gm

/**
 * カードの高さの見込み。押した単語の下に収まらなければ上に出す
 */
const WORD_CARD_ESTIMATED_HEIGHT = 296

const WORD_CARD_WIDTH = 340

/**
 * 読み上げ中の単語の印：琥珀の下線と淡い背景（単語のカードを開いた単語の表示とは別の見た目にする）
 */
const READING_WORD_CLASS = "bg-amber/15 shadow-[inset_0_-2px_0_var(--color-amber)]"

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
    nodes.push(<span key={index} className={colorClass}>{match[0]}</span>)
    cursor = index + match[0].length
  }
  nodes.push(code.slice(cursor))
  return <>{nodes}</>
}

function InlineCode({ children, isReading = false }: { children: string, isReading?: boolean }) {
  return (
    <code className={`rounded border border-line px-1 py-px font-code text-[0.82em] text-fg ${isReading ? READING_WORD_CLASS : "bg-surface"}`}>
      {children}
    </code>
  )
}

/**
 * 読み上げ中の単語の範囲 [start, end)（セグメントの添字）
 */
type ReadingRange = { end: number, start: number } | null

/**
 * セグメントを描画する。単語だけ押せる（クリックは article で拾う）。key は添字を offset からの通し番号にする。
 * 読み上げの印は通しの添字が reading の範囲にある単語とインラインコードに付ける（根拠の <mark> で分けた中でも通しで判定する）
 */
const renderSegments = (segments: PassageSegmentResponse[], offset: number, reading: ReadingRange): React.ReactNode[] =>
  segments.map((segment, index) => {
    const key = offset + index
    const isReading = reading !== null && key >= reading.start && key < reading.end
    if (segment.kind === "code") return <InlineCode key={key} isReading={isReading}>{segment.text}</InlineCode>
    if (segment.kind !== "word") return <Fragment key={key}>{segment.text}</Fragment>
    return (
      <span
        key={key}
        className={`cursor-pointer rounded-[3px] transition-colors hover:bg-amber-wash hover:text-amber-bright data-[active=true]:bg-amber/25 data-[active=true]:text-amber-bright ${
          isReading ? READING_WORD_CLASS : ""
        }`}
        data-glossary-entry-id={segment.glossary_entry_id}
        data-word={segment.text}
      >
        {segment.text}
      </span>
    )
  })

/**
 * 英文のセグメント。根拠の範囲 [highlightStart, highlightEnd) があれば <mark> で包む
 */
function SegmentList({
  highlightEnd,
  highlightStart,
  readingEnd,
  readingStart,
  segments,
}: {
  highlightEnd: number | null
  highlightStart: number | null
  readingEnd: number | null
  readingStart: number | null
  segments: PassageSegmentResponse[]
}) {
  const reading: ReadingRange = readingStart !== null && readingEnd !== null ? { end: readingEnd, start: readingStart } : null
  if (highlightStart === null || highlightEnd === null || highlightStart >= highlightEnd) {
    return <>{renderSegments(segments, 0, reading)}</>
  }
  return (
    <>
      {renderSegments(segments.slice(0, highlightStart), 0, reading)}
      <mark className="rounded-sm bg-amber/20 px-0.5 text-fg ring-1 ring-amber/50">
        {renderSegments(segments.slice(highlightStart, highlightEnd), highlightStart, reading)}
      </mark>
      {renderSegments(segments.slice(highlightEnd), highlightEnd, reading)}
    </>
  )
}

function TranslationText({ text }: { text: string }) {
  return (
    <>
      {splitInlineCode(text).map((part, index) =>
        part.isCode ? <InlineCode key={index}>{part.text}</InlineCode> : <Fragment key={index}>{part.text}</Fragment>,
      )}
    </>
  )
}

/**
 * 本文の 1 ブロック。左に段落番号の列（エディタの行番号のような gutter）と「訳」・段落の再生ボタン、右に英文 / 和訳 / コード。
 * 解答画面はタイマーで毎秒描き直すので memo して、表示が変わったブロックだけを描き直す。
 * 読み上げはブロックごとの値だけを受け取るので、単語が変わっても描き直すのは読み上げ中のブロックだけになる
 */
function ReaderBlock({
  block,
  blockIndex,
  highlightEnd,
  highlightStart,
  isPlayingBlock,
  isReadAloudAvailable,
  isReadingBlock,
  isTranslated,
  readingSegmentEnd,
  readingSegmentStart,
  onPlayBlock,
  onToggleTranslation,
}: {
  block: AttemptBlock
  blockIndex: number
  highlightEnd: number | null
  highlightStart: number | null
  /**
   * この段落だけを再生している最中
   */
  isPlayingBlock: boolean
  isReadAloudAvailable: boolean
  /**
   * 読み上げ中（一時停止中を含む）のブロック
   */
  isReadingBlock: boolean
  isTranslated: boolean
  readingSegmentEnd: number | null
  readingSegmentStart: number | null
  onPlayBlock?: (blockIndex: number) => void
  onToggleTranslation?: (blockIndex: number) => void
}) {
  const isCode = block.type === "code"
  const isHeading = block.type === "heading"
  const translation = isCode ? null : block.translation_ja

  return (
    <section
      className="group grid scroll-mt-24 grid-cols-[2.75rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)]"
      id={`block-${blockIndex}`}
    >
      <div className={`flex flex-col items-end gap-1.5 pr-3 font-code text-[12px] leading-none text-fg-faint sm:pr-4 ${isHeading ? "pt-[0.55em]" : "pt-[0.5em]"}`}>
        {isHeading && <span aria-hidden>#</span>}
        {block.paragraph_number !== null && <span aria-label={`第 ${block.paragraph_number} 段落`}>{block.paragraph_number}</span>}
        {translation !== null && onToggleTranslation && (
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
            className={`grid size-[22px] place-items-center rounded border outline-none transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-amber/60 disabled:pointer-events-none ${
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
        ) : isTranslated && translation !== null ? (
          <p
            className={`border-l-2 border-amber/50 pl-4 font-ui text-[0.92em] leading-[1.95] text-fg ${isHeading ? "mt-1 mb-5 font-semibold" : "mb-[1.15em]"}`}
            lang="ja"
          >
            <TranslationText text={translation} />
          </p>
        ) : isHeading ? (
          <h1 className="mb-5 text-[1.55em] font-semibold leading-tight tracking-[-0.01em] text-fg">
            <SegmentList
              highlightEnd={highlightEnd}
              highlightStart={highlightStart}
              readingEnd={readingSegmentEnd}
              readingStart={readingSegmentStart}
              segments={block.segments}
            />
          </h1>
        ) : (
          <p className="mb-[1.15em]" lang="en">
            <SegmentList
              highlightEnd={highlightEnd}
              highlightStart={highlightStart}
              readingEnd={readingSegmentEnd}
              readingStart={readingSegmentStart}
              segments={block.segments}
            />
          </p>
        )}
      </div>
    </section>
  )
}

const MemoizedReaderBlock = memo(ReaderBlock)

function WordCard({ card, onClose }: { card: WordCardState, onClose: () => void }) {
  /**
   * カードはクリック後にだけ描画されるので、ここで window を読んでもサーバー描画とずれない
   */
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 640
  const isAbove = !isNarrow && card.anchor.bottom + WORD_CARD_ESTIMATED_HEIGHT > window.innerHeight

  const style: React.CSSProperties | undefined = isNarrow
    ? undefined
    : {
      left: Math.min(Math.max(card.anchor.left, 12), window.innerWidth - WORD_CARD_WIDTH - 12),
      top: isAbove ? card.anchor.top - 8 : card.anchor.bottom + 8,
      transform: isAbove ? "translateY(-100%)" : undefined,
    }

  const { meaning } = card
  const subline = meaning.status === "glossary"
    ? { lemma: meaning.lemma, partOfSpeech: meaning.partOfSpeech }
    : meaning.status === "dictionary"
      ? { lemma: meaning.lemma, partOfSpeech: null }
      : null
  const isLemmaVisible = subline !== null && subline.lemma.toLowerCase() !== card.surface.toLowerCase()

  return (
    <div
      data-word-card
      aria-label={`${card.surface} の意味`}
      className={`fixed z-50 w-auto rounded-xl border border-line-strong bg-raised p-4 shadow-[0_18px_50px_rgb(0_0_0/0.45)] sm:w-[340px] ${
        isNarrow ? "inset-x-3 bottom-3" : ""
      }`}
      role="dialog"
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-reading text-xl font-semibold text-fg">{card.surface}</p>
          {subline !== null && (isLemmaVisible || subline.partOfSpeech) && (
            <p className="mt-0.5 text-xs text-fg-muted">
              {isLemmaVisible && <span className="mr-2 font-reading italic">{subline.lemma}</span>}
              {subline.partOfSpeech}
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
      <div aria-live="polite">
        {meaning.status === "loading" ? (
          <div className="mt-3.5 space-y-2">
            <span className="sr-only">意味を調べています</span>
            <span aria-hidden className="block h-3 w-4/5 rounded bg-line-strong/70 motion-safe:animate-pulse" />
            <span aria-hidden className="block h-3 w-1/2 rounded bg-line-strong/70 motion-safe:animate-pulse" />
          </div>
        ) : meaning.status === "not_found" ? (
          <p className="mt-3 text-sm text-fg-muted">辞書に見つかりませんでした。</p>
        ) : meaning.status === "failed" ? (
          <p className="mt-3 text-sm text-fg-muted">意味を取得できませんでした。もう一度押してください。</p>
        ) : meaning.status === "dictionary" ? (
          /**
           * 辞書は語義が多い語があるので、カードの高さを抑えて中だけスクロールする
           */
          <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto overscroll-contain pr-1 text-[14px] leading-relaxed text-fg">
            {splitDictionarySenses(meaning.meaningJa).map((sense, index) => <li key={index}>{sense}</li>)}
          </ul>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-fg">{meaning.meaningJa}</p>
            {meaning.noteJa && <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{meaning.noteJa}</p>}
          </>
        )}
      </div>
      <p className={`mt-3 flex items-center gap-1.5 text-[11px] ${meaning.status === "glossary" ? "text-amber" : "text-fg-faint"}`}>
        <span aria-hidden className={`size-1.5 rounded-full ${meaning.status === "glossary" ? "bg-amber" : "bg-fg-faint"}`} />
        {meaning.status === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）"}
      </p>
    </div>
  )
}

/**
 * 本文を表示する。段落番号の列・段落ごとの和訳・単語の意味・根拠のハイライトを持つ。
 * セグメントは api が分割したもの（blocks[].segments）をそのまま描画する（分割は api の 1 か所だけ）
 *
 * - 単語を押すと、用語集の語句（glossary_entry_id）は「この文での意味」、それ以外は onLookupDictionary で英和辞書を引く
 * - onLookupWord は意味が見つかったときだけ呼ぶ（解答画面が調べた単語として記録する）
 * - readAloud を渡すと段落の再生ボタンと読み上げ中の単語の印を出す。読み上げ中の段落は、和訳中・全文訳でも英文で出す
 * - 単語のカードは body に描画する（祖先に transform があると fixed の位置の基準がその祖先になり、位置がずれて切れるため。ログイン画面のデモはカードを傾ける）。
 *   カードは押した後にだけ描画するので、document はブラウザで必ずある
 */
export function PassageReader({
  blocks,
  fontSize = "md",
  glossary,
  highlight = null,
  readAloud = null,
  showAllTranslations = false,
  translatedBlocks,
  onLookupDictionary,
  onLookupWord,
  onToggleTranslation,
  onWordCardOpenChange,
}: {
  blocks: AttemptBlock[]
  fontSize?: ReaderFontSize
  glossary: AttemptGlossaryEntry[]
  /**
   * 結果画面の根拠
   */
  highlight?: ReaderHighlight | null
  readAloud?: ReaderReadAloud | null
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  /**
   * 用語集に無い単語を引く。親がキャッシュと通信を持つ（useDictionaryLookup）
   */
  onLookupDictionary: LookupDictionary
  onLookupWord?: (lookup: WordLookupRecord) => void
  onToggleTranslation?: (blockIndex: number) => void
  /**
   * 単語のカードを開いた・閉じたとき（ログイン画面のデモが、開いている間はカードの傾きを止める）
   */
  onWordCardOpenChange?: (isOpen: boolean) => void
}) {
  const [card, setCard] = useState<WordCardState | null>(null)
  const activeWordRef = useRef<HTMLElement | null>(null)
  /**
   * 押すたびに増やす。辞書の結果が届いたときに、別の単語を押した・カードを閉じた後なら捨てる
   */
  const requestIdRef = useRef(0)

  const glossaryById = useMemo(() => new Map(glossary.map(entry => [entry.id, entry])), [glossary])

  const closeCard = useCallback(() => {
    requestIdRef.current += 1
    setCard(null)
  }, [])

  useEffect(() => {
    if (!card) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCard()
    }
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest("[data-word-card]") && !target.closest("[data-word]")) closeCard()
    }
    window.addEventListener("keydown", closeOnEscape)
    window.addEventListener("mousedown", closeOnOutside)
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("mousedown", closeOnOutside)
    }
  }, [card, closeCard])

  /**
   * 押した単語は、カードを開いている間だけ強調する（全セグメントを描き直さないよう DOM の属性で切り替える）
   */
  useEffect(() => {
    if (activeWordRef.current) activeWordRef.current.dataset.active = card ? "true" : "false"
  }, [card])

  const isCardOpen = card !== null
  useEffect(() => {
    onWordCardOpenChange?.(isCardOpen)
  }, [isCardOpen, onWordCardOpenChange])

  const showDictionaryMeaning = async (requestId: number, surface: string) => {
    const isCurrent = () => requestIdRef.current === requestId
    try {
      const result = await onLookupDictionary(surface)
      if (!isCurrent()) return
      if (result === null) {
        setCard(current => current && { ...current, meaning: { status: "not_found" } })
        return
      }
      setCard(current => current && { ...current, meaning: { lemma: result.headword, meaningJa: result.meaningJa, status: "dictionary" } })
      onLookupWord?.({ glossaryEntryId: null, lemma: result.headword, source: "dictionary", surface })
    } catch {
      if (isCurrent()) setCard(current => current && { ...current, meaning: { status: "failed" } })
    }
  }

  const openWordCard = (event: React.MouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-word]")
    if (!target) return
    /**
     * ドラッグで文字列を選択した（コピーしようとしている）ときはカードを出さない
     */
    if (window.getSelection()?.toString()) return

    if (activeWordRef.current) activeWordRef.current.dataset.active = "false"
    activeWordRef.current = target

    const rect = target.getBoundingClientRect()
    const anchor = { bottom: rect.bottom, left: rect.left, top: rect.top }
    const surface = target.dataset.word ?? ""
    const entry = glossaryById.get(Number(target.dataset.glossaryEntryId))
    requestIdRef.current += 1

    if (entry) {
      setCard({
        anchor,
        meaning: { lemma: entry.lemma, meaningJa: entry.meaning_ja, noteJa: entry.note_ja, partOfSpeech: entry.part_of_speech, status: "glossary" },
        surface,
      })
      onLookupWord?.({ glossaryEntryId: entry.id, lemma: entry.lemma, source: "glossary", surface })
      return
    }
    /**
     * 結果を待つ間もカードは押した位置に出し、意味の部分だけ後から埋める
     */
    setCard({ anchor, meaning: { status: "loading" }, surface })
    void showDictionaryMeaning(requestIdRef.current, surface)
  }

  return (
    <>
      <article className={`font-reading leading-[1.8] text-fg ${FONT_SIZE_CLASS[fontSize]}`} onClick={openWordCard}>
        {blocks.map((block, blockIndex) => {
          const isHighlighted = highlight?.blockIndex === blockIndex
          const isReadingBlock = readAloud?.activeBlockIndex === blockIndex
          const reading = readAloud?.reading?.blockIndex === blockIndex ? readAloud.reading : null
          return (
            <MemoizedReaderBlock
              key={blockIndex}
              block={block}
              blockIndex={blockIndex}
              highlightEnd={isHighlighted ? highlight.segmentEnd : null}
              highlightStart={isHighlighted ? highlight.segmentStart : null}
              isPlayingBlock={readAloud?.playingBlockIndex === blockIndex}
              isReadAloudAvailable={readAloud?.isAvailable ?? false}
              isReadingBlock={isReadingBlock}
              /**
               * 読み上げ中の段落は、和訳を表示していても英文で出す（音声とハイライトを英文に合わせる。translatedBlocks 自体は変えない）
               */
              isTranslated={!isReadingBlock && block.type !== "code" && block.translation_ja !== null && (showAllTranslations || translatedBlocks.has(blockIndex))}
              readingSegmentEnd={reading?.segmentEnd ?? null}
              readingSegmentStart={reading?.segmentStart ?? null}
              onPlayBlock={readAloud?.onPlayBlock}
              onToggleTranslation={onToggleTranslation}
            />
          )
        })}
      </article>
      {card && createPortal(<WordCard card={card} onClose={closeCard} />, document.body)}
    </>
  )
}
