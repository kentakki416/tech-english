import {
  type GitHubRepositorySource,
  isAllowedLicense,
  PASSAGE_STATUSES,
  type PassageStatus,
  type Source,
  SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES,
  type SourceCollectionRun,
} from "@repo/domain"
import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"
import { buildCollectSourceJobId, type CollectSourceJobData, type JobQueue } from "@repo/queue"

import type { IGitHubLicenseClient } from "../client/github-license"
import {
  PassageCountRow,
  SourceCollectionRunRepository,
  SourceInput,
  SourceRepository,
  SourceWithTags,
  TagRepository,
} from "../repository"

type SourceRepo = { sourceRepository: SourceRepository }

/**
 * 収集の実行の記録も読み書きする Repository（詳細・今すぐ収集の依頼）
 */
type SourceCollectionRepo = SourceRepo & { sourceCollectionRunRepository: SourceCollectionRunRepository }

/**
 * 登録・更新で使う Repository。タグは存在の確認にだけ使う
 */
type SourceWriteRepo = SourceRepo & { tagRepository: Pick<TagRepository, "findByIds"> }

type GitHubRepositoryInput = Extract<SourceInput, { fetchType: "github_repository" }>

const DUPLICATE_SOURCE_MESSAGE = "Source already registered"

const WEBSITE_SOURCE_UNAVAILABLE_MESSAGE = "Website sources are only available locally"

const TAG_NOT_FOUND_MESSAGE = "Tag not found"

const WEBSITE_SOURCE_NOT_COLLECTED_MESSAGE = "Website sources are not collected"

const DISABLED_SOURCE_NOT_COLLECTED_MESSAGE = "Disabled sources are not collected"

const SOURCE_COLLECTION_RUNNING_MESSAGE = "Source collection is already running"

/**
 * failed にした記録の理由。admin がそのまま出すので日本語にする
 */
const SOURCE_COLLECTION_TIMED_OUT_ERROR = `${SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES} 分を過ぎても終わらなかった`

const SOURCE_COLLECTION_ENQUEUE_FAILED_ERROR = "収集を始められなかった（Queue に積めなかった）"

/**
 * 存在しないタグの id の詳細の code（既存の details の code と同じく `{対象}_not_found` の snake_case）
 */
const TAG_NOT_FOUND_CODE = "tag_not_found"

/**
 * 登録・更新で、取得方法ごとに受け付けるかの設定。サイトのソースはローカル（NODE_ENV !== "production"）でだけ受け付ける。
 * env を service で読まず index.ts が値を渡す（テストで切り替えるため）
 */
export type SourceWritePolicy = {
  isWebsiteSourceAllowed: boolean
}

const disableWebsiteSource = (input: SourceInput): SourceInput =>
  input.fetchType === "website" ? { ...input, isEnabled: false } : input

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
  input: SourceInput,
  repo: SourceRepo,
): Promise<Source | null> =>
  input.fetchType === "github_repository"
    ? repo.sourceRepository.findByRepository(input.repository)
    : repo.sourceRepository.findBySiteUrl(input.siteUrl)

/**
 * 存在しないタグの id の 400。admin は details の path（["tag_ids"]）で、取得元の変更の 400 と見分けてタグの欄に出す
 */
const buildTagNotFoundError = (message: string) =>
  badRequestError(TAG_NOT_FOUND_MESSAGE, [{ code: TAG_NOT_FOUND_CODE, message, path: ["tag_ids"] }])

/**
 * tagIds のうち tags に無い id（入力の順）。全部あれば空。
 * admin のフォームは登録済みのタグしか出さないが、送信までの間にタグの画面で消されることがある
 */
