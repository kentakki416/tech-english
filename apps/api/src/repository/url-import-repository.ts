import type { Passage } from "@repo/domain"

import type { TransactionContext } from "./transaction"

/**
 * 取り込みの判定に使う本文候補の項目
 */
export type ImportPassage = Pick<Passage, "contentHash" | "generatedAt" | "id" | "status" | "title">

/**
 * 取得したページの文書（source_documents）に書く値
 */
export type FetchedDocumentInput = {
  contentHash: string
  etag: string | null
  extractionVersion: string
  fetchedAt: Date
  httpStatus: number
  lastModified: string | null
  /**
   * URL の pathname
   */
  path: string
  sourceId: number
  title: string
}

/**
 * 挿入する本文候補（collected）
 */
export type CandidateInput = Pick<
  Passage,
  "blocks" | "contentHash" | "generationPrioritizedAt" | "sourceDocumentId" | "sourcePath" | "sourceRetrievedAt" | "title" | "wordCount"
>

/**
 * admin の URL の取り込み（1 ページの文書と本文候補）のリポジトリ
 */
export interface UrlImportRepository {
  /**
   * (sourceId, path) の文書の本文候補。文書が無ければ空
   */
  findDocumentPassages(input: { path: string; sourceId: number }, tx?: TransactionContext): Promise<ImportPassage[]>
  /**
   * content_hash が入る本文候補を、文書を問わずに返す
   */
  findPassagesByContentHashes(contentHashes: string[], tx?: TransactionContext): Promise<ImportPassage[]>
  /**
   * 同じ content_hash の行は飛ばし、挿入した行の id を返す
   */
  insertCandidates(inputs: CandidateInput[], tx: TransactionContext): Promise<number[]>
  /**
   * collected で content_hash が入るものの generation_prioritized_at を、まだ無ければ now にして返す（文書で絞らない。すでにあれば時刻を変えない）
   */
  prioritizeCollected(
    input: { contentHashes: string[]; now: Date },
    tx: TransactionContext,
  ): Promise<Pick<Passage, "contentHash" | "id" | "title">[]>
  /**
   * 文書の collected のうち、content_hash が keepContentHashes に無いものを却下して件数を返す
   */
  rejectCollected(input: { keepContentHashes: string[]; reason: string; sourceDocumentId: number }, tx: TransactionContext): Promise<number>
  /**
   * (sourceId, path) で文書を作るか、取得の結果の列を更新する（GitHub の列は null にし、sitemap_lastmod は変えない）
   */
  upsertFetchedDocument(input: FetchedDocumentInput, tx: TransactionContext): Promise<{ id: number }>
}
