import { setTimeout as delay } from "node:timers/promises"

import robotsParser from "robots-parser"
import { Agent, type Dispatcher, fetch as undiciFetch, type Response } from "undici"

import { logger } from "@repo/logger"

import {
  CRAWLER_NAME,
  MAX_CHILD_SITEMAPS,
  MAX_CRAWL_DELAY_SECONDS,
  MAX_HTML_BYTES,
  MAX_REDIRECTS,
  MAX_SITEMAP_BYTES,
  WEB_REQUEST_TIMEOUT_MS,
} from "../const"
import { type ParsedSitemap, parseSitemap } from "../parse-sitemap"

import { BlockedUrlError, CrawlDelayTooLongError, WebDeadlineExceededError, WebSourceThrottledError } from "./errors"
import { createSafeLookup, isBlockedIpLiteral } from "./safe-lookup"

/**
 * 条件付きリクエストに使う前回のレスポンスの値。どちらも null なら条件付きにしない
 */
export type ConditionalRequest = {
  etag: string | null
  lastModified: string | null
}

/**
 * ページを取得しなかった理由
 */
export type FetchPageSkipReason = "not_html" | "redirect_not_allowed" | "robots_disallowed" | "too_large" | "too_many_redirects"

export type FetchPageResult =
  | { body: string; etag: string | null; finalUrl: string; kind: "ok"; lastModified: string | null; status: number }
  | { kind: "not_modified"; status: 304 }
  /**
   * 404 / 410 と、429 / 503 以外の 4xx・5xx
   */
  | { kind: "http_error"; status: number }
  /**
   * タイムアウト・接続エラー
   */
  | { errorMessage: string; kind: "network_error" }
  | { kind: "skipped"; reason: FetchPageSkipReason; status: number | null }

/**
 * sitemap に載っていたページの URL（正規化していない `<loc>` のまま）
 */
export type SitemapUrl = {
  lastmod: Date | null
  url: string
}

/**
 * 1 つのサイト（オリジン）を礼儀正しく取得するクライアントのインターフェース
 */
export interface IWebPageClient {
  /**
   * 429 / 503 は WebSourceThrottledError、取得先の制限に掛かった URL は BlockedUrlError を throw する
   */
  fetchPage(url: string, conditional: ConditionalRequest): Promise<FetchPageResult>
  /**
   * sitemap index なら同じオリジンの子の sitemap を読んで、ページの URL をまとめて返す
   */
  fetchSitemapUrls(sitemapUrl: string): Promise<SitemapUrl[]>
  /**
   * robots.txt で許可されている URL か。loadRobots の前は false
   */
  isAllowedByRobots(url: string): boolean
  /**
   * robots.txt を読む。読めない（5xx・ネットワークエラー）なら throw する（読めないまま取得しない）。
   * Crawl-delay が MAX_CRAWL_DELAY_SECONDS を超えていれば CrawlDelayTooLongError を throw する
   */
  loadRobots(): Promise<void>
}

export type WebPageClientOptions = {
  /**
   * ソースのサイトの URL。このオリジンの外には取りに行かない
   */
  allowedOrigin: string
  /**
   * 取得の期限（epoch ミリ秒）。期限を過ぎるリクエストは送らずに WebDeadlineExceededError を throw する。省略時は期限なし
   */
  deadlineAt?: number
  /**
   * テストで差し替える。既定は undici の fetch（undici の Agent を dispatcher に渡すため、グローバルの fetch は使わない）
   */
  fetch?: typeof undiciFetch
  /**
   * robots.txt の Crawl-delay（秒）の上限。省略時は MAX_CRAWL_DELAY_SECONDS
   */
  maxCrawlDelaySeconds?: number
  /**
   * テストで差し替える。既定は Date.now
   */
  now?: () => number
  /**
   * 同じオリジンへのリクエストの間隔（ミリ秒）。robots.txt の Crawl-delay の方が長ければそちらに従う（上限は maxCrawlDelaySeconds）
   */
  requestIntervalMs: number
  /**
   * テストで差し替える。既定は timers/promises の setTimeout
   */
  sleep?: (ms: number) => Promise<void>
  userAgent: string
}

type Robots = ReturnType<typeof robotsParser>

/**
 * リダイレクトをたどった結果。たどり着いたレスポンスか、取得しなかった・できなかった理由
 */
type RequestResult =
  | { finalUrl: string; kind: "response"; response: Response }
  | { errorMessage: string; kind: "network_error" }
  | { kind: "skipped"; reason: "redirect_not_allowed" | "robots_disallowed" | "too_many_redirects"; status: number | null }

