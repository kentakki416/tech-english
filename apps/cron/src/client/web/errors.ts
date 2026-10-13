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
