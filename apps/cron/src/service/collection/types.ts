import type { IGitHubContentClient } from "../../client/github"
import type { IWebPageClient } from "../../client/web"
import type { ContentSourceRepository, PassageRepository, SourceDocumentRepository } from "../../repository"

export type CollectionRepo = {
  contentSourceRepository: ContentSourceRepository
  /**
   * 収集は本文候補の挿入と、見出しの確認、collected の却下だけを使う（問題生成のメソッドに依存させない）
   */
  passageRepository: Pick<PassageRepository, "findTitles" | "insertIgnoringDuplicates" | "rejectCollected">
  sourceDocumentRepository: SourceDocumentRepository
}

export type CollectionDeps = {
  /**
   * サイトのソースごとに WebPageClient を作る（オリジン・robots.txt・リクエストの間隔をソース単位で持つため）
   */
  createWebPageClient: (origin: string) => IWebPageClient
  githubContentClient: IGitHubContentClient
}

/**
 * 1 ソースの収集の終わり方
 *
 * - completed: 対象の文書を全部処理した（GitHub は last_collected_commit_sha を更新する。サイトは取得待ちの行を全部処理した）
 * - crawl_delay_too_long: サイトの robots.txt の Crawl-delay が上限を超えているので打ち切った（失敗にはしない）
 * - limit_reached: 文書数・本文候補数の上限で打ち切った。またはツリーが切り詰められて全部を列挙できなかった
 * - rate_limited: GitHub の rate limit の残りが閾値を切ったので打ち切った
 * - throttled: サイトが 429 / 503 を返したので打ち切った（失敗にはしない）
 * - up_to_date: 前回の収集から取得元が変わっていない
 */
export type SourceCollectionStatus =
  | "completed"
  | "crawl_delay_too_long"
  | "limit_reached"
  | "rate_limited"
  | "throttled"
  | "up_to_date"

export type SourceCollectionResult = {
  createdPassageCount: number
  fetchedDocumentCount: number
  status: SourceCollectionStatus
}
