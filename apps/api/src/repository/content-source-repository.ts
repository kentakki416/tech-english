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
 * 登録・更新の結果。repository / site_url の unique 制約に違反したら duplicate
 * （service の重複の事前検査と書き込みの間に、同じ取得元が別のリクエストで登録された場合）
 */
export type ContentSourceSaveResult = { kind: "duplicate" } | { kind: "saved"; source: ContentSource }

/**
 * 更新時に、ソースの列と一緒に戻す収集の状態
 */
export type ContentSourceUpdateOptions = {
  /**
   * last_collected_commit_sha を null に戻す（github の収集の範囲が変わったとき）
   */
  shouldResetCollectedCommit: boolean
  /**
   * そのソースの source_documents の etag / last_modified / content_hash を null に戻す（website の本文の CSS セレクタが変わったとき）。
   * 次回の収集で条件付きリクエスト（304）と本文のハッシュの比較が効かなくなり、全ページを新しいセレクタで抽出し直す
   */
  shouldResetDocumentCache: boolean
}

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
  create(input: ContentSourceInput): Promise<ContentSourceSaveResult>
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
   * 取得した文書（source_documents）を 1 件でも持つか
   */
  hasSourceDocuments(sourceId: number): Promise<boolean>
  /**
   * input.fetchType の列と共通の列だけを書く（取得方法は変えない）。options の収集の状態も同じトランザクションで戻す。
   * 対象が無い（id が無い・取得方法が違う）ときは throw する
   */
  update(id: number, input: ContentSourceInput, options: ContentSourceUpdateOptions): Promise<ContentSourceSaveResult>
}
