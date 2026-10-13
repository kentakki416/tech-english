/**
 * 収集のリクエストに付ける User-Agent。取得先の管理者がどのサービスのボットか分かるようにする
 */
export const COLLECTOR_USER_AGENT = "TechEnglishBot/1.0"

/**
 * GitHub の rate limit の残り（x-ratelimit-remaining）がこれを切ったら、そのソースの処理を打ち切って次回に回す（認証あり: 5,000 req/h）
 */
export const GITHUB_MIN_RATE_LIMIT_REMAINING = 100

/**
 * token が無いときの打ち切りの閾値。認証なしの上限は 60 req/h で、100 のままだと 1 件も取得できないため下げる
 */
export const GITHUB_UNAUTHENTICATED_MIN_RATE_LIMIT_REMAINING = 10

/**
 * 試し実行（--dry-run）で取得する文書数
 */
export const DRY_RUN_MAX_DOCUMENTS = 5

/**
 * 取得する Markdown ファイルのサイズの上限（バイト）。これより大きいファイルは対象にしない
 */
export const MAX_MARKDOWN_FILE_BYTES = 1_000_000

/**
 * robots.txt の User-agent と照合するボットの名前。サイトの管理者はこの名前で止められる（robots.txt を守る）
 */
export const CRAWLER_NAME = "TechEnglishBot"

/**
 * サイトへの 1 リクエストのタイムアウト（ミリ秒）
 */
export const WEB_REQUEST_TIMEOUT_MS = 10_000

/**
 * 受け取るページ（text/html）のサイズの上限（バイト）。超えたら読むのをやめて取得しない
 */
export const MAX_HTML_BYTES = 2 * 1024 * 1024

/**
 * sitemap のサイズの上限（バイト）
 */
export const MAX_SITEMAP_BYTES = 10 * 1024 * 1024

/**
 * sitemap index から取得する子の sitemap の数の上限
 */
export const MAX_CHILD_SITEMAPS = 50

/**
 * たどるリダイレクトの回数の上限（同じオリジンの中だけ）
 */
export const MAX_REDIRECTS = 3

/**
 * ネットワークエラー（タイムアウト・接続エラー）がこの回数続いたら、サイトの障害とみなしてそのソースを失敗にする
 */
export const MAX_CONSECUTIVE_NETWORK_ERRORS = 3

/**
 * collect:passages の実行の間隔（ミリ秒。1 日 1 回）。429 / 503 の Retry-After がこれより先なら warn を出す
 */
export const COLLECT_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * ページが無くなったことを表す HTTP ステータス。この行は取り直しの対象から外す（sitemap やリンクで再び見つかったら戻す）
 */
export const GONE_HTTP_STATUSES = [404, 410]
