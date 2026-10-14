"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import type { ReviewVocabularyCardActionResult } from "@/app/vocabulary/session/actions"
import { Keycap } from "@/components/ui/Keycap"
import { formatDayLabel } from "@/libs/format"
import { usePaperSound } from "@/libs/paper-sound"
import { useActiveSeconds } from "@/libs/use-active-seconds"

import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet, type VocabularyCard } from "./PaperCard"

type Grade = ReviewVocabularyCardRequest["grade"]

type ReviewAction = (input: ReviewVocabularyCardRequest) => Promise<ReviewVocabularyCardActionResult>

/**
 * 1 枚の答え。clientReviewId は送り直しでも同じ値を使う（API が冪等）
 */
type CardAnswer = {
  activeSeconds: number
  clientReviewId: string
  grade: Grade
  lemma: string
  saveStatus: "failed" | "saved" | "saving"
}

/**
 * 面を差し替えるまでの時間（めくる動き animate-card-flip の半分。カードが真横を向いた瞬間）
 */
const FLIP_HALF_MS = 220

/**
 * 答えたカードが横に飛んでいく時間
 */
const LEAVE_DURATION_MS = 300

const isReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * 入力欄・ボタン・リンクにフォーカスがあるときは、Space / Enter をその要素の操作に任せる
 */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))

/**
 * 進み具合のマス。覚えたは琥珀に灯り、まだはローズの枠、今のカードは白い輪
 */
function ProgressSquares({ answers, total }: { answers: Pick<CardAnswer, "grade">[], total: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: total }, (_, index) => {
        const grade = answers[index]?.grade
        return (
          <span
            key={index}
            className={`size-2.5 rounded-[2px] ${
              grade === "remembered"
                ? "bg-amber shadow-[0_0_8px_rgb(243_178_76/0.6)] motion-safe:animate-lamp-on"
                : grade === "forgot"
                  ? "border border-wrong/70 bg-wrong-wash"
                  : index === answers.length
                    ? "bg-heat-0 ring-1 ring-fg/60"
                    : "bg-heat-0"
            }`}
          />
        )
      })}
    </span>
  )
}

/**
 * 1 回分の上部バー（「‹ 単語帳」・進み具合・効果音）
 */
function SessionTopBar({
  answers,
  isSoundEnabled,
  total,
  onToggleSound,
}: {
  answers: CardAnswer[]
  isSoundEnabled: boolean
  total: number
  onToggleSound: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/60 px-3 backdrop-blur-md sm:px-4">
      <Link className="inline-flex w-24 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-raised hover:text-fg" href="/vocabulary">
        <span aria-hidden>‹</span>単語帳
      </Link>
      {total > 0 && (
        <div className="mx-auto flex items-center gap-3">
          <span className="text-sm text-fg tabular-nums">
            {Math.min(answers.length + 1, total)}
            <span className="text-fg-faint"> / {total}</span>
          </span>
          <span className="hidden sm:inline-flex"><ProgressSquares answers={answers} total={total} /></span>
        </div>
      )}
      <span className="flex w-24 justify-end">
        <button
          aria-pressed={isSoundEnabled}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-raised hover:text-fg"
          onClick={onToggleSound}
          title={isSoundEnabled ? "効果音をオフにする" : "効果音をオンにする"}
          type="button"
        >
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {isSoundEnabled ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6M22 9l-6 6" />}
          </svg>
          <span className="hidden sm:inline">効果音</span>
        </button>
      </span>
    </header>
  )
}

/**
 * 1 枚分（key でカードごとに作り直す）。めくる・答える・見ていた秒数・キーボードを持つ。
 * めくると横に回り、真横を向いた瞬間に表と裏を差し替える。めくり終わった後は変形を残さない（3D の変形が残ると文字がぼやけるため）
 */
function CardRound({
  card,
  remainingCount,
  onAnswer,
  onFlip,
}: {
  card: VocabularyCard
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

  const flip = () => {
    if (leaving) return
    const next = !isFlipped
    setIsFlipped(next)
    onFlip()
    if (isReducedMotion()) {
      setShownFlipped(next)
      return
    }
    setFlipCount(count => count + 1)
    window.setTimeout(() => setShownFlipped(next), FLIP_HALF_MS)
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

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === " " || event.key === "Enter") {
        if (isInteractiveTarget(event.target)) return
        event.preventDefault()
        flip()
      } else if (event.key === "ArrowRight") {
        answer("remembered")
      } else if (event.key === "ArrowLeft") {
        answer("forgot")
      }
    }
    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  })

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="relative">
        <CardStackBehind count={remainingCount} />
        <div className="relative motion-safe:animate-card-rise">
          <div
            className={`transition-[translate,rotate,opacity] duration-300 ease-out ${
              leaving === "right" ? "translate-x-[115%] rotate-12 opacity-0" : leaving === "left" ? "translate-x-[-115%] -rotate-12 opacity-0" : ""
            }`}
          >
            <button
              aria-label={isFlipped ? "カードを表に戻す" : "カードをめくる"}
              className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
              onClick={flip}
              type="button"
            >
              <div key={flipCount} className={flipCount > 0 ? "motion-safe:animate-card-flip" : ""}>
                <PaperSheet className="relative h-[440px] sm:h-[380px]" tone={shownFlipped ? "back" : "front"}>
                  {shownFlipped ? <PaperCardBack card={card} /> : <PaperCardFront card={card} />}
                </PaperSheet>
              </div>
            </button>
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

/**
 * ふりかえり。覚えた / まだの数と、まだの単語の一覧。保存できなかったカードは同じ clientReviewId で送り直せる
 */
