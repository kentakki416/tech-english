import type { GetUserStatsResponse } from "@repo/api-schema"

import { formatStudyTime } from "@/libs/format"

/**
 * 正答率の表示。設問が 0 問（null）なら `—`
 */
const formatAccuracy = (accuracyPercent: number | null): string => (accuracyPercent === null ? "—" : `${accuracyPercent}%`)

/**
 * 累計（解いた問題・挑戦した回数・学習時間・正答率）と、アシストなしの正答率
 */
export function StudyTotals({
  noAssist,
  totals,
}: {
  noAssist: GetUserStatsResponse["no_assist"]
  totals: GetUserStatsResponse["totals"]
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-fg">累計</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
        <div>
          <dt className="text-xs text-fg-muted">解いた問題</dt>
          <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{totals.passage_count}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">挑戦した回数</dt>
          <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{totals.attempt_count}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">学習時間</dt>
          <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{formatStudyTime(totals.study_seconds)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">正答率</dt>
          <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{formatAccuracy(totals.accuracy_percent)}</dd>
          <p className="mt-0.5 text-xs text-fg-faint">アシストなしでは {formatAccuracy(noAssist.accuracy_percent)}</p>
        </div>
      </dl>
    </div>
  )
}
