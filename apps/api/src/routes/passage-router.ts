import { Router } from "express"

import { AttemptStartController } from "../controller/attempt/start"
import { PassageDetailController } from "../controller/passage/detail"
import { PassageListController } from "../controller/passage/list"
import { PassageRandomController } from "../controller/passage/random"

type PassageRouterControllers = {
  detail?: PassageDetailController
  list?: PassageListController
  random?: PassageRandomController
  start?: AttemptStartController
}

/**
 * ユーザー向けの問題のルーター（/api/passage にマウントする）。認証必須（PUBLIC_PATHS に入れない）。
 * 渡されたコントローラーのルートのみ登録する
 */
export const passageRouter = (controllers: PassageRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/passage
   */
  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/passage/random は /:id より先に登録する（"random" が :id に一致して 400 になるため）
   */
  if (controllers.random) {
    const controller = controllers.random
    router.get("/random", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/passage/:id
   */
  if (controllers.detail) {
    const controller = controllers.detail
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/passage/:id/attempt（挑戦の開始）
   */
  if (controllers.start) {
    const controller = controllers.start
    router.post("/:id/attempt", async (req, res) => controller.execute(req, res))
  }

  return router
}
