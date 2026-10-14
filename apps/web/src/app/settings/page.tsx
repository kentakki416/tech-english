import type { Metadata } from "next"
import Link from "next/link"

import { GoalForm } from "@/components/features/learning-record/GoalForm"
import { TimezoneSelect } from "@/components/features/learning-record/TimezoneSelect"
import { AppHeader } from "@/components/ui/AppHeader"
import { SubmitButton } from "@/components/ui/SubmitButton"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { getUser } from "@/features/user/get-user"
import { logoutAction } from "@/libs/auth-actions"

import { saveGoalAction, updateTimezoneAction } from "./actions"

export const metadata: Metadata = {
  title: "設定",
}

/**
 * タイムゾーンの候補。現在の値が一覧に無ければ（UTC や別名）先頭に足す
 */
const listTimezoneOptions = (current: string): string[] => {
  const zones = Intl.supportedValuesOf("timeZone")
  return zones.includes(current) ? zones : [current, ...zones]
}

/**
 * 設定（目標 → タイムゾーン → リマインダー → アカウント → 危険な操作）
 */
export default async function SettingsPage() {
  const [user, { goal }] = await Promise.all([getUser(), learningRecordApi.getGoal()])

  return (
    <>
      <AppHeader current="settings" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">設定</h1>
        <div className="mt-8 space-y-10">
          <section aria-labelledby="goal-heading">
            <h2 className="text-base font-semibold text-fg" id="goal-heading">目標</h2>
            <p className="mt-1 text-sm text-fg-muted">マイページに表示します。どれも空欄にできます。</p>
            <GoalForm action={saveGoalAction} goal={goal} />
          </section>

          <section aria-labelledby="timezone-heading">
            <h2 className="text-base font-semibold text-fg" id="timezone-heading">タイムゾーン</h2>
            <p className="mt-1 text-sm text-fg-muted">学習した日付はこのタイムゾーンで決まります。変えても、記録済みの日付は動きません。</p>
            <TimezoneSelect action={updateTimezoneAction} initialTimezone={user.timezone} timezones={listTimezoneOptions(user.timezone)} />
          </section>

          <section aria-labelledby="reminder-heading">
            <h2 className="text-base font-semibold text-fg" id="reminder-heading">リマインダー</h2>
            <p className="mt-1 text-sm text-fg-muted">学習のリマインダーはモバイルアプリの設定画面で設定できます。</p>
          </section>

          <section aria-labelledby="account-heading">
            <h2 className="text-base font-semibold text-fg" id="account-heading">アカウント</h2>
            <form action={logoutAction}>
              <SubmitButton
                className="mt-4 h-10 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-amber/60 disabled:cursor-wait disabled:opacity-70"
                pendingLabel="ログアウトしています…"
              >
                ログアウト
              </SubmitButton>
            </form>
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
                href="/settings/delete-account"
              >
                アカウントを削除
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
