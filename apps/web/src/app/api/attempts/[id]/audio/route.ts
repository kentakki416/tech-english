import { NextRequest, NextResponse } from "next/server"

import { getAttemptAudioPathParamSchema } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * GET /api/attempts/:id/audio
 *
 * 解答画面・結果画面が、開いた後に読み上げの音声のマニフェストを取得する BFF（挑戦の取得のレスポンスを重くしないため別にする）。
 * mp3 そのものはブラウザが url（本番は CloudFront、開発は api の /media/*）から直接読む
 */
export const GET = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const parsed = getAttemptAudioPathParamSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  try {
    return NextResponse.json(await attemptApi.getAudio(parsed.data.id))
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: error instanceof ApiClientError ? error.status : 500 },
    )
  }
}
