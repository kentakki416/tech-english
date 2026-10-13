import type { UserGoal } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import type { UpsertUserGoalInput, UserGoalRepository, UserRepository } from "../repository"

type GoalRepo = { userGoalRepository: UserGoalRepository; userRepository: UserRepository }

/**
 * 目標を取得する（未設定なら null）。読み取りなのでユーザーの存在は確かめない（削除済みなら行が無く null になる）
 */
export const getUserGoal = async (
  userId: number,
  repo: { userGoalRepository: UserGoalRepository },
): Promise<Result<UserGoal | null>> => ok(await repo.userGoalRepository.findByUserId(userId))

/**
 * 目標を保存する（あれば全項目を上書き、無ければ作る）。週の目標の指標と値の組み合わせは API の入力時に検証済みの前提。
 * 削除済みユーザーの access token（JWT なので最長 15 分は残る）で書き込まれないよう、先にユーザーの存在を確かめて 401 にする
 * （外部キー違反の 500 にしない）
 */
export const saveUserGoal = async (
  userId: number,
  data: UpsertUserGoalInput,
  repo: GoalRepo,
): Promise<Result<UserGoal>> => {
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    logger.debug("GoalService: User not found", {
      userId,
    })
    return err(unauthorizedError("User not found"))
  }

  const goal = await repo.userGoalRepository.upsertByUserId(userId, data)
  logger.info("GoalService: Goal saved", {
    userId,
  })
  return ok(goal)
}
