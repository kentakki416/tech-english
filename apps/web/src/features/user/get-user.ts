import "server-only"

import { cache } from "react"

import type { GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 認証中ユーザー（自分自身）を Server 側で取得する。
 *
 * ブラウザから Express API を直接 fetch せず、server-only な apiClient 経由で
 * 取得する。apiClient が cookie の access token を付与する（期限が近ければ proxy が先に更新している）。
 * React の cache で包み、同じリクエスト内のページと共通ヘッダー（AppHeader）で 1 回の取得にする。
 */
export const getUser = cache(async (): Promise<GetUserResponse> =>
  apiClient.get<GetUserResponse>("/api/user"))
