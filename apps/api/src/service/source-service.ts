import {
  checkSourceCollectability,
  type GitHubRepositorySource,
  isAllowedLicense,
  PASSAGE_STATUSES,
  type PassageStatus,
  PERSONAL_USE_LICENSE,
  type Source,
  type SourceCollectionRun,
  type SourceFetchType,
  type SourceNotCollectableReason,
  type SourceSuggestionErrorCode,
} from "@repo/domain"
import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"
import { buildCollectSourceJobId, type CollectSourceJobData, type JobQueue } from "@repo/queue"

import type { DetectedLicense, IGitHubRepositoryClient } from "../client/github-repository"
import { SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES } from "../const"
import {
  UNSUPPORTED_DOCUMENT_REPOSITORIES,
  VERIFIED_DOCUMENT_REPOSITORIES,
  type VerifiedDocumentRepository,
} from "../const/document-repository"
import {
  buildDefaultExcludeGlobs,
  findDocumentsDirectory,
  findParentDirectory,
  isInsideDirectory,
  listAncestorDirectories,
} from "../lib/source-document-path"
import { buildGitHubIncludeGlob, buildWebsiteIncludeGlob, parseSourceUrl, splitBranchAndPath } from "../lib/source-url"
import {
  PassageCountRow,
  SourceCollectionRunRepository,
  SourceCreateInput,
  SourceRepository,
  SourceUpdateInput,
  SourceWithTags,
  TagRepository,
} from "../repository"

type SourceRepo = { sourceRepository: SourceRepository }

/**
 * 収集の実行の記録も読み書きする Repository（一覧・詳細・今すぐ収集の依頼）
 */
type SourceCollectionRepo = SourceRepo & { sourceCollectionRunRepository: SourceCollectionRunRepository }

/**
 * 登録・更新で使う Repository。タグは存在の確認にだけ使う
 */
type SourceWriteRepo = SourceRepo & { tagRepository: Pick<TagRepository, "findByIds"> }

type GitHubRepositoryUpdateInput = Extract<SourceUpdateInput, { fetchType: "github_repository" }>

const DUPLICATE_SOURCE_MESSAGE = "Source already registered"

const WEBSITE_SOURCE_UNAVAILABLE_MESSAGE = "Website sources are only available locally"

const TAG_NOT_FOUND_MESSAGE = "Tag not found"

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

const disableWebsiteSource = (input: SourceCreateInput): SourceCreateInput =>
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
  input: SourceCreateInput,
  repo: SourceRepo,
): Promise<Source | null> =>
  input.fetchType === "github_repository"
    ? repo.sourceRepository.findByRepository(input.repository)
    : repo.sourceRepository.findBySiteUrl(input.siteUrl)

/**
 * 存在しないタグの id の 400。admin は details の path（["tag_ids"]）で見分けてタグの欄に出す
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
 * 収集の範囲（対象パス / 除外パス）が変わったか
 */
const hasCollectionScopeChanged = (existing: GitHubRepositorySource, input: GitHubRepositoryUpdateInput): boolean =>
  !isSameStringList(existing.includeGlobs, input.includeGlobs)
  || !isSameStringList(existing.excludeGlobs, input.excludeGlobs)

/**
 * 収集中のまま時間切れ（SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES）を過ぎた記録を failed にする。
 * worker が止まって記録が収集中のまま残っても、次に一覧・詳細を読む・依頼するときに片付けて、もう一度依頼できるようにする。
 * sourceId を省くと、すべてのソースの記録を片付ける
 */
const failTimedOutCollectionRuns = async (now: Date, repo: SourceCollectionRepo, sourceId?: number): Promise<void> => {
  const count = await repo.sourceCollectionRunRepository.failTimedOut({
    error: SOURCE_COLLECTION_TIMED_OUT_ERROR,
    now,
    sourceId,
    staleBefore: new Date(now.getTime() - SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES * 60_000),
  })
  if (count > 0) logger.warn("SourceService: Timed out source collection runs were failed", { count, sourceId })
}

/**
 * ソース一覧（状態別の本文候補件数と、最後の収集の記録つき）
 */
