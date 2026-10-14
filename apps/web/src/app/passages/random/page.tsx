import { redirect } from "next/navigation"

import { buildPassageListPath, parsePassageSearchParams } from "@/features/passage/passage-query"
import { passageApi } from "@/features/passage/passage.api"
import { ApiClientError } from "@/libs/api-client"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * ランダムに 1 問。絞り込みに合う問題を API に選ばせて開始確認へ移る。該当が無ければ同じ絞り込みの一覧へ戻す。
 * GET 相当なので Server Action にしない（マイページ・リマインダーの通知の入口にもなる）
 */
export default async function RandomPassagePage({ searchParams }: Props) {
  const filter = parsePassageSearchParams(await searchParams)
  const id = await passageApi
    .getRandom(filter)
    .then(result => result.id)
    .catch((error: unknown) => {
      if (error instanceof ApiClientError && error.status === 404) return null
      throw error
    })
  /**
   * redirect は例外で実現されるので try / catch（.catch）の外で呼ぶ
   */
  redirect(id === null ? buildPassageListPath(filter) : `/passages/${id}`)
}
