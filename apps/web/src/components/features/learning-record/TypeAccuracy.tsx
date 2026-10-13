import type { GetUserStatsResponse } from "@repo/api-schema"

import { QUESTION_TYPE_LABELS } from "@/components/features/passage/labels"

/**
 * この正答率未満の種類は淡い琥珀にする（苦手の目安）
 */
const WEAK_ACCURACY_PERCENT = 70

/**
 * 設問の種類別の正答率。設問の無い種類（null）は `—` と空の棒。一番低い種類を下に書く
 */
export function TypeAccuracy({
  typeAccuracy,
  weakestQuestionType,
}: {
  typeAccuracy: GetUserStatsResponse["type_accuracy"]
  weakestQuestionType: GetUserStatsResponse["weakest_question_type"]
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-fg">設問の種類別の正答率</h2>
      <ul className="mt-4 space-y-3">
        {typeAccuracy.map(item => (
          <li key={item.type} className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
            <span className="text-fg-muted">{QUESTION_TYPE_LABELS[item.type]}</span>
            <span aria-hidden className="h-2 rounded-full bg-heat-0">
              {item.accuracy_percent !== null && (
                <span
                  className={`block h-full rounded-full ${item.accuracy_percent < WEAK_ACCURACY_PERCENT ? "bg-amber/50" : "bg-amber"}`}
                  style={{ width: `${item.accuracy_percent}%` }}
                />
              )}
            </span>
            <span className="text-right text-fg tabular-nums">{item.accuracy_percent === null ? "—" : `${item.accuracy_percent}%`}</span>
          </li>
        ))}
      </ul>
      {weakestQuestionType !== null && (
        <p className="mt-3 text-xs text-fg-faint">{QUESTION_TYPE_LABELS[weakestQuestionType]}の設問が一番苦手です。</p>
      )}
    </div>
  )
}
