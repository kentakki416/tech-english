"use client"

import { useEffect, useState } from "react"

import { MOCK_VOCABULARY_CARDS, type MockVocabularyCard } from "@/libs/mock-data"

import { usePaperSound } from "../../_components/paper-sound"
import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet } from "../../_components/PaperCard"
import {
  AnswerButtons,
  FlipButton,
  type Grade,
  isReducedMotion,
  LampGlow,
  REVIEWED_GRADES,
  SessionDone,
  SessionReview,
  SessionTopBar,
} from "../../_components/VocabularySessionParts"

export type VocabularySessionMockState = "back" | "done" | "front" | "review" | "save_failed"

/**
 * カードが横に飛んでいく時間（答えたとき）
 */
const LEAVE_DURATION_MS = 300

/**
 * 面を差し替えるまでの時間（めくる動き animate-card-flip の半分。カードが真横を向いた瞬間）
 */
const FLIP_HALF_MS = 220

const buildInitialProgress = (state: VocabularySessionMockState): { answers: Grade[], isFlipped: boolean } => {
  if (state === "review" || state === "save_failed") return { answers: REVIEWED_GRADES, isFlipped: false }
  return { answers: ["remembered", "forgot"], isFlipped: state === "back" }
}

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
 * 単語帳の 1 回分（モック）。1 枚のカードを横に裏返して覚えた / まだを付け、全部答えるとふりかえり
 *
 * Space / Enter でめくり、めくった後は → で覚えた、← でまだ。答えたカードは横に飛んで、次のカードが束から上がってくる。
 * めくるたびに紙をめくる音を鳴らす（上部バーで消せる）
 */
export function VocabularySessionMock({ initialState }: { initialState: VocabularySessionMockState }) {
  const cards = initialState === "done" ? [] : MOCK_VOCABULARY_CARDS
  const initial = buildInitialProgress(initialState)
  const [answers, setAnswers] = useState<Grade[]>(initial.answers)
  const [isFlipped, setIsFlipped] = useState(initial.isFlipped)
  const [shownFlipped, setShownFlipped] = useState(initial.isFlipped)
  const [flipCount, setFlipCount] = useState(0)
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null)
  const sound = usePaperSound()
  const current = cards[answers.length]

  const flip = () => {
    if (leaving) return
    const next = !isFlipped
    setIsFlipped(next)
    sound.play()
    if (isReducedMotion()) {
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
    if (isReducedMotion()) {
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
      <SessionTopBar answers={answers} isSoundEnabled={sound.isEnabled} total={cards.length} onToggleSound={sound.toggle} />

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

            <div className="mt-10 flex h-24 items-start justify-center gap-3">
              {isFlipped ? <AnswerButtons onAnswer={answer} /> : <FlipButton hint="意味を思い出してから、めくりましょう。" onFlip={flip} />}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
