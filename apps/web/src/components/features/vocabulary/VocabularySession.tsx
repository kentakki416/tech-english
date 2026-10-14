"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import type { ReviewVocabularyCardActionResult } from "@/app/vocabulary/session/actions"
import { formatDayLabel } from "@/libs/format"
import { usePaperSound } from "@/libs/paper-sound"

import { FlashCard } from "./FlashCard"
import { CardStackBehind, PaperSheet, type VocabularyCard } from "./PaperCard"
import { type CardAnswer, ProgressSquares, SessionReview } from "./SessionReview"

type Grade = ReviewVocabularyCardRequest["grade"]

type ReviewAction = (input: ReviewVocabularyCardRequest) => Promise<ReviewVocabularyCardActionResult>

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
          {/**
            * 次のカードに進んだことを読み上げで伝える（進み具合のマスは飾りなので aria-hidden）
            */}
          <span aria-live="polite" className="text-sm text-fg tabular-nums">
            <span className="sr-only">{total} 枚中 </span>
            {Math.min(answers.length + 1, total)}
            <span className="text-fg-faint"><span aria-hidden> / {total}</span><span className="sr-only"> 枚目</span></span>
          </span>
          <span className="hidden sm:inline-flex"><ProgressSquares answers={answers} total={total} /></span>
        </div>
      )}
      <span className="flex w-24 justify-end">
        {/**
          * 名前は「効果音」に固定し、オン / オフは aria-pressed で伝える（スマホ幅では文字を隠すので aria-label を付ける）
          */}
        <button
          aria-label="効果音"
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
          <span aria-hidden className="hidden sm:inline">効果音</span>
        </button>
      </span>
    </header>
  )
}

/**
 * 今日の分が無いとき（カードが 0 枚で開いた）
 */
function SessionDone({ nextDueDate }: { nextDueDate: string | null }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <div aria-hidden className="relative mx-auto h-36 w-56">
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
 * 答えたら保存を待たずに次のカードへ進む。保存は Server Action で 1 枚ずつ行い、失敗したカードはふりかえりで送り直せる。
 * Server Action の呼び出し自体が失敗した（通信が切れた・デプロイで action が変わった）ときも失敗として扱い、エラー画面にしない
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
      }).catch((): ReviewVocabularyCardActionResult => ({ status: "failed" }))
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
          <FlashCard
            key={current.lemma}
            card={current}
            isFirst={answers.length === 0}
            remainingCount={cards.length - answers.length - 1}
            onAnswer={answer}
            onFlip={sound.play}
          />
        ) : (
          <SessionReview answers={answers} cards={cards} onRetrySave={retryFailed} />
        )}
      </main>
    </div>
  )
}
