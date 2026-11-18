import { resolve } from "node:path"

import cors from "cors"
import express from "express"
import helmet from "helmet"

import { createDrizzleClient } from "@repo/db"
import { type EventTracker, NoopEventTracker, QueueEventTracker } from "@repo/events"
import { logger } from "@repo/logger"
import { BullMQJobQueue, COLLECT_SOURCE_QUEUE_NAME, type CollectSourceJobData, TRACK_EVENT_QUEUE_NAME } from "@repo/queue"
import { createRedisClient } from "@repo/redis"

import { GitHubOAuthClient } from "./client/github-oauth"
import { GitHubRepositoryClient } from "./client/github-repository"
import { GoogleOAuthClient } from "./client/google-oauth"
import { PageFetcher } from "./client/page-fetcher"
import { AdminAuthDevLoginController } from "./controller/admin/auth/dev-login"
import { AdminAuthGoogleController } from "./controller/admin/auth/google"
import { AdminAuthLogoutController } from "./controller/admin/auth/logout"
import { AdminAuthRefreshController } from "./controller/admin/auth/refresh"
import { AdminMeGetController } from "./controller/admin/me/get"
import { AdminPassageDetailController } from "./controller/admin/passage/detail"
import { AdminPassageListController } from "./controller/admin/passage/list"
import { AdminPassagePublishController } from "./controller/admin/passage/publish"
import { AdminPassageRegenerateController } from "./controller/admin/passage/regenerate"
import { AdminPassageRegenerateAudioController } from "./controller/admin/passage/regenerate-audio"
import { AdminPassageRejectController } from "./controller/admin/passage/reject"
import { AdminPassageResolveAttentionController } from "./controller/admin/passage/resolve-attention"
import { AdminPassageRestoreController } from "./controller/admin/passage/restore"
import { AdminPassageRetryAudioController } from "./controller/admin/passage/retry-audio"
import { AdminPassageUnpublishController } from "./controller/admin/passage/unpublish"
import { AdminPassageUpdateController } from "./controller/admin/passage/update"
import { AdminSourceCollectController } from "./controller/admin/source/collect"
import { AdminSourceCreateController } from "./controller/admin/source/create"
import { AdminSourceDeleteController } from "./controller/admin/source/delete"
import { AdminSourceDetailController } from "./controller/admin/source/detail"
import { AdminSourceListController } from "./controller/admin/source/list"
import { AdminSourceSuggestController } from "./controller/admin/source/suggest"
import { AdminSourceUpdateController } from "./controller/admin/source/update"
import { AdminStatsOverviewController } from "./controller/admin/stats/overview"
import { AdminPassageStatsDetailController } from "./controller/admin/stats/passage-detail"
import { AdminPassageStatsListController } from "./controller/admin/stats/passage-list"
import { AdminTagCreateController } from "./controller/admin/tag/create"
import { AdminTagDeleteController } from "./controller/admin/tag/delete"
import { AdminTagListController } from "./controller/admin/tag/list"
import { AdminTagUpdateController } from "./controller/admin/tag/update"
import { AdminUrlImportCreateController } from "./controller/admin/url-import/create"
import { AdminUrlImportPreviewController } from "./controller/admin/url-import/preview"
import { AdminUserAttemptsController } from "./controller/admin/user/attempts"
import { AdminUserCalendarController } from "./controller/admin/user/calendar"
import { AdminUserDetailController } from "./controller/admin/user/detail"
import { AdminUserListController } from "./controller/admin/user/list"
import { AttemptAudioController } from "./controller/attempt/audio"
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
import { VocabularyReviewController } from "./controller/vocabulary/review"
import { VocabularySessionController } from "./controller/vocabulary/session"
import { VocabularySummaryController } from "./controller/vocabulary/summary"
import { env } from "./env"
import { resolveAudioPublicUrlBase } from "./lib/passage-audio"
import { authMiddleware } from "./middleware/auth"
import { flushEventsBeforeResponse } from "./middleware/flush-events"
import { apiRateLimiter } from "./middleware/rate-limit"
import { requestLogger } from "./middleware/request-logger"
import { unhandledExceptionHandler } from "./middleware/unhandled-exception-handler"
import {
  DrizzleAdminRepository,
  DrizzleAdminStatsRepository,
  DrizzleAuthAccountRepository,
  DrizzleDatabaseHealthRepository,
  DrizzleDictionaryRepository,
  DrizzleLearningRecordRepository,
  DrizzleMemoRepository,
  DrizzlePassageAudioRepository,
  DrizzlePassageRepository,
  DrizzleReadingAttemptRepository,
  DrizzleReminderSettingRepository,
  DrizzleSourceCollectionRunRepository,
  DrizzleSourceRepository,
  DrizzleTagRepository,
  DrizzleTransactionRunner,
  DrizzleUrlImportRepository,
  DrizzleUserGoalRepository,
  DrizzleUserRepository,
  DrizzleVocabularyRepository,
  DrizzleWordAudioRepository,
} from "./repository/drizzle"
import { IoRedisHealthRepository, IoRedisRefreshTokenRepository, IoRedisUrlImportPageCacheRepository } from "./repository/redis"
import { adminRouter, mountAdminApi } from "./routes/admin-router"
import { attemptRouter } from "./routes/attempt-router"
import { authRouter } from "./routes/auth-router"
import { dictionaryRouter } from "./routes/dictionary-router"
import { eventRouter } from "./routes/event-router"
import { healthRouter } from "./routes/health-router"
import { mediaRouter } from "./routes/media-router"
import { memoRouter } from "./routes/memo-router"
import { passageRouter } from "./routes/passage-router"
import { userRouter } from "./routes/user-router"
import { vocabularyRouter } from "./routes/vocabulary-router"

