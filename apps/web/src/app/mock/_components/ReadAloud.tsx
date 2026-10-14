"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { MockGlossaryEntry, MockPassageBlock } from "@/libs/mock-data"

import { Keycap } from "./parts"
import { segmentText } from "./passage-text"

export type ReadAloudRate = 0.75 | 1 | 1.25

export type ReadAloudState = {
  blockIndex: number | null
  isPlaying: boolean
  mode: "all" | "block"
  wordIndex: number
}

export const READ_ALOUD_RATES: ReadAloudRate[] = [0.75, 1, 1.25]

/**
 * 1 倍速で 1 分あたりに読む語数（モックの擬似再生用）
 */
const WORDS_PER_MINUTE = 150

/**
 * この語数を読み進めたら「聞いた段落」に数える（本実装は 1 秒以上の再生）
 */
const LISTENED_WORD_THRESHOLD = 3

const IDLE_STATE: ReadAloudState = { blockIndex: null, isPlaying: false, mode: "all", wordIndex: 0 }

/**
 * 読み上げの擬似再生（モック用）。本実装は音声の再生位置と単語の時刻から今の単語を求める
 */
export function useReadAloudMock({
  blocks,
  glossary,
  initialState = IDLE_STATE,
}: {
  blocks: MockPassageBlock[]
  glossary: MockGlossaryEntry[]
  initialState?: ReadAloudState
}) {
  const [state, setState] = useState<ReadAloudState>(initialState)
  const [rate, setRate] = useState<ReadAloudRate>(1)
  const [listenedBlocks, setListenedBlocks] = useState<Set<number>>(
    initialState.blockIndex !== null && initialState.wordIndex >= LISTENED_WORD_THRESHOLD ? new Set([initialState.blockIndex]) : new Set(),
  )

  /**
   * ブロックごとの単語数。コードブロックは読み上げない（0 語）
   */
  const wordCounts = useMemo(
    () => blocks.map(block => (block.type === "code" ? 0 : segmentText(block.text, glossary).filter(segment => segment.kind === "word").length)),
    [blocks, glossary],
  )
  const readableIndexes = useMemo(() => wordCounts.flatMap((count, index) => (count > 0 ? [index] : [])), [wordCounts])
  const totalWords = useMemo(() => wordCounts.reduce((sum, count) => sum + count, 0), [wordCounts])

  useEffect(() => {
    if (!state.isPlaying || state.blockIndex === null) return
    const blockIndex = state.blockIndex
    const timer = window.setTimeout(() => {
      const nextBlockIndex = readableIndexes.find(index => index > blockIndex)
      const next: ReadAloudState =
        state.wordIndex + 1 < wordCounts[blockIndex]
          ? { ...state, wordIndex: state.wordIndex + 1 }
          : state.mode === "block" || nextBlockIndex === undefined
            ? IDLE_STATE
            : { ...state, blockIndex: nextBlockIndex, wordIndex: 0 }
      setState(next)
      if (next.blockIndex !== null && next.wordIndex >= LISTENED_WORD_THRESHOLD) {
        const listened = next.blockIndex
        setListenedBlocks(current => (current.has(listened) ? current : new Set(current).add(listened)))
      }
    }, 60_000 / (WORDS_PER_MINUTE * rate))
    return () => window.clearTimeout(timer)
  }, [rate, readableIndexes, state, wordCounts])

  /**
   * 画面を離れたら止める（タイマーが止まるのと合わせる）
   */
  useEffect(() => {
    const pauseOnHidden = () => {
      if (document.visibilityState === "hidden") setState(current => ({ ...current, isPlaying: false }))
    }
    document.addEventListener("visibilitychange", pauseOnHidden)
    return () => document.removeEventListener("visibilitychange", pauseOnHidden)
  }, [])

  const playAll = useCallback(() => {
    setState({ blockIndex: readableIndexes[0] ?? null, isPlaying: true, mode: "all", wordIndex: 0 })
  }, [readableIndexes])

  const playBlock = useCallback((blockIndex: number) => {
    setState(current =>
      current.blockIndex === blockIndex && current.mode === "block"
        ? { ...current, isPlaying: !current.isPlaying }
        : { blockIndex, isPlaying: true, mode: "block", wordIndex: 0 },
    )
  }, [])

  const togglePlay = useCallback(() => {
    setState(current => (current.blockIndex === null ? { blockIndex: readableIndexes[0] ?? null, isPlaying: true, mode: "all", wordIndex: 0 } : { ...current, isPlaying: !current.isPlaying }))
  }, [readableIndexes])

  const pause = useCallback(() => setState(current => ({ ...current, isPlaying: false })), [])
  const stop = useCallback(() => setState(IDLE_STATE), [])

  const wordsBefore = state.blockIndex === null ? 0 : wordCounts.slice(0, state.blockIndex).reduce((sum, count) => sum + count, 0)
  const progress =
    state.blockIndex === null
      ? 0
      : state.mode === "block"
        ? (state.wordIndex + 1) / wordCounts[state.blockIndex]
        : (wordsBefore + state.wordIndex + 1) / totalWords

  return { listenedBlocks, pause, playAll, playBlock, progress, rate, setRate, state, stop, togglePlay }
}

