import type { GitHubRepositorySource, PassageStatus, Source, Tag, WebsiteSource } from "@repo/domain"

import type { ReadOptions } from "./read-options"

type SourceInputBase = Pick<
  Source,
  "excludeGlobs" | "includeGlobs" | "isEnabled" | "kind" | "licenseUrl" | "name"
> & {
  /**
   * 付けるタグの id（重複なし。存在するかは service が確かめる）
   */
  tagIds: number[]
}

/**
 * タグ（名前の順）つきのソース。admin のソースの API が返す
 */
export type SourceWithTags = Source & { tags: Tag[] }

/**
 * ソースの登録・更新時の入力。取得方法（fetchType）ごとに書く列が違う
 */
export type SourceInput =
  | (SourceInputBase & Pick<GitHubRepositorySource, "branch" | "fetchType" | "licenseSpdx" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository">)
  | (SourceInputBase & Pick<WebsiteSource, "contentSelector" | "excludeSelectors" | "fetchType" | "licenseSpdx" | "siteUrl">)

/**
 * ソース × 本文候補の状態ごとの件数。件数が 0 の組み合わせは行が無い
 */
export type PassageCountRow = { count: number; sourceId: number; status: PassageStatus }

/**
 * 登録・更新の結果。
 * - duplicate：repository / site_url の unique 制約に違反した（service の重複の事前検査と書き込みの間に、同じ取得元が別のリクエストで登録された）
 * - missing_tags：source_tags の外部キーに違反した（service がタグの存在を確かめた後、書き込みまでの間にタグが消された）
 */
export type SourceSaveResult =
  | { kind: "duplicate" }
  | { kind: "missing_tags" }
  | { kind: "saved"; source: SourceWithTags }

/**
 * 更新時に、ソースの列と一緒に戻す収集の状態
 */
export type SourceUpdateOptions = {
  /**
   * last_collected_commit_sha を null に戻す（github の収集の範囲が変わったとき）
   */
  shouldResetCollectedCommit: boolean
}

/**
 * 英文の取得元（sources）のリポジトリ
 */
export interface SourceRepository {
  /**
   * sourceId を省略すると全ソース分
   */
  countPassagesBySource(sourceId?: number, options?: ReadOptions): Promise<PassageCountRow[]>
  /**
   * ソースと source_tags（input.tagIds）を 1 トランザクションで作る
   */
  create(input: SourceInput): Promise<SourceSaveResult>
  /**
   * id の昇順。各ソースのタグは名前の順
   */
  findAll(): Promise<SourceWithTags[]>
  findById(id: number, options?: ReadOptions): Promise<SourceWithTags | null>
  /**
   * 重複の検査に使うだけなのでタグは読まない
   */
  findByRepository(repository: string): Promise<Source | null>
  /**
   * 重複の検査に使うだけなのでタグは読まない
   */
  findBySiteUrl(siteUrl: string): Promise<Source | null>
  /**
   * 取得した文書（source_documents）を 1 件でも持つか
   */
  hasSourceDocuments(sourceId: number): Promise<boolean>
  /**
   * input.fetchType の列と共通の列を書き（取得方法は変えない）、このソースの source_tags を input.tagIds に付け替える。
   * options の収集の状態も含めて 1 トランザクションで行う。対象が無い（id が無い・取得方法が違う）ときは throw する
   */
  update(id: number, input: SourceInput, options: SourceUpdateOptions): Promise<SourceSaveResult>
}
