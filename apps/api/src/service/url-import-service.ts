import type { PassageChunk } from "@repo/content-extractor"
import {
  type ChunkRejectReason,
  type PassageStatus,
  SUPERSEDED_PASSAGE_REJECT_REASON,
  type UrlImportChunkStatus,
  type UrlImportErrorCode,
  type WebsiteSource,
} from "@repo/domain"
import { badRequestError, err, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import type { FetchedPage, IPageFetcher } from "../client/page-fetcher"
import type {
  ContentSourceRepository,
  ImportPassage,
  TransactionRunner,
  UrlImportPageCacheKey,
  UrlImportPageCacheRepository,
  UrlImportRepository,
} from "../repository"

type UrlImportRepo = {
  contentSourceRepository: Pick<ContentSourceRepository, "findAll">
  urlImportPageCacheRepository: UrlImportPageCacheRepository
  urlImportRepository: UrlImportRepository
}

type UrlImportDeps = { pageFetcher: IPageFetcher }

/**
 * 塊ごとの「保存したときにどうなるか」
 */
export type UrlImportChunk = {
  /**
   * 最初の見出しでないブロックの先頭（EXCERPT_LENGTH 文字。超えたら切って「…」を付ける）
   */
  excerpt: string
  rejectReasons: ChunkRejectReason[]
  /**
   * 同じ内容（content_hash）の本文候補（状態を問わない）。admin はその本文候補へのリンクを出す
   */
  sameContentPassage: Pick<ImportPassage, "id" | "status"> | null
  status: UrlImportChunkStatus
  title: string
  wordCount: number
}

export type UrlImportPreview = {
  chunks: UrlImportChunk[]
  page: Pick<FetchedPage, "normalizedUrl" | "path" | "title" | "wordCount">
  source: WebsiteSource
}

export type UrlImportResult = {
  createdCount: number
  /**
   * 今回生成を優先した collected（ページの塊の順）。isNew は今回作ったか
   */
  passages: { id: number; isNew: boolean; title: string }[]
  rejectedCount: number
  sourceDocumentId: number
  sourceId: number
}

const EXCERPT_LENGTH = 160

const URL_IMPORT_ERROR_MESSAGE = "URL could not be imported"

const GENERATED_OR_GENERATING_STATUSES: readonly PassageStatus[] = ["draft", "generating", "published"]

/**
 * 取り込めない理由の 400。admin は details[0].code で文言を分ける
 */
const buildUrlImportError = (code: UrlImportErrorCode, detail: string | null) =>
  badRequestError(URL_IMPORT_ERROR_MESSAGE, [{ code, message: detail ?? code, path: ["url"] }])

const findOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * 生成中か、生成した（下書き・公開済み・生成した後に却下した）本文候補か。
 * cron の findGeneratedOrGeneratingTitles と同じ条件なので、変えるときは cron も直す
 */
const isGeneratedOrGenerating = (passage: ImportPassage): boolean =>
  GENERATED_OR_GENERATING_STATUSES.includes(passage.status) || (passage.status === "rejected" && passage.generatedAt !== null)

const findGeneratedOrGeneratingTitles = (documentPassages: ImportPassage[]): Set<string> =>
  new Set(documentPassages.filter(isGeneratedOrGenerating).map((passage) => passage.title))

const buildExcerpt = (chunk: PassageChunk): string => {
  const text = chunk.blocks.find((block) => block.type !== "heading")?.text ?? ""
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text
}

/**
 * 保存（importUrl）と同じ順で判定する。同じ見出しの問題がある塊は、同じ内容の collected があっても挿入も優先もしない（その collected が同じ文書のものなら、前の切り分けとして却下する）
 */
const classifyChunk = (
  chunk: PassageChunk,
  generatedOrGeneratingTitles: Set<string>,
  passagesByContentHash: Map<string, ImportPassage>,
): UrlImportChunkStatus => {
  if (chunk.rejectReasons.length > 0) return "not_candidate"
  if (generatedOrGeneratingTitles.has(chunk.title)) return "generated_section"
  const sameContentPassage = passagesByContentHash.get(chunk.contentHash)
  if (sameContentPassage === undefined) return "new"
  return sameContentPassage.status === "collected" ? "existing" : "duplicated"
}

const findSameContentPassage = (
  chunk: PassageChunk,
  passagesByContentHash: Map<string, ImportPassage>,
): Pick<ImportPassage, "id" | "status"> | null => {
  const passage = passagesByContentHash.get(chunk.contentHash)
  return passage === undefined ? null : { id: passage.id, status: passage.status }
}

/**
 * URL のオリジンのサイトのソース（無効のソースも含む）。site_url はオリジンに正規化して unique なので 1 つだけ当たる。
 * 無ければ、GitHub のソースの公開ページのオリジンなら github_source、それも無ければ source_not_found
 */
const findImportSource = async (url: string, repo: UrlImportRepo): Promise<Result<WebsiteSource>> => {
  const origin = new URL(url).origin
  const sources = await repo.contentSourceRepository.findAll()
  const websiteSource = sources.find((source) => source.fetchType === "website" && source.siteUrl === origin)
  if (websiteSource?.fetchType === "website") return ok(websiteSource)
  const isGitHubSourceSite = sources.some((source) =>
    source.fetchType === "github_repository" && source.publicUrlTemplate !== null && findOrigin(source.publicUrlTemplate) === origin)
  return err(buildUrlImportError(isGitHubSourceSite ? "github_source" : "source_not_found", null))
}

/**
 * キャッシュの読み書きを待つ上限。Redis に繋がらないと ioredis は再接続を試すあいだ待ち続け、取得の期限と API Gateway の 29 秒を食うため
 */
const PAGE_CACHE_TIMEOUT_MS = 500

/**
 * 上限までに終わらなければ timeout を返して先に進む（promise は止めずに走らせたままにする）
 */
const waitWithPageCacheTimeout = async <T>(promise: Promise<T>): Promise<{ kind: "done"; value: T } | { kind: "timeout" }> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), PAGE_CACHE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise.then((value) => ({ kind: "done" as const, value })), timeout])
  } finally {
    clearTimeout(timer)
  }
}

const convertErrorToMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * キャッシュの読み書きの失敗・時間切れでは止めない（取得して進める）。キャッシュはサイトへのリクエストを減らすためだけのもの
 */
const findCachedPage = async (key: UrlImportPageCacheKey, repo: UrlImportRepo): Promise<FetchedPage | null> => {
  try {
    const result = await waitWithPageCacheTimeout(repo.urlImportPageCacheRepository.find(key))
    if (result.kind === "done") return result.value
    logger.warn("url import page cache read timed out", { timeoutMs: PAGE_CACHE_TIMEOUT_MS })
    return null
  } catch (error) {
    logger.warn("url import page cache could not be read", { error: convertErrorToMessage(error) })
    return null
  }
}

const cachePage = async (key: UrlImportPageCacheKey, page: FetchedPage, repo: UrlImportRepo): Promise<void> => {
  try {
    const result = await waitWithPageCacheTimeout(repo.urlImportPageCacheRepository.save(key, page))
    if (result.kind === "timeout") logger.warn("url import page cache write timed out", { timeoutMs: PAGE_CACHE_TIMEOUT_MS })
  } catch (error) {
    logger.warn("url import page cache could not be written", { error: convertErrorToMessage(error) })
  }
}

/**
 * キャッシュのキーにする URL。取得のときの正規化と同じくクエリとフラグメントを除き、#... だけが違う同じページで取り直さない
 */
