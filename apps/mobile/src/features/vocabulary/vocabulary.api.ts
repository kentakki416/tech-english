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
   * 1 回分のカード（最大 10 枚）。読み取りだけで何も書き込まない
   */
  getSession: async (): Promise<GetVocabularySessionResponse> => {
    const result = await apiClient.get("/api/vocabulary/session")
    return getVocabularySessionResponseSchema.parse(result.data)
  },
  getSummary: async (): Promise<GetVocabularySummaryResponse> => {
    const result = await apiClient.get("/api/vocabulary/summary")
    return getVocabularySummaryResponseSchema.parse(result.data)
  },
  /**
   * client_review_id で冪等なので、失敗したら同じ値で送り直してよい
   */
  review: async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardResponse> => {
    const result = await apiClient.post("/api/vocabulary/review", input)
    return reviewVocabularyCardResponseSchema.parse(result.data)
  },
}
