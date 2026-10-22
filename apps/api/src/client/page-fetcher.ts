import type * as ContentExtractor from "@repo/content-extractor"
import type { PassageChunk } from "@repo/content-extractor"
import type { UrlImportErrorCode, WebsiteSource } from "@repo/domain"

/**
 * 取得を始めてから打ち切るまで。API Gateway と Lambda の 29 秒に、抽出・DB・コールドスタートの分を残して収める
 * （抽出は HTML の上限の 2MB で手元 2.6 秒かかり、Lambda ではその数倍かかる）
 */
const URL_IMPORT_FETCH_DEADLINE_MS = 15_000

/**
 * robots.txt の Crawl-delay の上限。`@repo/content-extractor` の既定の上限（30 秒）だと、1 回待つだけで取得の期限を過ぎる
 */
const URL_IMPORT_MAX_CRAWL_DELAY_SECONDS = 10

/**
 * 同じサイトへのリクエストの間隔（content-collection の「サイトの取得」の礼儀正しい取得の間隔）
 */
const URL_IMPORT_REQUEST_INTERVAL_MS = 1000

export type FetchedPage = {
  /**
   * 条件を満たさない塊も含む（rejectReasons で見分ける）
   */
  chunks: PassageChunk[]
  contentHash: string
  extractionVersion: string
  /**
   * 入れた URL からクエリとフラグメントを除いたもの（リダイレクトの前）。出典のパスはこの pathname
   */
  normalizedUrl: string
  path: string
  title: string
  wordCount: number
}

/**
 * 取得・抽出で分かる取り込めない理由（ソースの決め方で分かるものを除く）
 */
export type PageFetchErrorCode = Exclude<UrlImportErrorCode, "github_source" | "source_not_found">

export type PageFetchResult =
  | { kind: "ok"; page: FetchedPage }
  /**
   * detail は admin に出す補足（HTTP のステータス・エラーのメッセージ・対象パスに合わなかったソースの表示名）
   */
  | { code: PageFetchErrorCode; detail: string | null; kind: "failed" }

/**
 * サイトのソースの 1 ページを取得して本文を抽出するクライアントのインターフェース
 */
export interface IPageFetcher {
  /**
   * 取り込めない理由は failed で返す。それ以外の想定外のエラーは throw する
   */
  fetchAndExtractPage(input: { now: Date; source: WebsiteSource; url: string }): Promise<PageFetchResult>
}

type ContentExtractorModule = typeof ContentExtractor

type PageFetchFailure = Extract<PageFetchResult, { kind: "failed" }>

const buildFailure = (code: PageFetchErrorCode, detail: string | null): PageFetchFailure => ({ code, detail, kind: "failed" })

const convertErrorToMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const findThrownErrorCode = (error: unknown, extractor: ContentExtractorModule): PageFetchErrorCode | null => {
  if (error instanceof extractor.BlockedUrlError) return "blocked_url"
  if (error instanceof extractor.CrawlDelayTooLongError) return "crawl_delay_too_long"
  if (error instanceof extractor.WebDeadlineExceededError) return "deadline_exceeded"
  if (error instanceof extractor.WebSourceThrottledError) return "throttled"
  return null
}

/**
 * robots.txt を読む。読めなければ（5xx・ネットワークエラーなど）robots_unavailable
 */
const loadRobotsOrFailure = async (
  client: ContentExtractor.IWebPageClient,
  extractor: ContentExtractorModule,
): Promise<PageFetchFailure | null> => {
  try {
    await client.loadRobots()
    return null
  } catch (error) {
    return buildFailure(findThrownErrorCode(error, extractor) ?? "robots_unavailable", convertErrorToMessage(error))
  }
}

/**
 * ページを条件なしで取得する。取り込めない理由に当たらないエラーは throw し直す
 */
const fetchPageOrFailure = async (
  client: ContentExtractor.IWebPageClient,
  url: string,
  extractor: ContentExtractorModule,
): Promise<ContentExtractor.FetchPageResult | PageFetchFailure> => {
  try {
    return await client.fetchPage(url)
  } catch (error) {
    const code = findThrownErrorCode(error, extractor)
    if (code === null) throw error
    return buildFailure(code, convertErrorToMessage(error))
  }
}

/**
 * `@repo/content-extractor` で、サイトのソースの 1 ページを取得して抽出する（取得先の制限・robots.txt・本文の抽出は `@repo/content-extractor` の規則）。
 * 取得は始めてから URL_IMPORT_FETCH_DEADLINE_MS で打ち切る
 */
export class PageFetcher implements IPageFetcher {
  private _contactUrl: string | undefined

  constructor(contactUrl: string | undefined) {
    this._contactUrl = contactUrl
  }

  /**
   * パッケージは使うときに import() で読む。jsdom などが重く、ほかの API のコールドスタートを遅くしないため
   */
  public async fetchAndExtractPage(input: { now: Date; source: WebsiteSource; url: string }): Promise<PageFetchResult> {
    const extractor = await import("@repo/content-extractor")
    const { source } = input
    const normalizedUrl = extractor.normalizePageUrl(input.url, source.siteUrl)
    if (normalizedUrl === null) return buildFailure("blocked_url", null)
    if (!extractor.isPassageTargetUrl(normalizedUrl, source)) return buildFailure("out_of_target_path", source.name)

    const client = new extractor.WebPageClient({
      allowedOrigin: source.siteUrl,
      deadlineAt: input.now.getTime() + URL_IMPORT_FETCH_DEADLINE_MS,
      maxCrawlDelaySeconds: URL_IMPORT_MAX_CRAWL_DELAY_SECONDS,
      requestIntervalMs: URL_IMPORT_REQUEST_INTERVAL_MS,
      userAgent: extractor.buildCollectorUserAgent(this._contactUrl),
    })
    const robotsFailure = await loadRobotsOrFailure(client, extractor)
    if (robotsFailure !== null) return robotsFailure
    if (!client.isAllowedByRobots(normalizedUrl)) return buildFailure("robots_disallowed", null)

    const fetched = await fetchPageOrFailure(client, normalizedUrl, extractor)
    switch (fetched.kind) {
    case "failed":
      return fetched
    case "http_error":
      return buildFailure("http_error", String(fetched.status))
    case "network_error":
      return buildFailure("network_error", fetched.errorMessage)
    case "skipped":
      return buildFailure(fetched.reason, null)
    case "ok":
      break
    }
    if (!extractor.isPassageTargetUrl(fetched.finalUrl, source)) return buildFailure("redirected_out_of_target", fetched.finalUrl)

    const path = new URL(normalizedUrl).pathname
    let extracted: ContentExtractor.ExtractedDocument
    try {
      extracted = extractor.extractWebPage(source, { body: fetched.body, finalUrl: fetched.finalUrl, path })
    } catch (error) {
      return buildFailure("extraction_failed", convertErrorToMessage(error))
    }
    return {
      kind: "ok",
      page: {
        chunks: extracted.chunks,
        contentHash: extracted.contentHash,
        extractionVersion: extractor.EXTRACTION_VERSION,
        normalizedUrl,
        path,
        title: extracted.title,
        wordCount: extracted.wordCount,
      },
    }
  }
}
