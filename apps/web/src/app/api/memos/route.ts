import { NextRequest, NextResponse } from "next/server"

import { memoApi } from "@/features/memo/memo.api"

/**
 * GET /api/memos?q=キーワード
 * Client Componentから検索用エンドポイント
 * サーバー側でmemoApi(server-only)を使い、絞り込む
 *
 * NOTE: 本来であれば検索（絞り込み）は API サーバー側に委任すべき。
 * 現状は Express の一覧取得（GET /api/memo）で全件取得してから、この BFF 層で
 * JS の filter による部分一致で絞り込んでいる。件数が少ないうちは問題ないが、
 * データが増えると「毎回全件を Express→BFF に転送してメモリで走査」するコストが
 * 線形に増え、ページネーションや高度な検索（全文検索・あいまい検索・ランキング）にも
 * 対応できない。将来的には API 側に `?q=` 付きの検索エンドポイントを用意し、
 * DB レベル（例: WHERE title/body ILIKE、Postgres なら pg_trgm の GIN index）で
 * 絞り込んで必要な件数だけ返す形に移行するのが望ましい。
 */
export const GET = async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? ""
  const { memos } = await memoApi.getList()

  const filtered = q
    ? memos.filter(
      (m) => m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q)
    )
    : memos

  return NextResponse.json({ memos: filtered })
}