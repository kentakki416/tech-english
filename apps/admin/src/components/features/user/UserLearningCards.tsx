import type { ReactNode } from "react"

import type { GetAdminUserResponse } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import { QUESTION_TYPE_LABELS } from "@/features/passage/passage.labels"
import { GOAL_METRIC_UNITS } from "@/features/user/user.labels"
import { EMPTY_VALUE, formatCount, formatStudyTime } from "@/libs/format-stats"

type UserStats = GetAdminUserResponse["stats"]

/**
 * 整数の % を「74%」に（マイページの accuracy_percent は 0〜100 の整数）。null は EMPTY_VALUE
 */
const formatPercent = (percent: number | null): string => (percent === null ? EMPTY_VALUE : `${percent}%`)

function StatCard({ label, note, value }: { label: string, note: string, value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">{value}</p>
      <p className="mt-1 text-theme-xs text-gray-400">{note}</p>
    </div>
  )
}

/**
 * 見出し付きのカード（種類ごとの正答率・週の目標・単語帳）
 */
function SectionCard({ children, title }: { children: ReactNode, title: string }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * 学習のまとめの数字のカード 4 枚（マイページと同じ数字）
 */
export function UserStatCards({ stats }: { stats: UserStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
      <StatCard label="連続学習日数" note={`最長 ${stats.streak.longest} 日`} value={`${stats.streak.current} 日`} />
      <StatCard label="解いた回数" note={`解いた問題 ${formatCount(stats.totals.passage_count)} 問`} value={`${formatCount(stats.totals.attempt_count)} 回`} />
      <StatCard label="正答率" note={`アシストなし ${formatPercent(stats.no_assist.accuracy_percent)}`} value={formatPercent(stats.totals.accuracy_percent)} />
      <StatCard label="学習時間" note="問題と単語帳の合計" value={formatStudyTime(stats.totals.study_seconds)} />
    </div>
  )
}

/**
 * 設問の種類ごとの正答率の横棒
 */
export function UserTypeAccuracyCard({ typeAccuracy }: { typeAccuracy: UserStats["type_accuracy"] }) {
  return (
    <SectionCard title="設問の種類ごとの正答率">
      <ul className="space-y-3">
        {typeAccuracy.map(accuracy => (
          <li key={accuracy.type} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 text-theme-sm">
            <span className="text-gray-700 dark:text-gray-300">{QUESTION_TYPE_LABELS[accuracy.type]}</span>
            <span className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <span className="block h-2 rounded-full bg-brand-500" style={{ width: `${accuracy.accuracy_percent ?? 0}%` }} />
            </span>
            <span className="text-right font-medium text-gray-800 tabular-nums dark:text-white/90">{formatPercent(accuracy.accuracy_percent)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

/**
 * 週の目標と今週の進み具合。単位は目標の種類で「問」か「分」、棒は 100% で止める
 */
export function UserGoalCard({ goal }: { goal: UserStats["goal"] }) {
  const metric = goal?.weekly_metric ?? null
  const target = goal?.weekly_target ?? null
  if (goal === null || metric === null || target === null) {
    return (
      <SectionCard title="週の目標">
        <p className="text-sm text-gray-500 dark:text-gray-400">目標は設定されていません</p>
      </SectionCard>
    )
  }
  const progress = goal.weekly_progress ?? 0
  return (
    <SectionCard title="週の目標">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          今週 {target} {GOAL_METRIC_UNITS[metric]}
        </p>
        {goal.is_weekly_achieved && <Badge color="success" size="sm">達成</Badge>}
      </div>
      <p className="mt-1 text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">
        {progress} / {target}
      </p>
      <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-2 rounded-full bg-success-500" style={{ width: `${Math.min(100, Math.round((progress / target) * 100))}%` }} />
      </div>
    </SectionCard>
  )
}

/**
 * 単語帳の枚数（今日やる・学習中・覚えた・まだ出ていない）と次に出る日
 */
export function UserVocabularyCard({ vocabulary }: { vocabulary: GetAdminUserResponse["vocabulary"] }) {
  const items = [
    { label: "今日やる", value: vocabulary.due_count },
    { label: "学習中", value: vocabulary.learning_count },
    { label: "覚えた", value: vocabulary.mastered_count },
    { label: "まだ出ていない", value: vocabulary.new_count },
  ]
  return (
    <SectionCard title="単語帳">
      <dl className="grid grid-cols-2 gap-4">
        {items.map(item => (
          <div key={item.label}>
            <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">{formatCount(item.value)} 枚</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-theme-xs text-gray-400">次に出る日 {vocabulary.next_due_date ?? EMPTY_VALUE}</p>
    </SectionCard>
  )
}
