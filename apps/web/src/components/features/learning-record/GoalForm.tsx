"use client"

import { useActionState, useState } from "react"

import type { GetUserGoalResponse } from "@repo/api-schema"

import type { GoalFormState } from "@/app/settings/actions"
import { SubmitButton } from "@/components/ui/SubmitButton"

type Goal = GetUserGoalResponse["goal"]

type GoalMetric = NonNullable<NonNullable<Goal>["weekly_metric"]>

type WeeklyMetricOption = "none" | GoalMetric

type SaveGoalAction = (prev: GoalFormState, formData: FormData) => Promise<GoalFormState>

const METRIC_OPTIONS: { key: WeeklyMetricOption, label: string }[] = [
  { key: "none", label: "設定しない" },
  { key: "passages", label: "問題数" },
  { key: "minutes", label: "学習時間" },
]

/**
 * 指標を選んだときの週の目標値の初期値（保存済みの指標と同じならその値）
 */
const DEFAULT_WEEKLY_TARGETS: Record<GoalMetric, number> = {
  minutes: 60,
  passages: 5,
}

/**
 * 目標の文字数の上限（API の検証と同じ。超えたら文字数を wrong で出す）
 */
const GOAL_TEXT_MAX = 200

const inputClass = "rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-amber/70 focus:ring-2 focus:ring-amber/30"

const resolveWeeklyTarget = (goal: Goal, metric: GoalMetric): string =>
  String(goal?.weekly_metric === metric && goal.weekly_target !== null ? goal.weekly_target : DEFAULT_WEEKLY_TARGETS[metric])

/**
 * 目標のフォーム。保存は Server Action（useActionState）。指標のセグメントの値は hidden の input で送る
 */
export function GoalForm({ action, goal }: { action: SaveGoalAction, goal: Goal }) {
  const [state, formAction] = useActionState(action, { status: "idle" })
  const [goalText, setGoalText] = useState(goal?.goal_text ?? "")
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "")
  const [metric, setMetric] = useState<WeeklyMetricOption>(goal?.weekly_metric ?? "none")
  const [weeklyTarget, setWeeklyTarget] = useState(goal?.weekly_metric ? resolveWeeklyTarget(goal, goal.weekly_metric) : "")
  /**
   * 保存後に入力を変えたら「目標を保存しました」を消す
   */
  const [isEditedAfterSubmit, setIsEditedAfterSubmit] = useState(false)

  const markEdited = () => setIsEditedAfterSubmit(true)

  return (
    <form
      action={formAction}
      className="mt-5 space-y-6 rounded-xl border border-line bg-surface p-5 sm:p-6"
      onSubmit={() => setIsEditedAfterSubmit(false)}
    >
      <div>
        <label className="flex items-baseline justify-between text-sm text-fg" htmlFor="goal-text">
          目標
          <span className={`text-xs tabular-nums ${goalText.length > GOAL_TEXT_MAX ? "text-wrong" : "text-fg-faint"}`}>
            {goalText.length} / {GOAL_TEXT_MAX}
          </span>
        </label>
        <textarea
          className={`${inputClass} mt-2 min-h-20 w-full resize-y leading-relaxed`}
          id="goal-text"
          name="goal_text"
          onChange={(event) => {
            setGoalText(event.target.value)
            markEdited()
          }}
          placeholder="例：英語の公式ドキュメントを辞書なしで読めるようになる"
          value={goalText}
        />
      </div>
      <div>
        <label className="block text-sm text-fg" htmlFor="goal-date">目標日</label>
        <input
          className={`${inputClass} mt-2 block w-full sm:w-56`}
          id="goal-date"
          name="target_date"
          onChange={(event) => {
            setTargetDate(event.target.value)
            markEdited()
          }}
          type="date"
          value={targetDate}
        />
      </div>
      <fieldset>
        <legend className="text-sm text-fg">週の目標</legend>
        <p className="mt-1 text-xs text-fg-muted">週は月曜日から始まります。</p>
        <input name="weekly_metric" type="hidden" value={metric} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div aria-label="週の目標の指標" className="flex rounded-md border border-line-strong p-0.5 text-sm" role="radiogroup">
            {METRIC_OPTIONS.map(option => (
              <button
                key={option.key}
                aria-checked={metric === option.key}
                className={`rounded px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                  metric === option.key ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
                }`}
                onClick={() => {
                  if (option.key !== metric && option.key !== "none") setWeeklyTarget(resolveWeeklyTarget(goal, option.key))
                  setMetric(option.key)
                  markEdited()
                }}
                role="radio"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {metric !== "none" && (
            <span className="flex items-center gap-2 text-sm whitespace-nowrap text-fg-muted">
              週に
              <input
                aria-label="週の目標値"
                className={`${inputClass} w-20 text-right tabular-nums`}
                min={1}
                name="weekly_target"
                onChange={(event) => {
                  setWeeklyTarget(event.target.value)
                  markEdited()
                }}
                type="number"
                value={weeklyTarget}
              />
              {metric === "passages" ? "問" : "分"}
            </span>
          )}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <SubmitButton
          className="h-10 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 disabled:cursor-wait disabled:opacity-70"
          pendingLabel="保存しています…"
        >
          目標を保存
        </SubmitButton>
        {state.status === "saved" && !isEditedAfterSubmit && <p className="text-sm text-correct" role="status">目標を保存しました</p>}
        {state.status === "error" && <p className="text-sm text-wrong" role="alert">{state.message}</p>}
      </div>
    </form>
  )
}
