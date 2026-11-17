import type { ReminderSetting } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import type { ReminderSettingRepository, UpsertReminderSettingInput, UserRepository } from "../repository"

/**
 * API が返すリマインダーの設定（保存済みの値か既定値）
 */
type ReminderSchedule = Pick<ReminderSetting, "isEnabled" | "time" | "weekdays">

const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = { isEnabled: false, time: "21:00", weekdays: [1, 2, 3, 4, 5, 6, 7] }

/**
 * 読み取りなのでユーザーの存在は確かめない（削除済みなら行が無く既定値になる）
 */
export const getReminderSetting = async (
  userId: number,
  repo: { reminderSettingRepository: ReminderSettingRepository },
): Promise<Result<ReminderSchedule>> => {
  const setting = await repo.reminderSettingRepository.findByUserId(userId)
  if (!setting) {
    /**
     * 既定値の配列を呼び出し側に共有させない
     */
    return ok({ ...DEFAULT_REMINDER_SCHEDULE, weekdays: [...DEFAULT_REMINDER_SCHEDULE.weekdays] })
  }
  return ok({ isEnabled: setting.isEnabled, time: setting.time, weekdays: setting.weekdays })
}

/**
 * 値域（曜日 1〜7・重複なし・時刻の 15 分刻み）は API の入力時に検証済みの前提
 */
export const saveReminderSetting = async (
  userId: number,
  input: UpsertReminderSettingInput,
  repo: { reminderSettingRepository: ReminderSettingRepository; userRepository: UserRepository },
): Promise<Result<ReminderSchedule>> => {
  /**
   * 削除済みユーザーの access token（JWT なので最長 15 分は残る）で書き込まれないよう、先にユーザーの存在を確かめて 401 にする
   * （外部キー違反の 500 にしない）
   */
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    logger.debug("ReminderService: User not found", {
      userId,
    })
    return err(unauthorizedError("User not found"))
  }

  const weekdays = [...input.weekdays].sort((a, b) => a - b)
  const setting = await repo.reminderSettingRepository.upsertByUserId(userId, { ...input, weekdays })
  logger.info("ReminderService: Reminder setting saved", {
    userId,
  })
  return ok({ isEnabled: setting.isEnabled, time: setting.time, weekdays: setting.weekdays })
}
