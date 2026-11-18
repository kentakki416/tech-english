import { isAxiosError } from "axios"

import { type LookupDictionaryResponse, lookupDictionaryResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const dictionaryApi = {
  /**
   * 辞書に無い（API の 404）ときは null。
   * 400（api が単語として受け付けない形）も利用者にとっては辞書に無いのと同じなので null にする
   */
  lookup: async (word: string): Promise<LookupDictionaryResponse | null> => {
    try {
      const result = await apiClient.get("/api/dictionary", { params: { word } })
      return lookupDictionaryResponseSchema.parse(result.data)
    } catch (error) {
      if (isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 400)) return null
      throw error
    }
  },
}
