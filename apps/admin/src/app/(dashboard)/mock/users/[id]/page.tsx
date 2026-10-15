import Link from "next/link"
import type { ReactNode } from "react"

import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import Badge from "@/components/ui/badge/Badge"
import {
  AUTH_PROVIDER_LABELS,
  MOCK_USER_ATTEMPTS,
  MOCK_USER_CALENDAR,
  MOCK_USER_STATS,
  MOCK_USERS,
  QUESTION_TYPE_OPTIONS,
} from "@/libs/mock-data"

import { MockStatePanel } from "../../_components/MockStatePanel"
import { EMPTY_VALUE, formatCount, formatRate, formatStudyTime } from "../../_components/stats-format"
import { cardClass } from "../../_components/ui"
import { UserAvatar } from "../UserAvatar"

import { UserAttemptList } from "./UserAttemptList"
import { UserCalendar } from "./UserCalendar"

/**
 * まだ学習していないユーザーの数字
 */
const UNSTUDIED_USER_STATS = {
  goal: null,
  noAssistRate: null,
  streak: { current: 0, longest: 0 },
  totals: { attemptCount: 0, correctRate: null, passageCount: 0, studySeconds: 0 },
  typeAccuracy: MOCK_USER_STATS.typeAccuracy.map(accuracy => ({ ...accuracy, rate: null })),
  vocabulary: { dueCount: 0, learningCount: 0, masteredCount: 0, newCount: 0, nextDueDate: null },
}

/**
 * 週の目標の単位（GOAL_METRICS：解いた問題の数 / 学習した分）
 */
const GOAL_METRIC_UNITS = { minutes: "分", passages: "問" }

/**
 * 数字のカード 1 枚
 */
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
 * 見出しつきの小さなカード
 */
