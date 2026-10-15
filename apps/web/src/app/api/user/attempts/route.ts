import { NextRequest, NextResponse } from "next/server"

import { getUserAttemptsQueryStringSchema } from "@repo/api-schema"

import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * 学習履歴の「さらに表示」と、学習カレンダーで選んだ日の挑戦を Client Component から取得する。
 * 件数は API の既定（20 件）に任せる
 */
export const GET = async (req: NextRequest) => {
  const parsed = getUserAttemptsQueryStringSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const { cursor, date } = parsed.data
  try {
    return NextResponse.json(await learningRecordApi.getAttempts({ cursor, date }))
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch attempts" },
      { status: error instanceof ApiClientError ? error.status : 500 },
    )
  }
}