const findMissingTagIds = async (tagIds: number[], repo: SourceWriteRepo): Promise<number[]> => {
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
const hasOriginChanged = (existing: Source, input: SourceInput): boolean => {
  if (existing.fetchType === "github_repository" && input.fetchType === "github_repository") {
    return existing.repository.toLowerCase() !== input.repository.toLowerCase()
  }
  if (existing.fetchType === "website" && input.fetchType === "website") return existing.siteUrl !== input.siteUrl
  return false
}

/**
 * ソース一覧（状態別の本文候補件数つき）
 */
export const getSources = async (
  repo: SourceRepo,
): Promise<Result<{ passageCounts: PassageCounts; source: SourceWithTags }[]>> => {
  const [sources, passageCountRows] = await Promise.all([
    repo.sourceRepository.findAll(),
    repo.sourceRepository.countPassagesBySource(),
  ])
  return ok(sources.map((source) => ({
    passageCounts: buildPassageCounts(passageCountRows, source.id),
    source,
  })))
}

/**
 * 収集中のまま時間切れ（SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES）を過ぎた記録を failed にする。
 * worker が止まって記録が収集中のまま残っても、次に詳細を読む・依頼するときに片付けて、もう一度依頼できるようにする
 */
const failTimedOutCollectionRuns = async (sourceId: number, now: Date, repo: SourceCollectionRepo): Promise<void> => {
  const count = await repo.sourceCollectionRunRepository.failTimedOut({
    error: SOURCE_COLLECTION_TIMED_OUT_ERROR,
    now,
    sourceId,
    startedBefore: new Date(now.getTime() - SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES * 60_000),
  })
  if (count > 0) logger.warn("SourceService: Timed out source collection runs were failed", { count, sourceId })
}

/**
 * ソース詳細（状態別の本文候補件数と、最後の収集の記録つき）
 */
export const getSourceById = async (
  id: number,
  repo: SourceCollectionRepo,
  deps: { now: Date },
): Promise<Result<{ latestCollectionRun: SourceCollectionRun | null; passageCounts: PassageCounts; source: SourceWithTags }>> => {
  const source = await repo.sourceRepository.findById(id)
  if (!source) {
    logger.debug("SourceService: Source not found", { id })
    return err(notFoundError("Source not found"))
  }
  await failTimedOutCollectionRuns(id, deps.now, repo)
  const [passageCountRows, latestCollectionRun] = await Promise.all([
    repo.sourceRepository.countPassagesBySource(id),
    repo.sourceCollectionRunRepository.findLatestBySourceId(id),
  ])
  return ok({ latestCollectionRun, passageCounts: buildPassageCounts(passageCountRows, id), source })
}

/**
 * ソースを登録する
 */
export const createSource = async (
  input: SourceInput,
  repo: SourceWriteRepo,
  policy: SourceWritePolicy,
): Promise<Result<SourceWithTags>> => {
  if (input.fetchType === "website" && !policy.isWebsiteSourceAllowed) {
    logger.debug("SourceService: Website source is not available", { fetchType: input.fetchType })
    return err(badRequestError(WEBSITE_SOURCE_UNAVAILABLE_MESSAGE))
  }
  /**
   * 入力の誤りなので、重複（409）より先に確かめる
   */
  const missingTagIds = await findMissingTagIds(input.tagIds, repo)
  if (missingTagIds.length > 0) {
    logger.debug("SourceService: Tag not found", { missingTagIds })
    return err(buildTagNotFoundError(`Tag not found: id=${missingTagIds.join(", ")}`))
  }
  if (await findDuplicateSource(input, repo)) {
    logger.debug("SourceService: Source already registered", { fetchType: input.fetchType })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }
  const result = await repo.sourceRepository.create(disableWebsiteSource(input))
  /**
   * 事前の検査の後に同じ取得元が登録された（同時のリクエスト）。unique 制約で弾かれたので 409 にする
   */
  if (result.kind === "duplicate") {
    logger.debug("SourceService: Source registered concurrently", { fetchType: input.fetchType })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }
  /**
   * 事前の確認の後にタグが消された（同時のリクエスト）。外部キーで弾かれたので、存在しないタグと同じ 400 にする
   */
  if (result.kind === "missing_tags") {
    logger.debug("SourceService: Tag deleted during the request", { fetchType: input.fetchType })
    return err(buildTagNotFoundError("Tag was deleted during the request"))
  }
  logger.info("SourceService: Source created", { fetchType: result.source.fetchType, id: result.source.id })
  return ok(result.source)
}

/**
 * ソースを更新する（GitHub は有効 / 無効の切り替えを含む）。取得方法は変えられない。
 * 取得した文書があるソースは取得元（repository / site_url）も変えられない（変えたいときは別のソースとして登録する）
 */
export const updateSource = async (
  id: number,
  input: SourceInput,
  repo: SourceWriteRepo,
  policy: SourceWritePolicy,
): Promise<Result<SourceWithTags>> => {
  if (input.fetchType === "website" && !policy.isWebsiteSourceAllowed) {
    logger.debug("SourceService: Website source is not available", { id })
    return err(badRequestError(WEBSITE_SOURCE_UNAVAILABLE_MESSAGE))
  }
  const existing = await repo.sourceRepository.findById(id)
  if (!existing) {
    logger.debug("SourceService: Source not found for update", { id })
    return err(notFoundError("Source not found"))
  }
  if (existing.fetchType !== input.fetchType) return err(badRequestError("fetch_type cannot be changed"))

  /**
   * 入力の誤りなので、取得元の変更・重複（409）より先に確かめる
   */
  const missingTagIds = await findMissingTagIds(input.tagIds, repo)
  if (missingTagIds.length > 0) {
    logger.debug("SourceService: Tag not found for update", { id, missingTagIds })
    return err(buildTagNotFoundError(`Tag not found: id=${missingTagIds.join(", ")}`))
  }

  /**
   * 過去の本文候補の出典は、ソースの今の取得元と passages の source_path（GitHub は source_commit_sha も）で組み立てる。
   * 取得元を変えると過去の問題の出典が別のリポジトリ・サイトを指して 404 になるため、取得した文書があれば拒否する。
   * ライセンスの変更は許す（誤登録の訂正は過去の問題の出典にも反映されるのが正しい）
   */
  if (hasOriginChanged(existing, input) && await repo.sourceRepository.hasSourceDocuments(id)) {
    logger.debug("SourceService: Origin of a collected source cannot be changed", { id })
    return err(badRequestError("repository / site_url cannot be changed after documents are collected"))
  }

  const duplicate = await findDuplicateSource(input, repo)
  if (duplicate && duplicate.id !== id) {
    logger.debug("SourceService: Source already registered", { fetchType: input.fetchType, id })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }

  /**
   * 収集の範囲が変わったら last_collected_commit_sha を null に戻す。
   * 戻さないと、最新コミットが前回と同じ間は新しい対象パスが収集されない
   */
  const shouldResetCollectedCommit = existing.fetchType === "github_repository"
    && input.fetchType === "github_repository"
    && hasCollectionScopeChanged(existing, input)
  const result = await repo.sourceRepository.update(id, disableWebsiteSource(input), { shouldResetCollectedCommit })
  if (result.kind === "duplicate") {
    logger.debug("SourceService: Source registered concurrently", { fetchType: input.fetchType, id })
    return err(conflictError(DUPLICATE_SOURCE_MESSAGE))
  }
  if (result.kind === "missing_tags") {
    logger.debug("SourceService: Tag deleted during the request", { id })
    return err(buildTagNotFoundError("Tag was deleted during the request"))
  }
  logger.info("SourceService: Source updated", { id, shouldResetCollectedCommit })
  return ok(result.source)
}

/**
 * GitHub が検出したリポジトリのライセンスと、それが許可リストにあるか
 */
export const detectRepositoryLicense = async (
  repository: string,
  deps: { githubLicenseClient: IGitHubLicenseClient },
): Promise<Result<{ isAllowed: boolean; licenseSpdx: string | null; licenseUrl: string | null }>> => {
  const detected = await deps.githubLicenseClient.detectLicense(repository)
  const licenseSpdx = detected?.licenseSpdx ?? null
  return ok({
    isAllowed: licenseSpdx !== null && isAllowedLicense(licenseSpdx),
    licenseSpdx,
    licenseUrl: detected?.licenseUrl ?? null,
  })
}

/**
 * 今すぐ収集を依頼する。queued の記録を作ってから Queue に積み、worker が収集する。
 * 有効な GitHub のソースだけを受け付け、同じソースの収集中に依頼されたら 409（部分 unique index で判定する）
 */
export const requestSourceCollection = async (
  sourceId: number,
  repo: SourceCollectionRepo,
  deps: { collectSourceQueue: JobQueue<CollectSourceJobData>; now: Date },
): Promise<Result<SourceCollectionRun>> => {
  const source = await repo.sourceRepository.findById(sourceId)
  if (!source) {
    logger.debug("SourceService: Source not found", { sourceId })
    return err(notFoundError("Source not found"))
  }
  if (source.fetchType === "website") {
    logger.debug("SourceService: Website source is not collected", { sourceId })
    return err(badRequestError(WEBSITE_SOURCE_NOT_COLLECTED_MESSAGE))
  }
  if (!source.isEnabled) {
    logger.debug("SourceService: Disabled source is not collected", { sourceId })
    return err(badRequestError(DISABLED_SOURCE_NOT_COLLECTED_MESSAGE))
  }

  await failTimedOutCollectionRuns(sourceId, deps.now, repo)
  const created = await repo.sourceCollectionRunRepository.create(sourceId)
  if (created.kind === "active_exists") {
    logger.debug("SourceService: Source collection is already running", { sourceId })
    return err(conflictError(SOURCE_COLLECTION_RUNNING_MESSAGE))
  }

  /**
   * 積めなかった記録を queued のまま残すと、時間切れまで同じソースを依頼できなくなるので、failed にしてから throw し直す
   */
  try {
    await deps.collectSourceQueue.enqueue({ runId: created.run.id }, { jobId: buildCollectSourceJobId(created.run.id) })
  } catch (error) {
    await repo.sourceCollectionRunRepository.markFailed({
      error: SOURCE_COLLECTION_ENQUEUE_FAILED_ERROR,
      id: created.run.id,
      now: deps.now,
    })
    throw error
  }
  logger.info("SourceService: Source collection requested", { runId: created.run.id, sourceId })
  return ok(created.run)
}
