import "server-only"

import { type NextRequest, NextResponse } from "next/server"

import { detectContentSourceLicenseQueryStringSchema } from "@repo/api-schema"

import { contentSourceApi } from "@/features/content-source/content-source.api"

/**
 * GitHub が検出したリポジトリのライセンス（ソースの登録フォームの「ライセンスを検出」用）。
 * GET 相当なので Server Action ではなく Route Handler にする。ブラウザから api を直接呼ばないための中継
 */
export const GET = async (request: NextRequest) => {
  const parsed = detectContentSourceLicenseQueryStringSchema.safeParse({
    repository: request.nextUrl.searchParams.get("repository"),
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid repository" }, { status: 400 })

  try {
    return NextResponse.json(await contentSourceApi.detectLicense(parsed.data.repository))
  } catch (error) {
    /**
     * GitHub の rate limit や通信障害。原因の詳細（api のエラーボディ）はブラウザに返さない
     */
    console.error("License detection failed", error)
    return NextResponse.json({ error: "License detection failed" }, { status: 502 })
  }
}
