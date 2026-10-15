import "server-only"

import {
  type AdminUserSort,
  type GetAdminUserAttemptsResponse,
  getAdminUserAttemptsResponseSchema,
  type GetAdminUserCalendarResponse,
  getAdminUserCalendarResponseSchema,
  type GetAdminUserListResponse,
  getAdminUserListResponseSchema,
  type GetAdminUserResponse,
  getAdminUserResponseSchema,
} from "@repo/api-schema"

import { apiClient, ApiClientError } from "@/libs/api-client"

const BASE_PATH = "/api/admin/user"

/**
 * 学習履歴の 1 回に読む件数（最初の表示と「さらに読み込む」）
 */
export const USER_ATTEMPTS_PAGE_SIZE = 10

/**
 * 404（ユーザーが居ない・退会した）を null にして返す
 */
const fetchOrNullOnNotFound = async <T>(path: string, parse: (raw: unknown) => T): Promise<T | null> => {
  try {
    return parse(await apiClient.get<unknown>(path))
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null
    throw error
  }
}

/**
 * ユーザー管理の API 通信層（admin-users）
 */
export const userApi = {
  /**
   * 学習履歴の 1 ページ（新しい順）。ユーザーが居なければ null
   */
  getAttempts: async (id: number, query: { cursor?: number, limit: number }): Promise<GetAdminUserAttemptsResponse | null> => {
    const params = new URLSearchParams({ limit: String(query.limit) })
    if (query.cursor !== undefined) params.set("cursor", String(query.cursor))
    return fetchOrNullOnNotFound(`${BASE_PATH}/${id}/attempts?${params.toString()}`, raw => getAdminUserAttemptsResponseSchema.parse(raw))
  },

  /**
   * 学習カレンダー（期間を省くとマイページと同じ直近 1 年）。ユーザーが居なければ null
   */
  getCalendar: async (id: number): Promise<GetAdminUserCalendarResponse | null> =>
    fetchOrNullOnNotFound(`${BASE_PATH}/${id}/calendar`, raw => getAdminUserCalendarResponseSchema.parse(raw)),

  /**
   * 基本の情報・学習のまとめ・単語帳の数。ユーザーが居なければ null
   */
  getDetail: async (id: number): Promise<GetAdminUserResponse | null> =>
    fetchOrNullOnNotFound(`${BASE_PATH}/${id}`, raw => getAdminUserResponseSchema.parse(raw)),

  getList: async (query: { order: "asc" | "desc", page: number, q?: string, sort: AdminUserSort }): Promise<GetAdminUserListResponse> => {
    const params = new URLSearchParams({ order: query.order, page: String(query.page), sort: query.sort })
    if (query.q) params.set("q", query.q)
    const raw = await apiClient.get<unknown>(`${BASE_PATH}?${params.toString()}`)
    return getAdminUserListResponseSchema.parse(raw)
  },
}
