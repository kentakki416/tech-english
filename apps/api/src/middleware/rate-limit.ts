import type { Request } from "express"
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit"

import { authRefreshRequestSchema } from "@repo/api-schema"

import { verifyAccessToken, verifyRefreshToken } from "../lib/jwt"

/**
 * 1 分あたりの上限。フロントが複数 API を並列取得しても引っかからない程度に緩く、
 * かつ機械的な連打は止まる水準。プロダクトに合わせて調整する。
 */
const API_RATE_LIMIT_PER_MINUTE = 300

/**
 * body で refresh token を受け取る API（web サーバーが全ユーザーの分を呼ぶ）
 */
const REFRESH_TOKEN_PATH = "/api/auth/refresh"

/**
 * Authorization の Bearer の access token を検証し、userId を返す。無い・不正・期限切れは undefined。
 * 署名と期限を見るだけで DB は引かない
 */
const findAccessTokenUserId = (authorization: string | undefined): number | undefined =>
  authorization?.startsWith("Bearer ") ? verifyAccessToken(authorization.substring(7))?.userId : undefined

/**
 * POST /api/auth/refresh の body の refresh token を検証し、userId を返す。それ以外のリクエスト・不正・期限切れは undefined。
 * 失効（ローテーション済み・ログアウト済み）は Redis を引かないと分からないので見ない（数え方を決めるだけで、更新の可否は controller が判断する）。
 * body は express.json() が先に parse している前提
 */
const findRefreshTokenUserId = (req: Request): number | undefined => {
  if (req.method !== "POST" || req.path !== REFRESH_TOKEN_PATH) return undefined
  const parsed = authRefreshRequestSchema.safeParse(req.body)
  return parsed.success ? verifyRefreshToken(parsed.data.refresh_token)?.userId : undefined
}

/**
 * レート制限のキー。検証できたトークンがあればユーザー（`user:<userId>`）、無ければ IP（`ip:<IP>`）で数える。
 *
 * web の Server Component・Route Handler・proxy からの呼び出しはすべて web サーバーの IP から来るため、
 * IP だけで数えると全ユーザーで 1 つの上限を分け合ってしまう。そのためトークンで利用者を見分ける。
 * トークンが無い・検証できないリクエストは今までどおり IP で数え、総当たりへの備えは弱めない。
 *
 * IP は `req.ip`（`trust proxy` を反映した値）をそのまま使う。express-rate-limit 7.x の既定の keyGenerator と同じで、
 * IPv6 をサブネットでまとめる `ipKeyGenerator` は 8.x からのため、この版では使えない
 */
const resolveRateLimitKey = (req: Request): string => {
  const userId = findAccessTokenUserId(req.headers.authorization) ?? findRefreshTokenUserId(req)
  return userId === undefined ? `ip:${req.ip ?? "unknown"}` : `user:${userId}`
}

const createApiRateLimiter = (limit: number): RateLimitRequestHandler =>
  rateLimit({
    keyGenerator: resolveRateLimitKey,
    legacyHeaders: false,
    limit,
    message: { error: "Too many requests", status_code: 429 },
    standardHeaders: "draft-7",
    windowMs: 60 * 1000,
  })

/**
 * API 全体のレート制限。
 *
 * 同一の利用者（検証できたトークンのユーザー、無ければ IP）が一定時間内に送れるリクエスト数に上限を設け、
 * ブルートフォースやアプリ層 DoS を緩和する。全エンドポイントに同じ上限（1 分あたり 300 リクエスト）を適用する。
 * 数え方は resolveRateLimitKey を参照。
 *
 * refresh の body を読むため、express.json() より後に登録する。
 *
 * 注意: カウントは in-memory（インスタンス単位）。複数インスタンス構成では実効上限が
 * インスタンス数倍になるため、厳密な分散制限が要る場合は Redis ストア化や WAF を検討する。
 */
export const apiRateLimiter = createApiRateLimiter(API_RATE_LIMIT_PER_MINUTE)

export const forTesting = {
  createApiRateLimiter,
  resolveRateLimitKey,
}