const db = createDrizzleClient({
  onError: (error) => {
    logger.error("db idle client error", error)
  },
})
/**
 * Redis は refresh token と queue の両方を載せているため、障害は error として残す。
 */
const redis = createRedisClient({
  onError: (error) => {
    logger.error("redis connection error", error)
  },
})

const userRepository = new DrizzleUserRepository(db)
const authAccountRepository = new DrizzleAuthAccountRepository(db)
const transactionRunner = new DrizzleTransactionRunner(db)
const memoRepository = new DrizzleMemoRepository(db)
const sourceRepository = new DrizzleSourceRepository(db)
const sourceCollectionRunRepository = new DrizzleSourceCollectionRunRepository(db)
const tagRepository = new DrizzleTagRepository(db)
const passageRepository = new DrizzlePassageRepository(db)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(db)
const passageAudioRepository = new DrizzlePassageAudioRepository(db)
const dictionaryRepository = new DrizzleDictionaryRepository(db)
const learningRecordRepository = new DrizzleLearningRecordRepository(db)
const userGoalRepository = new DrizzleUserGoalRepository(db)
const reminderSettingRepository = new DrizzleReminderSettingRepository(db)
const vocabularyRepository = new DrizzleVocabularyRepository(db)
const wordAudioRepository = new DrizzleWordAudioRepository(db)
const adminStatsRepository = new DrizzleAdminStatsRepository(db)
const urlImportRepository = new DrizzleUrlImportRepository(db)
const urlImportPageCacheRepository = new IoRedisUrlImportPageCacheRepository(redis)
const adminRepository = new DrizzleAdminRepository(db)
const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(redis, "admin_refresh_token")
const databaseHealthRepository = new DrizzleDatabaseHealthRepository(db)
const redisHealthRepository = new IoRedisHealthRepository(redis)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)

const gitHubOAuthClient = new GitHubOAuthClient(env.GITHUB_OAUTH_CLIENT_ID, env.GITHUB_OAUTH_CLIENT_SECRET)
const googleOAuthClient = new GoogleOAuthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
const gitHubRepositoryClient = new GitHubRepositoryClient(env.GITHUB_LICENSE_TOKEN)
/**
 * 連絡先の URL は、未設定なら web のトップ（どの環境でも設定してある FRONTEND_URL）にする。api の実行環境に env を足さずに済ませるため
 */
