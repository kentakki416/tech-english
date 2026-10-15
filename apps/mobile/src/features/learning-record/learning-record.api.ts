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
import { buildQueryString } from "@/libs/query-string"

/**
 * 値が undefined の項目を除いてクエリを付ける（クエリが空なら `?` を付けない）
 */
const buildPath = (path: string, query: Record<string, number | string | undefined>): string => {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params[key] = String(value)
  }
  const search = buildQueryString(params)
  return search ? `${path}?${search}` : path
}

export const learningRecordApi = {
  /**
   * 提出した挑戦の一覧（新しい順・20 件ずつ）。date を渡すとその日の挑戦だけ
   */
  getAttempts: async (query: { cursor?: number, date?: string } = {}): Promise<GetUserAttemptsResponse> => {
    const result = await apiClient.get(buildPath("/api/user/attempts", query))
    return getUserAttemptsResponseSchema.parse(result.data)
  },

  /**
   * 範囲を省略すると年表示（直近 53 週）の範囲を api が決める
   */
  getCalendar: async (range?: { from: string, to: string }): Promise<GetUserCalendarResponse> => {
    const result = await apiClient.get(buildPath("/api/user/calendar", range ?? {}))
    return getUserCalendarResponseSchema.parse(result.data)
  },

  /**
   * 未設定なら goal は null
   */
  getGoal: async (): Promise<GetUserGoalResponse> => {
    const result = await apiClient.get("/api/user/goal")
    return getUserGoalResponseSchema.parse(result.data)
  },

  getStats: async (): Promise<GetUserStatsResponse> => {
    const result = await apiClient.get("/api/user/stats")
    return getUserStatsResponseSchema.parse(result.data)
  },

  /**
   * すべての項目を送る（空にする項目は null。部分更新はしない）
   */
  saveGoal: async (input: UpdateUserGoalRequest): Promise<UpdateUserGoalResponse> => {
    const result = await apiClient.put("/api/user/goal", input)
    return updateUserGoalResponseSchema.parse(result.data)
  },
}
