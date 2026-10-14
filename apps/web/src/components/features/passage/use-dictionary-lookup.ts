"use client"

import { useCallback, useRef } from "react"

/**
 * 用語集に無い単語を英和辞書で引いた結果。headword は実際に見つかった見出し語（`running` を引いて `run` になることがある）
 */
export type DictionaryLookupResult = {
  headword: string
  meaningJa: string
}

export type LookupDictionary = (word: string) => Promise<DictionaryLookupResult | null>

/**
 * Route Handler（/api/dictionary）が中継する api のレスポンスの形か。
 * Zod のスキーマは bundle に入れないため、必要な列だけを確かめる
 */
const isDictionaryResponse = (value: unknown): value is { headword: string, meaning_ja: string } =>
  typeof value === "object"
  && value !== null
  && typeof (value as Record<string, unknown>).headword === "string"
  && typeof (value as Record<string, unknown>).meaning_ja === "string"

const fetchDictionaryEntry = async (word: string): Promise<DictionaryLookupResult | null> => {
  const res = await fetch(`/api/dictionary?${new URLSearchParams({ word })}`)
  /**
   * 400（api が単語として受け付けない形）も利用者にとっては辞書に無いのと同じなので null にする
   */
  if (res.status === 400) return null
  if (!res.ok) throw new Error(`dictionary lookup failed: ${res.status}`)
  const body: unknown = await res.json()
  /**
   * 辞書に無ければ Route Handler が 200 の null を返す
   */
  if (body === null) return null
  if (!isDictionaryResponse(body)) throw new Error("dictionary lookup returned an unexpected body")
  return { headword: body.headword, meaningJa: body.meaning_ja }
}

/**
 * 英和辞書を引く関数を返す（PassageReader の onLookupDictionary に渡す）。
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
