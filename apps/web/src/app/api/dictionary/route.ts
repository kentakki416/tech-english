import { NextRequest, NextResponse } from "next/server"

import { lookupDictionaryQueryStringSchema } from "@repo/api-schema"

import { dictionaryApi } from "@/features/dictionary/dictionary.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * GET /api/dictionary?word=
 *
 * 解答画面・結果画面で、用語集に無い単語を押したときの辞書検索を Client Component から api に中継する BFF。
 * 見つかれば { headword, meaning_ja }、辞書に無ければ null を 200 で返す
 */
export const GET = async (req: NextRequest) => {
  const parsed = lookupDictionaryQueryStringSchema.safeParse({ word: req.nextUrl.searchParams.get("word") })
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid word" }, { status: 400 })
  }

  try {
    return NextResponse.json(await dictionaryApi.lookup(parsed.data.word))
  } catch (error) {
    /**
     * 辞書に無い（api の 404）は正常な結果なので 200 の null にする（クライアントが「辞書に見つかりませんでした。」を出す）。
     * 404 のまま返すと、押すたびにブラウザが console に読み込みの失敗として出してしまう
     */
    if (error instanceof ApiClientError && error.status === 404) {
      return NextResponse.json(null)
    }
    if (error instanceof ApiClientError) {
      return NextResponse.json(error.body ?? {}, { status: error.status })
    }
    throw error
  }
}
