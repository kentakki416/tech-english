import { FirstStepGuide } from "@/components/features/learning-record/FirstStepGuide"
import { GoalPanel } from "@/components/features/learning-record/GoalPanel"
import { PrimaryActions } from "@/components/features/learning-record/PrimaryActions"
import { RecentAttempts } from "@/components/features/learning-record/RecentAttempts"
import { StreakPanel } from "@/components/features/learning-record/StreakPanel"
import { StudyCalendar } from "@/components/features/learning-record/StudyCalendar"
import { StudyTotals } from "@/components/features/learning-record/StudyTotals"
import { TypeAccuracy } from "@/components/features/learning-record/TypeAccuracy"
import { AppHeader } from "@/components/ui/AppHeader"
import { UserAvatar } from "@/components/ui/UserAvatar"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { getUser } from "@/features/user/get-user"

/**
 * マイページ（ログイン後の最初の画面）。PC は左に学習カレンダーと統計、右に囲みのパネル。
 * 1024px 未満ではパネルを先に並べる（続ける動機になる連続日数と目標を先に見せる）
 */
export default async function HomePage() {
  const [user, stats, calendar] = await Promise.all([getUser(), learningRecordApi.getStats(), learningRecordApi.getCalendar()])
  const isEmpty = stats.totals.attempt_count === 0

  return (
    <>
      <AppHeader current="home" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar avatarUrl={user.avatar_url} className="size-11 text-lg" name={user.name} size={44} />
            <h1 className="text-xl font-semibold text-fg">{user.name ?? "ユーザー"}</h1>
          </div>
          {!isEmpty && <PrimaryActions />}
        </div>

        {isEmpty && <FirstStepGuide />}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-10">
            <section>
              <StudyCalendar initialCalendar={calendar} />
            </section>

            {!isEmpty && (
              <section className="grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
                <StudyTotals noAssist={stats.no_assist} totals={stats.totals} />
                <TypeAccuracy typeAccuracy={stats.type_accuracy} weakestQuestionType={stats.weakest_question_type} />
              </section>
            )}
          </div>

          <aside className="order-first divide-y divide-line self-start rounded-xl border border-line bg-surface lg:order-none">
            <StreakPanel isEmpty={isEmpty} streak={stats.streak} />
            <GoalPanel goal={stats.goal} />
            {!isEmpty && <RecentAttempts attempts={stats.recent_attempts} />}
          </aside>
        </div>
      </main>
    </>
  )
}
