import { NextRequest, NextResponse } from "next/server"

import { parsePassageSearchParams } from "@/features/passage/passage-query"
import { passageApi } from "@/features/passage/passage.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * GET /api/passages?kind=&tag=&difficulty=&unattempted_only=&cursor=
 *
 * 問題一覧の 2 ページ目以降（「さらに表示」）を Client Component から取得する BFF。
 * 絞り込みは画面の URL と同じく parsePassageSearchParams で解釈し、cursor は API がそのまま検証する
 */
export const GET = async (req: NextRequest) => {
  const filter = parsePassageSearchParams(req.nextUrl.searchParams)
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined

  try {
    return NextResponse.json(await passageApi.getList({ ...filter, cursor }))
  } catch (error) {
    if (error instanceof ApiClientError) {
      return NextResponse.json({ error: "Failed to fetch passages" }, { status: error.status })
    }
    throw error
  }
}
