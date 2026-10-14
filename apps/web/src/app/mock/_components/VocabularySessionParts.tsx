"use client"

import Link from "next/link"

import { MOCK_VOCABULARY_SUMMARY, type MockVocabularyCard } from "@/libs/mock-data"

import { CardStackBehind, PaperSheet } from "./PaperCard"
import { Keycap } from "./parts"

/**
 * 単語帳の 1 回分のモックの部品（上部バー・進み具合・答えのボタン・ふりかえり）
 */

export type Grade = "forgot" | "remembered"

/**
 * ふりかえりの状態で使う答え（覚えた 7 / まだ 3）
 */
export const REVIEWED_GRADES: Grade[] = ["remembered", "forgot", "remembered", "remembered", "forgot", "remembered", "remembered", "remembered", "forgot", "remembered"]

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

/**
 * 視差効果を減らす設定のときは、めくる・飛ばす動きを省く
 */
export const isReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * 進み具合のマス。覚えたは琥珀に灯り、まだはローズの枠、今のカードは白い輪
 */
export function ProgressSquares({ answers, total }: { answers: Grade[], total: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: total }, (_, index) => {
        const grade = answers[index]
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
 * 読書灯の光（カードの上から当たる琥珀の光）
 */
export function LampGlow() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[150%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(243_178_76/0.2),transparent_62%)]"
    />
  )
}

/**
 * 効果音のオン / オフ
 */
function SoundToggle({ isEnabled, onToggle }: { isEnabled: boolean, onToggle: () => void }) {
  return (
    <button
      aria-pressed={isEnabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-raised hover:text-fg"
      onClick={onToggle}
      title={isEnabled ? "効果音をオフにする" : "効果音をオンにする"}
      type="button"
    >
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {isEnabled ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6M22 9l-6 6" />}
      </svg>
      <span className="hidden sm:inline">効果音</span>
    </button>
  )
}

/**
 * 1 回分の上部バー（「‹ 単語帳」・進み具合・効果音）
 */
export function SessionTopBar({
  answers,
  isSoundEnabled,
  total,
  onToggleSound,
}: {
  answers: Grade[]
  isSoundEnabled: boolean
  total: number
  onToggleSound: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/80 px-3 backdrop-blur sm:px-4">
      <Link className="inline-flex w-24 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-raised hover:text-fg" href="/mock/vocabulary">
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
      <span className="flex w-24 justify-end"><SoundToggle isEnabled={isSoundEnabled} onToggle={onToggleSound} /></span>
    </header>
  )
}

/**
 * 「まだ」「覚えた」のボタン（めくった後だけ出す）
 */
export function AnswerButtons({ onAnswer }: { onAnswer: (grade: Grade) => void }) {
  return (
    <>
      <button
        className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg border border-wrong/60 px-5 py-3 text-sm text-fg hover:bg-wrong-wash"
        onClick={() => onAnswer("forgot")}
        type="button"
      >
        <Keycap>←</Keycap>まだ
      </button>
      <button
        className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-semibold text-amber-ink hover:bg-amber-bright"
        onClick={() => onAnswer("remembered")}
        type="button"
      >
        覚えた<kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-b-2 border-amber-ink/30 px-1 font-code text-[11px] leading-none">→</kbd>
      </button>
    </>
  )
}

/**
 * 「めくる」のボタンと案内
 */
export function FlipButton({ hint, onFlip }: { hint: string, onFlip: () => void }) {
  return (
    <div className="text-center">
      <button
        className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 py-3 text-sm text-fg hover:bg-raised"
        onClick={onFlip}
        type="button"
      >
        めくる<Keycap>Space</Keycap>
      </button>
      <p className="mt-3 text-xs text-fg-faint">{hint}</p>
    </div>
  )
}

/**
 * ふりかえり。覚えた / まだの数と、まだの単語の一覧
 */
export function SessionReview({ answers, cards, hasSaveFailure }: { answers: Grade[], cards: MockVocabularyCard[], hasSaveFailure: boolean }) {
  const rememberedCount = answers.filter(grade => grade === "remembered").length
  const forgotCards = cards.filter((_, index) => answers[index] === "forgot")

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

      {hasSaveFailure && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-wrong/50 bg-wrong-wash px-4 py-3" role="alert">
          <p className="text-sm text-fg">保存できなかったカードが 1 枚あります。</p>
          <button className="rounded-md border border-wrong/60 px-3 py-1.5 text-sm text-fg hover:bg-wrong/15" type="button">もう一度送る</button>
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
                <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg-muted">{card.meaningJa}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink hover:bg-amber-bright" href="/mock/vocabulary/session">
          もう 1 回
        </Link>
        <Link className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-fg hover:bg-raised" href="/mock/vocabulary">
          単語帳のトップへ
        </Link>
      </div>
    </div>
  )
}

/**
 * 今日の分が無いとき
 */
export function SessionDone() {
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
        次の復習は <span className="text-fg">{formatDayLabel(MOCK_VOCABULARY_SUMMARY.nextDueDate)}</span> です。問題を解くと、新しい単語が増えます。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink hover:bg-amber-bright" href="/mock/passages">問題を解く</Link>
        <Link className="rounded-lg border border-line-strong px-5 py-2.5 text-sm text-fg hover:bg-raised" href="/mock/vocabulary">単語帳のトップへ</Link>
      </div>
    </div>
  )
}
