import "server-only"

import { cache } from "react"

import type { GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { redirectIfSessionRejected } from "@/libs/session"

/**
 * 認証中ユーザー（自分自身）を Server 側で取得する。
 * React の cache で包み、同じリクエスト内のページと共通ヘッダー（AppHeader）で 1 回の取得にする。
 */
export const getUser = cache(async (): Promise<GetUserResponse> =>
  apiClient.get<GetUserResponse>("/api/user").catch(redirectIfSessionRejected))
