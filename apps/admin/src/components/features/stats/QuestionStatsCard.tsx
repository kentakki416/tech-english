import type { GetAdminPassageStatsResponse } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import { CHOICE_LETTERS, QUESTION_TYPE_LABELS } from "@/features/passage/passage.labels"
import { formatRate } from "@/libs/format-stats"

type QuestionStats = GetAdminPassageStatsResponse["questions"][number]

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
 * 設問 1 つの分析（種類・設問文・正答率・選択肢ごとの割合・未回答・要確認の印）。
 * 要確認と橙にする選択肢の判定は API（needs_review・misleading_choice_indexes。ルールは domain）で、ここでは書き直さない
 */
export function QuestionStatsCard({ question }: { question: QuestionStats }) {
  return (
    <section className={`rounded-2xl border bg-white p-5 sm:p-6 dark:bg-white/3 ${question.needs_review ? "border-warning-300 dark:border-warning-500/40" : "border-gray-200 dark:border-gray-800"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-gray-800 dark:text-white/90">Q{question.order_index + 1}</span>
        <Badge color="light" size="sm">{QUESTION_TYPE_LABELS[question.type]}</Badge>
        {question.needs_review && <Badge color="warning" size="sm">要確認</Badge>}
        <span className="ml-auto text-theme-sm text-gray-500 dark:text-gray-400">
          正答率
          <span className="ml-1.5 text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">{formatRate(question.correct_rate)}</span>
        </span>
      </div>
      <p className="mt-3 text-theme-sm text-gray-800 dark:text-white/90">{question.prompt}</p>
      {question.needs_review && (
        <p className="mt-2 text-theme-xs text-warning-600 dark:text-orange-400">正解でない選択肢が、正解と同じかそれ以上選ばれています。選択肢と正解を見直してください。</p>
      )}
      <ul className="mt-4 space-y-3">
        {question.choices.map((choice, index) => (
          <ChoiceRow
            key={index}
            isCorrect={index === question.correct_choice_index}
            isMisleading={question.misleading_choice_indexes.includes(index)}
            label={CHOICE_LETTERS[index] ?? String(index + 1)}
            rate={question.choice_rates[index] ?? null}
            text={choice}
          />
        ))}
      </ul>
      <p className="mt-4 border-t border-gray-100 pt-3 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        未回答 {formatRate(question.unanswered_rate)}
      </p>
    </section>
  )
}
