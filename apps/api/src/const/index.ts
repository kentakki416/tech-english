/**
 * production 以外でのみ公開する dev 専用パス
 *
 * /api/auth/dev-login は seed で投入した dev ユーザーで token を発行する API。
 * production では index.ts でコントローラを生成しないためルート自体が存在しない
 * が、念のため PUBLIC_PATHS からも除外する。
 *
 * /media は cron が .storage/audio/ に書いた読み上げの mp3 の配信（<audio> は Authorization ヘッダを付けられないため認証の対象外にする）。
 * production では index.ts で mediaRouter を登録しない（本番は S3 + CloudFront）。
 */
const DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/api/auth/dev-login", "/media"]
  : []

/**
 * 認証をスキップする公開パス
 * これらのパスではauthMiddlewareが認証チェックをスキップします
 */
export const PUBLIC_PATHS: readonly string[] = [
  "/api/auth/github",
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/health",
  "/api/memo",
  ...DEV_ONLY_PUBLIC_PATHS,
]

export const ADMIN_PATH_PREFIX = "/api/admin"

/**
 * production 以外でのみ公開する admin の dev 専用パス（ADMIN_PATH_PREFIX からの相対）
 */
const ADMIN_DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/auth/dev-login"]
  : []

/**
 * admin の API のうち、admin の access token を求めないパス（ADMIN_PATH_PREFIX からの相対）
 *
 * logout は refresh token で本人を確かめるので、access token が切れていても呼べるようにする
 */
export const ADMIN_PUBLIC_PATHS: readonly string[] = [
  "/auth/google",
  "/auth/logout",
  "/auth/refresh",
  ...ADMIN_DEV_ONLY_PUBLIC_PATHS,
]

/**
 * リクエストログを除外するパス
 * これらのパスではrequestLoggerがログを記録しません
 */
export const LOG_EXCLUDE_PATHS = [
  "/api/health",
  "/api/health/ready",
] as const

/**
 * 収集中（queued / running）のまま、この分数を過ぎた収集の記録は終わらなかったとみなして failed にする
 * （docs/spec/manual-collection/README.md「終わらなかった実行の片付け」）。
 * worker が止まって記録が収集中のまま残ると、そのソースを二度と収集できなくなるため。
 * 1 回の上限（100 文書）を GitHub API で取って抽出する時間に十分な余裕を持たせた（cron の generate:questions の回収と同じ長さ）。
 * queued は依頼した時刻（created_at）、running は worker が始めた時刻（started_at）から数える
 */
export const SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES = 30
