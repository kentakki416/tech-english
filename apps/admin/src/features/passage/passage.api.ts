import "server-only"

import {
  type AdminPassageStatus,
  type GetAdminPassageListResponse,
  getAdminPassageListResponseSchema,
  type GetAdminPassageResponse,
  getAdminPassageResponseSchema,
  type PublishAdminPassageResponse,
  publishAdminPassageResponseSchema,
  type RegenerateAdminPassageResponse,
  regenerateAdminPassageResponseSchema,
  type RejectAdminPassageResponse,
  rejectAdminPassageResponseSchema,
  type RetryAdminPassageAudioResponse,
  retryAdminPassageAudioResponseSchema,
  type UnpublishAdminPassageResponse,
  unpublishAdminPassageResponseSchema,
  type UpdateAdminPassageRequest,
  type UpdateAdminPassageResponse,
  updateAdminPassageResponseSchema,
} from "@repo/api-schema"

import { apiClient, ApiClientError } from "@/libs/api-client"

const BASE_PATH = "/api/admin/passage"

/**
 * 一覧の 1 回の取得件数（API の上限）
 */
const LIST_PAGE_SIZE = 200

/**
 * 一覧で取る最大の行数。表（DataTable）は検索・Filter・ページ送りを画面内で行うため、1 つの状態の行をまとめて取る
 */
const MAX_LIST_ROWS = 1000

export type AdminPassageList = {
  /**
   * MAX_LIST_ROWS で打ち切ったか（その状態の行がまだ残っている）
   */
  isTruncated: boolean
  passages: GetAdminPassageListResponse["passages"]
  statusCounts: GetAdminPassageListResponse["status_counts"]
}

/**
 * 問題の API 通信層。400 / 404 / 409 は apiClient の ApiClientError（status / body）で呼び出し側が見分ける
 */
export const passageApi = {
  /**
   * 問題の全情報。404 は null
   */
  getDetail: async (id: number): Promise<GetAdminPassageResponse | null> => {
    try {
      const raw = await apiClient.get<unknown>(`${BASE_PATH}/${id}`)
      return getAdminPassageResponseSchema.parse(raw)
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return null
      throw error
    }
  },

  /**
   * 1 つの状態の行を、cursor をたどって最大 MAX_LIST_ROWS 件まで取る。並びは API の順のまま
   * （下書きは要確認 → 更新が古い順、それ以外は更新が新しい順）
   */
  getListByStatus: async (status: AdminPassageStatus): Promise<AdminPassageList> => {
    const passages: GetAdminPassageListResponse["passages"] = []
    let cursor: string | null = null
    let statusCounts: GetAdminPassageListResponse["status_counts"] | null = null
    let hasMore = true

    while (hasMore && passages.length < MAX_LIST_ROWS) {
      const params = new URLSearchParams({ limit: String(LIST_PAGE_SIZE), status })
      if (cursor !== null) params.set("cursor", cursor)
      const page: GetAdminPassageListResponse = getAdminPassageListResponseSchema.parse(
        await apiClient.get<unknown>(`${BASE_PATH}?${params.toString()}`),
      )
      passages.push(...page.passages)
      statusCounts ??= page.status_counts
      cursor = page.next_cursor
      hasMore = page.has_more && cursor !== null
    }

    return {
      isTruncated: hasMore || passages.length > MAX_LIST_ROWS,
      passages: passages.slice(0, MAX_LIST_ROWS),
      statusCounts: statusCounts ?? { collected: 0, draft: 0, failed: 0, generating: 0, published: 0, rejected: 0 },
    }
  },

  publish: async (id: number): Promise<PublishAdminPassageResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/publish`, {})
    return publishAdminPassageResponseSchema.parse(raw)
  },

  regenerate: async (id: number): Promise<RegenerateAdminPassageResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/regenerate`, {})
    return regenerateAdminPassageResponseSchema.parse(raw)
  },

  reject: async (id: number, reason: string): Promise<RejectAdminPassageResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/reject`, { reason })
    return rejectAdminPassageResponseSchema.parse(raw)
  },

  /**
   * 失敗した読み上げの音声を pending に戻す（failed のときだけ。それ以外の状態・音声の行が無ければ 409）
   */
  retryAudio: async (id: number): Promise<RetryAdminPassageAudioResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/audio/retry`, {})
    return retryAdminPassageAudioResponseSchema.parse(raw)
  },

  unpublish: async (id: number): Promise<UnpublishAdminPassageResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/unpublish`, {})
    return unpublishAdminPassageResponseSchema.parse(raw)
  },

  update: async (id: number, input: UpdateAdminPassageRequest): Promise<UpdateAdminPassageResponse> => {
    const raw = await apiClient.put<unknown>(`${BASE_PATH}/${id}`, input)
    return updateAdminPassageResponseSchema.parse(raw)
  },
}