function SpeedMenu({ rate, onChange }: { rate: ReadAloudRate, onChange: (rate: ReadAloudRate) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    window.addEventListener("mousedown", closeOnOutside)
    return () => window.removeEventListener("mousedown", closeOnOutside)
  }, [isOpen])

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`再生速度 ${rate} 倍`}
        className="flex h-8 items-center gap-1 rounded-md px-2 font-code text-[12px] text-fg-muted tabular-nums outline-none hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
        onClick={() => setIsOpen(value => !value)}
        type="button"
      >
        {rate}x
        <svg aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-36 rounded-lg border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgb(0_0_0/0.45)]" role="menu">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-fg-faint">再生速度</p>
          {READ_ALOUD_RATES.map(option => (
            <button
              aria-checked={rate === option}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left font-code text-[13px] tabular-nums outline-none hover:bg-surface focus-visible:bg-surface ${
                rate === option ? "text-amber" : "text-fg"
              }`}
              key={option}
              onClick={() => {
                onChange(option)
                setIsOpen(false)
              }}
              role="menuitemradio"
              type="button"
            >
              {option}x
              {rate === option && (
                <svg aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12l5 5 9-11" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 本文の列の下端に固定する読み上げのミニプレーヤー
 */
export function ReadAloudBar({
  blocks,
  isAvailable,
  isShortcutVisible = true,
  progress,
  rate,
  state,
  onRateChange,
  onStop,
  onToggle,
}: {
  blocks: MockPassageBlock[]
  isAvailable: boolean
  isShortcutVisible?: boolean
  progress: number
  rate: ReadAloudRate
  state: ReadAloudState
  onRateChange: (rate: ReadAloudRate) => void
  onStop: () => void
  onToggle: () => void
}) {
  const isActive = state.blockIndex !== null
  const paragraphNumbers = useMemo(() => {
    let count = 0
    return blocks.map(block => (block.type === "code" || block.type === "heading" ? null : ++count))
  }, [blocks])
  const paragraphCount = paragraphNumbers.filter(number => number !== null).length
  const currentNumber = state.blockIndex === null ? null : paragraphNumbers[state.blockIndex]

  if (!isAvailable) {
    return (
      <div className="flex h-12 items-center gap-3 rounded-xl border border-line bg-raised/95 px-2 pr-4 backdrop-blur">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-line text-fg-faint">
          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
        </span>
        <p className="text-[13px] text-fg-muted">読み上げの音声を準備中です</p>
      </div>
    )
  }

  return (
    <div className="flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-raised/95 px-2 shadow-[0_10px_30px_rgb(0_0_0/0.35)] backdrop-blur sm:gap-3">
      <button
        aria-label={state.isPlaying ? "読み上げを一時停止" : isActive ? "読み上げを再開" : "全文を読み上げ"}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-amber text-amber-ink outline-none transition-colors hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
        onClick={onToggle}
        type="button"
      >
        {state.isPlaying ? (
          <svg aria-hidden className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
        ) : (
          <svg aria-hidden className="size-3.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
        )}
      </button>

      <div className="min-w-0 shrink-0">
        <p className="text-[13px] leading-tight text-fg">
          {!isActive ? "全文を読み上げ" : currentNumber === null ? "見出し" : `段落 ${currentNumber} / ${paragraphCount}`}
        </p>
        {isActive && <p className="text-[11px] leading-tight text-fg-faint">{state.mode === "all" ? "全文" : "この段落だけ"}</p>}
      </div>

      <div aria-hidden className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-amber/80 transition-[width] duration-300 ease-out" style={{ width: `${progress * 100}%` }} />
      </div>

      {isActive && (
        <button
          aria-label="読み上げを停止"
          className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted outline-none hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
          onClick={onStop}
          type="button"
        >
          <svg aria-hidden className="size-3" fill="currentColor" viewBox="0 0 24 24"><rect height="14" rx="1.5" width="14" x="5" y="5" /></svg>
        </button>
      )}
      <SpeedMenu onChange={onRateChange} rate={rate} />
      {isShortcutVisible && <span className="hidden pr-1 lg:inline"><Keycap>R</Keycap></span>}
    </div>
  )
}

/**
 * 自動スクロールを止めた後に出す「読み上げ中の位置に戻る」
 */
export function ReturnToReadingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="mx-auto mb-2 flex items-center gap-1.5 rounded-full border border-amber/40 bg-raised/95 px-3 py-1.5 text-[12px] text-amber shadow-[0_6px_20px_rgb(0_0_0/0.35)] outline-none backdrop-blur hover:border-amber/70 focus-visible:ring-2 focus-visible:ring-amber/60"
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
      読み上げ中の位置に戻る
    </button>
  )
}
