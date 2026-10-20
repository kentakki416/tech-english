import { Express, Router } from "express"

import { ADMIN_PATH_PREFIX } from "../const"
import { AdminAuthDevLoginController } from "../controller/admin/auth/dev-login"
import { AdminAuthGoogleController } from "../controller/admin/auth/google"
import { AdminAuthLogoutController } from "../controller/admin/auth/logout"
import { AdminAuthRefreshController } from "../controller/admin/auth/refresh"
import { AdminContentSourceCreateController } from "../controller/admin/content-source/create"
import { AdminContentSourceDetailController } from "../controller/admin/content-source/detail"
import { AdminContentSourceDetectLicenseController } from "../controller/admin/content-source/detect-license"
import { AdminContentSourceListController } from "../controller/admin/content-source/list"
import { AdminContentSourceUpdateController } from "../controller/admin/content-source/update"
import { AdminMeGetController } from "../controller/admin/me/get"
import { AdminPassageDetailController } from "../controller/admin/passage/detail"
import { AdminPassageListController } from "../controller/admin/passage/list"
import { AdminPassagePublishController } from "../controller/admin/passage/publish"
import { AdminPassageRegenerateController } from "../controller/admin/passage/regenerate"
import { AdminPassageRegenerateAudioController } from "../controller/admin/passage/regenerate-audio"
import { AdminPassageRejectController } from "../controller/admin/passage/reject"
import { AdminPassageResolveAttentionController } from "../controller/admin/passage/resolve-attention"
import { AdminPassageRestoreController } from "../controller/admin/passage/restore"
import { AdminPassageRetryAudioController } from "../controller/admin/passage/retry-audio"
import { AdminPassageUnpublishController } from "../controller/admin/passage/unpublish"
import { AdminPassageUpdateController } from "../controller/admin/passage/update"
import { AdminStatsOverviewController } from "../controller/admin/stats/overview"
import { AdminPassageStatsDetailController } from "../controller/admin/stats/passage-detail"
import { AdminPassageStatsListController } from "../controller/admin/stats/passage-list"
import { AdminTagCreateController } from "../controller/admin/tag/create"
import { AdminTagDeleteController } from "../controller/admin/tag/delete"
import { AdminTagListController } from "../controller/admin/tag/list"
import { AdminTagUpdateController } from "../controller/admin/tag/update"
import { AdminUrlImportCreateController } from "../controller/admin/url-import/create"
import { AdminUrlImportPreviewController } from "../controller/admin/url-import/preview"
import { AdminUserAttemptsController } from "../controller/admin/user/attempts"
import { AdminUserCalendarController } from "../controller/admin/user/calendar"
import { AdminUserDetailController } from "../controller/admin/user/detail"
import { AdminUserListController } from "../controller/admin/user/list"
import { adminAuthMiddleware } from "../middleware/admin-auth"

/**
 * admin のコントローラー。リソースごとにネストし、渡されたものだけルートを登録する
 */
type AdminRouterControllers = {
  auth?: {
    devLogin?: AdminAuthDevLoginController
    google?: AdminAuthGoogleController
    logout?: AdminAuthLogoutController
    refresh?: AdminAuthRefreshController
  }
  contentSource?: {
    create?: AdminContentSourceCreateController
    detail?: AdminContentSourceDetailController
    detectLicense?: AdminContentSourceDetectLicenseController
    list?: AdminContentSourceListController
    update?: AdminContentSourceUpdateController
  }
  me?: {
    get?: AdminMeGetController
  }
  passage?: {
    detail?: AdminPassageDetailController
    list?: AdminPassageListController
    publish?: AdminPassagePublishController
    regenerate?: AdminPassageRegenerateController
    regenerateAudio?: AdminPassageRegenerateAudioController
    reject?: AdminPassageRejectController
    resolveAttention?: AdminPassageResolveAttentionController
    restore?: AdminPassageRestoreController
    retryAudio?: AdminPassageRetryAudioController
    unpublish?: AdminPassageUnpublishController
    update?: AdminPassageUpdateController
  }
  stats?: {
    overview?: AdminStatsOverviewController
    passageDetail?: AdminPassageStatsDetailController
    passageList?: AdminPassageStatsListController
  }
  tag?: {
    create?: AdminTagCreateController
    delete?: AdminTagDeleteController
    list?: AdminTagListController
    update?: AdminTagUpdateController
  }
  urlImport?: {
    create?: AdminUrlImportCreateController
    preview?: AdminUrlImportPreviewController
  }
  user?: {
    attempts?: AdminUserAttemptsController
    calendar?: AdminUserCalendarController
    detail?: AdminUserDetailController
    list?: AdminUserListController
  }
}

/**
 * admin 向けのルーター。
 *
 * /api/admin の下のルートは必ずこのルーターに足し、mountAdminApi で mount する（adminAuthMiddleware を通すため）。
 * ルートを足すときは、既存の router と同じく optional なコントローラーを受け取り、渡されたものだけを登録する。
 */
