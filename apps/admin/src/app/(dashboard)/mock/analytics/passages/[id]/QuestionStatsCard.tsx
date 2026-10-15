import Badge from "@/components/ui/badge/Badge"
import { QUESTION_TYPE_OPTIONS, type QuestionStats } from "@/libs/mock-data"

import { formatRate } from "../../../_components/stats-format"

const CHOICE_LETTERS = ["A", "B", "C", "D"]

/**
 * 正解でない選択肢が、正解と同じかそれ以上選ばれているか（本実装は API の isQuestionNeedingReview）
 */
const hasMisleadingChoice = (question: QuestionStats): boolean => {
  const correctRate = question.choiceRates[question.correctChoiceIndex]
  return question.choiceRates.some((rate, index) => index !== question.correctChoiceIndex && rate > 0 && rate >= correctRate)
}

/**
 * 選択肢 1 つの行。正解は緑、正解と同じかそれ以上選ばれた誤りは橙、ほかは灰色の横棒
 */
function ChoiceRow({ isCorrect, isMisleading, label, rate, text }: { isCorrect: boolean, isMisleading: boolean, label: string, rate: number | null, text: string }) {
  const barColor = isCorrect ? "bg-success-500" : isMisleading ? "bg-warning-500" : "bg-gray-300 dark:bg-gray-600"
  return (
    <li>
      <div className="flex items-start gap-3">
        <span className={`w-4 shrink-0 text-theme-sm font-semibold ${isCorrect ? "text-success-600 dark:text-success-500" : "text-gray-500 dark:text-gray-400"}`}>{label}</span>
        <span className="min-w-0 flex-1 text-theme-sm text-gray-700 dark:text-gray-300">
          {text}
          {isCorrect && <span className="ml-2 text-theme-xs font-medium whitespace-nowrap text-success-600 dark:text-success-500">✓ 正解</span>}
        </span>
        <span className="shrink-0 text-theme-sm font-medium text-gray-800 tabular-nums dark:text-white/90">{formatRate(rate)}</span>
      </div>
      <div className="mt-1.5 ml-7 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
      </div>
    </li>
  )
}

/**
 * 設問 1 つの分析（種類・設問文・正答率・選択肢ごとの割合・未回答・要確認の印）
 */
export function QuestionStatsCard({ isSolved, question, solvedAttempts }: { isSolved: boolean, question: QuestionStats, solvedAttempts: number }) {
  const needsReview = isSolved && solvedAttempts >= 5 && hasMisleadingChoice(question)
  const typeLabel = QUESTION_TYPE_OPTIONS.find(option => option.value === question.type)?.label ?? question.type

  return (
    <section className={`rounded-2xl border bg-white p-5 sm:p-6 dark:bg-white/3 ${needsReview ? "border-warning-300 dark:border-warning-500/40" : "border-gray-200 dark:border-gray-800"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-gray-800 dark:text-white/90">Q{question.orderIndex + 1}</span>
        <Badge color="light" size="sm">{typeLabel}</Badge>
        {needsReview && <Badge color="warning" size="sm">要確認</Badge>}
        <span className="ml-auto text-theme-sm text-gray-500 dark:text-gray-400">
          正答率
          <span className="ml-1.5 text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">{isSolved ? formatRate(question.correctRate) : "—"}</span>
        </span>
      </div>
      <p className="mt-3 text-theme-sm text-gray-800 dark:text-white/90">{question.prompt}</p>
      {needsReview && (
        <p className="mt-2 text-theme-xs text-warning-600 dark:text-orange-400">正解でない選択肢が、正解と同じかそれ以上選ばれています。選択肢と正解を見直してください。</p>
      )}
      <ul className="mt-4 space-y-3">
        {question.choices.map((choice, index) => (
          <ChoiceRow
            key={choice}
            isCorrect={index === question.correctChoiceIndex}
            isMisleading={needsReview && index !== question.correctChoiceIndex && question.choiceRates[index] >= question.choiceRates[question.correctChoiceIndex]}
            label={CHOICE_LETTERS[index]}
            rate={isSolved ? question.choiceRates[index] : null}
            text={choice}
          />
        ))}
      </ul>
      <p className="mt-4 border-t border-gray-100 pt-3 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        未回答 {isSolved ? formatRate(question.unansweredRate) : "—"}
      </p>
    </section>
  )
}