const pageFetcher = new PageFetcher(env.COLLECT_WEB_CONTACT_URL ?? env.FRONTEND_URL)

const audioPublicUrlBase = resolveAudioPublicUrlBase({
  audioPublicUrlBase: env.AUDIO_PUBLIC_URL_BASE,
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
})
if (audioPublicUrlBase === null) {
  logger.warn("AUDIO_PUBLIC_URL_BASE is not set; read-aloud audio is reported as pending")
}

const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

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

const userDeleteController = new UserDeleteController(userRepository, refreshTokenRepository)
const userGetController = new UserGetController(userRepository)
const userUpdateController = new UserUpdateController(userRepository)

const userAttemptsController = new UserAttemptsController(learningRecordRepository, userRepository)
const userCalendarController = new UserCalendarController(learningRecordRepository, userRepository)
const userStatsController = new UserStatsController(learningRecordRepository, userGoalRepository, userRepository)

const userGetGoalController = new UserGetGoalController(userGoalRepository)
const userPutGoalController = new UserPutGoalController(userGoalRepository, userRepository)

const userGetReminderController = new UserGetReminderController(reminderSettingRepository)
const userPutReminderController = new UserPutReminderController(reminderSettingRepository, userRepository)

const authDevLoginController = process.env.NODE_ENV !== "production"
  ? new AuthDevLoginController(userRepository, refreshTokenRepository)
  : undefined

const memoListController = new MemoListController(memoRepository)
const memoDetailController = new MemoDetailController(memoRepository)
const eventTracker: EventTracker = env.EVENT_TRACKER_TYPE === "queue"
  ? new QueueEventTracker(new BullMQJobQueue(redis, TRACK_EVENT_QUEUE_NAME))
  : new NoopEventTracker()

const eventCreateController = new EventCreateController(eventTracker)

const memoCreateController = new MemoCreateController(memoRepository, eventTracker)
const memoUpdateController = new MemoUpdateController(memoRepository, eventTracker)
const memoDeleteController = new MemoDeleteController(memoRepository, eventTracker)

const adminAuthDevLoginController = process.env.NODE_ENV !== "production"
  ? new AdminAuthDevLoginController(adminRepository, adminRefreshTokenRepository)
  : undefined
const adminAuthGoogleController = new AdminAuthGoogleController(adminRepository, adminRefreshTokenRepository, googleOAuthClient)
const adminAuthLogoutController = new AdminAuthLogoutController(adminRefreshTokenRepository)
const adminAuthRefreshController = new AdminAuthRefreshController(adminRepository, adminRefreshTokenRepository)
const adminMeGetController = new AdminMeGetController(adminRepository)

/**
 * dev / min / prd はどれも NODE_ENV=production で動くので、ローカルだけが true（サイトのソースと URL から追加はローカルだけ）
 */
const isLocalEnvironment = env.NODE_ENV !== "production"

const sourceWritePolicy = { isWebsiteSourceAllowed: isLocalEnvironment }

const adminSourceCreateController = new AdminSourceCreateController(sourceRepository, tagRepository, sourceWritePolicy)
const adminSourceDeleteController = new AdminSourceDeleteController(sourceRepository, sourceCollectionRunRepository)
const adminSourceDetailController = new AdminSourceDetailController(sourceRepository, sourceCollectionRunRepository)
const adminSourceListController = new AdminSourceListController(sourceRepository, sourceCollectionRunRepository)
const adminSourceSuggestController = new AdminSourceSuggestController(gitHubRepositoryClient, sourceWritePolicy)
const adminSourceUpdateController = new AdminSourceUpdateController(sourceRepository, tagRepository, sourceWritePolicy)

/**
 * 今すぐ収集は worker が収集するので、worker を動かさない環境（SOURCE_COLLECTION_TYPE=none）では Controller を作らない（ルートが無く 404）
 */
