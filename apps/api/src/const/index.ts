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
  /**
   * admin 向け API はユーザーの JWT 認証の対象外にする。
   * 代わりに admin-router の adminAuthMiddleware（X-Admin-Token）で保護する
   */
  "/api/admin",
  "/api/auth/github",
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/health",
  "/api/memo",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * リクエストログを除外するパス
 * これらのパスではrequestLoggerがログを記録しません
 */
export const LOG_EXCLUDE_PATHS = [
  "/api/health",
  "/api/health/ready",
] as const
