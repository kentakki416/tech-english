import type { IGitHubContentClient } from "../../client/github"
import type { IWebPageClient } from "../../client/web"
import type { ContentSourceRepository, PassageRepository, SourceDocumentRepository } from "../../repository"

/**
 * 収集で使う Repository をまとめたもの
 */
export type CollectionRepo = {
  contentSourceRepository: ContentSourceRepository
  passageRepository: PassageRepository
  sourceDocumentRepository: SourceDocumentRepository
}

/**
 * 収集で使う外部クライアントと停止指示
 */
export type CollectionDeps = {
  /**
   * サイトのソースごとに WebPageClient を作る（オリジン・robots.txt・リクエストの間隔をソース単位で持つため）
   */
  createWebPageClient: (origin: string) => IWebPageClient
  githubContentClient: IGitHubContentClient
  /**
   * SIGTERM / SIGINT を受けたら true。文書ごとのループの頭で見て抜ける
   */
  isShuttingDown: () => boolean
}

/**
 * 1 ソースの収集の終わり方
 *
 * - completed: 対象の文書を全部処理した（GitHub は last_collected_commit_sha を更新する。サイトは取得待ちの行を全部処理した）
 * - interrupted: 停止指示を受けて途中で抜けた
 * - limit_reached: 文書数・本文候補数の上限で打ち切った。またはツリーが切り詰められて全部を列挙できなかった
 * - rate_limited: GitHub の rate limit の残りが閾値を切ったので打ち切った
 * - throttled: サイトが 429 / 503 を返したので打ち切った（失敗にはしない）
 * - up_to_date: 前回の収集から取得元が変わっていない
 */
export type SourceCollectionStatus =
  | "completed"
  | "interrupted"
  | "limit_reached"
  | "rate_limited"
  | "throttled"
  | "up_to_date"

export type SourceCollectionResult = {
  createdPassageCount: number
  fetchedDocumentCount: number
  status: SourceCollectionStatus
}
