import {
  type ContentSource,
  type GitHubRepositorySource,
  isAllowedLicense,
  PASSAGE_STATUSES,
  type PassageStatus,
} from "@repo/domain"
import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import type { IGitHubLicenseClient } from "../client/github-license"
import { ContentSourceInput, ContentSourceRepository, FailedPage, PassageCountRow } from "../repository"

type ContentSourceRepo = { contentSourceRepository: ContentSourceRepository }

type GitHubRepositoryInput = Extract<ContentSourceInput, { fetchType: "github_repository" }>

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
 * ソース一覧（状態別の本文候補件数と取得失敗のページ数つき）
 */
export const getContentSources = async (
  repo: ContentSourceRepo,
): Promise<Result<{ failedPageCount: number; passageCounts: PassageCounts; source: ContentSource }[]>> => {
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
): Promise<Result<{ failedPages: FailedPage[]; passageCounts: PassageCounts; source: ContentSource }>> => {
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
  repo: ContentSourceRepo,
): Promise<Result<ContentSource>> => {
  if (await findDuplicateSource(input, repo)) {
    logger.debug("ContentSourceService: Content source already registered", { fetchType: input.fetchType })
    return err(conflictError("Content source already registered"))
  }
  /**
   * サイトは試し実行で本文を確かめてから有効にするため、無効で作る
   */
  const source = await repo.contentSourceRepository.create(
    input.fetchType === "website" ? { ...input, isEnabled: false } : input,
  )
  logger.info("ContentSourceService: Content source created", { fetchType: source.fetchType, id: source.id })
  return ok(source)
}

/**
 * ソースを更新する（有効 / 無効の切り替えを含む）。取得方法は変えられない
 */
export const updateContentSource = async (
  id: number,
  input: ContentSourceInput,
  repo: ContentSourceRepo,
): Promise<Result<ContentSource>> => {
  const existing = await repo.contentSourceRepository.findById(id)
  if (!existing) {
    logger.debug("ContentSourceService: Content source not found for update", { id })
    return err(notFoundError("Content source not found"))
  }
  if (existing.fetchType !== input.fetchType) return err(badRequestError("fetch_type cannot be changed"))

  const duplicate = await findDuplicateSource(input, repo)
  if (duplicate && duplicate.id !== id) {
    logger.debug("ContentSourceService: Content source already registered", { fetchType: input.fetchType, id })
    return err(conflictError("Content source already registered"))
  }

  /**
   * 収集の範囲が変わったら last_collected_commit_sha を null に戻す。
   * 戻さないと、最新コミットが前回と同じ間は新しい対象パスが収集されない
   */
  const shouldResetCollectedCommit = existing.fetchType === "github_repository"
    && input.fetchType === "github_repository"
    && hasCollectionScopeChanged(existing, input)
  const source = await repo.contentSourceRepository.update(id, input, { shouldResetCollectedCommit })
  logger.info("ContentSourceService: Content source updated", { id, shouldResetCollectedCommit })
  return ok(source)
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