const adminSourceCollectController = env.SOURCE_COLLECTION_TYPE === "queue"
  ? new AdminSourceCollectController(
    sourceRepository,
    sourceCollectionRunRepository,
    new BullMQJobQueue<CollectSourceJobData>(redis, COLLECT_SOURCE_QUEUE_NAME),
  )
  : undefined

const adminPassageDetailController = new AdminPassageDetailController(passageRepository)
const adminPassageListController = new AdminPassageListController(passageRepository)
const adminPassagePublishController = new AdminPassagePublishController(passageRepository, passageAudioRepository, transactionRunner)
const adminPassageRegenerateController = new AdminPassageRegenerateController(passageRepository)
const adminPassageRegenerateAudioController = new AdminPassageRegenerateAudioController(passageAudioRepository)
const adminPassageRejectController = new AdminPassageRejectController(passageRepository)
const adminPassageResolveAttentionController = new AdminPassageResolveAttentionController(passageRepository)
const adminPassageRestoreController = new AdminPassageRestoreController(passageRepository)
const adminPassageRetryAudioController = new AdminPassageRetryAudioController(passageAudioRepository)
const adminPassageUnpublishController = new AdminPassageUnpublishController(passageRepository)
const adminPassageUpdateController = new AdminPassageUpdateController(passageRepository)
const adminTagCreateController = new AdminTagCreateController(tagRepository)
const adminTagDeleteController = new AdminTagDeleteController(tagRepository)
const adminTagListController = new AdminTagListController(tagRepository)
const adminTagUpdateController = new AdminTagUpdateController(tagRepository)

/**
 * ローカルでだけ生成する（router は渡されたものだけを登録するので、production では 404）
 */
const adminUrlImportCreateController = isLocalEnvironment
  ? new AdminUrlImportCreateController(
    sourceRepository,
    urlImportRepository,
    urlImportPageCacheRepository,
    transactionRunner,
    pageFetcher,
  )
  : undefined
const adminUrlImportPreviewController = isLocalEnvironment
  ? new AdminUrlImportPreviewController(
    sourceRepository,
    urlImportRepository,
    urlImportPageCacheRepository,
    pageFetcher,
  )
  : undefined

const adminStatsOverviewController = new AdminStatsOverviewController(adminStatsRepository)
const adminPassageStatsListController = new AdminPassageStatsListController(adminStatsRepository)
const adminPassageStatsDetailController = new AdminPassageStatsDetailController(adminStatsRepository)
const adminUserListController = new AdminUserListController(userRepository)
const adminUserDetailController = new AdminUserDetailController(
  authAccountRepository,
  learningRecordRepository,
  userGoalRepository,
  userRepository,
  vocabularyRepository,
)
const adminUserCalendarController = new AdminUserCalendarController(learningRecordRepository, userRepository)
const adminUserAttemptsController = new AdminUserAttemptsController(learningRecordRepository, userRepository)

const passageDetailController = new PassageDetailController(passageRepository, readingAttemptRepository)
const passageListController = new PassageListController(passageRepository, readingAttemptRepository)
const passageRandomController = new PassageRandomController(passageRepository, readingAttemptRepository)

const attemptAudioController = new AttemptAudioController(passageAudioRepository, readingAttemptRepository, audioPublicUrlBase)
const attemptDetailController = new AttemptDetailController(passageRepository, readingAttemptRepository)
const attemptStartController = new AttemptStartController(passageRepository, readingAttemptRepository, userRepository)
const attemptSubmitController = new AttemptSubmitController(
  passageRepository,
  readingAttemptRepository,
  transactionRunner,
  userRepository,
)

const dictionaryLookupController = new DictionaryLookupController(dictionaryRepository)

const vocabularyReviewController = new VocabularyReviewController(transactionRunner, userRepository, vocabularyRepository)
const vocabularySessionController = new VocabularySessionController(
  userRepository,
  vocabularyRepository,
  passageAudioRepository,
  wordAudioRepository,
  audioPublicUrlBase,
)
const vocabularySummaryController = new VocabularySummaryController(userRepository, vocabularyRepository)

const app = express()

