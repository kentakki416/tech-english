"use server"

import "server-only"

import {
  getAdminUserAttemptsPathParamSchema,
  getAdminUserAttemptsQueryStringSchema,
  type GetAdminUserAttemptsResponse,
} from "@repo/api-schema"

import { USER_ATTEMPTS_PAGE_SIZE, userApi } from "@/features/user/user.api"

/**
 * 失敗の理由。not_found はユーザーが居ない（退会・不正な引数）で押し直しても直らない、unavailable は API の一時的な失敗で押し直せば直りうる
 */
export type LoadMoreUserAttemptsFailureReason = "not_found" | "unavailable"

export type LoadMoreUserAttemptsResult = { ok: false, reason: LoadMoreUserAttemptsFailureReason } | { ok: true, page: GetAdminUserAttemptsResponse }

/**
 * 学習履歴の次のページを読む（「さらに読み込む」）。引数はブラウザから届くので、API と同じスキーマで検証する。
 * 読むだけだが、admin の API はトークンが要りブラウザから直接呼べないので Server Action にする
 */
export const loadMoreUserAttemptsAction = async (userId: number, cursor: number): Promise<LoadMoreUserAttemptsResult> => {
  const path = getAdminUserAttemptsPathParamSchema.safeParse({ id: userId })
  const query = getAdminUserAttemptsQueryStringSchema.safeParse({ cursor })
  if (!path.success || !query.success || query.data.cursor === undefined) return { ok: false, reason: "not_found" }
  try {
    const page = await userApi.getAttempts(path.data.id, { cursor: query.data.cursor, limit: USER_ATTEMPTS_PAGE_SIZE })
    return page === null ? { ok: false, reason: "not_found" } : { ok: true, page }
  } catch (error) {
    console.error("Loading user attempts failed", error)
    return { ok: false, reason: "unavailable" }
  }
}
