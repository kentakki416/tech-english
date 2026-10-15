import "server-only"

import {
  type AdminStatsPeriod,
  type GetAdminPassageStatsListResponse,
  getAdminPassageStatsListResponseSchema,
  type GetAdminPassageStatsResponse,
  getAdminPassageStatsResponseSchema,
  type GetAdminStatsOverviewResponse,
  getAdminStatsOverviewResponseSchema,
} from "@repo/api-schema"

import type { DashboardQuery } from "@/features/stats/stats.params"
import { apiClient, ApiClientError } from "@/libs/api-client"

const BASE_PATH = "/api/admin/stats"

export const statsApi = {
  getOverview: async (period: AdminStatsPeriod): Promise<GetAdminStatsOverviewResponse> => {
    const raw = await apiClient.get<unknown>(`${BASE_PATH}/overview?period=${period}`)
    return getAdminStatsOverviewResponseSchema.parse(raw)
  },

  /**
   * 問題の分析。問題が無ければ null（404）
   */
  getPassage: async (id: number, period: AdminStatsPeriod): Promise<GetAdminPassageStatsResponse | null> => {
    try {
      const raw = await apiClient.get<unknown>(`${BASE_PATH}/passage/${id}?period=${period}`)
      return getAdminPassageStatsResponseSchema.parse(raw)
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return null
      throw error
    }
  },

  /**
   * 問題ごとの成績（1 ページ。件数は API の既定値）
   */
  getPassageList: async (query: DashboardQuery): Promise<GetAdminPassageStatsListResponse> => {
    const params = new URLSearchParams({ order: query.order, page: String(query.page), period: query.period, sort: query.sort })
    if (query.q) params.set("q", query.q)
    const raw = await apiClient.get<unknown>(`${BASE_PATH}/passage?${params.toString()}`)
    return getAdminPassageStatsListResponseSchema.parse(raw)
  },
}
