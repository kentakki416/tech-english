"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { MOCK_VOCABULARY_CARDS, MOCK_VOCABULARY_SUMMARY, type MockVocabularyCard } from "@/libs/mock-data"

import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet } from "../../_components/PaperCard"
import { Keycap } from "../../_components/parts"

export type VocabularySessionMockState = "back" | "done" | "front" | "review" | "save_failed"

type Grade = "forgot" | "remembered"

/**
 * カードが横に飛んでいく時間（答えたとき）
 */
const LEAVE_DURATION_MS = 300

/**
 * ふりかえりの状態で使う答え（覚えた 7 / まだ 3）
 */
const REVIEWED_GRADES: Grade[] = ["remembered", "forgot", "remembered", "remembered", "forgot", "remembered", "remembered", "remembered", "forgot", "remembered"]

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

const buildInitialProgress = (state: VocabularySessionMockState): { answers: Grade[], isFlipped: boolean } => {
  if (state === "review" || state === "save_failed") return { answers: REVIEWED_GRADES, isFlipped: false }
  return { answers: ["remembered", "forgot"], isFlipped: state === "back" }
}

/**
 * 進み具合のマス。覚えたは琥珀に灯り、まだはローズの枠、今のカードは白い輪
 */
function ProgressSquares({ answers, total }: { answers: Grade[], total: number }) {
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
function LampGlow() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[150%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(243_178_76/0.2),transparent_62%)]"
    />
  )
}

/**
 * 面を差し替えるまでの時間（めくる動き animate-card-flip の半分。カードが真横を向いた瞬間）
 */
const FLIP_HALF_MS = 220

/**
 * 1 枚のカード。めくると横に回り、真横を向いた瞬間に表と裏を差し替える（差し替えは親が FLIP_HALF_MS 後に行う）。
 * めくり終わった後は変形を残さない（3D の変形が残ると文字がぼやけるため）
 */
function FlipCard({
  card,
  flipCount,
  isFlipped,
  shownFlipped,
  onFlip,
}: {
  card: MockVocabularyCard
  flipCount: number
  isFlipped: boolean
  shownFlipped: boolean
  onFlip: () => void
}) {
  return (
    <button
      aria-label={isFlipped ? "カードを表に戻す" : "カードをめくる"}
      className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
      onClick={onFlip}
      type="button"
    >
      <div key={flipCount} className={flipCount > 0 ? "motion-safe:animate-card-flip" : ""}>
        <PaperSheet className="relative h-[440px] sm:h-[380px]" tone={shownFlipped ? "back" : "front"}>
          {shownFlipped ? <PaperCardBack card={card} /> : <PaperCardFront card={card} />}
        </PaperSheet>
      </div>
    </button>
  )
}

/**
 * ふりかえり。覚えた / まだの数と、まだの単語の一覧
 */
function SessionReview({ answers, cards, hasSaveFailure }: { answers: Grade[], cards: MockVocabularyCard[], hasSaveFailure: boolean }) {
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
function SessionDone() {
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

/**
 * 単語帳の 1 回分（モック）。カードをめくって覚えた / まだを付け、全部答えるとふりかえり
 *
 * Space / Enter でめくり、めくった後は → で覚えた、← でまだ。答えたカードは横に飛んで、次のカードが束から上がってくる
 */
export function VocabularySessionMock({ initialState }: { initialState: VocabularySessionMockState }) {
  const cards = initialState === "done" ? [] : MOCK_VOCABULARY_CARDS
  const initial = buildInitialProgress(initialState)
  const [answers, setAnswers] = useState<Grade[]>(initial.answers)
  const [isFlipped, setIsFlipped] = useState(initial.isFlipped)
  const [shownFlipped, setShownFlipped] = useState(initial.isFlipped)
  const [flipCount, setFlipCount] = useState(0)
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null)
  const current = cards[answers.length]

  const flip = () => {
    if (leaving) return
    const next = !isFlipped
    setIsFlipped(next)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShownFlipped(next)
      return
    }
    setFlipCount(count => count + 1)
    window.setTimeout(() => setShownFlipped(next), FLIP_HALF_MS)
  }

  const answer = (grade: Grade) => {
    if (!isFlipped || leaving) return
    const finish = () => {
      setAnswers(previous => [...previous, grade])
      setIsFlipped(false)
      setShownFlipped(false)
      setFlipCount(0)
      setLeaving(null)
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish()
      return
    }
    setLeaving(grade === "remembered" ? "right" : "left")
    window.setTimeout(finish, LEAVE_DURATION_MS)
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || !current) return
      if (event.key === " " || event.key === "Enter") {
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
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/80 px-3 backdrop-blur sm:px-4">
        <Link className="inline-flex w-24 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-raised hover:text-fg" href="/mock/vocabulary">
          <span aria-hidden>‹</span>単語帳
        </Link>
        {cards.length > 0 && (
          <div className="mx-auto flex items-center gap-3">
            <span className="text-sm text-fg tabular-nums">
              {Math.min(answers.length + 1, cards.length)}
              <span className="text-fg-faint"> / {cards.length}</span>
            </span>
            <span className="hidden sm:inline-flex"><ProgressSquares answers={answers} total={cards.length} /></span>
          </div>
        )}
        <span className="w-24" />
      </header>

      <main className="relative flex flex-1 flex-col justify-center overflow-x-clip px-4 py-8 sm:py-12">
        {cards.length === 0 ? (
          <SessionDone />
        ) : !current ? (
          <SessionReview answers={answers} cards={cards} hasSaveFailure={initialState === "save_failed"} />
        ) : (
          <div className="mx-auto w-full max-w-[560px]">
            <div className="relative">
              <LampGlow />
              <CardStackBehind count={cards.length - answers.length - 1} />
              <div key={answers.length} className="relative motion-safe:animate-card-rise">
                <div
                  className={`transition-[translate,rotate,opacity] duration-300 ease-out ${
                    leaving === "right" ? "translate-x-[115%] rotate-12 opacity-0" : leaving === "left" ? "translate-x-[-115%] -rotate-12 opacity-0" : ""
                  }`}
                >
                  <FlipCard card={current} flipCount={flipCount} isFlipped={isFlipped} shownFlipped={shownFlipped} onFlip={flip} />
                </div>
              </div>
            </div>

            <div className="mt-10 flex min-h-12 items-center justify-center gap-3">
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
        )}
      </main>
    </div>
  )
}
