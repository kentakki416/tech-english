import { Router } from "express"

import { UserAttemptsController } from "../controller/user/attempts"
import { UserCalendarController } from "../controller/user/calendar"
import { UserDeleteController } from "../controller/user/delete"
import { UserGetController } from "../controller/user/get"
import { UserGetGoalController } from "../controller/user/get-goal"
import { UserGetReminderController } from "../controller/user/get-reminder"
import { UserPutGoalController } from "../controller/user/put-goal"
import { UserPutReminderController } from "../controller/user/put-reminder"
import { UserStatsController } from "../controller/user/stats"
import { UserUpdateController } from "../controller/user/update"

type UserRouterControllers = {
  attempts?: UserAttemptsController
  calendar?: UserCalendarController
  delete?: UserDeleteController
  get?: UserGetController
  getGoal?: UserGetGoalController
  getReminder?: UserGetReminderController
  putGoal?: UserPutGoalController
  putReminder?: UserPutReminderController
  stats?: UserStatsController
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

  /**
   * GET /api/user/stats（マイページの統計）
   */
  if (controllers.stats) {
    const controller = controllers.stats
    router.get("/stats", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/user/calendar（学習カレンダー）
   */
  if (controllers.calendar) {
    const controller = controllers.calendar
    router.get("/calendar", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/user/attempts（提出した挑戦の一覧）
   */
  if (controllers.attempts) {
    const controller = controllers.attempts
    router.get("/attempts", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/user/goal（目標の取得）
   */
  if (controllers.getGoal) {
    const controller = controllers.getGoal
    router.get("/goal", async (req, res) => controller.execute(req, res))
  }

  /**
   * PUT /api/user/goal（目標の保存）
   */
  if (controllers.putGoal) {
    const controller = controllers.putGoal
    router.put("/goal", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/user/reminder（リマインダーの設定の取得）
   */
  if (controllers.getReminder) {
    const controller = controllers.getReminder
    router.get("/reminder", async (req, res) => controller.execute(req, res))
  }

  /**
   * PUT /api/user/reminder（リマインダーの設定の保存）
   */
  if (controllers.putReminder) {
    const controller = controllers.putReminder
    router.put("/reminder", async (req, res) => controller.execute(req, res))
  }

  return router
}
