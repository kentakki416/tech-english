import cors from "cors"
import express from "express"
import helmet from "helmet"

import { createDrizzleClient } from "@repo/db"
import { type EventTracker, NoopEventTracker, QueueEventTracker } from "@repo/events"
import { logger } from "@repo/logger"
import { BullMQJobQueue, TRACK_EVENT_QUEUE_NAME } from "@repo/queue"
import { createRedisClient } from "@repo/redis"

import { GitHubLicenseClient } from "./client/github-license"
import { GitHubOAuthClient } from "./client/github-oauth"
import { GoogleOAuthClient } from "./client/google-oauth"
import { AdminContentSourceCreateController } from "./controller/admin/content-source/create"
import { AdminContentSourceDetailController } from "./controller/admin/content-source/detail"
import { AdminContentSourceDetectLicenseController } from "./controller/admin/content-source/detect-license"
import { AdminContentSourceListController } from "./controller/admin/content-source/list"
import { AdminContentSourceUpdateController } from "./controller/admin/content-source/update"
import { AdminPassageDetailController } from "./controller/admin/passage/detail"
import { AdminPassageListController } from "./controller/admin/passage/list"
import { AdminPassagePublishController } from "./controller/admin/passage/publish"
import { AdminPassageRegenerateController } from "./controller/admin/passage/regenerate"
import { AdminPassageRejectController } from "./controller/admin/passage/reject"
import { AdminPassageUnpublishController } from "./controller/admin/passage/unpublish"
import { AdminPassageUpdateController } from "./controller/admin/passage/update"
import { AttemptDetailController } from "./controller/attempt/detail"
import { AttemptStartController } from "./controller/attempt/start"
import { AttemptSubmitController } from "./controller/attempt/submit"
import { AuthDevLoginController } from "./controller/auth/dev-login"
import { AuthGitHubController } from "./controller/auth/github"
import { AuthGoogleController } from "./controller/auth/google"
import { AuthLogoutController } from "./controller/auth/logout"
import { AuthRefreshController } from "./controller/auth/refresh"
import { DictionaryLookupController } from "./controller/dictionary/lookup"
import { EventCreateController } from "./controller/event/create"
import { HealthLivenessController } from "./controller/health/liveness"
import { HealthReadinessController } from "./controller/health/readiness"
import { MemoCreateController } from "./controller/memo/create"
import { MemoDeleteController } from "./controller/memo/delete"
import { MemoDetailController } from "./controller/memo/detail"
import { MemoListController } from "./controller/memo/list"
import { MemoUpdateController } from "./controller/memo/update"
import { PassageDetailController } from "./controller/passage/detail"
import { PassageListController } from "./controller/passage/list"
import { PassageRandomController } from "./controller/passage/random"
import { UserAttemptsController } from "./controller/user/attempts"
import { UserCalendarController } from "./controller/user/calendar"
import { UserDeleteController } from "./controller/user/delete"
import { UserGetController } from "./controller/user/get"
import { UserGetGoalController } from "./controller/user/get-goal"
import { UserGetReminderController } from "./controller/user/get-reminder"
import { UserPutGoalController } from "./controller/user/put-goal"
import { UserPutReminderController } from "./controller/user/put-reminder"
import { UserStatsController } from "./controller/user/stats"
import { UserUpdateController } from "./controller/user/update"
import { env } from "./env"
import { authMiddleware } from "./middleware/auth"
import { flushEventsBeforeResponse } from "./middleware/flush-events"
import { apiRateLimiter } from "./middleware/rate-limit"
import { requestLogger } from "./middleware/request-logger"
import { unhandledExceptionHandler } from "./middleware/unhandled-exception-handler"
import {
  DrizzleAuthAccountRepository,
  DrizzleContentSourceRepository,
  DrizzleDatabaseHealthRepository,
  DrizzleDictionaryRepository,
  DrizzleLearningRecordRepository,
  DrizzleMemoRepository,
  DrizzlePassageRepository,
  DrizzleReadingAttemptRepository,
  DrizzleReminderSettingRepository,
  DrizzleTransactionRunner,
  DrizzleUserGoalRepository,
  DrizzleUserRepository,
} from "./repository/drizzle"
import { IoRedisHealthRepository, IoRedisRefreshTokenRepository } from "./repository/redis"
import { adminRouter } from "./routes/admin-router"
import { attemptRouter } from "./routes/attempt-router"
import { authRouter } from "./routes/auth-router"
import { dictionaryRouter } from "./routes/dictionary-router"
import { eventRouter } from "./routes/event-router"
import { healthRouter } from "./routes/health-router"
import { memoRouter } from "./routes/memo-router"
import { passageRouter } from "./routes/passage-router"
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
const contentSourceRepository = new DrizzleContentSourceRepository(db)
/**
 * reading-practice のユーザー向け API と共有する
 */
const passageRepository = new DrizzlePassageRepository(db)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(db)
const dictionaryRepository = new DrizzleDictionaryRepository(db)
/**
 * 学習記録（learning-record）の集計と目標
 */
const learningRecordRepository = new DrizzleLearningRecordRepository(db)
const userGoalRepository = new DrizzleUserGoalRepository(db)
/**
 * 学習リマインダー（study-reminder）の設定
 */
const reminderSettingRepository = new DrizzleReminderSettingRepository(db)
const databaseHealthRepository = new DrizzleDatabaseHealthRepository(db)
const redisHealthRepository = new IoRedisHealthRepository(redis)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)

/**
 * 外部 SaaS client の DI assembly
 */
const gitHubOAuthClient = new GitHubOAuthClient(env.GITHUB_OAUTH_CLIENT_ID, env.GITHUB_OAUTH_CLIENT_SECRET)
const googleOAuthClient = new GoogleOAuthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
const gitHubLicenseClient = new GitHubLicenseClient(env.GITHUB_LICENSE_TOKEN)

