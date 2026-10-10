import cors from "cors"
import express from "express"
import helmet from "helmet"

import { createDrizzleClient } from "@repo/db"
import { type EventTracker, NoopEventTracker, QueueEventTracker } from "@repo/events"
import { logger } from "@repo/logger"
import { BullMQJobQueue, TRACK_EVENT_QUEUE_NAME } from "@repo/queue"
import { createRedisClient } from "@repo/redis"

import { GoogleOAuthClient } from "./client/google-oauth"
import { AuthDevLoginController } from "./controller/auth/dev-login"
import { AuthGoogleController } from "./controller/auth/google"
import { AuthLogoutController } from "./controller/auth/logout"
import { AuthRefreshController } from "./controller/auth/refresh"
import { EventCreateController } from "./controller/event/create"
import { HealthLivenessController } from "./controller/health/liveness"
import { HealthReadinessController } from "./controller/health/readiness"
import { MemoCreateController } from "./controller/memo/create"
import { MemoDeleteController } from "./controller/memo/delete"
import { MemoDetailController } from "./controller/memo/detail"
import { MemoListController } from "./controller/memo/list"
import { MemoUpdateController } from "./controller/memo/update"
import { UserGetController } from "./controller/user/get"
import { env } from "./env"
import { authMiddleware } from "./middleware/auth"
import { flushEventsBeforeResponse } from "./middleware/flush-events"
import { apiRateLimiter } from "./middleware/rate-limit"
import { requestLogger } from "./middleware/request-logger"
import { unhandledExceptionHandler } from "./middleware/unhandled-exception-handler"
import {
  DrizzleAuthAccountRepository,
  DrizzleDatabaseHealthRepository,
  DrizzleMemoRepository,
  DrizzleTransactionRunner,
  DrizzleUserRepository,
} from "./repository/drizzle"
import { IoRedisHealthRepository, IoRedisRefreshTokenRepository } from "./repository/redis"
import { authRouter } from "./routes/auth-router"
import { eventRouter } from "./routes/event-router"
import { healthRouter } from "./routes/health-router"
import { memoRouter } from "./routes/memo-router"
import { userRouter } from "./routes/user-router"

/**
 * インフラ client はプロセス起動時に 1 回だけ生成する。
 * DB は Drizzle 実装を使う（Prisma 実装も repository/prisma に残してあり、ここを差し替えれば切り替えられる）。
 */
const db = createDrizzleClient({
  onError: (error) => {
    logger.error("db idle client error", error)
  },
})
/**
 * onError を渡さないと factory 既定の console.error に落ち、構造化ログに乗らない。
 * Redis は refresh token と queue の両方を載せているため、障害は error として残す。
 */
const redis = createRedisClient({
  onError: (error) => {
    logger.error("redis connection error", error)
  },
})

/**
 * Repository の DI assembly
 */
const userRepository = new DrizzleUserRepository(db)
const authAccountRepository = new DrizzleAuthAccountRepository(db)
const transactionRunner = new DrizzleTransactionRunner(db)
const memoRepository = new DrizzleMemoRepository(db)
const databaseHealthRepository = new DrizzleDatabaseHealthRepository(db)
const redisHealthRepository = new IoRedisHealthRepository(redis)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)

/**
 * 外部 SaaS client の DI assembly
 */
const googleOAuthClient = new GoogleOAuthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)

/**
 * Health Controller のインスタンス化
 */
const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

/**
 * Auth Controller のインスタンス化
 */
const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  googleOAuthClient,
)
const authRefreshController = new AuthRefreshController(refreshTokenRepository)
const authLogoutController = new AuthLogoutController(refreshTokenRepository)

/**
 * User Controller のインスタンス化（認証中ユーザー自身の取得）
 */
const userGetController = new UserGetController(userRepository)

/**
 * dev-login Controller は production 以外でのみ生成する
 * （本番では auth-router でルート自体が登録されない）
 */
const authDevLoginController = process.env.NODE_ENV !== "production"
  ? new AuthDevLoginController(userRepository, refreshTokenRepository)
  : undefined

/**
 * Memo Controller のインスタンス化
 */
