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

export const vocabularyApi = {
  /**
   * 1 回分のカード（最大 10 枚）
   */
  getSession: async (): Promise<GetVocabularySessionResponse> => {
    const raw = await apiClient.get<unknown>("/api/vocabulary/session")
    return getVocabularySessionResponseSchema.parse(raw)
  },
  getSummary: async (): Promise<GetVocabularySummaryResponse> => {
    const raw = await apiClient.get<unknown>("/api/vocabulary/summary")
    return getVocabularySummaryResponseSchema.parse(raw)
  },
  /**
   * client_review_id で冪等なので、失敗したら同じ値で送り直してよい
   */
  review: async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardResponse> => {
    const raw = await apiClient.post<unknown>("/api/vocabulary/review", input)
    return reviewVocabularyCardResponseSchema.parse(raw)
  },
}