type ReadBodyResult =
  | { bytes: Uint8Array; kind: "ok" }
  | { errorMessage: string; kind: "network_error" }
  | { kind: "too_large" }

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"

const ROBOTS_ACCEPT = "text/plain,*/*;q=0.1"

const SITEMAP_ACCEPT = "application/xml,text/xml;q=0.9,*/*;q=0.1"

/**
 * robots.txt のサイズの上限（Google と同じ 500 KiB）
 */
const MAX_ROBOTS_TXT_BYTES = 500 * 1024

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const THROTTLED_STATUSES = new Set([429, 503])

const EMPTY_SITEMAP: ParsedSitemap = { sitemaps: [], urls: [] }

const sleepWithTimer = async (ms: number): Promise<void> => {
  await delay(ms)
}

/**
 * Error の cause（tsconfig の lib が ES2020 で型に無いため取り出す）
 */
const readCause = (error: Error): unknown => (error as Error & { cause?: unknown }).cause

const formatErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const cause = readCause(error)
  return cause instanceof Error ? `${error.message}: ${cause.message}` : error.message
}

/**
 * undici は lookup のエラーを `TypeError: fetch failed` の cause に包むので、cause をたどって BlockedUrlError を探す
 */
const findBlockedUrlError = (error: unknown): BlockedUrlError | null => {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current instanceof BlockedUrlError) return current
    current = readCause(current)
  }
  return null
}

/**
 * 読まないレスポンスの本文を捨てる（接続を解放するため）
 */
const discardBody = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined)
}

/**
 * 本文を maxBytes まで読む。超えたら読むのをやめて too_large、途中で切れたら（タイムアウトなど）network_error
 */
const readBodyWithLimit = async (response: Response, maxBytes: number): Promise<ReadBodyResult> => {
  if (!response.body) return { bytes: new Uint8Array(0), kind: "ok" }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { kind: "too_large" }
      }
      chunks.push(value)
    }
  } catch (error) {
    return { errorMessage: formatErrorMessage(error), kind: "network_error" }
  }
  return { bytes: Buffer.concat(chunks), kind: "ok" }
}

/**
 * Content-Type のメディアタイプ（`text/html; charset=utf-8` → `text/html`）
 */
const parseMediaType = (contentType: string | null): string => (contentType ?? "").split(";")[0].trim().toLowerCase()

/**
 * Content-Type の charset（無ければ UTF-8）で復号する。対応していない charset は UTF-8 にする
 */
const decodeBody = (bytes: Uint8Array, contentType: string | null): string => {
  const charset = /charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType ?? "")?.[1] ?? "utf-8"
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}

/**
 * Content-Length が maxBytes を超えるか。無い・数値でなければ false（読みながら確かめる）
 */
const isDeclaredTooLarge = (response: Response, maxBytes: number): boolean => {
  const contentLength = Number(response.headers.get("content-length") ?? "")
  return Number.isFinite(contentLength) && contentLength > maxBytes
}

/**
 * 1 つのサイト（オリジン）を取得するクライアント。1 ソースにつき 1 つ作り、オリジン・robots.txt・リクエストの間隔をソース単位で持つ。
 *
 * 取得先の制限（SSRF 対策）は 3 層で行う：
 * 1. URL：リクエストの前（リダイレクト先も）に https かつ同じオリジンかを確かめる。IP アドレスのホストはここで範囲も確かめる
 * 2. 接続先の IP：undici の Agent の connect.lookup に createSafeLookup を渡し、接続のときに名前解決した全アドレスを検査する
 * 3. リダイレクト：redirect: "manual" で自分でたどり、最大 MAX_REDIRECTS 回、毎回 1 と robots.txt を検査する
 *
 * すべてのリクエストは直列で、前回の開始から max(requestIntervalMs, Crawl-delay) 空ける。Crawl-delay が maxCrawlDelaySeconds を
 * 超えるサイトは loadRobots で CrawlDelayTooLongError を throw する（従うと処理が長時間止まるため）。
 * deadlineAt を渡したときは、期限を過ぎるリクエストを送らず、各リクエストのタイムアウトも期限までに縮める。env は読まずコンストラクタで受ける
 */
export class WebPageClient implements IWebPageClient {
  private _crawlDelayMs = 0
  private _deadlineAt: number | null
  private _dispatcher: Dispatcher
  private _fetch: typeof undiciFetch
  private _lastRequestStartedAt: number | null = null
  private _maxCrawlDelaySeconds: number
  private _now: () => number
  private _origin: string
  private _requestIntervalMs: number
  private _robots: Robots | null = null
  private _sleep: (ms: number) => Promise<void>
  private _userAgent: string

