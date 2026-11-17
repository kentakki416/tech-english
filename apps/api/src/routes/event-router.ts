import { Router } from "express"

import { EventCreateController } from "../controller/event/create"

type EventRouterControllers = {
  create?: EventCreateController
}

export const eventRouter = (controllers: EventRouterControllers): Router => {
  const router = Router()

  if (controllers.create) {
    const controller = controllers.create
    router.post("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
