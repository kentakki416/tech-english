import "server-only"

import {
  type CreateUrlImportRequest,
  type CreateUrlImportResponse,
  createUrlImportResponseSchema,
  type PreviewUrlImportRequest,
  type PreviewUrlImportResponse,
  previewUrlImportResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

const BASE_PATH = "/api/admin/url-import"

/**
 * URL の取り込みの API 通信層。取り込めない理由（400）は apiClient の ApiClientError の body の details[0].code で呼び出し側が見分ける
 */
export const urlImportApi = {
  create: async (input: CreateUrlImportRequest): Promise<CreateUrlImportResponse> => {
    const raw = await apiClient.post<unknown>(BASE_PATH, input)
    return createUrlImportResponseSchema.parse(raw)
  },

  preview: async (input: PreviewUrlImportRequest): Promise<PreviewUrlImportResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/preview`, input)
    return previewUrlImportResponseSchema.parse(raw)
  },
}
