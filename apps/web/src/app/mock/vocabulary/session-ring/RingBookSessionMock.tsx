"use client"

import { useEffect, useState } from "react"

import { MOCK_TODAY, MOCK_VOCABULARY_CARDS, type MockVocabularyCard } from "@/libs/mock-data"

import { usePaperSound } from "../../_components/paper-sound"
import { PaperCardBack, PaperCardFront, PaperSheet, PunchHole } from "../../_components/PaperCard"
import {
  AnswerButtons,
  FlipButton,
  formatDayLabel,
  type Grade,
  isReducedMotion,
  LampGlow,
  REVIEWED_GRADES,
  SessionReview,
  SessionTopBar,
} from "../../_components/VocabularySessionParts"

export type RingBookMockState = "first" | "review" | "stamped" | "turned"

/**
 * 1 枚めくる時間（animate-page-turn-left / animate-page-turn-up と同じ）
 */
const PAGE_TURN_MS = 640

/**
 * 最後のカードに答えてから、ふりかえりを出すまでの時間（ハンコを見せるため）
 */
const REVIEW_DELAY_MS = 900

/**
 * leftIndex は見開きの左（スマホ幅では上）に裏向きで出ているカード。null なら表紙の裏
 */
type Progress = { answers: Grade[], isReviewShown: boolean, leftIndex: number | null }

const buildInitialProgress = (state: RingBookMockState): Progress => {
  if (state === "turned") return { answers: ["remembered", "forgot"], isReviewShown: false, leftIndex: 2 }
  if (state === "stamped") return { answers: ["remembered", "forgot", "remembered"], isReviewShown: false, leftIndex: 2 }
  if (state === "review") return { answers: REVIEWED_GRADES, isReviewShown: true, leftIndex: 9 }
  return { answers: [], isReviewShown: false, leftIndex: null }
}

/**
 * 見開きの 1 ページ。front は右（スマホ幅は下）、back は左（スマホ幅は上）で、どちらもリングの側に穴を開ける
 */
function RingPage({ children, side }: { children: React.ReactNode, side: "back" | "front" }) {
  return (
    <PaperSheet className="absolute inset-0" hasHole={false} tone={side}>
      <PunchHole
        className={
          side === "front"
            ? "top-3 left-1/2 -translate-x-1/2 sm:top-1/2 sm:left-3 sm:translate-x-0 sm:-translate-y-1/2"
            : "bottom-3 left-1/2 -translate-x-1/2 sm:top-1/2 sm:right-3 sm:bottom-auto sm:left-auto sm:translate-x-0 sm:-translate-y-1/2"
        }
      />
      {children}
    </PaperSheet>
  )
}

/**
 * ページの下に重なった束。左（めくり終えたカード）は答えた枚数、右（これからのカード）は残りの枚数で厚くなる
 */
function PageStack({ count, side }: { count: number, side: "back" | "front" }) {
  const layers = Math.min(3, Math.ceil(count / 3))
  return (
    <>
      {Array.from({ length: layers }, (_, index) => {
        const offset = (layers - index) * 3
        return (
          <span
            key={index}
            aria-hidden
            className="absolute inset-0 rounded-xl bg-paper-edge shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)]"
            style={{ transform: `translate(${side === "front" ? offset : -offset}px, ${offset}px)` }}
          />
        )
      })}
    </>
  )
}

/**
 * 見開きの間を通るリング（金具）。PC は横長、スマホ幅は縦長
 */
function BinderRing() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[calc(50%-44px)] left-1/2 z-20 h-[88px] w-9 -translate-x-1/2 rounded-full border-[5px] border-[#cdc5b3] shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_3px_6px_rgb(0_0_0/0.55)] sm:top-1/2 sm:h-9 sm:w-[88px] sm:-translate-y-1/2"
    />
  )
}

/**
 * 答えたときに押すハンコ
 */
function GradeStamp({ grade }: { grade: Grade }) {
  return (
    <span
      className={`absolute top-6 right-8 z-10 rounded-md border-[2.5px] px-2.5 py-1 text-sm font-bold tracking-widest mix-blend-multiply motion-safe:animate-stamp-in sm:right-14 ${
        grade === "remembered" ? "border-ink-amber/80 text-ink-amber" : "border-[#b5484c]/80 text-[#b5484c]"
      }`}
      style={{ transform: "rotate(-14deg)" }}
    >
      {grade === "remembered" ? "覚えた" : "まだ"}
    </span>
  )
}

/**
 * 表紙の裏（まだ 1 枚もめくっていないとき、左に出す）
 */
function InsideCover({ total }: { total: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="font-code text-xs tracking-wide text-ink-faint">tech-english</p>
      <p className="text-sm text-ink-muted">今日の単語帳</p>
      <p className="font-reading text-5xl font-semibold text-ink tabular-nums">{total}<span className="ml-1 text-base font-normal text-ink-muted">枚</span></p>
      <p className="text-xs text-ink-faint">{formatDayLabel(MOCK_TODAY)}</p>
    </div>
  )
}

/**
 * 裏表紙（最後のカードをめくった後、右に出す）
 */
function BackCover() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="font-reading text-2xl text-ink-muted italic">fin.</p>
      <p className="text-xs text-ink-faint">左のカードに答えると、ふりかえりに進みます。</p>
    </div>
  )
}