const buildPageCacheUrl = (url: string): string => {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

/**
 * ソースを決め、ページを取得・抽出する。確認と保存で同じページを取り直さないよう、取得・抽出したページはキャッシュに置いて使い回す
 * （Crawl-delay を守り、保存の内容を確認した内容とそろえるため。取得に失敗したときは置かない）
 */
const fetchImportPage = async (
  url: string,
  now: Date,
  repo: UrlImportRepo,
  deps: UrlImportDeps,
): Promise<Result<{ page: FetchedPage; source: WebsiteSource }>> => {
  const source = await findImportSource(url, repo)
  if (!source.ok) return source
  const cacheKey: UrlImportPageCacheKey = { sourceId: source.value.id, sourceUpdatedAt: source.value.updatedAt, url: buildPageCacheUrl(url) }
  const cachedPage = await findCachedPage(cacheKey, repo)
  if (cachedPage !== null) return ok({ page: cachedPage, source: source.value })

  const fetched = await deps.pageFetcher.fetchAndExtractPage({ now, source: source.value, url })
  if (fetched.kind === "failed") {
    /**
     * 失敗の多くは外部のサイトの状態で決まり、sendError のログには details が出ないので、調べるための値をここで残す
     */
    logger.info("url could not be imported", { code: fetched.code, detail: fetched.detail, sourceId: source.value.id, url })
    return err(buildUrlImportError(fetched.code, fetched.detail))
  }
  await cachePage(cacheKey, fetched.page, repo)
  return ok({ page: fetched.page, source: source.value })
}

/**
 * URL のページを取得・抽出し、塊ごとに保存したときにどうなるかを返す。DB には書かない
 */
export const previewUrlImport = async (
  url: string,
  now: Date,
  repo: UrlImportRepo,
  deps: UrlImportDeps,
): Promise<Result<UrlImportPreview>> => {
  const fetched = await fetchImportPage(url, now, repo, deps)
  if (!fetched.ok) return fetched
  const { page, source } = fetched.value
  const [documentPassages, sameContentPassages] = await Promise.all([
    repo.urlImportRepository.findDocumentPassages({ path: page.path, sourceId: source.id }),
    repo.urlImportRepository.findPassagesByContentHashes(page.chunks.map((chunk) => chunk.contentHash)),
  ])
  const generatedOrGeneratingTitles = findGeneratedOrGeneratingTitles(documentPassages)
  const passagesByContentHash = new Map(sameContentPassages.map((passage) => [passage.contentHash, passage]))
  return ok({
    chunks: page.chunks.map((chunk) => ({
      excerpt: buildExcerpt(chunk),
      rejectReasons: chunk.rejectReasons,
      sameContentPassage: findSameContentPassage(chunk, passagesByContentHash),
      status: classifyChunk(chunk, generatedOrGeneratingTitles, passagesByContentHash),
      title: chunk.title,
      wordCount: chunk.wordCount,
    })),
    page: { normalizedUrl: page.normalizedUrl, path: page.path, title: page.title, wordCount: page.wordCount },
    source,
  })
}

/**
 * URL のページを取得・抽出し、1 トランザクションで本文候補として保存する。
 *
 * 1. ページの文書を upsert する（取得の結果を記録し、収集でも取得済みとして扱う）
 * 2. その文書に同じ見出しの問題がある塊を除き、残りを生成を優先した collected で挿入する（同じ content_hash は飛ばす）
 * 3. 残した塊と同じ内容の collected（別の文書のものも）の生成を優先する
 * 4. その文書の collected のうち、残した塊に無いもの（前の切り分け）を却下する
 */
export const importUrl = async (
  url: string,
  now: Date,
  repo: UrlImportRepo & { transactionRunner: TransactionRunner },
  deps: UrlImportDeps,
): Promise<Result<UrlImportResult>> => {
  const fetched = await fetchImportPage(url, now, repo, deps)
  if (!fetched.ok) return fetched
  const { page, source } = fetched.value

  const saved = await repo.transactionRunner.run(async (tx) => {
    const document = await repo.urlImportRepository.upsertFetchedDocument({
      contentHash: page.contentHash,
      etag: page.etag,
      extractionVersion: page.extractionVersion,
      fetchedAt: now,
      httpStatus: page.httpStatus,
      lastModified: page.lastModified,
      path: page.path,
      sourceId: source.id,
      title: page.title,
    }, tx)
    const documentPassages = await repo.urlImportRepository.findDocumentPassages({ path: page.path, sourceId: source.id }, tx)
    const generatedOrGeneratingTitles = findGeneratedOrGeneratingTitles(documentPassages)
    const candidatesToInsert = page.chunks.filter((chunk) =>
      chunk.rejectReasons.length === 0 && !generatedOrGeneratingTitles.has(chunk.title))
    const createdIds = await repo.urlImportRepository.insertCandidates(
      candidatesToInsert.map((chunk) => ({
        blocks: chunk.blocks,
        contentHash: chunk.contentHash,
        generationPrioritizedAt: now,
        sourceDocumentId: document.id,
        sourcePath: page.path,
        sourceRetrievedAt: now,
        title: chunk.title,
        wordCount: chunk.wordCount,
      })),
      tx,
    )
    const keepContentHashes = candidatesToInsert.map((chunk) => chunk.contentHash)
    const prioritized = await repo.urlImportRepository.prioritizeCollected({ contentHashes: keepContentHashes, now }, tx)
    const rejectedCount = await repo.urlImportRepository.rejectCollected({
      keepContentHashes,
      reason: SUPERSEDED_PASSAGE_REJECT_REASON,
      sourceDocumentId: document.id,
    }, tx)
    return { createdIds, documentId: document.id, keepContentHashes, prioritized, rejectedCount }
  })

  const createdIds = new Set(saved.createdIds)
  const passages = [...saved.prioritized]
    .sort((a, b) => saved.keepContentHashes.indexOf(a.contentHash) - saved.keepContentHashes.indexOf(b.contentHash))
    .map((passage) => ({ id: passage.id, isNew: createdIds.has(passage.id), title: passage.title }))
  logger.info("url was imported", {
    createdCount: createdIds.size,
    path: page.path,
    prioritizedCount: passages.length,
    rejectedCount: saved.rejectedCount,
    sourceId: source.id,
  })
  return ok({
    createdCount: createdIds.size,
    passages,
    rejectedCount: saved.rejectedCount,
    sourceDocumentId: saved.documentId,
    sourceId: source.id,
  })
}
