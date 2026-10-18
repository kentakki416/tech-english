import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { getAdminUserPathParamSchema } from "@repo/api-schema"

import { UserAttemptList } from "@/components/features/user/UserAttemptList"
import { UserCalendar } from "@/components/features/user/UserCalendar"
import { UserGoalCard, UserStatCards, UserTypeAccuracyCard, UserVocabularyCard } from "@/components/features/user/UserLearningCards"
import { UserProfileCard } from "@/components/features/user/UserProfileCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { USER_ATTEMPTS_PAGE_SIZE, userApi } from "@/features/user/user.api"

export const metadata: Metadata = {
  title: "ユーザーの詳細",
}

type Props = {
  params: Promise<{ id: string }>
}

/**
 * URL の id をユーザーの ID にする。正の整数でない id（`abc`・`0`・`1e3`・`0x10` など）と、DB の ID の上限を超える id は null（問題の確認・修正の画面と同じ読み方）
 */
const convertPathIdToUserId = (id: string): number | null => {
  if (!/^\d+$/.test(id)) return null
  const parsed = getAdminUserPathParamSchema.safeParse({ id })
  return parsed.success ? parsed.data.id : null
}

/**
 * ユーザーの詳細（admin-users の UI 設計）。学習のまとめ・カレンダー・学習履歴・単語帳はマイページと同じ数字。ユーザーが居なければ 404
 */
export default async function UserDetailPage({ params }: Props) {
  await connection()
  const userId = convertPathIdToUserId((await params).id)
  if (userId === null) notFound()
  const [detail, calendar, attempts] = await Promise.all([
    userApi.getDetail(userId),
    userApi.getCalendar(userId),
    userApi.getAttempts(userId, { limit: USER_ATTEMPTS_PAGE_SIZE }),
  ])
  if (!detail || !calendar || !attempts) notFound()

  return (
    <>
      <PageBreadcrumb pageTitle="ユーザーの詳細" />
      <div className="space-y-6">
        <Link className="inline-block text-theme-sm font-medium text-brand-500 hover:text-brand-600" href="/users">← ユーザー一覧に戻る</Link>
        <UserProfileCard user={detail.user} />
        <UserStatCards stats={detail.stats} />
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-8">
            <UserCalendar calendar={calendar} />
            <UserTypeAccuracyCard typeAccuracy={detail.stats.type_accuracy} />
          </div>
          <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-4">
            <UserGoalCard goal={detail.stats.goal} />
            <UserVocabularyCard vocabulary={detail.vocabulary} />
          </div>
        </div>
        <UserAttemptList initialPage={attempts} timeZone={detail.user.timezone} userId={userId} />
      </div>
    </>
  )
}