const memoListController = new MemoListController(memoRepository)
const memoDetailController = new MemoDetailController(memoRepository)
/**
 * 行動イベントの送出先は EVENT_TRACKER_TYPE で選ぶ。
 * queue なら enqueue するだけで、ClickHouse への書き込みは apps/worker が行う
 */
const eventTracker: EventTracker = env.EVENT_TRACKER_TYPE === "queue"
  ? new QueueEventTracker(new BullMQJobQueue(redis, TRACK_EVENT_QUEUE_NAME))
  : new NoopEventTracker()

const eventCreateController = new EventCreateController(eventTracker)

const memoCreateController = new MemoCreateController(memoRepository, eventTracker)
const memoUpdateController = new MemoUpdateController(memoRepository, eventTracker)
const memoDeleteController = new MemoDeleteController(memoRepository, eventTracker)

const app = express()

/**
 * ALB 越しの X-Forwarded-For から実 IP を取る。設定しないと全ユーザーが
 * プロキシの内部 IP として扱われ、IP 単位のレート制限が機能しない。
 * 値はプロキシの段数（プロキシが無い環境では false）。
 */
app.set("trust proxy", 1)

/**
 * 別オリジンのフロントから <img> 等で読む場合は crossOriginResourcePolicy を
 * cross-origin に緩める。
 */
app.use(helmet())

/**
 * cors設定のミドルウェア
 */
app.use(
  cors({
    credentials: true,
    origin: env.FRONTEND_URL,
  })
)

/**
 * jsonを変換するミドルウェア
 */
app.use(express.json())

/**
 * 認証ミドルウェア
 */
app.use(authMiddleware)

/**
 * リクエストのロギングミドルウェア
 */
app.use(requestLogger)

/**
 * Lambda ではレスポンス後に実行環境が凍結されるため、送出中のイベントを先に送り切る
 */
if (env.FLUSH_EVENTS_BEFORE_RESPONSE) {
  app.use(flushEventsBeforeResponse(eventTracker))
}

/**
 * ルーティング
 */
app.use(
  "/api/health",
  healthRouter({
    liveness: healthLivenessController,
    readiness: healthReadinessController,
  })
)
/**
 * レート制限を API 全体に適用する。
 * ヘルスチェック（/api/health）はロードバランサの死活監視で高頻度に叩かれるため、本ミドル
 * ウェアより前に登録して対象外にしている（制限に巻き込むと target が unhealthy 判定される恐れ）。
 */
app.use(apiRateLimiter)
app.use(
  "/api/auth",
  authRouter({
    devLogin: authDevLoginController,
    google: authGoogleController,
    logout: authLogoutController,
    refresh: authRefreshController,
  })
)
app.use(
  "/api/user",
  userRouter({
    get: userGetController,
  })
)
app.use(
  "/api/events",
  eventRouter({
    create: eventCreateController,
  })
)
app.use(
  "/api/memo",
  memoRouter({
    create: memoCreateController,
    delete: memoDeleteController,
    detail: memoDetailController,
    list: memoListController,
    update: memoUpdateController,
  })
)

/**
 * 想定外例外を捕捉する Express の最終エラーハンドラ
 * 業務 4xx エラーは Controller の sendError 経由で返却されるため、ここを通らない
 * ルーティング定義の最後に登録する必要がある
 */
app.use(unhandledExceptionHandler)

/**
 * サーバー起動
 */
const server = app.listen(env.PORT, () => {
  logger.info("API server running", {
    environment: env.NODE_ENV,
    port: env.PORT,
    url: `http://localhost:${env.PORT}`,
  })
})

/**
 * Graceful shutdown
 * SIGTERM / SIGINT を受けたら HTTP server を閉じてから DB / Redis を切断
 */
const shutdown = async (signal: string): Promise<void> => {
  logger.info("Shutdown initiated", { signal })
  server.close(async () => {
    await Promise.all([
      db.$disconnect(),
      redis.quit(),
    ])
    logger.info("Shutdown completed")
    process.exit(0)
  })
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

/**
 * 予期しない例外をキャッチ（念のため）
 */
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason as Error)
  process.exit(1)
})
