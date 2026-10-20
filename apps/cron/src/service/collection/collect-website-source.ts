import type { SourceDocument, WebsiteSource } from "@repo/domain"
import { logger } from "@repo/logger"

import {
  CrawlDelayTooLongError,
  type FetchPageResult,
  type IWebPageClient,
  type SitemapUrl,
  WebSourceThrottledError,
} from "../../client/web"
import { COLLECT_RUN_INTERVAL_MS, GONE_HTTP_STATUSES, MAX_CONSECUTIVE_NETWORK_ERRORS } from "../../const/collection"
import { EXTRACTION_VERSION, type ExtractedDocument } from "../../lib/document"
import { isTargetPath } from "../../lib/path-filter"
import type { DiscoveredDocumentInput } from "../../repository"

import { rejectOutOfTargetPassages } from "./reject-out-of-target-passages"
import { replacePassageCandidates } from "./replace-passage-candidates"
import type { CollectionDeps, CollectionRepo, SourceCollectionResult, SourceCollectionStatus } from "./types"
import {
  buildPageUrl,
  extractWebPage,
  findFetchablePagePath,
  findStartPagePath,
  isPassageTargetUrl,
  selectFetchablePagePaths,
} from "./website-pages"

export type CollectWebsiteSourceInput = {
  /**
   * このソースから取得するページ数の上限（取得待ちの行をこの件数まで取る）
   */
  maxDocuments: number
  /**
   * このソースで作る本文候補数の上限（実行全体の残り）
   */
  maxPassages: number
  now: Date
  /**
   * 取得してからこの日数がたったページを取り直す
   */
  refetchDays: number
  source: WebsiteSource
}

type WebsiteCollectionDeps = Pick<CollectionDeps, "createWebPageClient">

