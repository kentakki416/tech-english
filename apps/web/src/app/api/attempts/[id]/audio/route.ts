import { NextRequest, NextResponse } from "next/server"

import { getAttemptAudioPathParamSchema } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * 読み上げの音声のマニフェストを、画面を開いた後に取得する（挑戦の取得のレスポンスを重くしないため別にする）。
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