export const getSources = async (
  repo: SourceCollectionRepo,
  deps: { now: Date },
): Promise<Result<{ latestCollectionRun: SourceCollectionRun | null; passageCounts: PassageCounts; source: SourceWithTags }[]>> => {
  await failTimedOutCollectionRuns(deps.now, repo)
  /**
   * 詳細と同じ理由で、すべて primary から読む（一覧も収集中は読み直し、終わると読み直さないので、遅れた件数が残らないように）
   */
  const [sources, passageCountRows, latestCollectionRuns] = await Promise.all([
    repo.sourceRepository.findAll({ fromPrimary: true }),
    repo.sourceRepository.countPassagesBySource(undefined, { fromPrimary: true }),
    repo.sourceCollectionRunRepository.findLatestPerSource({ fromPrimary: true }),
  ])
  const latestCollectionRunBySourceId = new Map(latestCollectionRuns.map((run) => [run.sourceId, run]))
  return ok(sources.map((source) => ({
    latestCollectionRun: latestCollectionRunBySourceId.get(source.id) ?? null,
    passageCounts: buildPassageCounts(passageCountRows, source.id),
    source,
  })))
}

/**
 * ソース詳細（状態別の本文候補件数と、最後の収集の記録つき）
 */
export const getSourceById = async (
  id: number,
  repo: SourceCollectionRepo,
  deps: { now: Date },
): Promise<Result<{ latestCollectionRun: SourceCollectionRun | null; passageCounts: PassageCounts; source: SourceWithTags }>> => {
  /**
   * 詳細は admin しか呼ばず数が少ないので、すべて primary から読む。収集中の読み直しで、記録（完了）と件数・最終収集が
   * read replica の遅れで食い違わないようにするため（片付けの UPDATE の直後と、依頼の直後の読み直しも同じ）
   */
  const source = await repo.sourceRepository.findById(id, { fromPrimary: true })
  if (!source) {
    logger.debug("SourceService: Source not found", { id })
    return err(notFoundError("Source not found"))
  }
  await failTimedOutCollectionRuns(deps.now, repo, id)
  const [passageCountRows, latestCollectionRun] = await Promise.all([
    repo.sourceRepository.countPassagesBySource(id, { fromPrimary: true }),
    repo.sourceCollectionRunRepository.findLatestBySourceId(id, { fromPrimary: true }),
  ])
  return ok({ latestCollectionRun, passageCounts: buildPassageCounts(passageCountRows, id), source })
}

/**
 * ソースを登録する
 */
