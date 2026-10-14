import { saveReminderSetting } from "../../../src/service/reminder-service"

import {
  buildReminderSetting,
  createMockReminderSettingRepository,
  createMockUserRepository,
  REMINDER_INPUT,
  USER,
} from "./fixtures"

const setup = () => ({
  reminderSettingRepository: createMockReminderSettingRepository(),
  userRepository: createMockUserRepository(),
})

describe("saveReminderSetting", () => {
  describe("正常系", () => {
    it("ユーザーが存在すれば upsertByUserId を呼び、保存後の値（isEnabled / time / weekdays）を ok で返す", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.reminderSettingRepository.upsertByUserId.mockResolvedValue(buildReminderSetting())

      const result = await saveReminderSetting(USER.id, REMINDER_INPUT, repo)

      expect(result).toEqual({ ok: true, value: REMINDER_INPUT })
      expect(repo.userRepository.findById).toHaveBeenCalledWith(USER.id)
      expect(repo.reminderSettingRepository.upsertByUserId).toHaveBeenCalledWith(USER.id, REMINDER_INPUT)
    })

    it("weekdays を昇順に並べてから upsertByUserId を呼ぶ（[5, 1, 3] → [1, 3, 5]）", async () => {
      const repo = setup()
      const input = { ...REMINDER_INPUT, weekdays: [5, 1, 3] }
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.reminderSettingRepository.upsertByUserId.mockResolvedValue(buildReminderSetting({ weekdays: [1, 3, 5] }))

      const result = await saveReminderSetting(USER.id, input, repo)

      expect(repo.reminderSettingRepository.upsertByUserId).toHaveBeenCalledWith(USER.id, { ...REMINDER_INPUT, weekdays: [1, 3, 5] })
      expect(result).toEqual({ ok: true, value: { ...REMINDER_INPUT, weekdays: [1, 3, 5] } })
      /**
       * 入力の配列そのものは並べ替えない
       */
      expect(input.weekdays).toEqual([5, 1, 3])
    })

    it("オフでも曜日と時刻をそのまま保存する", async () => {
      const repo = setup()
      const input = { isEnabled: false, time: "07:00", weekdays: [6, 7] }
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.reminderSettingRepository.upsertByUserId.mockResolvedValue(buildReminderSetting(input))

      const result = await saveReminderSetting(USER.id, input, repo)

      expect(result).toEqual({ ok: true, value: input })
      expect(repo.reminderSettingRepository.upsertByUserId).toHaveBeenCalledWith(USER.id, input)
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しなければ UNAUTHORIZED（401）で、upsertByUserId を呼ばない", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(null)

      const result = await saveReminderSetting(999, REMINDER_INPUT, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(repo.reminderSettingRepository.upsertByUserId).not.toHaveBeenCalled()
    })

    it("データベースエラー時に例外が伝播する", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.reminderSettingRepository.upsertByUserId.mockRejectedValue(new Error("Database connection failed"))

      await expect(saveReminderSetting(USER.id, REMINDER_INPUT, repo)).rejects.toThrow()
    })
  })
})
