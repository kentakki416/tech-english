import { Router } from "express"

import { VocabularySessionController } from "../controller/vocabulary/session"
import { VocabularySummaryController } from "../controller/vocabulary/summary"

type VocabularyRouterControllers = {
  session?: VocabularySessionController
  summary?: VocabularySummaryController
}

/**
 * 単語帳のルーター（/api/vocabulary にマウントする）。認証必須（PUBLIC_PATHS に入れない）。
 * 渡されたコントローラーのルートのみ登録する
 */
export const vocabularyRouter = (controllers: VocabularyRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/vocabulary/session
   */
  if (controllers.session) {
    const controller = controllers.session
    router.get("/session", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/vocabulary/summary
   */
  if (controllers.summary) {
    const controller = controllers.summary
    router.get("/summary", async (req, res) => controller.execute(req, res))
  }

  return router
}
