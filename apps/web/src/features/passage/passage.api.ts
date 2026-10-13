import "server-only"

import {
  type GetPassageListResponse,
  getPassageListResponseSchema,
  type GetPassageResponse,
  getPassageResponseSchema,
  type GetRandomPassageResponse,
  getRandomPassageResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

import { buildPassageSearchParams, type PassageFilterQuery, type PassageListQuery } from "./passage-query"

/**
 * 問題（ユーザー向け）の API 通信層
 */
export const passageApi = {
  getDetail: async (id: number): Promise<GetPassageResponse> => {
    const raw = await apiClient.get<unknown>(`/api/passage/${id}`)
    return getPassageResponseSchema.parse(raw)
  },
  /**
   * limit は API の既定（20）
   */
  getList: async (query: PassageListQuery): Promise<GetPassageListResponse> => {
    const raw = await apiClient.get<unknown>(`/api/passage?${buildPassageSearchParams(query)}`)
    return getPassageListResponseSchema.parse(raw)
  },
  /**
   * 該当する問題が無ければ API が 404（ApiClientError）
   */
  getRandom: async (filter: PassageFilterQuery): Promise<GetRandomPassageResponse> => {
    const params = buildPassageSearchParams({ ...filter, unattemptedOnly: false })
    const raw = await apiClient.get<unknown>(`/api/passage/random?${params}`)
    return getRandomPassageResponseSchema.parse(raw)
  },
}
