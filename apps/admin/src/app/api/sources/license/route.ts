import "server-only"

import { type NextRequest, NextResponse } from "next/server"

import { detectSourceLicenseQueryStringSchema } from "@repo/api-schema"

import { sourceApi } from "@/features/source/source.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * GitHub が検出したリポジトリのライセンス（ソースの登録フォームの「ライセンスを検出」用）。
 * GET 相当なので Server Action ではなく Route Handler にする。ブラウザから api を直接呼ばないための中継
 */
export const GET = async (request: NextRequest) => {
  const parsed = detectSourceLicenseQueryStringSchema.safeParse({
    repository: request.nextUrl.searchParams.get("repository"),
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid repository" }, { status: 400 })

  try {
    return NextResponse.json(await sourceApi.detectLicense(parsed.data.repository))
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    /**
     * GitHub の rate limit や通信障害。原因の詳細（api のエラーボディ）はブラウザに返さない
     */
    console.error("License detection failed", error)
    return NextResponse.json({ error: "License detection failed" }, { status: 502 })
  }
}
