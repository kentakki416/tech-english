import type { GitHubRepositorySource, Source } from "@repo/domain"

/**
 * 収集を終えたときに記録する値
 */
export type MarkCollectedInput = {
  lastCollectedAt: Date
  /**
   * GitHub のみ。全件処理できたときだけ渡す（省略したら last_collected_commit_sha・last_collected_extraction_version は変えない）。
   * last_collected_commit_sha が expectedSha（収集を始めたときに読んだ値。null は未収集）のままのときだけ、
   * nextSha と extractionVersion を一緒に書く楽観ロック。
   * 収集の途中で admin が収集の範囲を変えて null に戻していたら、last_collected_at も含めて何も書かずに false を返す
   * （古い SHA を書き戻すと、変えた範囲が次のコミットまで収集されないため）
   */
  lastCollectedCommit?: { expectedSha: string | null; extractionVersion: string; nextSha: string }
}

/**
 * cron 側（collect-passages）で必要なソースの操作。
 * apps/api 側の SourceRepository（管理画面の CRUD）とは操作のセットが違うので分けている
 */
export interface SourceRepository {
  findById(id: number): Promise<Source | null>
  /**
   * last_collected_at の古い順（未収集が先）。本文候補の上限で後ろのソースが毎回あふれないように
   */
  findEnabledGitHubSources(): Promise<GitHubRepositorySource[]>
  /**
   * 収集を終えた時刻を記録する。行を更新できたら true
   */
  markCollected(id: number, input: MarkCollectedInput): Promise<boolean>
}