function SessionReview({
  answers,
  cards,
  onRetrySave,
}: {
  answers: CardAnswer[]
  cards: VocabularyCard[]
  onRetrySave: () => void
}) {
  const router = useRouter()
  const rememberedCount = answers.filter(item => item.grade === "remembered").length
  const forgotCards = cards.filter((_, index) => answers[index]?.grade === "forgot")
  const failedCount = answers.filter(item => item.saveStatus === "failed").length
  const isSaving = answers.some(item => item.saveStatus === "saving")

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <h1 className="text-center text-sm text-fg-muted">ふりかえり</h1>
      <p className="mt-3 text-center text-fg">
        <span className="text-sm text-fg-muted">覚えた</span>
        <span className="mx-2 text-4xl font-semibold text-amber tabular-nums">{rememberedCount}</span>
        <span className="text-fg-faint">/</span>
        <span className="mx-2 text-4xl font-semibold text-fg tabular-nums">{answers.length - rememberedCount}</span>
        <span className="text-sm text-fg-muted">まだ</span>
      </p>
      <div className="mt-4 flex justify-center"><ProgressSquares answers={answers} total={answers.length} /></div>

      {failedCount > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-wrong/50 bg-wrong-wash px-4 py-3" role="alert">
          <p className="text-sm text-fg">保存できなかったカードが {failedCount} 枚あります。</p>
          <button className="rounded-md border border-wrong/60 px-3 py-1.5 text-sm text-fg hover:bg-wrong/15" onClick={onRetrySave} type="button">
            もう一度送る
          </button>
        </div>
      )}

      {forgotCards.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-fg">まだの単語</h2>
          <p className="mt-1 text-xs text-fg-faint">明日、もう一度出ます。</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {forgotCards.map(card => (
              <li key={card.lemma} className="flex items-baseline gap-4 py-3">
                <span className="w-36 shrink-0 font-reading text-[16px] text-fg">{card.surface}</span>
                <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg-muted">{card.meaning_ja}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={() => router.refresh()}
          type="button"
        >
          {isSaving ? "保存しています…" : "もう 1 回"}
        </button>
        <Link className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-fg hover:bg-raised" href="/vocabulary">
          単語帳のトップへ
        </Link>
      </div>
    </div>
  )
}

/**
 * 今日の分が無いとき（カードが 0 枚で開いた）
 */
function SessionDone({ nextDueDate }: { nextDueDate: string | null }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="relative mx-auto h-36 w-56">
        <CardStackBehind count={2} />
        <PaperSheet className="absolute inset-0 grid place-items-center">
          <p className="font-reading text-lg text-ink-muted">All done.</p>
        </PaperSheet>
      </div>
      <h1 className="mt-8 text-lg font-semibold text-fg">今日の分は終わりました</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {nextDueDate && <>次の復習は <span className="text-fg">{formatDayLabel(nextDueDate)}</span> です。</>}
        問題を解くと、新しい単語が増えます。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink hover:bg-amber-bright" href="/passages">問題を解く</Link>
        <Link className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-fg hover:bg-raised" href="/vocabulary">単語帳のトップへ</Link>
      </div>
    </div>
  )
}

/**
 * 単語帳の 1 回分。カードをめくって覚えた / まだを付け、全部答えるとふりかえり（vocabulary-cards README「UI 設計 > 1 回分」）。
 *
 * 答えたら保存を待たずに次のカードへ進む。保存は Server Action で 1 枚ずつ行い、失敗したカードはふりかえりで送り直せる
 */
export function VocabularySession({
  cards,
  nextDueDate,
  reviewAction,
}: {
  cards: VocabularyCard[]
  nextDueDate: string | null
  reviewAction: ReviewAction
}) {
  const [answers, setAnswers] = useState<CardAnswer[]>([])
  const [, startSaving] = useTransition()
  const sound = usePaperSound()
  const current = cards[answers.length]

  const save = (target: CardAnswer) => {
    startSaving(async () => {
      const result = await reviewAction({
        active_seconds: target.activeSeconds,
        client_review_id: target.clientReviewId,
        grade: target.grade,
        lemma: target.lemma,
      })
      startSaving(() => {
        setAnswers(previous => previous.map(item => (item.clientReviewId === target.clientReviewId ? { ...item, saveStatus: result.status } : item)))
      })
    })
  }

  const answer = (grade: Grade, activeSeconds: number) => {
    if (!current) return
    const next: CardAnswer = { activeSeconds, clientReviewId: crypto.randomUUID(), grade, lemma: current.lemma, saveStatus: "saving" }
    setAnswers(previous => [...previous, next])
    save(next)
  }

  const retryFailed = () => {
    const failed = answers.filter(item => item.saveStatus === "failed")
    setAnswers(previous => previous.map(item => (item.saveStatus === "failed" ? { ...item, saveStatus: "saving" } : item)))
    for (const item of failed) save(item)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SessionTopBar answers={answers} isSoundEnabled={sound.isEnabled} total={cards.length} onToggleSound={sound.toggle} />
      <main className="relative flex flex-1 flex-col justify-center overflow-x-clip px-4 py-8 sm:py-12">
        {cards.length === 0 ? (
          <SessionDone nextDueDate={nextDueDate} />
        ) : current ? (
          <CardRound key={answers.length} card={current} remainingCount={cards.length - answers.length - 1} onAnswer={answer} onFlip={sound.play} />
        ) : (
          <SessionReview answers={answers} cards={cards} onRetrySave={retryFailed} />
        )}
      </main>
    </div>
  )
}
