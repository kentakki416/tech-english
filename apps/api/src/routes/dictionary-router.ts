import { Router } from "express"

import { DictionaryLookupController } from "../controller/dictionary/lookup"

type DictionaryRouterControllers = {
  lookup?: DictionaryLookupController
}

/**
 * 認証必須（PUBLIC_PATHS に入れない）
 */
export const dictionaryRouter = (controllers: DictionaryRouterControllers): Router => {
  const router = Router()

  if (controllers.lookup) {
    const controller = controllers.lookup
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
