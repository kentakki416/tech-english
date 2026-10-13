import Link from "next/link"

import type { GetUserStatsResponse } from "@repo/api-schema"

type GoalProgress = NonNullable<GetUserStatsResponse["goal"]>

/**
 * 週の目標の線を目標値の数だけ並べる上限（問題数のとき）。超えたら 1 本の線を進捗の割合で塗る
 */
const SEGMENTED_TARGET_MAX = 10

/**
 * どの項目も空なら目標が無いのと同じに扱う（設定画面ですべて空欄にして保存した場合）
 */
const hasGoalContent = (goal: GoalProgress): boolean =>
  goal.goal_text !== null || goal.target_date !== null || goal.weekly_metric !== null

/**
 * 今週の進捗（`3 / 5 問` と線、達成までの残り）。週の目標が無ければ出さない
 */
function WeeklyProgress({ goal }: { goal: GoalProgress }) {
  const { is_weekly_achieved: isAchieved, weekly_metric: metric, weekly_progress: progress, weekly_target: target } = goal
  if (metric === null || target === null || progress === null) return null

  const unit = metric === "passages" ? "問" : "分"
  const isSegmented = metric === "passages" && target <= SEGMENTED_TARGET_MAX

  return (
    <div className="mt-5">
      <p className="flex items-baseline justify-between text-sm">
        <span className="text-fg-muted">今週</span>
        <span className="text-fg tabular-nums">
          {progress} / {target} {unit}
        </span>
      </p>
      {isSegmented ? (
        <div aria-hidden className="mt-2 flex gap-1">
          {Array.from({ length: target }, (_, index) => (
            <span key={index} className={`h-1.5 flex-1 rounded-full ${index < progress ? "bg-amber" : "bg-heat-0"}`} />
          ))}
        </div>
      ) : (
        <div aria-hidden className="mt-2 h-1.5 rounded-full bg-heat-0">
          <span className="block h-full rounded-full bg-amber" style={{ width: `${Math.min(progress / target, 1) * 100}%` }} />
        </div>
      )}
      <p className={`mt-2 text-xs ${isAchieved ? "text-amber" : "text-fg-faint"}`}>
        {isAchieved ? "今週の目標を達成しました。" : `あと ${target - progress} ${unit}で今週の目標を達成します。`}
      </p>
    </div>
  )
}

/**
 * 目標のパネル。値のある項目だけ出し、目標が無ければ設定を促す。「編集」で設定画面へ
 */
export function GoalPanel({ goal }: { goal: GetUserStatsResponse["goal"] }) {
  return (
    <section className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-fg-muted">目標</h2>
        <Link className="text-xs text-fg-muted hover:text-fg" href="/settings">編集</Link>
      </div>
      {goal === null || !hasGoalContent(goal) ? (
        <div className="mt-2">
          <p className="text-sm text-fg-faint">目標はまだありません。</p>
          <Link className="mt-3 inline-block text-sm text-amber hover:text-amber-bright" href="/settings">目標を設定する</Link>
        </div>
      ) : (
        <>
          {goal.goal_text !== null && <p className="mt-2 text-[15px] leading-relaxed text-fg">{goal.goal_text}</p>}
          {goal.target_date !== null && (
            <p className="mt-1.5 text-xs text-fg-muted">
              {goal.target_date.replaceAll("-", "/")} まで
              <span className="ml-1 text-fg tabular-nums">
                {goal.days_left !== null && goal.days_left >= 0 ? `あと ${goal.days_left} 日` : "目標日を過ぎています"}
              </span>
            </p>
          )}
          <WeeklyProgress goal={goal} />
        </>
      )}
    </section>
  )
}
