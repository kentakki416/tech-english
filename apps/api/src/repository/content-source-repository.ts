import type { ContentSource, GitHubRepositorySource, PassageStatus, WebsiteSource } from "@repo/domain"

type SourceInputBase = Pick<
  ContentSource,
  "excludeGlobs" | "includeGlobs" | "isEnabled" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "tags"
>

/**
 * ソースの登録・更新時の入力。取得方法（fetchType）ごとに書く列が違う
 */
export type ContentSourceInput =
  | (SourceInputBase & Pick<GitHubRepositorySource, "branch" | "fetchType" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository">)
  | (SourceInputBase & Pick<WebsiteSource, "contentSelector" | "excludeSelectors" | "fetchType" | "sitemapUrl" | "siteUrl" | "startUrl">)

/**
 * 取得に失敗したページ（source_documents.http_status >= 400）
 */
export type FailedPage = { httpStatus: number; path: string }

/**
 * ソース × 本文候補の状態ごとの件数。件数が 0 の組み合わせは行が無い
 */
export type PassageCountRow = { count: number; sourceId: number; status: PassageStatus }

/**
 * 英文の取得元（content_sources）のリポジトリ
 */
export interface ContentSourceRepository {
  /**
   * ソースごとの取得失敗のページ数。0 件のソースは行が無い
   */
  countFailedPagesBySource(): Promise<{ count: number; sourceId: number }[]>
  /**
   * sourceId を省略すると全ソース分
   */
  countPassagesBySource(sourceId?: number): Promise<PassageCountRow[]>
  create(input: ContentSourceInput): Promise<ContentSource>
  /**
   * id の昇順
   */
  findAll(): Promise<ContentSource[]>
  findById(id: number): Promise<ContentSource | null>
  findByRepository(repository: string): Promise<ContentSource | null>
  findBySiteUrl(siteUrl: string): Promise<ContentSource | null>
  /**
   * path の昇順
   */
  findFailedPages(sourceId: number): Promise<FailedPage[]>
  /**
   * input.fetchType の列と共通の列だけを書く（取得方法は変えない）。
   * shouldResetCollectedCommit なら last_collected_commit_sha も null に戻す。
   * 対象が無い（id が無い・取得方法が違う）ときは throw する
   */
  update(id: number, input: ContentSourceInput, options: { shouldResetCollectedCommit: boolean }): Promise<ContentSource>
}
