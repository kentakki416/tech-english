import "server-only"

import {
  type GetVocabularySessionResponse,
  getVocabularySessionResponseSchema,
  type GetVocabularySummaryResponse,
  getVocabularySummaryResponseSchema,
  type ReviewVocabularyCardRequest,
  type ReviewVocabularyCardResponse,
  reviewVocabularyCardResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 単語帳の API 通信層
 */
export const vocabularyApi = {
  /**
   * GET /api/vocabulary/session。1 回分のカード（最大 10 枚）
   */
  getSession: async (): Promise<GetVocabularySessionResponse> => {
    const raw = await apiClient.get<unknown>("/api/vocabulary/session")
    return getVocabularySessionResponseSchema.parse(raw)
  },
  /**
   * GET /api/vocabulary/summary。単語帳のトップの数
   */
  getSummary: async (): Promise<GetVocabularySummaryResponse> => {
    const raw = await apiClient.get<unknown>("/api/vocabulary/summary")
    return getVocabularySummaryResponseSchema.parse(raw)
  },
  /**
   * POST /api/vocabulary/review。client_review_id で冪等なので、失敗したら同じ値で送り直してよい
   */
  review: async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardResponse> => {
    const raw = await apiClient.post<unknown>("/api/vocabulary/review", input)
    return reviewVocabularyCardResponseSchema.parse(raw)
  },
}
