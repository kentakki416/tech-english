import type { SourceCollectionRun } from "@repo/domain"

/**
 * 記録を作った結果。active_exists はそのソースの収集が queued / running で残っている（部分 unique index に違反した）
 */
export type CreateSourceCollectionRunResult =
  | { kind: "active_exists" }
  | { kind: "created"; run: SourceCollectionRun }

/**
 * api 側で必要な収集の実行の記録の操作（作る・最新を読む・片付ける）。running にする・結果を書くのは worker
 */
export interface SourceCollectionRunRepository {
  /**
   * queued の記録を作る
   */
  create(sourceId: number): Promise<CreateSourceCollectionRunResult>
  /**
   * そのソースの収集中の記録のうち、queued は依頼した時刻・running は始めた時刻が startedBefore より前のものを failed にし、件数を返す
   */
  failTimedOut(input: { error: string; now: Date; sourceId: number; startedBefore: Date }): Promise<number>
  /**
   * そのソースの最新の記録（id の降順で 1 件）
   */
  findLatestBySourceId(sourceId: number): Promise<SourceCollectionRun | null>
  /**
   * queued のままの記録を failed にする（Queue に積めなかったとき）
   */
  markFailed(input: { error: string; id: number; now: Date }): Promise<void>
}
