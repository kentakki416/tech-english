import type { GetUserResponse } from "@repo/api-schema"

import { RefreshButton } from "@/components/features/user/refresh-button"
import { UserBotAnimation } from "@/components/features/user/user-bot-animation"
import { getUser } from "@/features/user/get-user"

/**
 * トップページ（認証ユーザー情報サンプル）。
 *
 * 初期データ取得は Server Component 内で server-only な apiClient 経由で行う。
 * ブラウザから Express API を直接叩かないことで、cookie 認証・401 リフレッシュ・
 * origin のサーバ側解決を一貫させる。
 */
export default async function Home() {
  let user: GetUserResponse | null = null
  let hasError = false

  try {
    user = await getUser()
  } catch {
    hasError = true
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <UserBotAnimation />

          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            ユーザー情報取得サンプル
          </h1>

          {hasError && (
            <div className="rounded-lg bg-red-100 p-4 text-red-800 dark:bg-red-900 dark:text-red-200">
              <p className="font-semibold">エラー</p>
              <p>ユーザー情報の取得に失敗しました</p>
            </div>
          )}

          {user && (
            <div className="rounded-lg bg-zinc-100 p-6 dark:bg-zinc-800">
              <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
                ユーザー情報
              </h2>
              <div className="space-y-2 text-left">
                <p className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">ID:</span> {user.id}
                </p>
                <p className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">名前:</span> {user.name ?? "-"}
                </p>
                <p className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">メール:</span> {user.email ?? "-"}
                </p>
                <p className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">作成日時:</span> {user.created_at}
                </p>
              </div>
            </div>
          )}

          <RefreshButton />
        </div>
      </main>
    </div>
  )
}
