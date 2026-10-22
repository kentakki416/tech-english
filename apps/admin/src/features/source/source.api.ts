import "server-only"

import {
  type CreateSourceRequest,
  type CreateSourceCollectionRunResponse,
  createSourceCollectionRunResponseSchema,
  type CreateSourceResponse,
  createSourceResponseSchema,
  type DetectSourceLicenseResponse,
  detectSourceLicenseResponseSchema,
  type GetSourceListResponse,
  getSourceListResponseSchema,
  type GetSourceResponse,
  getSourceResponseSchema,
  type UpdateSourceRequest,
  type UpdateSourceResponse,
  updateSourceResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

const BASE_PATH = "/api/admin/source"

/**
 * ソース（英文の取得元）の API 通信層。404 / 409 は apiClient の ApiClientError（status）で呼び出し側が見分ける
 */
export const sourceApi = {
  create: async (input: CreateSourceRequest): Promise<CreateSourceResponse> => {
    const raw = await apiClient.post<unknown>(BASE_PATH, input)
    return createSourceResponseSchema.parse(raw)
  },

  detectLicense: async (repository: string): Promise<DetectSourceLicenseResponse> => {
    const raw = await apiClient.get<unknown>(`${BASE_PATH}/license?repository=${encodeURIComponent(repository)}`, { onUnauthorized: "throw" })
    return detectSourceLicenseResponseSchema.parse(raw)
  },

  getDetail: async (id: number): Promise<GetSourceResponse> => {
    const raw = await apiClient.get<unknown>(`${BASE_PATH}/${id}`)
    return getSourceResponseSchema.parse(raw)
  },

  getList: async (): Promise<GetSourceListResponse> => {
    const raw = await apiClient.get<unknown>(BASE_PATH)
    return getSourceListResponseSchema.parse(raw)
  },

  /**
   * 今すぐ収集を依頼し、queued の記録を返す（収集は worker が裏で行う）
   */
  requestCollection: async (id: number): Promise<CreateSourceCollectionRunResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/collection-runs`, {})
    return createSourceCollectionRunResponseSchema.parse(raw)
  },

  update: async (id: number, input: UpdateSourceRequest): Promise<UpdateSourceResponse> => {
    const raw = await apiClient.put<unknown>(`${BASE_PATH}/${id}`, input)
    return updateSourceResponseSchema.parse(raw)
  },
}
