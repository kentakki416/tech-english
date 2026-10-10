import { NextRequest, NextResponse } from "next/server"

import { createEventRequestSchema } from "@repo/api-schema"

import { eventApi } from "@/features/event/event.api"

/**
 * POST /api/events
 *
 * ブラウザから行動イベントを受け取り、Express API へ中継する BFF。
 * ブラウザは Express を直接叩けないため（認証 cookie は httpOnly で
 * apiClient 側でのみ扱う）、この Route Handler を経由する。
 *
 * **失敗しても 204 を返す。** 分析イベントの送信失敗をブラウザ側で
 * リトライさせる意味がなく、エラーを返すと sendBeacon のログが汚れるだけ。
 * 未ログイン時は Express が 401 を返すが、それも 204 に丸める
 * （匿名ユーザーは追跡しない方針なので想定内）。
 */
export const POST = async (req: NextRequest) => {
  const parsed = createEventRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 })
  }

  try {
    const { accepted } = await eventApi.create(parsed.data)
    return NextResponse.json({ accepted })
  } catch {
    /** 分析イベントの失敗はブラウザに伝えない */
    return new NextResponse(null, { status: 204 })
  }
}
