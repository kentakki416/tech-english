import { Router } from "express"

import { AttemptAudioController } from "../controller/attempt/audio"
import { AttemptDetailController } from "../controller/attempt/detail"
import { AttemptSubmitController } from "../controller/attempt/submit"

type AttemptRouterControllers = {
  audio?: AttemptAudioController
  detail?: AttemptDetailController
  submit?: AttemptSubmitController
}

/**
 * 認証必須（PUBLIC_PATHS に入れない）
 */
export const attemptRouter = (controllers: AttemptRouterControllers): Router => {
  const router = Router()

  if (controllers.detail) {
    const controller = controllers.detail
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }

  if (controllers.audio) {
    const controller = controllers.audio
    router.get("/:id/audio", async (req, res) => controller.execute(req, res))
  }

  if (controllers.submit) {
    const controller = controllers.submit
    router.post("/:id/submit", async (req, res) => controller.execute(req, res))
  }

  return router
}
