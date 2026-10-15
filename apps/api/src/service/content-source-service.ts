import {
  type ContentSource,
  type GitHubRepositorySource,
  isAllowedLicense,
  PASSAGE_STATUSES,
  type PassageStatus,
  type WebsiteSource,
} from "@repo/domain"
import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import type { IGitHubLicenseClient } from "../client/github-license"
import {
  ContentSourceInput,
  ContentSourceRepository,
  ContentSourceWithTags,
  FailedPage,
  PassageCountRow,
  TagRepository,
} from "../repository"

type ContentSourceRepo = { contentSourceRepository: ContentSourceRepository }

/**
 * 登録・更新で使う Repository。タグは存在の確認にだけ使う
 */
type ContentSourceWriteRepo = ContentSourceRepo & { tagRepository: Pick<TagRepository, "findByIds"> }

type GitHubRepositoryInput = Extract<ContentSourceInput, { fetchType: "github_repository" }>

type WebsiteInput = Extract<ContentSourceInput, { fetchType: "website" }>

const DUPLICATE_SOURCE_MESSAGE = "Content source already registered"

const TAG_NOT_FOUND_MESSAGE = "Tag not found"

/**
 * 存在しないタグの id の詳細の code（既存の details の code と同じく `{対象}_not_found` の snake_case）
 */
const TAG_NOT_FOUND_CODE = "tag_not_found"

/**
 * 本文候補の状態ごとの件数
 */
export type PassageCounts = Record<PassageStatus, number>

/**
 * 1 ソースの状態ごとの件数。行が無い状態は 0 で埋める
 */
const buildPassageCounts = (rows: PassageCountRow[], sourceId: number): PassageCounts => {
  const counts = Object.fromEntries(PASSAGE_STATUSES.map((status) => [status, 0])) as PassageCounts
  for (const row of rows) {
    if (row.sourceId === sourceId) counts[row.status] += row.count
  }
  return counts
}

/**
 * 同じ取得元（github は repository、website は site_url）で登録済みのソース
 */
const findDuplicateSource = async (
  input: ContentSourceInput,
  repo: ContentSourceRepo,
): Promise<ContentSource | null> =>
  input.fetchType === "github_repository"
    ? repo.contentSourceRepository.findByRepository(input.repository)
    : repo.contentSourceRepository.findBySiteUrl(input.siteUrl)

/**
 * 存在しないタグの id の 400。admin は details の path（["tag_ids"]）で、取得元の変更の 400 と見分けてタグの欄に出す
 */
const buildTagNotFoundError = (message: string) =>
  badRequestError(TAG_NOT_FOUND_MESSAGE, [{ code: TAG_NOT_FOUND_CODE, message, path: ["tag_ids"] }])

/**
 * tagIds のうち tags に無い id（入力の順）。全部あれば空。
 * admin のフォームは登録済みのタグしか出さないが、送信までの間にタグの画面で消されることがある
 */
const findMissingTagIds = async (tagIds: number[], repo: ContentSourceWriteRepo): Promise<number[]> => {
  if (tagIds.length === 0) return []
  const existingIds = new Set((await repo.tagRepository.findByIds(tagIds)).map((tag) => tag.id))
  return tagIds.filter((tagId) => !existingIds.has(tagId))
}

/**
 * 2 つの文字列の配列が同じ順で同じ値を持つか
 */
const isSameStringList = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

/**
 * 収集の範囲（repository / branch / 対象パス / 除外パス）が変わったか
 */
const hasCollectionScopeChanged = (existing: GitHubRepositorySource, input: GitHubRepositoryInput): boolean =>
  existing.repository !== input.repository
  || existing.branch !== input.branch
  || !isSameStringList(existing.includeGlobs, input.includeGlobs)
  || !isSameStringList(existing.excludeGlobs, input.excludeGlobs)

/**
 * 取得元（github は repository、website は site_url）が変わったか。
 * GitHub はリポジトリ名の大文字・小文字を区別しないので、大文字・小文字の違いだけなら変わっていない（リンクは 404 にならない）
 */