type Progress = {
  createdPassageCount: number
  fetchedDocumentCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 切り分けたときの抽出の版が今と違うか（未取得・列を足す前に取得したページを含む）
 */
const isExtractionOutdated = (document: SourceDocument): boolean => document.extractionVersion !== EXTRACTION_VERSION

const isGonePage = (document: SourceDocument): boolean =>
  document.httpStatus !== null && GONE_HTTP_STATUSES.includes(document.httpStatus)

/**
 * Retry-After（秒数か HTTP の日時）を日時にする。読めなければ null
 */
const parseRetryAfter = (retryAfter: string, now: Date): Date | null => {
  const trimmed = retryAfter.trim()
  if (/^\d+$/.test(trimmed)) return new Date(now.getTime() + Number(trimmed) * 1000)
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Retry-After が次回の実行（約 24 時間後）より先なら warn を出す。次回の実行は Retry-After より前に再開してしまうため
 */
const warnIfRetryAfterIsBeyondNextRun = (error: WebSourceThrottledError, now: Date, sourceId: number): void => {
  const retryAt = error.retryAfter === null ? null : parseRetryAfter(error.retryAfter, now)
  if (retryAt !== null && retryAt.getTime() > now.getTime() + COLLECT_RUN_INTERVAL_MS) {
    logger.warn("Retry-After is later than the next run", { retryAfter: error.retryAfter, sourceId, url: error.url })
  }
}

/**
 * ソースを失敗にせずに打ち切る例外（Crawl-delay が上限を超える・429 / 503）なら warn を出して終わり方を返す。それ以外は throw し直す
 */
const resolveAbortedStatus = (error: unknown, now: Date, sourceId: number): "crawl_delay_too_long" | "throttled" => {
  if (error instanceof CrawlDelayTooLongError) {
    logger.warn("Crawl-delay in robots.txt exceeds the limit; the source is skipped in this run", {
      crawlDelaySeconds: error.crawlDelaySeconds,
      maxCrawlDelaySeconds: error.maxCrawlDelaySeconds,
      sourceId,
      url: error.url,
    })
    return "crawl_delay_too_long"
  }
  if (error instanceof WebSourceThrottledError) {
    logger.warn("site is throttling requests; remaining pages are left for the next run", {
      retryAfter: error.retryAfter,
      sourceId,
      status: error.status,
      url: error.url,
    })
    warnIfRetryAfterIsBeyondNextRun(error, now, sourceId)
    return "throttled"
  }
  throw error
}

/**
 * sitemap の URL を取得してよいものに絞って path にする。同じ path が複数あれば lastmod が新しい方を残す
 */
const buildSitemapInputs = (
  sitemapUrls: SitemapUrl[],
  base: string,
  source: WebsiteSource,
  client: IWebPageClient,
): DiscoveredDocumentInput[] => {
  const lastmodByPath = new Map<string, Date | null>()
  for (const { lastmod, url } of sitemapUrls) {
    const path = findFetchablePagePath(url, base, source, client)
    if (path === null) continue
    const current = lastmodByPath.get(path)
    if (current === undefined || (lastmod !== null && (current === null || lastmod > current))) {
      lastmodByPath.set(path, lastmod)
    }
  }
  return [...lastmodByPath].map(([path, sitemapLastmod]) => ({ path, sitemapLastmod }))
}

/**
 * sitemap と開始ページから URL を見つけて source_documents に未取得の行として入れる。
 * sitemap は取得してよい URL だけ、開始ページは対象パスに合わなくても（リンクをたどるために）入れる（毎回入れても冪等）
 */
const discoverDocuments = async (source: WebsiteSource, repo: CollectionRepo, client: IWebPageClient): Promise<void> => {
  if (source.sitemapUrl !== null) {
    const sitemapUrls = await client.fetchSitemapUrls(source.sitemapUrl)
    const inputs = buildSitemapInputs(sitemapUrls, source.sitemapUrl, source, client)
    logger.info("sitemap URLs discovered", { discoveredCount: inputs.length, sitemapUrlCount: sitemapUrls.length, sourceId: source.id })
    if (inputs.length > 0) {
      await repo.sourceDocumentRepository.upsertDiscovered(source.id, inputs, { shouldReviveGone: false })
    }
  }

  const startPath = findStartPagePath(source)
  if (startPath !== null) {
    await repo.sourceDocumentRepository.upsertDiscovered(
      source.id,
      [{ path: startPath, sitemapLastmod: null }],
      { shouldReviveGone: false },
    )
  }
}

/**
 * 本文を抽出する。不正な CSS セレクタなど throw したページは warn を出して null（本文候補 0 件として扱う）
 */
const extractPageSafely = (
  source: WebsiteSource,
  page: { body: string; finalUrl: string; path: string },
): ExtractedDocument | null => {
  try {
    return extractWebPage(source, page)
  } catch (error) {
    logger.warn("failed to extract document", {
      error: error instanceof Error ? error.message : String(error),
      path: page.path,
      sourceId: source.id,
    })
    return null
  }
}

/**
 * 200 のページを保存し、作った本文候補の件数を返す。
 *
 * 1. 本文を抽出する。失敗したら（不正な CSS セレクタなど）markResponse で取得の時刻だけ記録して終える
 * 2. ページ内のリンクのうち取得してよいものを未取得の行として入れる（404 / 410 の行は対象に戻す）
 * 3. 対象パスのページで、本文のハッシュが前回と違うか、切り分けたときの抽出の版が古ければ本文候補を保存する（前の切り分けの collected は却下する）。
 *    開始ページなど対象パス外のページと、リダイレクトの行き先が対象パス外・除外パス・ページでない拡張子のページはリンクだけ使う
 * 4. 最後に markFetched（ハッシュ・ETag・Last-Modified・抽出の版の記録）。途中で落ちても次回やり直し、挿入済みの本文候補は unique で弾く
 */
const savePage = async (
  input: { client: IWebPageClient; document: SourceDocument; now: Date; page: Extract<FetchPageResult, { kind: "ok" }>; source: WebsiteSource },
  repo: CollectionRepo,
): Promise<number> => {
  const { client, document, now, page, source } = input
  const extracted = extractPageSafely(source, { body: page.body, finalUrl: page.finalUrl, path: document.path })
  if (extracted === null) {
    /**
     * ETag / Last-Modified / ハッシュは保存しない。保存すると次回から 304 か同じハッシュで止まり、
     * セレクタを直してもページが変わるまで抽出し直されない
     */
    await repo.sourceDocumentRepository.markResponse(document.id, { fetchedAt: now, httpStatus: page.status })
    return 0
  }

  const linkPaths = selectFetchablePagePaths(extracted.links, page.finalUrl, source, client)
  if (linkPaths.length > 0) {
    await repo.sourceDocumentRepository.upsertDiscovered(
      source.id,
      linkPaths.map((path) => ({ path, sitemapLastmod: null })),
      { shouldReviveGone: true },
    )
  }

  const isTargetPage = isTargetPath(document.path, source)
  const isRedirectedOutOfTarget = isTargetPage && !isPassageTargetUrl(page.finalUrl, source)
  if (isRedirectedOutOfTarget) {
    logger.info("page was redirected outside the target paths; no passages are created", {
      finalUrl: page.finalUrl,
      path: document.path,
      sourceId: source.id,
    })
  }
  const shouldCreatePassages = isTargetPage
    && !isRedirectedOutOfTarget
    && (extracted.contentHash !== document.contentHash || isExtractionOutdated(document))
  const createdPassageCount = shouldCreatePassages
    ? await replacePassageCandidates({
      candidates: extracted.candidates,
      documentId: document.id,
      now,
      sourceCommitSha: null,
      sourceId: source.id,
      sourcePath: document.path,
    }, repo)
    : 0
  await repo.sourceDocumentRepository.markFetched(document.id, {
    blobSha: null,
    commitSha: null,
    contentHash: extracted.contentHash,
    etag: page.etag,
    extractionVersion: EXTRACTION_VERSION,
    fetchedAt: now,
    httpStatus: page.status,
    lastModified: page.lastModified,
    title: extracted.title,
  })
  return createdPassageCount
}

/**
 * ページを取得する。切り分けたときの抽出の版が古いページは、304 で止まらないよう条件付きリクエストを送らない。
 * 429 / 503（WebSourceThrottledError）は、その行に試した時刻を記録してから throw し直す
 * （記録しないと次回も同じ行が先頭に来て、429 / 503 を返し続けるページがソース全体を止めるため）
 */
const fetchPageRecordingThrottle = async (
  input: { client: IWebPageClient; document: SourceDocument; now: Date; url: string },
  repo: CollectionRepo,
): Promise<FetchPageResult> => {
  const { client, document, now, url } = input
  try {
    return await client.fetchPage(
      url,
      isExtractionOutdated(document)
        ? { etag: null, lastModified: null }
        : { etag: document.etag, lastModified: document.lastModified },
    )
  } catch (error) {
    if (error instanceof WebSourceThrottledError) {
      await repo.sourceDocumentRepository.markResponse(document.id, { fetchedAt: now, httpStatus: error.status })
    }
    throw error
  }
}

/**
 * 取得待ちの行を順に取得する。本文候補の上限で抜けたら limit_reached を、全部処理したら completed / limit_reached を返す。
 *
 * 取得できなかった行（ネットワークエラー・429 / 503）も fetched_at に試した時刻を入れ、待ち行列から外す
 * （COLLECT_WEB_REFETCH_DAYS 日後に取り直す）。入れないと次回も同じ行が先頭に来て、取得できないページが残りのページを塞ぐ。
 * ネットワークエラーが MAX_CONSECUTIVE_NETWORK_ERRORS 回続いたら throw する（サイトの障害で残りのページのタイムアウトを待たないため）。
 * 429 / 503 は WebSourceThrottledError が上に伝わる
 */
const fetchQueuedDocuments = async (
  input: CollectWebsiteSourceInput & { client: IWebPageClient; progress: Progress; queue: SourceDocument[] },
  repo: CollectionRepo,
): Promise<Exclude<SourceCollectionStatus, "crawl_delay_too_long" | "rate_limited" | "throttled" | "up_to_date">> => {
  const { client, now, progress, queue, source } = input
  let consecutiveNetworkErrorCount = 0
  for (const document of queue) {
    if (progress.createdPassageCount >= input.maxPassages) return "limit_reached"

    const url = buildPageUrl(source, document.path)
    const result = await fetchPageRecordingThrottle({ client, document, now, url }, repo)
    if (result.kind === "network_error") {
      consecutiveNetworkErrorCount += 1
      logger.warn("page fetch failed", { error: result.errorMessage, path: document.path, sourceId: source.id })
      await repo.sourceDocumentRepository.markResponse(document.id, { fetchedAt: now, httpStatus: null })
      if (consecutiveNetworkErrorCount >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
        throw new Error(`Network errors occurred ${consecutiveNetworkErrorCount} times in a row: ${url}`)
      }
      continue
    }
    consecutiveNetworkErrorCount = 0
    progress.fetchedDocumentCount += 1

    switch (result.kind) {
    case "ok":
      progress.createdPassageCount += await savePage({ client, document, now, page: result, source }, repo)
      break
    case "not_modified":
      await repo.sourceDocumentRepository.markResponse(document.id, { fetchedAt: now, httpStatus: result.status })
      break
    case "http_error":
      logger.info("page returned an HTTP error", { path: document.path, sourceId: source.id, status: result.status })
      await repo.sourceDocumentRepository.markResponse(document.id, { fetchedAt: now, httpStatus: result.status })
      break
    case "skipped":
      logger.info("page skipped", { path: document.path, reason: result.reason, sourceId: source.id, status: result.status })
      await repo.sourceDocumentRepository.markResponse(document.id, { fetchedAt: now, httpStatus: result.status })
      break
    }
  }
  return queue.length >= input.maxDocuments ? "limit_reached" : "completed"
}

/**
 * 公式ドキュメントのサイトのソースを 1 つ収集する。source_documents をクロールの待ち行列として使う。
 *
 * 1. 対象パスから外れたページと 404 / 410 のページの collected を却下する（404 / 410 になったページは、その次の回で却下する）
 * 2. robots.txt を読む（読めなければ throw。Crawl-delay が上限を超えていれば crawl_delay_too_long で打ち切る）
 * 3. sitemap と開始ページから URL を見つけて未取得の行として入れる
 * 4. 取得待ちの行（未取得 → 取得から refetchDays 日たったもの）を maxDocuments 件まで、条件付きリクエストで取得する
 *    （抽出の版が古いページは条件を付けない）
 * 5. 200 のページはリンクを未取得の行として入れ、本文のハッシュが前回と違うか抽出の版が古ければ本文候補を作る
 *
 * Crawl-delay が上限を超えるサイトと 429 / 503 はそのソースを打ち切る（失敗にしない）。
 * 取得先の制限（BlockedUrlError）と robots.txt の読込み失敗は throw する。
 * last_collected_at は取得を最後まで終えたとき（completed / limit_reached）だけ進める
 */
export const collectWebsiteSource = async (
  input: CollectWebsiteSourceInput,
  repo: CollectionRepo,
  deps: WebsiteCollectionDeps,
): Promise<SourceCollectionResult> => {
  const { now, source } = input
  const client = deps.createWebPageClient(source.siteUrl)
  const progress: Progress = { createdPassageCount: 0, fetchedDocumentCount: 0 }
  await rejectOutOfTargetPassages({
    isOutOfTarget: (document) => !isTargetPath(document.path, source) || isGonePage(document),
    sourceId: source.id,
  }, repo)
  let status: SourceCollectionStatus
  try {
    await client.loadRobots()
    await discoverDocuments(source, repo, client)
    const queue = await repo.sourceDocumentRepository.findFetchQueue({
      limit: input.maxDocuments,
      refetchBefore: new Date(now.getTime() - input.refetchDays * DAY_MS),
      sourceId: source.id,
    })
    logger.info("website fetch queue loaded", { queuedDocumentCount: queue.length, sourceId: source.id })
    status = await fetchQueuedDocuments({ ...input, client, progress, queue }, repo)
  } catch (error) {
    status = resolveAbortedStatus(error, now, source.id)
  }

  /**
   * 429 / 503・Crawl-delay で途中で終えたソースは進めない（最終収集の表示が実際より新しくならないように。
   * findEnabled は last_collected_at の古い順なので、次回の実行で先に処理される）
   */
  if (status === "completed" || status === "limit_reached") {
    await repo.contentSourceRepository.markCollected(source.id, { lastCollectedAt: now })
  }
  return { ...progress, status }
}
