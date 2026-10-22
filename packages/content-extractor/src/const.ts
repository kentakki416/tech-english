/**
 * 収集のリクエストに付ける User-Agent。取得先の管理者がどのサービスのボットか分かるようにする
 */
export const COLLECTOR_USER_AGENT = "TechEnglishBot/1.0"

/**
 * 収集のリクエストの User-Agent。連絡先の URL（サービスのトップ）があれば `TechEnglishBot/1.0 (+url)` にする
 */
export const buildCollectorUserAgent = (contactUrl: string | undefined): string =>
  contactUrl ? `${COLLECTOR_USER_AGENT} (+${contactUrl})` : COLLECTOR_USER_AGENT

/**
 * robots.txt の User-agent と照合するボットの名前。サイトの管理者はこの名前で止められる（robots.txt を守る）
 */
export const CRAWLER_NAME = "TechEnglishBot"

/**
 * robots.txt の Crawl-delay（秒）の上限（この値ちょうどは従う）。これを超える値を返すサイトは、そのソースを今回の実行では打ち切る（失敗にはしない）。
 * 極端に大きい値（3600 など）にそのまま従うと、1 ソースの処理が何時間も止まるため
 */
export const MAX_CRAWL_DELAY_SECONDS = 30

/**
 * サイトへの 1 リクエストのタイムアウト（ミリ秒）
 */
export const WEB_REQUEST_TIMEOUT_MS = 10_000

/**
 * 受け取るページ（text/html）のサイズの上限（バイト）。超えたら読むのをやめて取得しない
 */
export const MAX_HTML_BYTES = 2 * 1024 * 1024

/**
 * たどるリダイレクトの回数の上限（同じオリジンの中だけ）
 */
export const MAX_REDIRECTS = 3
