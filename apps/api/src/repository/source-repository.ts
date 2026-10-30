import type { GitHubRepositorySource, PassageStatus, Source, Tag, WebsiteSource } from "@repo/domain"

import type { ReadOptions } from "./read-options"

/**
 * 登録と編集の共通の入力
 */
type SourceEditableInputBase = Pick<Source, "excludeGlobs" | "includeGlobs" | "name"> & {
  /**
   * 付けるタグの id（重複なし。存在するかは service が確かめる）
   */
  tagIds: number[]
}

type SourceCreateInputBase = SourceEditableInputBase & Pick<Source, "isEnabled" | "kind" | "licenseUrl">

/**
 * タグ（名前の順）つきのソース。admin のソースの API が返す
 */
export type SourceWithTags = Source & { tags: Tag[] }

/**
 * ソースの登録時の入力。取得方法（fetchType）ごとに書く列が違う
 */
export type SourceCreateInput =
  | (SourceCreateInputBase & Pick<GitHubRepositorySource, "branch" | "fetchType" | "licenseSpdx" | "repository">)
  | (SourceCreateInputBase & Pick<WebsiteSource, "contentSelector" | "excludeSelectors" | "fetchType" | "licenseSpdx" | "siteUrl">)

/**
 * ソースの編集時の入力。取得方法（fetchType）ごとに書く列が違い、取得元・種別・GitHub のライセンスは登録で決まるので含まない。
 * サイトは常に無効なので isEnabled も含まない
 */
export type SourceUpdateInput =
  | (SourceEditableInputBase & Pick<GitHubRepositorySource, "fetchType" | "isEnabled">)
  | (SourceEditableInputBase & Pick<WebsiteSource, "contentSelector" | "excludeSelectors" | "fetchType" | "licenseSpdx" | "licenseUrl">)

/**
 * ソース × 本文候補の状態ごとの件数。件数が 0 の組み合わせは行が無い
 */
export type PassageCountRow = { count: number; sourceId: number; status: PassageStatus }

/**
 * 登録の結果。
 * - duplicate：repository / site_url の unique 制約に違反した（service の重複の事前検査と書き込みの間に、同じ取得元が別のリクエストで登録された）
 * - missing_tags：source_tags の外部キーに違反した（service がタグの存在を確かめた後、書き込みまでの間にタグが消された）
 */
export type SourceCreateResult =
  | { kind: "duplicate" }
  | { kind: "missing_tags" }
  | { kind: "saved"; source: SourceWithTags }

/**
 * 編集の結果。編集は取得元を変えないので、unique 制約の違反（duplicate）は起きない
 */
export type SourceUpdateResult = Exclude<SourceCreateResult, { kind: "duplicate" }>

/**
 * 更新時に、ソースの列と一緒に戻す収集の状態
 */
export type SourceUpdateOptions = {
  /**
   * last_collected_commit_sha を null に戻す（github の対象パス・除外パスが変わったとき）
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
  create(input: SourceCreateInput): Promise<SourceCreateResult>
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
   * input の列（取得方法ごとの、編集で変えられる列）を書き、このソースの source_tags を input.tagIds に付け替える。
   * options の収集の状態も含めて 1 トランザクションで行う。対象が無い（id が無い・取得方法が違う）ときは throw する
   */
  update(id: number, input: SourceUpdateInput, options: SourceUpdateOptions): Promise<SourceUpdateResult>
}
