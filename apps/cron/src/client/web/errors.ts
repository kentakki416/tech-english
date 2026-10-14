/**
 * 取得先の制限（SSRF 対策）に掛かった。https 以外・ソースのサイトと別のオリジン・プライベートなどの IP アドレスへの接続。
 * 登録の誤りか攻撃なので、ページ単位で飛ばさずにソースの失敗にする
 */
export class BlockedUrlError extends Error {
  public readonly target: string

  constructor(target: string) {
    super(`Blocked by the fetch restriction: ${target}`)
    this.name = "BlockedUrlError"
    this.target = target
  }
}

/**
 * robots.txt の Crawl-delay が上限（MAX_CRAWL_DELAY_SECONDS）を超えている。従うと処理が長時間止まるので、
 * そのソースの処理を今回の実行では打ち切る（失敗にはしない）
 */
export class CrawlDelayTooLongError extends Error {
  public readonly crawlDelaySeconds: number
  public readonly maxCrawlDelaySeconds: number
  public readonly url: string

  constructor(input: { crawlDelaySeconds: number; maxCrawlDelaySeconds: number; url: string }) {
    super(`Crawl-delay in robots.txt is too long: ${input.crawlDelaySeconds}s (max ${input.maxCrawlDelaySeconds}s) ${input.url}`)
    this.name = "CrawlDelayTooLongError"
    this.crawlDelaySeconds = input.crawlDelaySeconds
    this.maxCrawlDelaySeconds = input.maxCrawlDelaySeconds
    this.url = input.url
  }
}

/**
 * サイトが 429 / 503 を返した。そのソースの処理を打ち切って次回に回す（失敗にはしない）
 */
export class WebSourceThrottledError extends Error {
  /**
   * レスポンスの Retry-After（秒数か HTTP の日時）。無ければ null
   */
  public readonly retryAfter: string | null
  public readonly status: number
  public readonly url: string

  constructor(input: { retryAfter: string | null; status: number; url: string }) {
    super(`Site is throttling requests: ${input.status} ${input.url}`)
    this.name = "WebSourceThrottledError"
    this.retryAfter = input.retryAfter
    this.status = input.status
    this.url = input.url
  }
}
