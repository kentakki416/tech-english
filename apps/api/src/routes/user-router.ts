import { Router } from "express"

import { UserDeleteController } from "../controller/user/delete"
import { UserGetController } from "../controller/user/get"
import { UserUpdateController } from "../controller/user/update"

type UserRouterControllers = {
  delete?: UserDeleteController
  get?: UserGetController
  update?: UserUpdateController
}

/**
 * 認証中ユーザー（自分自身）に関するルーター
 * グローバルに authMiddleware が適用済みのため、ここでは認証チェックを行わない。
 */
export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  /** GET /api/user */
  if (controllers.get) {
    const controller = controllers.get
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  /** PATCH /api/user（タイムゾーンの変更） */
  if (controllers.update) {
    const controller = controllers.update
    router.patch("/", async (req, res) => controller.execute(req, res))
  }

  /**
   * DELETE /api/user（アカウントの削除）
   */
  if (controllers.delete) {
    const controller = controllers.delete
    router.delete("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
