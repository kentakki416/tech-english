"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import type { VocabularyCard } from "./PaperCard"

/**
 * 1 枚の答え。clientReviewId は送り直しでも同じ値を使う（API が冪等）
 */
export type CardAnswer = {
  activeSeconds: number
  clientReviewId: string
  grade: ReviewVocabularyCardRequest["grade"]
  lemma: string
  saveStatus: "failed" | "saved" | "saving"
}

/**
 * 進み具合のマス。覚えたは琥珀に灯り、まだはローズの枠、今のカードは白い輪
 */
export function ProgressSquares({ answers, total }: { answers: Pick<CardAnswer, "grade">[], total: number }) {
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
 * ふりかえり。覚えた / まだの数と、まだの単語の一覧。保存できなかったカードは同じ clientReviewId で送り直せる。
 * 保存中のカードが残っている間と、次の回を取りに行っている間は「もう 1 回」を押せない
 */
export function SessionReview({
  answers,
  cards,
  onRetrySave,
}: {
  answers: CardAnswer[]
  cards: VocabularyCard[]
  onRetrySave: () => void
}) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
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
          disabled={isSaving || isRefreshing}
          onClick={() => startRefresh(() => router.refresh())}
          type="button"
        >
          {isSaving ? "保存しています…" : isRefreshing ? "読み込んでいます…" : "もう 1 回"}
        </button>
        <Link className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-fg hover:bg-raised" href="/vocabulary">
          単語帳のトップへ
        </Link>
      </div>
    </div>
  )
}
