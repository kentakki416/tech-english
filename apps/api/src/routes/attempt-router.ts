import { Router } from "express"

import { AttemptDetailController } from "../controller/attempt/detail"
import { AttemptSubmitController } from "../controller/attempt/submit"

type AttemptRouterControllers = {
  detail?: AttemptDetailController
  submit?: AttemptSubmitController
}

/**
 * 自分の挑戦のルーター（/api/attempt にマウントする）。認証必須（PUBLIC_PATHS に入れない）。
 * 挑戦の開始は問題のルーター（POST /api/passage/:id/attempt）に置く。渡されたコントローラーのルートのみ登録する
 */
export const attemptRouter = (controllers: AttemptRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/attempt/:id
   */
  if (controllers.detail) {
    const controller = controllers.detail
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/attempt/:id/submit
   */
  if (controllers.submit) {
    const controller = controllers.submit
    router.post("/:id/submit", async (req, res) => controller.execute(req, res))
  }

  return router
}