const hasOriginChanged = (existing: ContentSource, input: ContentSourceInput): boolean => {
  if (existing.fetchType === "github_repository" && input.fetchType === "github_repository") {
    return existing.repository.toLowerCase() !== input.repository.toLowerCase()
  }
  if (existing.fetchType === "website" && input.fetchType === "website") return existing.siteUrl !== input.siteUrl
  return false
}

/**
 * 本文の抽出の設定（本文の CSS セレクタ / 除外する CSS セレクタ）が変わったか
 */
const hasExtractionChanged = (existing: WebsiteSource, input: WebsiteInput): boolean =>
  existing.contentSelector !== input.contentSelector
  || !isSameStringList(existing.excludeSelectors, input.excludeSelectors)

/**
 * ソース一覧（状態別の本文候補件数と取得失敗のページ数つき）
 */
export const getContentSources = async (
  repo: ContentSourceRepo,
): Promise<Result<{ failedPageCount: number; passageCounts: PassageCounts; source: ContentSourceWithTags }[]>> => {
  const [sources, passageCountRows, failedPageCountRows] = await Promise.all([
    repo.contentSourceRepository.findAll(),
    repo.contentSourceRepository.countPassagesBySource(),
    repo.contentSourceRepository.countFailedPagesBySource(),
  ])
  const failedPageCounts = new Map(failedPageCountRows.map((row) => [row.sourceId, row.count]))
  return ok(sources.map((source) => ({
    failedPageCount: failedPageCounts.get(source.id) ?? 0,
    passageCounts: buildPassageCounts(passageCountRows, source.id),
    source,
  })))
}

/**
 * ソース詳細（状態別の本文候補件数と取得失敗のページつき）
 */
export const getContentSourceById = async (
  id: number,
  repo: ContentSourceRepo,
): Promise<Result<{ failedPages: FailedPage[]; passageCounts: PassageCounts; source: ContentSourceWithTags }>> => {
  const source = await repo.contentSourceRepository.findById(id)
  if (!source) {
    logger.debug("ContentSourceService: Content source not found", { id })
    return err(notFoundError("Content source not found"))
  }
  const [passageCountRows, failedPages] = await Promise.all([
    repo.contentSourceRepository.countPassagesBySource(id),
    repo.contentSourceRepository.findFailedPages(id),
  ])
  return ok({ failedPages, passageCounts: buildPassageCounts(passageCountRows, id), source })
}

/**
 * ソースを登録する
 */
export const createContentSource = async (
  input: ContentSourceInput,
  repo: ContentSourceWriteRepo,
): Promise<Result<ContentSourceWithTags>> => {
  /**
   * 入力の誤りなので、重複（409）より先に確かめる
   */
  const missingTagIds = await findMissingTagIds(input.tagIds, repo)
  if (missingTagIds.length > 0) {
    logger.debug("ContentSourceService: Tag not found", { missingTagIds })
    return err(buildTagNotFoundError(`Tag not found: id=${missingTagIds.join(", ")}`))
  }
  if (await findDuplicateSource(input, repo)) {
    logger.debug("ContentSourceService: Content source already registered", { fetchType: input.fetchType })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }
  /**
   * サイトは試し実行で本文を確かめてから有効にするため、無効で作る
   */
  const result = await repo.contentSourceRepository.create(
    input.fetchType === "website" ? { ...input, isEnabled: false } : input,
  )
  /**
   * 事前の検査の後に同じ取得元が登録された（同時のリクエスト）。unique 制約で弾かれたので 409 にする
   */
  if (result.kind === "duplicate") {
    logger.debug("ContentSourceService: Content source registered concurrently", { fetchType: input.fetchType })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }
  /**
   * 事前の確認の後にタグが消された（同時のリクエスト）。外部キーで弾かれたので、存在しないタグと同じ 400 にする
   */
  if (result.kind === "missing_tags") {
    logger.debug("ContentSourceService: Tag deleted during the request", { fetchType: input.fetchType })
    return err(buildTagNotFoundError("Tag was deleted during the request"))
  }
  logger.info("ContentSourceService: Content source created", { fetchType: result.source.fetchType, id: result.source.id })
  return ok(result.source)
}

