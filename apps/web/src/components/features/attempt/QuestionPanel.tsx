import type { AttemptQuestion } from "@repo/api-schema"

import { Keycap } from "@/components/ui/Keycap"

import { QuestionTranslationToggle } from "./QuestionTranslationToggle"

const CHOICE_LETTERS = ["A", "B", "C", "D"]

const MOVE_BUTTON_CLASS = "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60 disabled:pointer-events-none disabled:opacity-40"

/**
 * 設問パネル。上部に設問の番号（現在の設問は塗りと枠、回答済みは琥珀の点）、設問文と選択肢、下部に前後の移動。
 * PC 幅では右の列、スマホ幅では設問シートの中に置く
 */
export function QuestionPanel({
  answers,
  currentIndex,
  isLabelVisible = true,
  questions,
  translatedQuestionIds,
  onChoose,
  onMove,
  onToggleTranslation,
}: {
  /**
   * 設問 ID → 選んだ選択肢の添字
   */
  answers: Record<number, number>
  currentIndex: number
  isLabelVisible?: boolean
  questions: AttemptQuestion[]
  /**
   * 和訳を出している設問の ID
   */
  translatedQuestionIds: Set<number>
  onChoose: (questionId: number, choiceIndex: number) => void
  onMove: (index: number) => void
  onToggleTranslation: (questionId: number) => void
}) {
  const question = questions[currentIndex]
  if (!question) return null
  const isTranslated = question.prompt_ja !== null && translatedQuestionIds.has(question.id)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-4 py-3">
        {isLabelVisible && <span className="mr-2 text-xs text-fg-muted">設問</span>}
        {questions.map((item, index) => {
          const isAnswered = answers[item.id] !== undefined
          return (
            <button
              key={item.id}
              aria-current={index === currentIndex ? "step" : undefined}
              aria-label={`Q${index + 1}${isAnswered ? "（回答済み）" : ""}`}
              className={`relative grid h-8 w-9 place-items-center rounded-md text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
                index === currentIndex ? "bg-raised text-fg ring-1 ring-line-strong" : "text-fg-muted hover:bg-raised hover:text-fg"
              }`}
              onClick={() => onMove(index)}
              type="button"
            >
              {index + 1}
              <span aria-hidden className={`absolute bottom-1 size-1 rounded-full ${isAnswered ? "bg-amber" : "bg-transparent"}`} />
            </button>
          )
        })}
      </div>

      {/**
        * 設問を移ったら先頭から読めるよう、設問ごとにスクロールの位置を作り直す
        */}
      <div key={question.id} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">Q{currentIndex + 1}</p>
          {question.prompt_ja !== null && (
            <QuestionTranslationToggle isTranslated={isTranslated} onToggle={() => onToggleTranslation(question.id)} />
          )}
        </div>
        <h2 className="mt-2 font-reading text-[17px] leading-relaxed text-fg">{question.prompt}</h2>
        {isTranslated && <p className="mt-1.5 font-ui text-[14px] leading-relaxed text-fg-muted">{question.prompt_ja}</p>}
        <ul className="mt-5 space-y-2.5">
          {question.choices.map((choice, choiceIndex) => {
            const isSelected = answers[question.id] === choiceIndex
            return (
              <li key={choiceIndex}>
                <button
                  aria-pressed={isSelected}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
                    isSelected ? "border-amber/70 bg-amber-wash" : "border-line hover:border-line-strong hover:bg-raised"
                  }`}
                  onClick={() => onChoose(question.id, choiceIndex)}
                  type="button"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-md border font-code text-xs ${
                      isSelected ? "border-amber bg-amber text-amber-ink" : "border-line-strong text-fg-muted"
                    }`}
                  >
                    {CHOICE_LETTERS[choiceIndex]}
                  </span>
                  <span className="flex flex-col pt-px">
                    <span className="font-reading text-[15.5px] leading-snug text-fg">{choice}</span>
                    {isTranslated && question.choices_ja !== null && (
                      <span className="mt-1 font-ui text-[13px] leading-snug text-fg-muted">{question.choices_ja[choiceIndex]}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <button className={MOVE_BUTTON_CLASS} disabled={currentIndex === 0} onClick={() => onMove(currentIndex - 1)} type="button">
          <span className="hidden lg:inline"><Keycap>K</Keycap></span>
          前の設問
        </button>
        <button
          className={MOVE_BUTTON_CLASS}
          disabled={currentIndex === questions.length - 1}
          onClick={() => onMove(currentIndex + 1)}
          type="button"
        >
          次の設問
          <span className="hidden lg:inline"><Keycap>J</Keycap></span>
        </button>
      </div>
    </div>
  )
}