export const adminRouter = (controllers: AdminRouterControllers): Router => {
  const router = Router()

  const auth = controllers.auth ?? {}

  /**
   * POST /api/admin/auth/google
   */
  if (auth.google) {
    const controller = auth.google
    router.post("/auth/google", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/auth/dev-login（NODE_ENV !== "production" のみ）
   */
  if (auth.devLogin) {
    const controller = auth.devLogin
    router.post("/auth/dev-login", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/auth/refresh
   */
  if (auth.refresh) {
    const controller = auth.refresh
    router.post("/auth/refresh", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/auth/logout
   */
  if (auth.logout) {
    const controller = auth.logout
    router.post("/auth/logout", async (req, res) => controller.execute(req, res))
  }

  const me = controllers.me ?? {}

  /**
   * GET /api/admin/me
   */
  if (me.get) {
    const controller = me.get
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  const contentSource = controllers.contentSource ?? {}

  /**
   * GET /api/admin/content-source
   */
  if (contentSource.list) {
    const controller = contentSource.list
    router.get("/content-source", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/content-source/license は /:id より先に登録する（"license" が :id に一致して 400 になるため）
   */
  if (contentSource.detectLicense) {
    const controller = contentSource.detectLicense
    router.get("/content-source/license", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/content-source/:id
   */
  if (contentSource.detail) {
    const controller = contentSource.detail
    router.get("/content-source/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/content-source
   */
  if (contentSource.create) {
    const controller = contentSource.create
    router.post("/content-source", async (req, res) => controller.execute(req, res))
  }

  /**
   * PUT /api/admin/content-source/:id
   */
  if (contentSource.update) {
    const controller = contentSource.update
    router.put("/content-source/:id", async (req, res) => controller.execute(req, res))
  }

  const passage = controllers.passage ?? {}

  /**
   * GET /api/admin/passage
   */
  if (passage.list) {
    const controller = passage.list
    router.get("/passage", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/passage/:id
   */
  if (passage.detail) {
    const controller = passage.detail
    router.get("/passage/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * PUT /api/admin/passage/:id
   */
  if (passage.update) {
    const controller = passage.update
    router.put("/passage/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/publish
   */
  if (passage.publish) {
    const controller = passage.publish
    router.post("/passage/:id/publish", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/reject
   */
  if (passage.reject) {
    const controller = passage.reject
    router.post("/passage/:id/reject", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/unpublish
   */
  if (passage.unpublish) {
    const controller = passage.unpublish
    router.post("/passage/:id/unpublish", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/regenerate
   */
  if (passage.regenerate) {
    const controller = passage.regenerate
    router.post("/passage/:id/regenerate", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/restore
   */
  if (passage.restore) {
    const controller = passage.restore
    router.post("/passage/:id/restore", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/attention/resolve
   */
  if (passage.resolveAttention) {
    const controller = passage.resolveAttention
    router.post("/passage/:id/attention/resolve", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/audio/retry
   */
  if (passage.retryAudio) {
    const controller = passage.retryAudio
    router.post("/passage/:id/audio/retry", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/passage/:id/audio/regenerate
   */
  if (passage.regenerateAudio) {
    const controller = passage.regenerateAudio
    router.post("/passage/:id/audio/regenerate", async (req, res) => controller.execute(req, res))
  }

  const stats = controllers.stats ?? {}

  /**
   * GET /api/admin/stats/overview
   */
  if (stats.overview) {
    const controller = stats.overview
    router.get("/stats/overview", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/stats/passage
   */
  if (stats.passageList) {
    const controller = stats.passageList
    router.get("/stats/passage", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/stats/passage/:id
   */
  if (stats.passageDetail) {
    const controller = stats.passageDetail
    router.get("/stats/passage/:id", async (req, res) => controller.execute(req, res))
  }

  const tag = controllers.tag ?? {}

  /**
   * GET /api/admin/tag
   */
  if (tag.list) {
    const controller = tag.list
    router.get("/tag", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/tag
   */
  if (tag.create) {
    const controller = tag.create
    router.post("/tag", async (req, res) => controller.execute(req, res))
  }

  /**
   * PUT /api/admin/tag/:id
   */
  if (tag.update) {
    const controller = tag.update
    router.put("/tag/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * DELETE /api/admin/tag/:id
   */
  if (tag.delete) {
    const controller = tag.delete
    router.delete("/tag/:id", async (req, res) => controller.execute(req, res))
  }

  const urlImport = controllers.urlImport ?? {}

  /**
   * POST /api/admin/url-import/preview
   */
  if (urlImport.preview) {
    const controller = urlImport.preview
    router.post("/url-import/preview", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/admin/url-import
   */
  if (urlImport.create) {
    const controller = urlImport.create
    router.post("/url-import", async (req, res) => controller.execute(req, res))
  }

  const user = controllers.user ?? {}

  /**
   * GET /api/admin/user
   */
  if (user.list) {
    const controller = user.list
    router.get("/user", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/user/:id
   */
  if (user.detail) {
    const controller = user.detail
    router.get("/user/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/user/:id/calendar
   */
  if (user.calendar) {
    const controller = user.calendar
    router.get("/user/:id/calendar", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/admin/user/:id/attempts
   */
  if (user.attempts) {
    const controller = user.attempts
    router.get("/user/:id/attempts", async (req, res) => controller.execute(req, res))
  }

  return router
}

/**
 * admin の API を /api/admin に mount する。index.ts とテストで同じ組み方にするため、ここにまとめる。
 *
 * adminAuthMiddleware は全体ではなく mount の中に置く。Express 5 の mount と Router は大文字小文字を区別しないので、
 * 全体に適用して req.path を文字列で比べると、/API/Admin/... が admin の判定をすり抜けて Router に届くため。
 * mount の中なら、Router に届くリクエストは必ず adminAuthMiddleware を通る
 */
export const mountAdminApi = (app: Express, router: Router): void => {
  app.use(ADMIN_PATH_PREFIX, adminAuthMiddleware, router)
}
