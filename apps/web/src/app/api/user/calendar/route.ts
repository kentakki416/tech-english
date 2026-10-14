import { NextRequest, NextResponse } from "next/server"

import { getUserCalendarQueryStringSchema } from "@repo/api-schema"

import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * Client Component からは月の範囲を必ず指定する（年表示の範囲はページの Server Component が取る）
 */
const calendarRangeSchema = getUserCalendarQueryStringSchema.required()

/**
 * GET /api/user/calendar?from=&to=
 *
 * 学習カレンダーの月表示で、年表示のデータより前の月を Client Component から取得する BFF
 */
export const GET = async (req: NextRequest) => {
  const parsed = calendarRangeSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  try {
    return NextResponse.json(await learningRecordApi.getCalendar(parsed.data))
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch calendar" },
      { status: error instanceof ApiClientError ? error.status : 500 },
    )
  }
}
