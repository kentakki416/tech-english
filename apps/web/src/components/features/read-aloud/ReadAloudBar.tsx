"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { AttemptBlock } from "@repo/api-schema"

import { Keycap } from "@/components/ui/Keycap"

import type { ReadAloudAvailability, ReadAloudPlayback } from "./use-read-aloud"
import { READ_ALOUD_RATES, type ReadAloudRate } from "./use-read-aloud-rate"

/**
 * 準備中・失敗の文言（再生ボタン・停止・速度は出さない）
 */
const UNAVAILABLE_MESSAGES: Record<Extract<ReadAloudAvailability, "failed" | "pending">, string> = {
  failed: "この問題の読み上げは利用できません",
  pending: "読み上げの音声を準備中です",
}

/**
 * 速度のメニュー（速度のボタンの上に開く）。選ぶとすぐに速度が変わり、メニューを閉じる（再生は止めない）。
 * 外のクリック・Esc で閉じる（Esc は単語のカードの Esc と同時に効いてよい）
 */
function SpeedMenu({ rate, onChange }: { rate: ReadAloudRate, onChange: (rate: ReadAloudRate) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("mousedown", closeOnOutside)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("mousedown", closeOnOutside)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
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
        <div aria-label="再生速度" className="absolute right-0 bottom-full mb-2 w-36 rounded-lg border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgb(0_0_0/0.45)]" role="menu">
          <p aria-hidden className="px-2.5 pt-1.5 pb-1 text-[11px] text-fg-faint">再生速度</p>
          {READ_ALOUD_RATES.map(option => (
            <button
              key={option}
              aria-checked={rate === option}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left font-code text-[13px] tabular-nums outline-none hover:bg-surface focus-visible:bg-surface ${
                rate === option ? "text-amber" : "text-fg"
              }`}
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
 * 本文の列の下端に固定する読み上げのミニプレーヤー（再生・停止・速度）。
 * 待機中は「全文を読み上げ」、再生中・一時停止中は読み上げ中の位置（段落番号の列と同じ番号）と全文 / この段落だけ
 */
export function ReadAloudBar({
  availability,
  blocks,
  isShortcutVisible,
  playback,
  progress,
  rate,
  onRateChange,
  onStop,
  onToggle,
}: {
  availability: ReadAloudAvailability
  blocks: AttemptBlock[]
  /**
   * R のキーキャップ（解答画面の 1024px 以上だけ）
   */
  isShortcutVisible: boolean
  playback: ReadAloudPlayback | null
  progress: number
  rate: ReadAloudRate
  onRateChange: (rate: ReadAloudRate) => void
  onStop: () => void
  onToggle: () => void
}) {
  const paragraphCount = useMemo(() => blocks.filter(block => block.paragraph_number !== null).length, [blocks])

  if (availability === "pending" || availability === "failed") {
    return (
      <div className="flex h-12 items-center gap-3 rounded-xl border border-line bg-raised/95 px-2 pr-4 backdrop-blur">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-line text-fg-faint">
          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
        </span>
        <p className="text-[13px] text-fg-muted">{UNAVAILABLE_MESSAGES[availability]}</p>
      </div>
    )
  }

  const isActive = playback !== null
  const isPlaying = playback?.isPlaying ?? false
  const paragraphNumber = playback ? (blocks[playback.blockIndex]?.paragraph_number ?? null) : null
  const label = availability === "error"
    ? "読み上げを読み込めませんでした"
    : !isActive
      ? "全文を読み上げ"
      : paragraphNumber === null
        ? "見出し"
        : `段落 ${paragraphNumber} / ${paragraphCount}`

  return (
    <div className="flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-raised/95 px-2 shadow-[0_10px_30px_rgb(0_0_0/0.35)] backdrop-blur sm:gap-3">
      <button
        aria-label={isPlaying ? "読み上げを一時停止" : isActive ? "読み上げを再開" : "全文を読み上げ"}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-amber text-amber-ink outline-none transition-colors hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-raised disabled:pointer-events-none disabled:opacity-50"
        disabled={availability === "loading"}
        onClick={onToggle}
        type="button"
      >
        {isPlaying ? (
          <svg aria-hidden className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
        ) : (
          <svg aria-hidden className="size-3.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
        )}
      </button>

      <div className="min-w-0 shrink-0">
        <p className="text-[13px] leading-tight text-fg">{label}</p>
        {isActive && <p className="text-[11px] leading-tight text-fg-faint">{playback.mode === "all" ? "全文" : "この段落だけ"}</p>}
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
      <SpeedMenu rate={rate} onChange={onRateChange} />
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
