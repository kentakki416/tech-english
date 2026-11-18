import { Router } from "express"

import { HealthLivenessController } from "../controller/health/liveness"
import { HealthReadinessController } from "../controller/health/readiness"

type HealthRouterControllers = {
  liveness?: HealthLivenessController
  readiness?: HealthReadinessController
}

export const healthRouter = (controllers: HealthRouterControllers): Router => {
  const router = Router()

  if (controllers.liveness) {
    const controller = controllers.liveness
    router.get("/", (req, res) => controller.execute(req, res))
  }

  if (controllers.readiness) {
    const controller = controllers.readiness
    router.get("/ready", async (req, res) => controller.execute(req, res))
  }

  return router
}
