"use client"

import Link from "next/link"
import { useState } from "react"

import { MOCK_STATS } from "@/libs/mock-data"

type WeeklyMetric = "minutes" | "none" | "passages"

const METRIC_OPTIONS: { key: WeeklyMetric, label: string }[] = [
  { key: "none", label: "設定しない" },
  { key: "passages", label: "問題数" },
  { key: "minutes", label: "学習時間" },
]

const TIMEZONES = ["Asia/Tokyo", "Asia/Seoul", "Asia/Singapore", "Europe/London", "America/Los_Angeles", "America/New_York"]

const GOAL_TEXT_MAX = 200

const inputClass = "rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-amber/70 focus:ring-2 focus:ring-amber/30"

/**
 * 設定画面のフォーム（モック）
 */
export function SettingsForm() {
  const [goalText, setGoalText] = useState(MOCK_STATS.goal.goalText)
  const [metric, setMetric] = useState<WeeklyMetric>(MOCK_STATS.goal.weeklyMetric)
  const [isSaved, setIsSaved] = useState(false)

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="goal-heading">
        <h2 className="text-base font-semibold text-fg" id="goal-heading">目標</h2>
        <p className="mt-1 text-sm text-fg-muted">マイページに表示します。どれも空欄にできます。</p>
        <form
          className="mt-5 space-y-6 rounded-xl border border-line bg-surface p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            setIsSaved(true)
          }}
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
              onChange={(event) => {
                setGoalText(event.target.value)
                setIsSaved(false)
              }}
              placeholder="例：英語の公式ドキュメントを辞書なしで読めるようになる"
              value={goalText}
            />
          </div>
          <div>
            <label className="block text-sm text-fg" htmlFor="goal-date">目標日</label>
            <input className={`${inputClass} mt-2 block w-full sm:w-56`} defaultValue={MOCK_STATS.goal.targetDate} id="goal-date" type="date" />
          </div>
          <fieldset>
            <legend className="text-sm text-fg">週の目標</legend>
            <p className="mt-1 text-xs text-fg-muted">週は月曜日から始まります。</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex rounded-md border border-line-strong p-0.5 text-sm" role="radiogroup">
                {METRIC_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    aria-checked={metric === option.key}
                    className={`rounded px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                      metric === option.key ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
                    }`}
                    onClick={() => {
                      setMetric(option.key)
                      setIsSaved(false)
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
                    defaultValue={metric === "passages" ? MOCK_STATS.goal.weeklyTarget : 60}
                    key={metric}
                    min={1}
                    type="number"
                  />
                  {metric === "passages" ? "問" : "分"}
                </span>
              )}
            </div>
          </fieldset>
          <div className="flex items-center gap-3 border-t border-line pt-5">
            <button
              className="h-10 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
              type="submit"
            >
              目標を保存
            </button>
            {isSaved && <p className="text-sm text-correct" role="status">目標を保存しました</p>}
          </div>
        </form>
      </section>

      <section aria-labelledby="timezone-heading">
        <h2 className="text-base font-semibold text-fg" id="timezone-heading">タイムゾーン</h2>
        <p className="mt-1 text-sm text-fg-muted">学習した日付はこのタイムゾーンで決まります。変えても、記録済みの日付は動きません。</p>
        <select aria-label="タイムゾーン" className={`${inputClass} mt-4 block w-full sm:w-72`} defaultValue="Asia/Tokyo">
          {TIMEZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </section>

      <section aria-labelledby="reminder-heading">
        <h2 className="text-base font-semibold text-fg" id="reminder-heading">リマインダー</h2>
        <p className="mt-1 text-sm text-fg-muted">学習のリマインダーはモバイルアプリの設定画面で設定できます。</p>
      </section>

      <section aria-labelledby="account-heading">
        <h2 className="text-base font-semibold text-fg" id="account-heading">アカウント</h2>
        <button
          className="mt-4 h-10 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-amber/60"
          type="button"
        >
          ログアウト
        </button>
      </section>

      <section aria-labelledby="danger-heading" className="rounded-xl border border-wrong/40">
        <h2 className="border-b border-wrong/30 px-5 py-3 text-base font-semibold text-wrong" id="danger-heading">危険な操作</h2>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm text-fg">アカウントを削除する</p>
            <p className="mt-1 text-xs text-fg-muted">学習の記録・目標・リマインダーの設定がすべて削除され、元に戻せません。</p>
          </div>
          <Link
            className="grid h-9 place-items-center rounded-lg border border-wrong/60 px-4 text-sm text-wrong outline-none hover:bg-wrong-wash focus-visible:ring-2 focus-visible:ring-wrong/60"
            href="/mock/settings/delete-account"
          >
            アカウントを削除
          </Link>
        </div>
      </section>
    </div>
  )
}
