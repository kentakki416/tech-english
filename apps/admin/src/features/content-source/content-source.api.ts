import "server-only"

import {
  type CreateContentSourceRequest,
  type CreateContentSourceResponse,
  createContentSourceResponseSchema,
  type DetectContentSourceLicenseResponse,
  detectContentSourceLicenseResponseSchema,
  type GetContentSourceListResponse,
  getContentSourceListResponseSchema,
  type GetContentSourceResponse,
  getContentSourceResponseSchema,
  type UpdateContentSourceRequest,
  type UpdateContentSourceResponse,
  updateContentSourceResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

const BASE_PATH = "/api/admin/content-source"

/**
 * ソース（英文の取得元）の API 通信層。404 / 409 は apiClient の ApiClientError（status）で呼び出し側が見分ける
 */
export const contentSourceApi = {
  create: async (input: CreateContentSourceRequest): Promise<CreateContentSourceResponse> => {
    const raw = await apiClient.post<unknown>(BASE_PATH, input)
    return createContentSourceResponseSchema.parse(raw)
  },

  detectLicense: async (repository: string): Promise<DetectContentSourceLicenseResponse> => {
    const raw = await apiClient.get<unknown>(`${BASE_PATH}/license?repository=${encodeURIComponent(repository)}`, { onUnauthorized: "throw" })
    return detectContentSourceLicenseResponseSchema.parse(raw)
  },

  getDetail: async (id: number): Promise<GetContentSourceResponse> => {
    const raw = await apiClient.get<unknown>(`${BASE_PATH}/${id}`)
    return getContentSourceResponseSchema.parse(raw)
  },

  getList: async (): Promise<GetContentSourceListResponse> => {
    const raw = await apiClient.get<unknown>(BASE_PATH)
    return getContentSourceListResponseSchema.parse(raw)
  },

  update: async (id: number, input: UpdateContentSourceRequest): Promise<UpdateContentSourceResponse> => {
    const raw = await apiClient.put<unknown>(`${BASE_PATH}/${id}`, input)
    return updateContentSourceResponseSchema.parse(raw)
  },
}
