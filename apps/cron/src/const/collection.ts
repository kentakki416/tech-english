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

/**
 * 収集の対象から外れた文書（除外パス・対象パスから外した、取得元から消えた）の collected を却下するときの理由
 */
export const OUT_OF_TARGET_PASSAGE_REJECT_REASON = "除外パスに入ったか取得元から消えたため、収集の対象から外した"