/**
 * ソースを更新する（有効 / 無効の切り替えを含む）。取得方法は変えられない。
 * 取得した文書があるソースは取得元（repository / site_url）も変えられない（変えたいときは別のソースとして登録する）
 */
export const updateContentSource = async (
  id: number,
  input: ContentSourceInput,
  repo: ContentSourceWriteRepo,
): Promise<Result<ContentSourceWithTags>> => {
  const existing = await repo.contentSourceRepository.findById(id)
  if (!existing) {
    logger.debug("ContentSourceService: Content source not found for update", { id })
    return err(notFoundError("Content source not found"))
  }
  if (existing.fetchType !== input.fetchType) return err(badRequestError("fetch_type cannot be changed"))

  /**
   * 入力の誤りなので、取得元の変更・重複（409）より先に確かめる
   */
  const missingTagIds = await findMissingTagIds(input.tagIds, repo)
  if (missingTagIds.length > 0) {
    logger.debug("ContentSourceService: Tag not found for update", { id, missingTagIds })
    return err(buildTagNotFoundError(`Tag not found: id=${missingTagIds.join(", ")}`))
  }

  /**
   * 過去の本文候補の出典は、ソースの今の取得元と passages の source_path（GitHub は source_commit_sha も）で組み立てる。
   * 取得元を変えると過去の問題の出典が別のリポジトリ・サイトを指して 404 になるため、取得した文書があれば拒否する。
   * ライセンスの変更は許す（誤登録の訂正は過去の問題の出典にも反映されるのが正しい）
   */
  if (hasOriginChanged(existing, input) && await repo.contentSourceRepository.hasSourceDocuments(id)) {
    logger.debug("ContentSourceService: Origin of a collected content source cannot be changed", { id })
    return err(badRequestError("repository / site_url cannot be changed after documents are collected"))
  }

  const duplicate = await findDuplicateSource(input, repo)
  if (duplicate && duplicate.id !== id) {
    logger.debug("ContentSourceService: Content source already registered", { fetchType: input.fetchType, id })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }

  /**
   * 収集の範囲が変わったら last_collected_commit_sha を null に戻す。
   * 戻さないと、最新コミットが前回と同じ間は新しい対象パスが収集されない
   */
  const shouldResetCollectedCommit = existing.fetchType === "github_repository"
    && input.fetchType === "github_repository"
    && hasCollectionScopeChanged(existing, input)
  /**
   * 本文の抽出の設定が変わったら、取得済みの文書の ETag / Last-Modified / 本文のハッシュを消す。
   * 消さないと、ページが変わっていない間は 304 か同じハッシュで止まり、新しいセレクタで抽出し直されない
   */
  const shouldResetDocumentCache = existing.fetchType === "website"
    && input.fetchType === "website"
    && hasExtractionChanged(existing, input)
  const result = await repo.contentSourceRepository.update(id, input, { shouldResetCollectedCommit, shouldResetDocumentCache })
  if (result.kind === "duplicate") {
    logger.debug("ContentSourceService: Content source registered concurrently", { fetchType: input.fetchType, id })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }
  if (result.kind === "missing_tags") {
    logger.debug("ContentSourceService: Tag deleted during the request", { id })
    return err(buildTagNotFoundError("Tag was deleted during the request"))
  }
  logger.info("ContentSourceService: Content source updated", { id, shouldResetCollectedCommit, shouldResetDocumentCache })
  return ok(result.source)
}

/**
 * GitHub が検出したリポジトリのライセンスと、それが許可リストにあるか
 */
export const detectRepositoryLicense = async (
  repository: string,
  deps: { githubLicenseClient: IGitHubLicenseClient },
): Promise<Result<{ isAllowed: boolean; licenseSpdx: string | null }>> => {
  const licenseSpdx = await deps.githubLicenseClient.detectLicense(repository)
  return ok({ isAllowed: licenseSpdx !== null && isAllowedLicense(licenseSpdx), licenseSpdx })
}
