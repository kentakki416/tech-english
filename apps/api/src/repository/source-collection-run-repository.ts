import type { SourceCollectionRun } from "@repo/domain"

import type { ReadOptions } from "./read-options"

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
   * 収集中の記録のうち、queued は依頼した時刻・running は始めた時刻が staleBefore より前のものを failed にし、件数を返す。
   * sourceId を省くと、すべてのソースの記録が対象
   */
  failTimedOut(input: { error: string; now: Date; sourceId?: number; staleBefore: Date }): Promise<number>
  /**
   * そのソースの最新の記録（id の降順で 1 件）
   */
  findLatestBySourceId(sourceId: number, options?: ReadOptions): Promise<SourceCollectionRun | null>
  /**
   * ソースごとの最新の記録（ソースごとに id の降順で 1 件。記録の無いソースは含まない）
   */
  findLatestPerSource(options?: ReadOptions): Promise<SourceCollectionRun[]>
  /**
   * queued のままの記録を failed にする（Queue に積めなかったとき）。終わった時刻は DB の今の時刻（依頼の時刻より前にならないように）
   */
  markQueuedAsFailed(input: { error: string; id: number }): Promise<void>
}
