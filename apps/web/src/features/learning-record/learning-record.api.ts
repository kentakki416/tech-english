import "server-only"

import {
  type GetUserAttemptsResponse,
  getUserAttemptsResponseSchema,
  type GetUserCalendarResponse,
  getUserCalendarResponseSchema,
  type GetUserGoalResponse,
  getUserGoalResponseSchema,
  type GetUserStatsResponse,
  getUserStatsResponseSchema,
  type UpdateUserGoalRequest,
  type UpdateUserGoalResponse,
  updateUserGoalResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 値が undefined の項目を除いてクエリ文字列にする
 */
const buildSearchParams = (query: Record<string, number | string | undefined>): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  return params
}

/**
 * 学習記録と目標の API 通信層
 */
export const learningRecordApi = {
  /**
   * 提出した挑戦の一覧（新しい順・20 件ずつ）。date を渡すとその日の挑戦だけ
   */
  getAttempts: async (query: { cursor?: number, date?: string } = {}): Promise<GetUserAttemptsResponse> => {
    const raw = await apiClient.get<unknown>(`/api/user/attempts?${buildSearchParams(query)}`)
    return getUserAttemptsResponseSchema.parse(raw)
  },
  /**
   * 範囲を省略すると年表示（直近 53 週）の範囲を api が決める
   */
  getCalendar: async (range?: { from: string, to: string }): Promise<GetUserCalendarResponse> => {
    const raw = await apiClient.get<unknown>(`/api/user/calendar?${buildSearchParams(range ?? {})}`)
    return getUserCalendarResponseSchema.parse(raw)
  },
  getGoal: async (): Promise<GetUserGoalResponse> => {
    const raw = await apiClient.get<unknown>("/api/user/goal")
    return getUserGoalResponseSchema.parse(raw)
  },
  getStats: async (): Promise<GetUserStatsResponse> => {
    const raw = await apiClient.get<unknown>("/api/user/stats")
    return getUserStatsResponseSchema.parse(raw)
  },
  /**
   * すべての項目を送る（空にする項目は null。部分更新はしない）
   */
  saveGoal: async (input: UpdateUserGoalRequest): Promise<UpdateUserGoalResponse> => {
    const raw = await apiClient.put<unknown>("/api/user/goal", input)
    return updateUserGoalResponseSchema.parse(raw)
  },
}
