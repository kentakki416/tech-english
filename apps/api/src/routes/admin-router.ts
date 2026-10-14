import { Router } from "express"

import { AdminContentSourceCreateController } from "../controller/admin/content-source/create"
import { AdminContentSourceDetailController } from "../controller/admin/content-source/detail"
import { AdminContentSourceDetectLicenseController } from "../controller/admin/content-source/detect-license"
import { AdminContentSourceListController } from "../controller/admin/content-source/list"
import { AdminContentSourceUpdateController } from "../controller/admin/content-source/update"
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

  return router
}
