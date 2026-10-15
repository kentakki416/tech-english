"use server"

import "server-only"

import type { GetAdminUserAttemptsResponse } from "@repo/api-schema"

import { USER_ATTEMPTS_PAGE_SIZE, userApi } from "@/features/user/user.api"

export type LoadMoreUserAttemptsResult = { ok: false } | { ok: true, page: GetAdminUserAttemptsResponse }

/**
 * 学習履歴の次のページを読む（「さらに読み込む」）。ユーザーが居なくなっていれば失敗
 */
export async function loadMoreUserAttemptsAction(userId: number, cursor: number): Promise<LoadMoreUserAttemptsResult> {
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(cursor) || cursor <= 0) return { ok: false }
  const page = await userApi.getAttempts(userId, { cursor, limit: USER_ATTEMPTS_PAGE_SIZE })
  return page === null ? { ok: false } : { ok: true, page }
}
