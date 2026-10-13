import type { SourceDocument } from "@repo/domain"

/**
 * 文書を取得した結果。取得方法ごとの項目は、該当しない方を null にする
 */
export type MarkFetchedInput = {
  blobSha: string | null
  commitSha: string | null
  contentHash: string | null
  etag: string | null
  fetchedAt: Date
  httpStatus: number | null
  lastModified: string | null
  title: string | null
}

/**
 * サイトのクロールで見つけたページ。path は URL の pathname
 */
export type DiscoveredDocumentInput = {
  path: string
  /**
   * sitemap の lastmod。リンクで見つけたページは null
   */
  sitemapLastmod: Date | null
}

/**
 * cron 側（collect-passages）で必要な取得文書の操作
 */
export interface SourceDocumentRepository {
  findBySourceId(sourceId: number): Promise<SourceDocument[]>
  /**
   * サイトのクロールの取得待ちの行。http_status が 404 / 410 の行を除き、fetched_at IS NULL（未取得）、
   * sitemap_lastmod > fetched_at（sitemap の更新日時が前回の取得より新しい）、fetched_at < refetchBefore（取得から日がたった）のどれか。
   * 並びは fetched_at の昇順（NULL が先）→ id
   */
  findFetchQueue(input: { limit: number; refetchBefore: Date; sourceId: number }): Promise<SourceDocument[]>
  markFetched(id: number, input: MarkFetchedInput): Promise<void>
  /**
   * fetched_at と http_status だけを更新する（サイトの 304 / HTTP エラー / 取得しなかったページ）
   */
  markResponse(id: number, input: { fetchedAt: Date; httpStatus: number | null }): Promise<void>
  /**
   * サイトのクロールで見つけた URL を未取得の行として入れる。既存の行は sitemap_lastmod を更新する（新しい値が null なら変えない）。
   * http_status が 404 / 410 の行は、shouldReviveGone か sitemap の lastmod が fetched_at より新しいときだけ
   * http_status を NULL に戻して取得の対象に戻す（「再び見つかったら対象に戻す」）。
   * inputs の path は重複させない（同じ INSERT で同じ行を 2 回更新できないため）
   */
  upsertDiscovered(
    sourceId: number,
    inputs: DiscoveredDocumentInput[],
    options: { shouldReviveGone: boolean },
  ): Promise<void>
  /**
   * (source_id, path) で upsert して行を返す。既存の行は title だけ更新する
   */
  upsertByPath(input: { path: string; sourceId: number; title: string | null }): Promise<SourceDocument>
}
