import "server-only"

import {
  type CreateTagRequest,
  type CreateTagResponse,
  createTagResponseSchema,
  type GetTagListResponse,
  getTagListResponseSchema,
  type UpdateTagRequest,
  type UpdateTagResponse,
  updateTagResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

const BASE_PATH = "/api/admin/tag"

/**
 * タグの API 通信層。404 / 409 は apiClient の ApiClientError（status）で呼び出し側が見分ける
 */
export const tagApi = {
  create: async (input: CreateTagRequest): Promise<CreateTagResponse> => {
    const raw = await apiClient.post<unknown>(BASE_PATH, input)
    return createTagResponseSchema.parse(raw)
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_PATH}/${id}`)
  },

  getList: async (): Promise<GetTagListResponse> => {
    const raw = await apiClient.get<unknown>(BASE_PATH)
    return getTagListResponseSchema.parse(raw)
  },

  update: async (id: number, input: UpdateTagRequest): Promise<UpdateTagResponse> => {
    const raw = await apiClient.put<unknown>(`${BASE_PATH}/${id}`, input)
    return updateTagResponseSchema.parse(raw)
  },
}
