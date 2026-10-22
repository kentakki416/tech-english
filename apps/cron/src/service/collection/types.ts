import type { IGitHubContentClient } from "../../client/github"
import type { PassageRepository, SourceDocumentRepository, SourceRepository } from "../../repository"

export type CollectionRepo = {
  /**
   * 収集は本文候補の挿入と、見出しの確認、collected の却下だけを使う（問題生成のメソッドに依存させない）
   */
  passageRepository: Pick<PassageRepository, "findGeneratedOrGeneratingTitles" | "insertIgnoringDuplicates" | "rejectCollected">
  sourceDocumentRepository: SourceDocumentRepository
  sourceRepository: SourceRepository
}

export type CollectionDeps = {
  githubContentClient: IGitHubContentClient
}

/**
 * 1 ソースの収集の終わり方
 *
 * - completed: 対象の文書を全部処理した（last_collected_commit_sha を更新する）
 * - limit_reached: 文書数・本文候補数の上限で打ち切った。またはツリーが切り詰められて全部を列挙できなかった
 * - rate_limited: GitHub の rate limit の残りが閾値を切ったので打ち切った
 * - up_to_date: 前回の収集から取得元が変わっていない
 */
export type SourceCollectionStatus =
  | "completed"
  | "limit_reached"
  | "rate_limited"
  | "up_to_date"

export type SourceCollectionResult = {
  createdPassageCount: number
  fetchedDocumentCount: number
  status: SourceCollectionStatus
}
