import { useCallback, useRef } from "react"

import { dictionaryApi } from "./dictionary.api"

/**
 * 用語集に無い単語を英和辞書で引いた結果。headword は実際に見つかった見出し語（`running` を引いて `run` になることがある）
 */
export type DictionaryLookupResult = {
  headword: string
  meaningJa: string
}

export type LookupDictionary = (word: string) => Promise<DictionaryLookupResult | null>

const fetchDictionaryEntry = async (word: string): Promise<DictionaryLookupResult | null> => {
  const result = await dictionaryApi.lookup(word)
  return result === null ? null : { headword: result.headword, meaningJa: result.meaning_ja }
}

/**
 * 英和辞書を引く関数を返す（PassageReader の onLookupDictionary に渡す）。解答画面と結果画面で使う。
 * 結果（見つからなかった null も含む）は画面を開いている間だけメモリに持ち、同じ単語の 2 回目は通信しない。
 * 通信中の Promise ごと持つので、結果を待つ間に同じ単語を押しても 1 回しか通信しない。通信の失敗はキャッシュしない
 */
export function useDictionaryLookup(): LookupDictionary {
  const cacheRef = useRef<Map<string, Promise<DictionaryLookupResult | null>>>(new Map())

  return useCallback(async (word: string) => {
    /**
     * api は小文字にしてから引くので、大文字小文字の違いは同じ単語として扱う
     */
    const key = word.toLowerCase()
    const cache = cacheRef.current
    const cached = cache.get(key)
    if (cached) return cached

    const request = fetchDictionaryEntry(word)
    cache.set(key, request)
    try {
      return await request
    } catch (error) {
      cache.delete(key)
      throw error
    }
  }, [])
}
