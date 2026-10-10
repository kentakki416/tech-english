import Link from "next/link"

import {
  createMockCalendar,
  formatSeconds,
  MOCK_ATTEMPT_HISTORY,
  MOCK_STATS,
  MOCK_USER,
  QUESTION_TYPE_LABELS,
} from "@/libs/mock-data"

import { AppHeader } from "../_components/AppHeader"
import { MockStatePanel } from "../_components/MockStatePanel"
import { ScoreSquares } from "../_components/parts"
import { StudyCalendar } from "../_components/StudyCalendar"

const STATES = [
  { key: "normal", label: "通常" },
  { key: "empty", label: "まだ 1 問も解いていない" },
]

const formatStudyTime = (minutes: number): string => `${Math.floor(minutes / 60)}時間${minutes % 60}分`

/**
 * 直近 14 日の学習の有無（連続日数の表示用）。今日を末尾にする
 */
const RECENT_DAYS = createMockCalendar().slice(-14)

function PrimaryActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link className="grid h-10 place-items-center rounded-lg border border-line-strong px-4 text-sm text-fg hover:bg-raised" href="/mock/passages">
        問題一覧
      </Link>
      <Link className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-bright" href="/mock/passages/57">
        ランダムに 1 問解く
      </Link>
    </div>
  )
}

/**
 * マイページ（モック）
 */
export default async function MockHomePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const isEmpty = state === "empty"
  const { goal, streak, totals, typeAccuracy } = MOCK_STATS

  return (
    <>
      <AppHeader current="home" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full border border-line-strong bg-raised text-lg font-semibold">
              {MOCK_USER.avatarInitial}
            </span>
            <h1 className="text-xl font-semibold text-fg">{MOCK_USER.name}</h1>
          </div>
          {!isEmpty && <PrimaryActions />}
        </div>

        {isEmpty && (
          <section className="mt-8 rounded-xl border border-amber/30 bg-amber-wash px-6 py-8 sm:px-8">
            <h2 className="text-lg font-semibold text-fg">最初の 1 問を解いてみましょう</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
              公式ドキュメントや GitHub の英文を読んで、4 択の設問に答えます。1 問 5〜10 分ほどです。解くと、今日のマスに色が付きます。
            </p>
            <div className="mt-5"><PrimaryActions /></div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-10">
            <section>
              <StudyCalendar days={createMockCalendar()} isEmpty={isEmpty} />
            </section>

            {!isEmpty && (
              <section className="grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
                <div>
                  <h2 className="text-base font-semibold text-fg">累計</h2>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
                    <div>
                      <dt className="text-xs text-fg-muted">解いた問題</dt>
                      <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{totals.passages}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">挑戦した回数</dt>
                      <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{totals.attempts}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">学習時間</dt>
                      <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{formatStudyTime(totals.studyMinutes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">正答率</dt>
                      <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">{totals.accuracy}%</dd>
                      <p className="mt-0.5 text-xs text-fg-faint">アシストなしでは {totals.noAssistAccuracy}%</p>
                    </div>
                  </dl>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-fg">設問の種類別の正答率</h2>
                  <ul className="mt-4 space-y-3">
                    {typeAccuracy.map(item => (
                      <li key={item.type} className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                        <span className="text-fg-muted">{QUESTION_TYPE_LABELS[item.type]}</span>
                        <span aria-hidden className="h-2 rounded-full bg-heat-0">
                          <span className={`block h-full rounded-full ${item.rate < 70 ? "bg-amber/50" : "bg-amber"}`} style={{ width: `${item.rate}%` }} />
                        </span>
                        <span className="text-right text-fg tabular-nums">{item.rate}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-fg-faint">推論の設問が一番苦手です。</p>
                </div>
              </section>
            )}
          </div>

          <aside className="order-first divide-y divide-line self-start rounded-xl border border-line bg-surface lg:order-none">
            <section className="p-5">
              <h2 className="text-sm text-fg-muted">連続学習日数</h2>
              {isEmpty ? (
                <p className="mt-2 text-sm text-fg-faint">まだ記録がありません。</p>
              ) : (
                <>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold text-fg tabular-nums">{streak.current}</span>
                    <span className="text-sm text-fg-muted">日</span>
                    <span className="ml-auto text-xs text-fg-faint">最長 {streak.longest} 日</span>
                  </p>
                  <div aria-label="直近 14 日の学習" className="mt-3 flex gap-1" role="img">
                    {RECENT_DAYS.map(day => (
                      <span
                        key={day.date}
                        className={`h-5 flex-1 rounded-[3px] ${day.level > 0 ? "bg-amber" : "border border-line-strong"} ${
                          day.level > 0 && day.date === RECENT_DAYS[RECENT_DAYS.length - 1].date ? "shadow-[0_0_10px_rgb(243_178_76/0.6)]" : ""
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-fg-faint">直近 14 日</p>
                </>
              )}
            </section>

            <section className="p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm text-fg-muted">目標</h2>
                <Link className="text-xs text-fg-muted hover:text-fg" href="/mock/settings">編集</Link>
              </div>
              {isEmpty ? (
                <div className="mt-2">
                  <p className="text-sm text-fg-faint">目標はまだありません。</p>
                  <Link className="mt-3 inline-block text-sm text-amber hover:text-amber-bright" href="/mock/settings">目標を設定する</Link>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-[15px] leading-relaxed text-fg">{goal.goalText}</p>
                  <p className="mt-1.5 text-xs text-fg-muted">
                    {goal.targetDate.replaceAll("-", "/")} まで<span className="ml-1 text-fg tabular-nums">あと {goal.daysLeft} 日</span>
                  </p>
                  <div className="mt-5">
                    <p className="flex items-baseline justify-between text-sm">
                      <span className="text-fg-muted">今週</span>
                      <span className="text-fg tabular-nums">
                        {goal.weeklyValue} / {goal.weeklyTarget} 問
                      </span>
                    </p>
                    <div aria-hidden className="mt-2 flex gap-1">
                      {Array.from({ length: goal.weeklyTarget }, (_, index) => (
                        <span key={index} className={`h-1.5 flex-1 rounded-full ${index < goal.weeklyValue ? "bg-amber" : "bg-heat-0"}`} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-fg-faint">あと {goal.weeklyTarget - goal.weeklyValue} 問で今週の目標を達成します。</p>
                  </div>
                </>
              )}
            </section>

            {!isEmpty && (
              <section className="p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm text-fg-muted">最近の挑戦</h2>
                  <Link className="text-xs text-fg-muted hover:text-fg" href="/mock/history">すべて見る</Link>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {MOCK_ATTEMPT_HISTORY.slice(0, 5).map(attempt => (
                    <li key={attempt.id}>
                      <Link className="block py-2.5 hover:text-amber-bright" href="/mock/attempts/42/result">
                        <span className="block truncate font-reading text-[15px] text-fg">{attempt.title}</span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-fg-muted tabular-nums">
                          <ScoreSquares results={Array.from({ length: attempt.questionCount }, (_, index) => index < attempt.correctCount)} size="sm" />
                          {attempt.correctCount} / {attempt.questionCount}
                          <span className="ml-auto">{formatSeconds(attempt.elapsedSeconds)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </main>
      <MockStatePanel basePath="/mock/home" current={isEmpty ? "empty" : "normal"} states={STATES} />
    </>
  )
}
