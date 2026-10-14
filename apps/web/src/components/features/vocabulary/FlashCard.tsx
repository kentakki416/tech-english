"use client"

import { useEffect, useRef, useState } from "react"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import { Keycap } from "@/components/ui/Keycap"
import { useActiveSeconds } from "@/libs/use-active-seconds"

import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet, type VocabularyCard } from "./PaperCard"
import { useVocabularyShortcuts } from "./use-vocabulary-shortcuts"

type Grade = ReviewVocabularyCardRequest["grade"]

/**
 * 面を差し替えるまでの時間（めくる動き animate-card-flip の半分。カードが真横を向いた瞬間）
 */
const FLIP_HALF_MS = 220

/**
 * 答えたカードが横に飛んでいく時間
 */
const LEAVE_DURATION_MS = 300

/**
 * 出てすぐはめくらない時間。視差効果を減らす設定ではすぐ次のカードになるので、「覚えた」のダブルクリックの 2 回目が
 * 同じ位置の「めくる」に当たって、思い出す前に裏が出ないようにする
 */
const INPUT_GUARD_MS = 250

const isReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * 1 枚分（key でカードごとに作り直す）。めくる・答える・見ていた秒数・キーボードを持つ。
 * めくると横に回り、真横を向いた瞬間に表と裏を差し替える。めくり終わった後は変形を残さない（3D の変形が残ると文字がぼやけるため）。
 *
 * カードの中身はボタンに入れず、そのまま読み上げられるようにする（クリックでもめくれる。キーボードは「めくる」ボタンと Space）。
 * めくったら意味を常に置いてある live region で伝え、2 枚目からは出たときにカードへフォーカスを移す
 */
export function FlashCard({
  card,
  isFirst,
  remainingCount,
  onAnswer,
  onFlip,
}: {
  card: VocabularyCard
  /**
   * 1 回分の最初のカード（フォーカスを動かさない）
   */
  isFirst: boolean
  /**
   * このカードの後ろに残っている枚数（束の厚み）
   */
  remainingCount: number
  onAnswer: (grade: Grade, activeSeconds: number) => void
  onFlip: () => void
}) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [shownFlipped, setShownFlipped] = useState(false)
  const [flipCount, setFlipCount] = useState(0)
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null)
  const activeSeconds = useActiveSeconds({ initialSeconds: 0, isRunning: leaving === null })
  const cardRef = useRef<HTMLDivElement>(null)
  const readyAtRef = useRef(Number.POSITIVE_INFINITY)

  useEffect(() => {
    readyAtRef.current = performance.now() + INPUT_GUARD_MS
    if (!isFirst) cardRef.current?.focus({ preventScroll: true })
  }, [isFirst])

  const flip = () => {
    if (leaving || performance.now() < readyAtRef.current) return
    const next = !isFlipped
    setIsFlipped(next)
    if (isReducedMotion()) {
      setShownFlipped(next)
    } else {
      setFlipCount(count => count + 1)
      window.setTimeout(() => setShownFlipped(next), FLIP_HALF_MS)
    }
    /**
     * 「めくる」ボタンはめくると消えるので、フォーカスをカードに移す（Tab で次に答えのボタンへ進めるように）
     */
    cardRef.current?.focus({ preventScroll: true })
    onFlip()
  }

  const answer = (grade: Grade) => {
    if (!isFlipped || leaving) return
    if (isReducedMotion()) {
      onAnswer(grade, activeSeconds)
      return
    }
    setLeaving(grade === "remembered" ? "right" : "left")
    window.setTimeout(() => onAnswer(grade, activeSeconds), LEAVE_DURATION_MS)
  }

  useVocabularyShortcuts({ onAnswer: answer, onFlip: flip })

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <p aria-live="polite" className="sr-only">{shownFlipped ? `意味：${card.meaning_ja}` : ""}</p>
      <div className="relative">
        <CardStackBehind count={remainingCount} />
        <div className="relative motion-safe:animate-card-rise">
          <div
            className={`transition-[translate,rotate,opacity] duration-300 ease-out ${
              leaving === "right" ? "translate-x-[115%] rotate-12 opacity-0" : leaving === "left" ? "translate-x-[-115%] -rotate-12 opacity-0" : ""
            }`}
          >
            <div
              ref={cardRef}
              aria-roledescription="単語カード"
              className="cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
              onClick={flip}
              role="group"
              tabIndex={-1}
            >
              <div key={flipCount} className={flipCount > 0 ? "motion-safe:animate-card-flip" : ""}>
                <PaperSheet className="relative h-[440px] sm:h-[380px]" tone={shownFlipped ? "back" : "front"}>
                  {shownFlipped ? <PaperCardBack card={card} /> : <PaperCardFront card={card} />}
                </PaperSheet>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-14 flex h-24 items-start justify-center gap-3">
        {isFlipped ? (
          <>
            <button
              className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg border border-wrong/60 px-5 py-3 text-sm text-fg hover:bg-wrong-wash"
              onClick={() => answer("forgot")}
              type="button"
            >
              <Keycap>←</Keycap>まだ
            </button>
            <button
              className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-semibold text-amber-ink hover:bg-amber-bright"
              onClick={() => answer("remembered")}
              type="button"
            >
              覚えた<kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-b-2 border-amber-ink/30 px-1 font-code text-[11px] leading-none">→</kbd>
            </button>
          </>
        ) : (
          <div className="text-center">
            <button
              className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 py-3 text-sm text-fg hover:bg-raised"
              onClick={flip}
              type="button"
            >
              めくる<Keycap>Space</Keycap>
            </button>
            <p className="mt-3 text-xs text-fg-faint">意味を思い出してから、めくりましょう。</p>
          </div>
        )}
      </div>
    </div>
  )
}
