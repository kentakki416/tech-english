import { Router } from "express"

import { VocabularyReviewController } from "../controller/vocabulary/review"
import { VocabularySessionController } from "../controller/vocabulary/session"
import { VocabularySummaryController } from "../controller/vocabulary/summary"

type VocabularyRouterControllers = {
  review?: VocabularyReviewController
  session?: VocabularySessionController
  summary?: VocabularySummaryController
}

/**
 * 認証必須（PUBLIC_PATHS に入れない）
 */
export const vocabularyRouter = (controllers: VocabularyRouterControllers): Router => {
  const router = Router()

  if (controllers.review) {
    const controller = controllers.review
    router.post("/review", async (req, res) => controller.execute(req, res))
  }

  if (controllers.session) {
    const controller = controllers.session
    router.get("/session", async (req, res) => controller.execute(req, res))
  }

  if (controllers.summary) {
    const controller = controllers.summary
    router.get("/summary", async (req, res) => controller.execute(req, res))
  }

  return router
}
