import { Router } from "express"

import { DictionaryLookupController } from "../controller/dictionary/lookup"

type DictionaryRouterControllers = {
  lookup?: DictionaryLookupController
}

/**
 * 英和辞書のルーター（/api/dictionary にマウントする）。認証必須（PUBLIC_PATHS に入れない）。
 * 渡されたコントローラーのルートのみ登録する
 */
export const dictionaryRouter = (controllers: DictionaryRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/dictionary?word=
   */
  if (controllers.lookup) {
    const controller = controllers.lookup
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
