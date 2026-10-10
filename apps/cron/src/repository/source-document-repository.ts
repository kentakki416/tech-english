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
 * cron 側（collect-passages）で必要な取得文書の操作
 */
export interface SourceDocumentRepository {
  findBySourceId(sourceId: number): Promise<SourceDocument[]>
  markFetched(id: number, input: MarkFetchedInput): Promise<void>
  /**
   * (source_id, path) で upsert して行を返す。既存の行は title だけ更新する
   */
  upsertByPath(input: { path: string; sourceId: number; title: string | null }): Promise<SourceDocument>
}
