import { isAxiosError } from "axios"

import {
  type GetPassageListResponse,
  getPassageListResponseSchema,
  type GetPassageResponse,
  getPassageResponseSchema,
  getRandomPassageResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

import { buildPassageSearchParams, type PassageFilterQuery, type PassageListQuery } from "./passage-query"

/**
 * クエリが空なら `?` を付けない
 */
const buildPath = (path: string, search: string): string => (search ? `${path}?${search}` : path)

/**
 * 問題（ユーザー向け）の API 通信層
 */
export const passageApi = {
  /**
   * GET /api/passage/:id。開始確認の概要（本文は含まない）。下書き・存在しない ID は API が 404
   */
  getDetail: async (id: number): Promise<GetPassageResponse> => {
    const result = await apiClient.get(`/api/passage/${id}`)
    return getPassageResponseSchema.parse(result.data)
  },

  /**
   * GET /api/passage。問題一覧（cursor ページング。limit は API の既定の 20）
   */
  getList: async (query: PassageListQuery): Promise<GetPassageListResponse> => {
    const result = await apiClient.get(buildPath("/api/passage", buildPassageSearchParams(query)))
    return getPassageListResponseSchema.parse(result.data)
  },

  /**
   * GET /api/passage/random。条件に合う問題を 1 つ選んで ID を返す。条件に合う問題が無ければ（API の 404）null。
   * 未挑戦のみは使わない（API が未挑戦から優先して選ぶ）
   */
  getRandom: async (filter: PassageFilterQuery): Promise<number | null> => {
    try {
      const result = await apiClient.get(buildPath("/api/passage/random", buildPassageSearchParams({ ...filter, unattemptedOnly: false })))
      return getRandomPassageResponseSchema.parse(result.data).id
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) return null
      throw error
    }
  },
}