/**
 * Health Controller のインスタンス化
 */
const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

/**
 * Auth Controller のインスタンス化
 */
const authGitHubController = new AuthGitHubController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  gitHubOAuthClient,
)
const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  googleOAuthClient,
)
const authRefreshController = new AuthRefreshController(refreshTokenRepository, userRepository)
const authLogoutController = new AuthLogoutController(refreshTokenRepository)

/**
 * User Controller のインスタンス化（認証中ユーザー自身の取得・更新・削除）
 */
const userDeleteController = new UserDeleteController(userRepository, refreshTokenRepository)
const userGetController = new UserGetController(userRepository)
const userUpdateController = new UserUpdateController(userRepository)

/**
 * 学習記録（マイページの統計・学習カレンダー・提出した挑戦の一覧）Controller のインスタンス化
 */
const userAttemptsController = new UserAttemptsController(learningRecordRepository, userRepository)
const userCalendarController = new UserCalendarController(learningRecordRepository, userRepository)
const userStatsController = new UserStatsController(learningRecordRepository, userGoalRepository, userRepository)

/**
 * 目標（取得・保存）Controller のインスタンス化
 */
const userGetGoalController = new UserGetGoalController(userGoalRepository)
const userPutGoalController = new UserPutGoalController(userGoalRepository, userRepository)

/**
 * 学習リマインダーの設定（取得・保存）Controller のインスタンス化
 */
const userGetReminderController = new UserGetReminderController(reminderSettingRepository)
const userPutReminderController = new UserPutReminderController(reminderSettingRepository, userRepository)

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

/**
 * Admin のソース管理 Controller のインスタンス化
 */
const adminContentSourceCreateController = new AdminContentSourceCreateController(contentSourceRepository)
const adminContentSourceDetailController = new AdminContentSourceDetailController(contentSourceRepository)
const adminContentSourceDetectLicenseController = new AdminContentSourceDetectLicenseController(gitHubLicenseClient)
const adminContentSourceListController = new AdminContentSourceListController(contentSourceRepository)
const adminContentSourceUpdateController = new AdminContentSourceUpdateController(contentSourceRepository)

/**
 * Admin の問題の確認・公開 Controller のインスタンス化
 */
const adminPassageDetailController = new AdminPassageDetailController(passageRepository)
const adminPassageListController = new AdminPassageListController(passageRepository)
const adminPassagePublishController = new AdminPassagePublishController(passageRepository)
const adminPassageRegenerateController = new AdminPassageRegenerateController(passageRepository)
const adminPassageRejectController = new AdminPassageRejectController(passageRepository)
const adminPassageUnpublishController = new AdminPassageUnpublishController(passageRepository)
const adminPassageUpdateController = new AdminPassageUpdateController(passageRepository)

/**
 * ユーザー向けの問題（一覧・ランダムに 1 問・開始確認の概要）Controller のインスタンス化
 */
const passageDetailController = new PassageDetailController(passageRepository, readingAttemptRepository)
const passageListController = new PassageListController(passageRepository, readingAttemptRepository)
const passageRandomController = new PassageRandomController(passageRepository, readingAttemptRepository)

/**
 * ユーザー向けの挑戦（開始・取得・提出）Controller のインスタンス化
 */
const attemptDetailController = new AttemptDetailController(passageRepository, readingAttemptRepository)
const attemptStartController = new AttemptStartController(passageRepository, readingAttemptRepository, userRepository)
const attemptSubmitController = new AttemptSubmitController(
  passageRepository,
  readingAttemptRepository,
  transactionRunner,
  userRepository,
)

/**
 * 英和辞書（解答中の単語の意味）Controller のインスタンス化
 */
const dictionaryLookupController = new DictionaryLookupController(dictionaryRepository)

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
/**
 * admin 向け API。/api/admin は PUBLIC_PATHS に入っているので、admin-router 側の
 * adminAuthMiddleware（X-Admin-Token）で保護する
 */
app.use(
  "/api/admin",
  adminRouter({
    contentSource: {
      create: adminContentSourceCreateController,
      detail: adminContentSourceDetailController,
      detectLicense: adminContentSourceDetectLicenseController,
      list: adminContentSourceListController,
      update: adminContentSourceUpdateController,
    },
    passage: {
      detail: adminPassageDetailController,
      list: adminPassageListController,
      publish: adminPassagePublishController,
      regenerate: adminPassageRegenerateController,
      reject: adminPassageRejectController,
      unpublish: adminPassageUnpublishController,
      update: adminPassageUpdateController,
    },
  })
)
app.use(
  "/api/auth",
  authRouter({
    devLogin: authDevLoginController,
    github: authGitHubController,
    google: authGoogleController,
    logout: authLogoutController,
    refresh: authRefreshController,
  })
)
app.use(
  "/api/user",
  userRouter({
    attempts: userAttemptsController,
    calendar: userCalendarController,
    delete: userDeleteController,
    get: userGetController,
    getGoal: userGetGoalController,
    getReminder: userGetReminderController,
    putGoal: userPutGoalController,
    putReminder: userPutReminderController,
    stats: userStatsController,
    update: userUpdateController,
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
app.use(
  "/api/passage",
  passageRouter({
    detail: passageDetailController,
    list: passageListController,
    random: passageRandomController,
    start: attemptStartController,
  })
)
app.use(
  "/api/attempt",
  attemptRouter({
    detail: attemptDetailController,
    submit: attemptSubmitController,
  })
)
app.use(
  "/api/dictionary",
  dictionaryRouter({
    lookup: dictionaryLookupController,
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