export const createSource = async (
  input: SourceCreateInput,
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
 * 取得元は入力に含まない（編集では変えない）ので、createSource と違って重複は確かめない
 */
export const updateSource = async (
  id: number,
  input: SourceUpdateInput,
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

  const missingTagIds = await findMissingTagIds(input.tagIds, repo)
  if (missingTagIds.length > 0) {
    logger.debug("SourceService: Tag not found for update", { id, missingTagIds })
    return err(buildTagNotFoundError(`Tag not found: id=${missingTagIds.join(", ")}`))
  }

  /**
   * 収集の範囲が変わったら last_collected_commit_sha を null に戻す。
   * 戻さないと、最新コミットが前回と同じ間は新しい対象パスが収集されない
   */
  const shouldResetCollectedCommit = existing.fetchType === "github_repository"
    && input.fetchType === "github_repository"
    && hasCollectionScopeChanged(existing, input)
  const result = await repo.sourceRepository.update(id, input, { shouldResetCollectedCommit })
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
type RepositoryLicense = {
  /**
   * 対象パスかその親にある、トップと内容の違うライセンスのファイルの URL
   */
  conflictUrl: string | null
  isAllowed: boolean
  isVerified: boolean
  licenseSpdx: string | null
  licenseUrl: string | null
}

/**
 * URL からのソースの登録の初期値
 */
export type SourceSuggestion =
  | {
    branch: string
    defaultBranch: string
    detectedLicense: RepositoryLicense
    excludeGlobs: string[]
    fetchType: "github_repository"
    includeGlobs: string[]
    repository: string
  }
  | {
    fetchType: "website"
    includeGlobs: string[]
    licenseSpdx: typeof PERSONAL_USE_LICENSE
    licenseUrl: string
    siteUrl: string
  }

const SOURCE_SUGGESTION_ERROR_MESSAGE = "Cannot suggest a source from the URL"

/**
 * 大文字だけを見る。`docs/license.md` のようなページ（製品のライセンスの説明）で止めないため
 */
const LICENSE_FILE_NAME_PATTERN = /^(LICENSE|LICENCE|COPYING)([-._].*)?$/

/**
 * URL から初期値を作れない理由の 400。admin は details[0].code で文言を分ける
 */
const buildSourceSuggestionError = (code: SourceSuggestionErrorCode) =>
  badRequestError(SOURCE_SUGGESTION_ERROR_MESSAGE, [{ code, message: code, path: ["url"] }])

const buildRepositoryLicense = (detected: DetectedLicense | null, conflictUrl: string | null): RepositoryLicense => {
  const licenseSpdx = detected?.licenseSpdx ?? null
  return {
    conflictUrl,
    isAllowed: licenseSpdx !== null && isAllowedLicense(licenseSpdx),
    isVerified: false,
    licenseSpdx,
    licenseUrl: detected?.licenseUrl ?? null,
  }
}

/**
 * サイトのライセンスは自動で判定できないので、ローカルの用途（個人の学習用）にそろえる
 */
const suggestWebsiteSource = (url: string, policy: SourceWritePolicy): Result<SourceSuggestion> => {
  if (!policy.isWebsiteSourceAllowed) {
    logger.debug("SourceService: Website source is not available")
    return err(buildSourceSuggestionError("website_unavailable"))
  }
  const sourceUrl = parseSourceUrl(url)
  if (sourceUrl?.fetchType !== "website") {
    logger.debug("SourceService: GitHub URL is given for a website source")
    return err(buildSourceSuggestionError("github_url"))
  }
  return ok({
    fetchType: "website",
    includeGlobs: [buildWebsiteIncludeGlob(sourceUrl.path)],
    licenseSpdx: PERSONAL_USE_LICENSE,
    licenseUrl: sourceUrl.siteUrl,
    siteUrl: sourceUrl.siteUrl,
  })
}

/**
 * 対象パスとその親で、トップのライセンスと内容の違うライセンスのファイルを探す。トップの検出はサブディレクトリのライセンスを見ないので、
 * ドキュメントだけ別のライセンスのリポジトリ（ClickHouse の docs/LICENSE）をトップのライセンスで登録してしまうため
 */
const findConflictingLicenseUrl = async (
  input: { branch: string; directory: string; licenseSha: string; repository: string },
  deps: { githubRepositoryClient: IGitHubRepositoryClient },
): Promise<string | null> => {
  for (const directory of listAncestorDirectories(input.directory)) {
    const files = await deps.githubRepositoryClient.listDirectoryFiles(input.repository, input.branch, directory)
    const conflict = files.find((file) => LICENSE_FILE_NAME_PATTERN.test(file.name) && file.sha !== input.licenseSha)
    if (conflict) return conflict.htmlUrl
  }
  return null
}

/**
 * 確認済みの一覧のライセンスは default branch のドキュメントの中だけに使う。ほかの場所の文章は確かめていないため
 */
const findVerifiedLicense = (
  input: { branch: string; defaultBranch: string; documentsPath: string; repository: string },
  verified: VerifiedDocumentRepository | undefined,
): RepositoryLicense | null => {
  if (!verified?.license || input.branch !== input.defaultBranch || !isInsideDirectory(input.documentsPath, verified.documentsPath)) return null
  return {
    conflictUrl: null,
    isAllowed: isAllowedLicense(verified.license.spdx),
    isVerified: true,
    licenseSpdx: verified.license.spdx,
    licenseUrl: `https://github.com/${input.repository}/blob/${input.branch}/${verified.license.path}`,
  }
}

const suggestGitHubRepositorySource = async (
  url: string,
  deps: { githubRepositoryClient: IGitHubRepositoryClient },
): Promise<Result<SourceSuggestion>> => {
  const sourceUrl = parseSourceUrl(url)
  if (sourceUrl?.fetchType !== "github_repository") {
    logger.debug("SourceService: URL is not a GitHub repository URL")
    return err(buildSourceSuggestionError("not_repository_url"))
  }

  const githubRepository = await deps.githubRepositoryClient.findRepository(sourceUrl.repository)
  if (githubRepository === null) {
    logger.debug("SourceService: GitHub repository not found", { repository: sourceUrl.repository })
    return err(buildSourceSuggestionError("repository_not_found"))
  }

  const repository = githubRepository.fullName.toLowerCase()
  if (UNSUPPORTED_DOCUMENT_REPOSITORIES.includes(repository)) {
    logger.debug("SourceService: Repository is not supported", { repository })
    return err(buildSourceSuggestionError("unsupported_repository"))
  }

  const { defaultBranch } = githubRepository
  const { branch, path } = splitBranchAndPath(sourceUrl.refAndPath, defaultBranch)
  const verified = VERIFIED_DOCUMENT_REPOSITORIES[repository]
  const documentsPath = path !== ""
    ? path
    : verified?.documentsPath ?? findDocumentsDirectory(await deps.githubRepositoryClient.listMarkdownPaths(repository, branch))
  const isFile = sourceUrl.target === "file"
  const verifiedLicense = findVerifiedLicense({ branch, defaultBranch, documentsPath, repository }, verified)
  /**
   * 見つからなくても default branch のライセンスは見ない。無いブランチや、確かめていないブランチの文章を登録できてしまい、登録の後は直せないため
   */
  const detected = verifiedLicense ? null : await deps.githubRepositoryClient.detectLicense(repository, branch)
  const conflictUrl = detected
    ? await findConflictingLicenseUrl(
      { branch, directory: isFile ? findParentDirectory(documentsPath) : documentsPath, licenseSha: detected.sha, repository },
      deps,
    )
    : null
  return ok({
    branch,
    defaultBranch,
    detectedLicense: verifiedLicense ?? buildRepositoryLicense(detected, conflictUrl),
    excludeGlobs: isFile ? [] : [
      ...buildDefaultExcludeGlobs(documentsPath, { hasReadmePages: verified?.hasReadmePages ?? false }),
      ...(verified?.extraExcludeGlobs ?? []),
    ],
    fetchType: "github_repository",
    includeGlobs: [buildGitHubIncludeGlob(isFile ? "file" : "directory", documentsPath)],
    repository,
  })
}

/**
 * 登録の画面の取得方法と URL から、ソースの登録のフォームの初期値を作る。登録の検証は createSource が行うので、
 * ここでは許可リストのライセンスかどうかを返すだけで拒否しない
 */
export const suggestSourceFromUrl = async (
  input: { fetchType: SourceFetchType; url: string },
  deps: { githubRepositoryClient: IGitHubRepositoryClient },
  policy: SourceWritePolicy,
): Promise<Result<SourceSuggestion>> =>
  input.fetchType === "website"
    ? suggestWebsiteSource(input.url, policy)
    : suggestGitHubRepositorySource(input.url, deps)

/**
 * 収集できないソースの理由を、api のエラーにする（ソースが無いときだけ 404）
 */
const buildSourceNotCollectableError = (reason: SourceNotCollectableReason) => {
  if (reason === "not_found") return notFoundError("Source not found")
  if (reason === "website") return badRequestError("Website sources are not collected")
  return badRequestError("Disabled sources are not collected")
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
  const collectability = checkSourceCollectability(await repo.sourceRepository.findById(sourceId))
  if (!collectability.isCollectable) {
    logger.debug("SourceService: Source is not collectable", { reason: collectability.reason, sourceId })
    return err(buildSourceNotCollectableError(collectability.reason))
  }

  await failTimedOutCollectionRuns(deps.now, repo, sourceId)
  const created = await repo.sourceCollectionRunRepository.create(sourceId)
  if (created.kind === "active_exists") {
    logger.debug("SourceService: Source collection is already running", { sourceId })
    return err(conflictError(SOURCE_COLLECTION_RUNNING_MESSAGE))
  }

  /**
   * 積めなかった記録を queued のまま残すと、時間切れまで同じソースを依頼できなくなるので、failed にしてから throw し直す
   * （apps/api/CLAUDE.md の try/catch の許容の「後始末をしてから throw し直す」）
   */
  try {
    await deps.collectSourceQueue.enqueue({ runId: created.run.id }, { jobId: buildCollectSourceJobId(created.run.id) })
  } catch (error) {
    await repo.sourceCollectionRunRepository.markQueuedAsFailed({ error: SOURCE_COLLECTION_ENQUEUE_FAILED_ERROR, id: created.run.id })
    throw error
  }
  logger.info("SourceService: Source collection requested", { runId: created.run.id, sourceId })
  return ok(created.run)
}
