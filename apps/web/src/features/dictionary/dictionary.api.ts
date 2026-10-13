import "server-only"

import { type LookupDictionaryResponse, lookupDictionaryResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 英和辞書の API 通信層
 */
export const dictionaryApi = {
  /**
   * 見つからなければ API が 404（ApiClientError）
   */
  lookup: async (word: string): Promise<LookupDictionaryResponse> => {
    const raw = await apiClient.get<unknown>(`/api/dictionary?${new URLSearchParams({ word })}`)
    return lookupDictionaryResponseSchema.parse(raw)
  },
}
