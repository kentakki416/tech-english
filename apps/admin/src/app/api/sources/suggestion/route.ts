import "server-only"

import { type NextRequest, NextResponse } from "next/server"

import { errorResponseSchema, sourceSuggestionErrorCodeSchema, suggestSourceQueryStringSchema } from "@repo/api-schema"

import { sourceApi } from "@/features/source/source.api"
import type { SourceSuggestionFailureReason } from "@/features/source/source.labels"
import { ApiClientError } from "@/libs/api-client"

/**
 * api の 400 の理由（details[0].code）。読めなければ URL の形の誤りとみなす
 */
const convertApiErrorToFailureReason = (error: ApiClientError): SourceSuggestionFailureReason => {
  const body = errorResponseSchema.safeParse(error.body)
  const code = sourceSuggestionErrorCodeSchema.safeParse(body.success ? body.data.details?.[0]?.code : undefined)
  return code.success ? code.data : "invalid_url"
}

const respondFailure = (reason: SourceSuggestionFailureReason, status: number) => NextResponse.json({ reason }, { status })

/**
 * 登録の画面の取得方法と URL から登録の初期値（GitHub・サイトの登録フォームの「読み込む」用）。
 * GET 相当なので Server Action ではなく Route Handler にする。ブラウザから api を直接呼ばないための中継。
 * 失敗は理由（reason）で返し、文言はフォームが決める
 */
export const GET = async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const parsed = suggestSourceQueryStringSchema.safeParse({ fetch_type: searchParams.get("fetch_type"), url: searchParams.get("url") })
  if (!parsed.success) return respondFailure("invalid_url", 400)

  try {
    return NextResponse.json(await sourceApi.suggest(parsed.data))
  } catch (error) {
    /**
     * フォームの入力を消さないよう、ここではサインイン画面に移さない
     */
    if (error instanceof ApiClientError && error.status === 401) return respondFailure("unauthorized", 401)
    if (error instanceof ApiClientError && error.status === 400) return respondFailure(convertApiErrorToFailureReason(error), 400)
    /**
     * GitHub の rate limit や通信障害。原因の詳細（api のエラーボディ）はブラウザに返さない
     */
    console.error("Source suggestion failed", error)
    return respondFailure("failed", 502)
  }
}