/**
 * めくっている途中のカード。表と裏を重ね、リングを軸に回す（PC は左へ、スマホ幅は上へ）。
 * 軸は見開きの間（gap-8 = 32px）の真ん中なので、transform-origin をページの外へ 16px ずらす
 */
function TurningPage({ card }: { card: MockVocabularyCard }) {
  return (
    <div className="absolute inset-0 z-10 origin-[50%_-16px] transform-3d motion-safe:animate-page-turn-up sm:origin-[-16px_50%] sm:motion-safe:animate-page-turn-left">
      <div className="absolute inset-0 backface-hidden">
        <RingPage side="front"><PaperCardFront card={card} /></RingPage>
      </div>
      <div className="absolute inset-0 rotate-x-180 backface-hidden sm:rotate-x-0 sm:rotate-y-180">
        <RingPage side="back"><PaperCardBack card={card} /></RingPage>
      </div>
    </div>
  )
}

/**
 * 単語帳の 1 回分（モック・デザイン 2）。左のリングで綴じた単語帳を 1 枚ずつ左へめくる
 *
 * 右のページ（スマホ幅は下）が今のカードの表。Space でめくると、そのカードの裏（意味）が左に来て、右に次のカードの表が出る。
 * 左のカードに → / ← で答えるとハンコが押され、次のカードをめくれるようになる。めくるたびに紙の音を鳴らす
 */
export function RingBookSessionMock({ initialState }: { initialState: RingBookMockState }) {
  const cards = MOCK_VOCABULARY_CARDS
  const initial = buildInitialProgress(initialState)
  const [answers, setAnswers] = useState<Grade[]>(initial.answers)
  const [leftIndex, setLeftIndex] = useState<number | null>(initial.leftIndex)
  const [turningIndex, setTurningIndex] = useState<number | null>(null)
  const [isReviewShown, setIsReviewShown] = useState(initial.isReviewShown)
  const sound = usePaperSound()

  const rightIndex = leftIndex === null ? 0 : leftIndex + 1
  const isAwaitingAnswer = leftIndex !== null && answers.length === leftIndex
  const canTurn = turningIndex === null && !isAwaitingAnswer && rightIndex < cards.length
  const staticRightIndex = turningIndex === null ? rightIndex : turningIndex + 1

  const turn = () => {
    if (!canTurn) return
    sound.play("page")
    if (isReducedMotion()) {
      setLeftIndex(rightIndex)
      return
    }
    setTurningIndex(rightIndex)
    window.setTimeout(() => {
      setLeftIndex(rightIndex)
      setTurningIndex(null)
    }, PAGE_TURN_MS)
  }

  const answer = (grade: Grade) => {
    if (!isAwaitingAnswer) return
    setAnswers(previous => [...previous, grade])
    if (answers.length + 1 === cards.length) window.setTimeout(() => setIsReviewShown(true), REVIEW_DELAY_MS)
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || isReviewShown) return
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault()
        turn()
      } else if (event.key === "ArrowRight") {
        answer("remembered")
      } else if (event.key === "ArrowLeft") {
        answer("forgot")
      }
    }
    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  })

  const leftCard = leftIndex === null ? null : cards[leftIndex]
  const rightCard = cards[staticRightIndex]

  return (
    <div className="flex min-h-dvh flex-col">
      <SessionTopBar answers={answers} isSoundEnabled={sound.isEnabled} total={cards.length} onToggleSound={sound.toggle} />

      <main className="relative flex flex-1 flex-col justify-center overflow-x-clip px-4 py-6 sm:py-12">
        {isReviewShown ? (
          <SessionReview answers={answers} cards={cards} hasSaveFailure={false} retryHref="/mock/vocabulary/session-ring" />
        ) : (
          <div className="mx-auto w-full max-w-[940px]">
            <div className="relative grid gap-8 sm:grid-cols-2">
              <LampGlow className="-top-40" />

              <div className="relative h-[268px] sm:h-[340px]">
                <PageStack count={answers.length} side="back" />
                <RingPage side="back">
                  {leftCard ? <PaperCardBack card={leftCard} /> : <InsideCover total={cards.length} />}
                  {leftIndex !== null && answers[leftIndex] && <GradeStamp key={leftIndex} grade={answers[leftIndex]} />}
                </RingPage>
              </div>

              <div className="relative h-[268px] perspective-[2400px] perspective-origin-top sm:h-[340px] sm:perspective-origin-left">
                <PageStack count={cards.length - staticRightIndex - 1} side="front" />
                <button
                  aria-label="カードをめくる"
                  className="absolute inset-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/70 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas disabled:cursor-default"
                  disabled={!canTurn}
                  onClick={turn}
                  type="button"
                >
                  <RingPage side="front">{rightCard ? <PaperCardFront card={rightCard} /> : <BackCover />}</RingPage>
                </button>
                {turningIndex !== null && <TurningPage card={cards[turningIndex]} />}
              </div>

              <BinderRing />
            </div>

            <div className="mt-8 flex h-24 flex-col items-center gap-3 sm:mt-10">
              {isAwaitingAnswer ? (
                <>
                  <div className="flex gap-3"><AnswerButtons onAnswer={answer} /></div>
                  <p className="text-xs text-fg-faint">左のカードの意味を確かめて、答えてください。</p>
                </>
              ) : canTurn ? (
                <FlipButton hint="右のカードの意味を思い出してから、左へめくりましょう。" onFlip={turn} />
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