/**
 * ALB 越しの X-Forwarded-For から実 IP を取る。設定しないと全ユーザーが
 * プロキシの内部 IP として扱われ、トークンの無いリクエストを IP で数えるレート制限が機能しない。
 * 値はプロキシの段数（プロキシが無い環境では false）。
 */
app.set("trust proxy", 1)

/**
 * 別オリジンのフロントから <img> 等で読む場合は crossOriginResourcePolicy を
 * cross-origin に緩める。
 */
app.use(helmet())

app.use(
  cors({
    credentials: true,
    origin: env.FRONTEND_URL,
  })
)

app.use(express.json())

app.use(authMiddleware)

app.use(requestLogger)

if (env.FLUSH_EVENTS_BEFORE_RESPONSE) {
  app.use(flushEventsBeforeResponse(eventTracker))
}

app.use(
  "/api/health",
  healthRouter({
    liveness: healthLivenessController,
    readiness: healthReadinessController,
  })
)
/**
 * 開発環境だけ、cron が .storage/audio/ に書いた読み上げの mp3 を /media で配信する（本番は S3 + CloudFront）。
 * <audio> は 1 ファイルに Range のリクエストを何度も送るので、レート制限より前に登録する
 */
if (env.NODE_ENV !== "production") {
  app.use("/media", mediaRouter({ audioDir: resolve(env.AUDIO_STORAGE_LOCAL_DIR) }))
}
/**
 * refresh の body の refresh token でユーザーを見分けるため、express.json() より後に登録する。
 * ヘルスチェック（/api/health）はロードバランサの死活監視で高頻度に叩かれるため、本ミドル
 * ウェアより前に登録して対象外にしている（制限に巻き込むと target が unhealthy 判定される恐れ）。
 */
app.use(apiRateLimiter)
mountAdminApi(
  app,
  adminRouter({
    auth: {
      devLogin: adminAuthDevLoginController,
      google: adminAuthGoogleController,
      logout: adminAuthLogoutController,
      refresh: adminAuthRefreshController,
    },
    source: {
      collect: adminSourceCollectController,
      create: adminSourceCreateController,
      delete: adminSourceDeleteController,
      detail: adminSourceDetailController,
      list: adminSourceListController,
      suggest: adminSourceSuggestController,
      update: adminSourceUpdateController,
    },
    me: { get: adminMeGetController },
    passage: {
      detail: adminPassageDetailController,
      list: adminPassageListController,
      publish: adminPassagePublishController,
      regenerate: adminPassageRegenerateController,
      regenerateAudio: adminPassageRegenerateAudioController,
      reject: adminPassageRejectController,
      resolveAttention: adminPassageResolveAttentionController,
      restore: adminPassageRestoreController,
      retryAudio: adminPassageRetryAudioController,
      unpublish: adminPassageUnpublishController,
      update: adminPassageUpdateController,
    },
    stats: {
      overview: adminStatsOverviewController,
      passageDetail: adminPassageStatsDetailController,
      passageList: adminPassageStatsListController,
    },
    tag: {
      create: adminTagCreateController,
      delete: adminTagDeleteController,
      list: adminTagListController,
      update: adminTagUpdateController,
    },
    urlImport: {
      create: adminUrlImportCreateController,
      preview: adminUrlImportPreviewController,
    },
    user: {
      attempts: adminUserAttemptsController,
      calendar: adminUserCalendarController,
      detail: adminUserDetailController,
      list: adminUserListController,
    },
  }),
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
    audio: attemptAudioController,
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
app.use(
  "/api/vocabulary",
  vocabularyRouter({
    review: vocabularyReviewController,
    session: vocabularySessionController,
    summary: vocabularySummaryController,
  })
)

/**
 * すべてのルートの後に登録しないと、ルートで投げられた例外を受け取れない
 */
app.use(unhandledExceptionHandler)

const server = app.listen(env.PORT, () => {
  logger.info("API server running", {
    environment: env.NODE_ENV,
    port: env.PORT,
    url: `http://localhost:${env.PORT}`,
  })
})

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

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason as Error)
  process.exit(1)
})