  constructor(options: WebPageClientOptions) {
    this._origin = new URL(options.allowedOrigin).origin
    this._deadlineAt = options.deadlineAt ?? null
    this._dispatcher = new Agent({ connect: { lookup: createSafeLookup() } })
    this._fetch = options.fetch ?? undiciFetch
    this._maxCrawlDelaySeconds = options.maxCrawlDelaySeconds ?? MAX_CRAWL_DELAY_SECONDS
    this._now = options.now ?? Date.now
    this._requestIntervalMs = options.requestIntervalMs
    this._sleep = options.sleep ?? sleepWithTimer
    this._userAgent = options.userAgent
  }

  public async fetchPage(url: string, conditional: ConditionalRequest): Promise<FetchPageResult> {
    const result = await this._requestFollowingRedirects(url, { accept: HTML_ACCEPT, checkRobots: true, conditional })
    if (result.kind !== "response") return result
    const { finalUrl, response } = result
    if (response.status === 304) {
      await discardBody(response)
      return { kind: "not_modified", status: 304 }
    }
    await this._throwIfThrottled(response, finalUrl)
    if (!response.ok) {
      await discardBody(response)
      return { kind: "http_error", status: response.status }
    }
    const contentType = response.headers.get("content-type")
    if (parseMediaType(contentType) !== "text/html") {
      await discardBody(response)
      return { kind: "skipped", reason: "not_html", status: response.status }
    }
    if (isDeclaredTooLarge(response, MAX_HTML_BYTES)) {
      await discardBody(response)
      return { kind: "skipped", reason: "too_large", status: response.status }
    }
    const body = await readBodyWithLimit(response, MAX_HTML_BYTES)
    if (body.kind === "too_large") return { kind: "skipped", reason: "too_large", status: response.status }
    if (body.kind === "network_error") {
      this._throwIfDeadlinePassed(url)
      return body
    }
    return {
      body: decodeBody(body.bytes, contentType),
      etag: response.headers.get("etag"),
      finalUrl,
      kind: "ok",
      lastModified: response.headers.get("last-modified"),
      status: response.status,
    }
  }

  public async fetchSitemapUrls(sitemapUrl: string): Promise<SitemapUrl[]> {
    const sitemap = await this._fetchSitemap(sitemapUrl)
    if (sitemap.sitemaps.length === 0) {
      return sitemap.urls.map((entry) => ({ lastmod: entry.lastmod, url: entry.loc }))
    }

    const childUrls = this._selectChildSitemapUrls(sitemap.sitemaps.map((entry) => entry.loc), sitemapUrl)
    const urls: SitemapUrl[] = []
    for (const childUrl of childUrls) {
      const child = await this._fetchSitemap(childUrl)
      if (child.sitemaps.length > 0) {
        logger.warn("nested sitemap index is not supported; skipped", { url: childUrl })
      }
      urls.push(...child.urls.map((entry) => ({ lastmod: entry.lastmod, url: entry.loc })))
    }
    return urls
  }

  public isAllowedByRobots(url: string): boolean {
    return this._robots?.isAllowed(url, CRAWLER_NAME) === true
  }

  public async loadRobots(): Promise<void> {
    const robotsUrl = `${this._origin}/robots.txt`
    const result = await this._requestFollowingRedirects(robotsUrl, {
      accept: ROBOTS_ACCEPT,
      checkRobots: false,
      conditional: null,
    })
    if (result.kind === "network_error") throw new Error(`Failed to fetch robots.txt: ${result.errorMessage} (${robotsUrl})`)
    if (result.kind === "skipped") throw new Error(`Failed to fetch robots.txt: ${result.reason} (${robotsUrl})`)

    const { response } = result
    await this._throwIfThrottled(response, robotsUrl)
    /**
     * 4xx（robots.txt が無い）は全許可。5xx などそれ以外の失敗は、読めないまま取得しないよう throw する
     */
    if (response.status >= 400 && response.status < 500) {
      await discardBody(response)
      this._setRobots(robotsUrl, "")
      return
    }
    if (!response.ok) {
      await discardBody(response)
      throw new Error(`Failed to fetch robots.txt: ${response.status} (${robotsUrl})`)
    }
    const body = await readBodyWithLimit(response, MAX_ROBOTS_TXT_BYTES)
    if (body.kind === "network_error") throw new Error(`Failed to fetch robots.txt: ${body.errorMessage} (${robotsUrl})`)
    if (body.kind === "too_large") throw new Error(`robots.txt is too large (${robotsUrl})`)
    this._setRobots(robotsUrl, new TextDecoder("utf-8").decode(body.bytes))
  }

