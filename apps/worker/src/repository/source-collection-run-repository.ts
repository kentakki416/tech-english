import type { SourceCollectionResultStatus } from "@repo/domain"

/**
 * worker が実行中にした記録を指すトークン。結果は `WHERE id = ? AND status = 'running' AND started_at = ?` で書き、
 * 別の実行に取り直された・時間切れで片付けられた後の古い実行が、結果を上書きしないようにする
 */
export type SourceCollectionRunClaim = {
  runId: number
  sourceId: number
  startedAt: Date
}

/**
 * 収集の結果。最後まで動いたら件数と終わり方、失敗したら理由（admin にそのまま出す）
 */
export type SourceCollectionOutcome =
  | { createdPassageCount: number; fetchedDocumentCount: number; status: SourceCollectionResultStatus }
  | { error: string; status: "failed" }

/**
 * worker 側で必要な収集の実行の記録の操作（実行中にする・結果を書く）
 */
export interface SourceCollectionRunRepository {
  /**
   * queued か running の記録を running にし（started_at = now）、トークンを返す。それ以外（時間切れで片付けられた・終わった）なら null。
   * running も取り直すのは、worker が落ちて同じジョブが渡し直されたときに続きを収集するため
   */
  claim(runId: number, now: Date): Promise<SourceCollectionRunClaim | null>
  /**
   * 結果を書く。トークンが古ければ何も書かずに false
   */
  finish(claim: SourceCollectionRunClaim, outcome: SourceCollectionOutcome, now: Date): Promise<boolean>
}
