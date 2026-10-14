import { User } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { RefreshTokenRepository, UserRepository } from "../repository"

type RefreshVerifier = (token: string) => { jti: string; userId: number } | null

/**
 * ユーザーIDからユーザー情報を取得
 *
 * ユーザーが無いときは 401 にする。access token は JWT なので、アカウント削除後も最長 15 分は残る。
 * 401 を返せばクライアントは refresh を試み、refresh も 401 になってログイン画面に戻る
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
    return err(unauthorizedError("User not found"))
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

/**
 * アカウントの削除。users の行を消し、関連データは外部キーの cascade で消す。
 * 既に無いユーザーでも成功にする（二重送信・削除済みの端末から呼ばれても同じ結果になる）
 *
 * DB の削除を先に行う。Redis の失敗で 500 になっても、再送すれば（ユーザーは消えているので）jti の失効だけが行われる。
 */
export const deleteUser = async (
  userId: number,
  input: { refreshToken?: string },
  repo: { refreshTokenRepository: RefreshTokenRepository; userRepository: UserRepository },
  verifier: RefreshVerifier
): Promise<Result<void>> => {
  const user = await repo.userRepository.findById(userId)
  if (user) {
    await repo.userRepository.deleteById(userId)
  }

  /**
   * 他人の refresh token を消させないよう、本人のものだけ失効させる
   */
  const payload = input.refreshToken ? verifier(input.refreshToken) : null
  if (payload && payload.userId === userId) {
    await repo.refreshTokenRepository.delete(payload.jti)
  }

  logger.info("UserService: User deleted", {
    userId,
  })
  return ok(undefined)
}
