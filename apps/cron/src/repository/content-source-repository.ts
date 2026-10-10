import type { ContentSource } from "@repo/domain"

/**
 * cron 側（collect-passages）で必要なソースの操作。
 * apps/api 側の ContentSourceRepository（管理画面の CRUD）とは操作のセットが違うので分けている
 */
export interface ContentSourceRepository {
  findById(id: number): Promise<ContentSource | null>
  /**
   * is_enabled = true のソースを last_collected_at の古い順（未収集が先）で返す。
   * 本文候補の上限で後ろのソースが毎回あふれないように
   */
  findEnabled(): Promise<ContentSource[]>
  /**
   * 収集を終えた時刻を記録する。lastCollectedCommitSha を省略したら変えない（全件処理できたときだけ渡す）
   */
  markCollected(id: number, input: { lastCollectedAt: Date; lastCollectedCommitSha?: string }): Promise<void>
}
