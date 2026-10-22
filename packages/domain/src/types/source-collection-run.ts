import type { SOURCE_COLLECTION_RESULT_STATUSES, SOURCE_COLLECTION_RUN_STATUSES } from "../const/source-collection-run"

/**
 * 1 ソースの収集の終わり方
 */
export type SourceCollectionResultStatus = (typeof SOURCE_COLLECTION_RESULT_STATUSES)[number]

/**
 * 収集の実行の記録の状態
 */
export type SourceCollectionRunStatus = (typeof SOURCE_COLLECTION_RUN_STATUSES)[number]

/**
 * 収集（admin の今すぐ収集）の 1 回の記録
 */
export type SourceCollectionRun = {
  id: number
  /**
   * 作った本文候補の数。終わったときだけ入る（failed は null）
   */
  createdPassageCount: number | null
  /**
   * failed のときの理由（admin にそのまま出す）
   */
  error: string | null
  /**
   * 取得した文書の数。終わったときだけ入る（failed は null）
   */
  fetchedDocumentCount: number | null
  finishedAt: Date | null
  sourceId: number
  /**
   * worker が実行中にした時刻。結果を書くときのトークンにする（別の実行に取り直された後の古い実行が、結果を上書きしないようにする）
   */
  startedAt: Date | null
  status: SourceCollectionRunStatus
  /**
   * 収集を依頼した時刻
   */
  createdAt: Date
  updatedAt: Date
}