function SideCard({ children, title }: { children: ReactNode, title: string }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * ユーザーの詳細（モック）。学習のまとめ・カレンダー・学習履歴・単語帳はマイページと同じ数字
 */
export default async function MockUserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ state?: string }> }) {
  const { id } = await params
  const { state } = await searchParams
  const current = state === "unstudied" || state === "not-found" ? state : "normal"
  const user = MOCK_USERS.find(item => item.id === Number(id))
  const isStudied = current === "normal" && user !== undefined && user.solvedAttempts > 0
  /**
   * 学習のまとめはどのユーザーも alice の数字を使い、解いた回数だけ一覧の値に合わせる
   */
  const stats = isStudied
    ? {
      ...MOCK_USER_STATS,
      totals: {
        ...MOCK_USER_STATS.totals,
        attemptCount: user.solvedAttempts,
        passageCount: Math.min(MOCK_USER_STATS.totals.passageCount, user.solvedAttempts),
      },
    }
    : UNSTUDIED_USER_STATS
  const calendar = isStudied ? MOCK_USER_CALENDAR : MOCK_USER_CALENDAR.map(day => ({ ...day, level: 0 }))

  const states = [
    { href: `/mock/users/${id}`, key: "normal", label: "通常（初期表示）" },
    { href: `/mock/users/${id}?state=unstudied`, key: "unstudied", label: "まだ学習していない" },
    { href: `/mock/users/${id}?state=not-found`, key: "not-found", label: "ユーザーが見つからない" },
  ]

  if (current === "not-found" || !user) {
    return (
      <>
        <PageBreadcrumb pageTitle="ユーザーの詳細" />
        <div className={`${cardClass} px-6 py-16 text-center`}>
          <p className="text-base font-medium text-gray-800 dark:text-white/90">ユーザーが見つかりません</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">退会したか、ID が違います。</p>
          <Link className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-600" href="/mock/users">ユーザー一覧に戻る</Link>
        </div>
        <MockStatePanel current="not-found" states={states} />
      </>
    )
  }

  const profileItems = [
    { label: "ユーザー ID", value: String(user.id) },
    { label: "登録日時", value: `${user.createdAt}（日本時間）` },
    { label: "タイムゾーン", value: user.timezone },
    { label: "最後に学習した日", value: isStudied ? (user.lastStudiedDate ?? EMPTY_VALUE) : EMPTY_VALUE },
  ]

  return (
    <>
      <PageBreadcrumb pageTitle="ユーザーの詳細" />
      <div className="space-y-6">
        <Link className="inline-block text-theme-sm font-medium text-brand-500 hover:text-brand-600" href="/mock/users">← ユーザー一覧に戻る</Link>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <UserAvatar avatarUrl={user.avatarUrl} name={user.name} size={72} />
            <div className="min-w-0">
              <h2 className={`text-lg font-semibold ${user.name ? "text-gray-800 dark:text-white/90" : "text-gray-400"}`}>{user.name ?? "（名前なし）"}</h2>
              <p className="mt-1 text-sm break-all text-gray-500 dark:text-gray-400">{user.email ?? "メールアドレスなし"}</p>
              <div className="mt-2 flex gap-1">
                {user.providers.map(provider => <Badge key={provider} color="light" size="sm">{AUTH_PROVIDER_LABELS[provider] ?? provider}</Badge>)}
              </div>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-gray-100 pt-5 sm:grid-cols-2 xl:grid-cols-4 dark:border-gray-800">
            {profileItems.map(item => (
              <div key={item.label}>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
                <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
          <StatCard label="連続学習日数" note={`最長 ${stats.streak.longest} 日`} value={`${stats.streak.current} 日`} />
          <StatCard label="解いた回数" note={`解いた問題 ${formatCount(stats.totals.passageCount)} 問`} value={`${formatCount(stats.totals.attemptCount)} 回`} />
          <StatCard label="正答率" note={`アシストなし ${formatRate(stats.noAssistRate)}`} value={formatRate(stats.totals.correctRate)} />
          <StatCard label="学習時間" note="問題と単語帳の合計" value={formatStudyTime(stats.totals.studySeconds)} />
        </div>

        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-8">
            <UserCalendar days={calendar} studiedDayCount={calendar.filter(day => day.level > 0).length} />
            <SideCard title="設問の種類ごとの正答率">
              <ul className="space-y-3">
                {stats.typeAccuracy.map(accuracy => (
                  <li key={accuracy.type} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 text-theme-sm">
                    <span className="text-gray-700 dark:text-gray-300">{QUESTION_TYPE_OPTIONS.find(option => option.value === accuracy.type)?.label ?? accuracy.type}</span>
                    <span className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                      <span className="block h-2 rounded-full bg-brand-500" style={{ width: `${Math.round((accuracy.rate ?? 0) * 100)}%` }} />
                    </span>
                    <span className="text-right font-medium text-gray-800 tabular-nums dark:text-white/90">{formatRate(accuracy.rate)}</span>
                  </li>
                ))}
              </ul>
            </SideCard>
          </div>
          <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-4">
            <SideCard title="週の目標">
              {stats.goal ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      今週 {stats.goal.weeklyTarget} {GOAL_METRIC_UNITS[stats.goal.weeklyMetric]}
                    </p>
                    {stats.goal.isWeeklyAchieved && <Badge color="success" size="sm">達成</Badge>}
                  </div>
                  <p className="mt-1 text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">
                    {stats.goal.weeklyProgress} / {stats.goal.weeklyTarget}
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-2 rounded-full bg-success-500" style={{ width: `${Math.min(100, Math.round((stats.goal.weeklyProgress / stats.goal.weeklyTarget) * 100))}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">目標は設定されていません</p>
              )}
            </SideCard>
            <SideCard title="単語帳">
              <dl className="grid grid-cols-2 gap-4">
                {[
                  { label: "今日やる", value: stats.vocabulary.dueCount },
                  { label: "学習中", value: stats.vocabulary.learningCount },
                  { label: "覚えた", value: stats.vocabulary.masteredCount },
                  { label: "まだ出ていない", value: stats.vocabulary.newCount },
                ].map(item => (
                  <div key={item.label}>
                    <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">{item.value} 枚</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-theme-xs text-gray-400">次に出る日 {stats.vocabulary.nextDueDate ?? EMPTY_VALUE}</p>
            </SideCard>
          </div>
        </div>

        <UserAttemptList key={current} attempts={isStudied ? MOCK_USER_ATTEMPTS : []} />
      </div>
      <MockStatePanel current={current} states={states} />
    </>
  )
}
