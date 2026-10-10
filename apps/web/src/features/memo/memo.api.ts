import "server-only"

import { CreateMemoRequest, CreateMemoResponse, createMemoResponseSchema, getMemoListResponseSchema, GetMemoResponse, getMemoResponseSchema, UpdateMemoRequest, UpdateMemoResponse, updateMemoResponseSchema, type GetMemoListResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * メモのAPI通信層
 */
export const memoApi = {
  getList: async (): Promise<GetMemoListResponse> => {
    const raw = await apiClient.get<unknown>("/api/memo")
    return getMemoListResponseSchema.parse(raw)
  },

  getDetail: async (id: number): Promise<GetMemoResponse> => {
    const raw = await apiClient.get<unknown>(`/api/memo/${id}`)
    return getMemoResponseSchema.parse(raw)
  },

  create: async (input: CreateMemoRequest): Promise<CreateMemoResponse> => {
    const raw = await apiClient.post<unknown>("/api/memo", input)
    return createMemoResponseSchema.parse(raw)
  },

  update: async (id: number, input: UpdateMemoRequest): Promise<UpdateMemoResponse> => {
    const raw = await apiClient.put<unknown>(`/api/memo/${id}`, input)
    return updateMemoResponseSchema.parse(raw)
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/memo/${id}`)
  }
}