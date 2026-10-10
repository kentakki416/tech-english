import { User } from "@repo/domain"
import { err, notFoundError, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { UserRepository } from "../repository"

/**
 * ユーザーIDからユーザー情報を取得
 */
export const getUserById = async (
  userId: number,
  repo: { userRepository: UserRepository }
): Promise<Result<User>> => {
  logger.debug("UserService: Fetching user by ID", {
    userId,
  })
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    logger.debug("UserService: User not found", {
      userId,
    })
    return err(notFoundError("User not found"))
  }
  logger.debug("UserService: User found", {
    userId: user.id,
  })
  return ok(user)
}

/**
 * 認証中ユーザーのタイムゾーンを変更する
 *
 * タイムゾーン名の検証は API の入力時（api-schema の timezoneSchema）に済んでいる前提。
 */
export const updateUserTimezone = async (
  userId: number,
  input: { timezone: string },
  repo: { userRepository: UserRepository }
): Promise<Result<User>> => {
  /**
   * 削除済みユーザーの access token が残っている場合（access token は JWT なので最長 15 分は失効させられない）
   */
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    logger.debug("UserService: User not found", {
      userId,
    })
    return err(unauthorizedError("User not found"))
  }

  const updatedUser = await repo.userRepository.updateTimezone(userId, input.timezone)
  logger.info("UserService: Timezone updated", {
    userId,
  })
  return ok(updatedUser)
}
