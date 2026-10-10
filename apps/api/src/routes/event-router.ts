import { Router } from "express"

import { EventCreateController } from "../controller/event/create"

type EventRouterControllers = {
  create?: EventCreateController
}

/**
 * 行動イベント関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const eventRouter = (controllers: EventRouterControllers): Router => {
  const router = Router()

  // POST /api/events
  if (controllers.create) {
    const controller = controllers.create
    router.post("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