  /**
   * リクエストの前の URL の検査。https 以外・別のオリジン・弾く範囲の IP アドレスのホストなら BlockedUrlError
   */
  private _assertAllowedUrl(url: string): void {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new BlockedUrlError(url)
    }
    if (parsed.protocol !== "https:" || parsed.origin !== this._origin || isBlockedIpLiteral(parsed.hostname)) {
      throw new BlockedUrlError(url)
    }
  }

  private _buildHeaders(accept: string, conditional: ConditionalRequest | null): Record<string, string> {
    return {
      Accept: accept,
      "User-Agent": this._userAgent,
      ...(conditional?.etag ? { "If-None-Match": conditional.etag } : {}),
      ...(conditional?.lastModified ? { "If-Modified-Since": conditional.lastModified } : {}),
    }
  }

  /**
   * sitemap を 1 つ取得して読む。`.gz`・取得できない・大きすぎる sitemap は warn を出して空にする（ページの取得は続ける）
   */
  private async _fetchSitemap(url: string): Promise<ParsedSitemap> {
    this._assertAllowedUrl(url)
    if (new URL(url).pathname.toLowerCase().endsWith(".gz")) {
      logger.warn("gzipped sitemap is not supported; skipped", { url })
      return EMPTY_SITEMAP
    }
    const result = await this._requestFollowingRedirects(url, { accept: SITEMAP_ACCEPT, checkRobots: false, conditional: null })
    if (result.kind !== "response") {
      logger.warn("failed to fetch sitemap; skipped", { ...result, url })
      return EMPTY_SITEMAP
    }
    const { response } = result
    await this._throwIfThrottled(response, url)
    if (!response.ok) {
      await discardBody(response)
      logger.warn("failed to fetch sitemap; skipped", { status: response.status, url })
      return EMPTY_SITEMAP
    }
    if (isDeclaredTooLarge(response, MAX_SITEMAP_BYTES)) {
      await discardBody(response)
      logger.warn("failed to read sitemap; skipped", { kind: "too_large", url })
      return EMPTY_SITEMAP
    }
    const body = await readBodyWithLimit(response, MAX_SITEMAP_BYTES)
    if (body.kind !== "ok") {
      logger.warn("failed to read sitemap; skipped", { ...body, url })
      return EMPTY_SITEMAP
    }
    return parseSitemap(new TextDecoder("utf-8").decode(body.bytes))
  }

  /**
   * URL を検査し、リダイレクトを同じオリジンの中で最大 MAX_REDIRECTS 回たどる。
   * 最初の URL が制限に掛かれば BlockedUrlError を throw し、リダイレクト先が掛かれば redirect_not_allowed で止める
   */
  private async _requestFollowingRedirects(
    url: string,
    options: { accept: string; checkRobots: boolean; conditional: ConditionalRequest | null },
  ): Promise<RequestResult> {
    this._assertAllowedUrl(url)
    let currentUrl = url
    for (let redirectCount = 0; ; redirectCount += 1) {
      if (options.checkRobots && !this.isAllowedByRobots(currentUrl)) {
        return { kind: "skipped", reason: "robots_disallowed", status: null }
      }
      const response = await this._send(currentUrl, this._buildHeaders(options.accept, options.conditional))
      if (response.kind === "network_error") return response
      const location = REDIRECT_STATUSES.has(response.value.status) ? response.value.headers.get("location") : null
      if (location === null) return { finalUrl: currentUrl, kind: "response", response: response.value }

      await discardBody(response.value)
      if (redirectCount >= MAX_REDIRECTS) {
        return { kind: "skipped", reason: "too_many_redirects", status: response.value.status }
      }
      const nextUrl = this._resolveRedirectUrl(location, currentUrl)
      if (nextUrl === null) return { kind: "skipped", reason: "redirect_not_allowed", status: response.value.status }
      currentUrl = nextUrl
    }
  }

  /**
   * Location を解決する。https かつ同じオリジンでなければ null（たどらない）
   */
  private _resolveRedirectUrl(location: string, base: string): string | null {
    try {
      const url = new URL(location, base)
      return url.protocol === "https:" && url.origin === this._origin && !isBlockedIpLiteral(url.hostname)
        ? url.toString()
        : null
    } catch {
      return null
    }
  }

  /**
   * sitemap index の子のうち、https かつ同じオリジンのものを先頭から MAX_CHILD_SITEMAPS 個
   */
  private _selectChildSitemapUrls(locs: string[], indexUrl: string): string[] {
    const sameOriginUrls = locs.filter((loc) => {
      try {
        const url = new URL(loc)
        return url.protocol === "https:" && url.origin === this._origin
      } catch {
        return false
      }
    })
    if (sameOriginUrls.length < locs.length) {
      logger.warn("child sitemaps outside the site are skipped", {
        skippedCount: locs.length - sameOriginUrls.length,
        url: indexUrl,
      })
    }
    if (sameOriginUrls.length > MAX_CHILD_SITEMAPS) {
      logger.warn("too many child sitemaps; only the first ones are fetched", {
        childSitemapCount: sameOriginUrls.length,
        maxChildSitemaps: MAX_CHILD_SITEMAPS,
        url: indexUrl,
      })
    }
    return sameOriginUrls.slice(0, MAX_CHILD_SITEMAPS)
  }

  /**
   * 間隔を空けてから 1 リクエストを送る（リダイレクトはたどらない）。
   * タイムアウト・接続エラーは network_error にし、取得先の制限（lookup の BlockedUrlError）は throw する
   */
  private async _send(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ kind: "response"; value: Response } | { errorMessage: string; kind: "network_error" }> {
    await this._waitForTurn(url)
    logger.debug("web request", { url })
    try {
      const response = await this._fetch(url, {
        dispatcher: this._dispatcher,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(this._calculateTimeoutMs()),
      })
      return { kind: "response", value: response }
    } catch (error) {
      const blocked = findBlockedUrlError(error)
      if (blocked) throw blocked
      this._throwIfDeadlinePassed(url)
      return { errorMessage: formatErrorMessage(error), kind: "network_error" }
    }
  }

  /**
   * 1 リクエストのタイムアウト。期限があれば期限までの残りに縮める
   */
  private _calculateTimeoutMs(): number {
    return this._deadlineAt === null
      ? WEB_REQUEST_TIMEOUT_MS
      : Math.max(1, Math.min(WEB_REQUEST_TIMEOUT_MS, this._deadlineAt - this._now()))
  }

  /**
   * 期限を過ぎていれば WebDeadlineExceededError を throw する（期限までに縮めたタイムアウトで止まったリクエストを、ネットワークエラーと分けるため）
   */
  private _throwIfDeadlinePassed(url: string): void {
    if (this._deadlineAt !== null && this._now() >= this._deadlineAt) {
      throw new WebDeadlineExceededError({ deadlineAt: this._deadlineAt, url })
    }
  }

  /**
   * robots.txt の内容を持つ。Crawl-delay が maxCrawlDelaySeconds を超えていれば CrawlDelayTooLongError を throw する
   */
  private _setRobots(robotsUrl: string, content: string): void {
    const robots = robotsParser(robotsUrl, content)
    const crawlDelay = robots.getCrawlDelay(CRAWLER_NAME)
    if (crawlDelay !== undefined && crawlDelay > this._maxCrawlDelaySeconds) {
      throw new CrawlDelayTooLongError({ crawlDelaySeconds: crawlDelay, maxCrawlDelaySeconds: this._maxCrawlDelaySeconds, url: robotsUrl })
    }
    this._robots = robots
    this._crawlDelayMs = crawlDelay !== undefined && Number.isFinite(crawlDelay) && crawlDelay > 0 ? crawlDelay * 1000 : 0
  }

  /**
   * 429 / 503 なら本文を捨てて WebSourceThrottledError を throw する
   */
  private async _throwIfThrottled(response: Response, url: string): Promise<void> {
    if (!THROTTLED_STATUSES.has(response.status)) return
    await discardBody(response)
    throw new WebSourceThrottledError({ retryAfter: response.headers.get("retry-after"), status: response.status, url })
  }

  /**
   * 前回のリクエストの開始から max(requestIntervalMs, Crawl-delay) 経つまで待つ。
   * 待った後に送る時刻が期限を過ぎるなら、待たずに WebDeadlineExceededError を throw する
   */
  private async _waitForTurn(url: string): Promise<void> {
    const waitMs = this._lastRequestStartedAt === null
      ? 0
      : this._lastRequestStartedAt + Math.max(this._requestIntervalMs, this._crawlDelayMs) - this._now()
    if (this._deadlineAt !== null && this._now() + Math.max(waitMs, 0) >= this._deadlineAt) {
      throw new WebDeadlineExceededError({ deadlineAt: this._deadlineAt, url })
    }
    if (waitMs > 0) await this._sleep(waitMs)
    this._lastRequestStartedAt = this._now()
  }
}
