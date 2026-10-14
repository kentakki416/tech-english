import { Router } from "express"

import { AdminContentSourceCreateController } from "../controller/admin/content-source/create"
import { AdminContentSourceDetailController } from "../controller/admin/content-source/detail"
import { AdminContentSourceDetectLicenseController } from "../controller/admin/content-source/detect-license"
import { AdminContentSourceListController } from "../controller/admin/content-source/list"
import { AdminContentSourceUpdateController } from "../controller/admin/content-source/update"
import { AdminPassageDetailController } from "../controller/admin/passage/detail"
import { AdminPassageListController } from "../controller/admin/passage/list"
import { AdminPassagePublishController } from "../controller/admin/passage/publish"
import { AdminPassageRegenerateController } from "../controller/admin/passage/regenerate"
import { AdminPassageRejectController } from "../controller/admin/passage/reject"
import { AdminPassageResolveAttentionController } from "../controller/admin/passage/resolve-attention"
import { AdminPassageRestoreController } from "../controller/admin/passage/restore"
import { AdminPassageUnpublishController } from "../controller/admin/passage/unpublish"
import { AdminPassageUpdateController } from "../controller/admin/passage/update"
import { adminAuthMiddleware } from "../middleware/admin-auth"

/**
 * admin のコントローラー。リソースごとにネストし、渡されたものだけルートを登録する
 */
type AdminRouterControllers = {
  contentSource?: {
    create?: AdminContentSourceCreateController
    detail?: AdminContentSourceDetailController
    detectLicense?: AdminContentSourceDetectLicenseController
    list?: AdminContentSourceListController
    update?: AdminContentSourceUpdateController
  }
  passage?: {
    detail?: AdminPassageDetailController
    list?: AdminPassageListController
    publish?: AdminPassagePublishController
    regenerate?: AdminPassageRegenerateController
    reject?: AdminPassageRejectController
    resolveAttention?: AdminPassageResolveAttentionController
    restore?: AdminPassageRestoreController
    unpublish?: AdminPassageUnpublishController
    update?: AdminPassageUpdateController
  }
}

/**
 * admin 向けのルーター（/api/admin にマウントする）。すべてのルートの前に adminAuthMiddleware を通す。
 *
 * /api/admin は PUBLIC_PATHS に入っていてユーザーの JWT 認証を通らないため、
 * /api/admin 配下のルートは必ずこのルーターに足す（別の router に足すと無認証で公開される）。
 * ルートを足すときは、既存の router と同じく optional なコントローラーを受け取り、渡されたものだけを登録する。
 */
export const adminRouter = (controllers: AdminRouterControllers): Router => {
  const router = Router()

  router.use(adminAuthMiddleware)

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

  return router
}
