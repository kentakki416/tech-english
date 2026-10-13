import { getReminderSetting } from "../../../src/service/reminder-service"

import { buildReminderSetting, createMockReminderSettingRepository, USER } from "./fixtures"

const DEFAULT_SCHEDULE = { isEnabled: false, time: "21:00", weekdays: [1, 2, 3, 4, 5, 6, 7] }

describe("getReminderSetting", () => {
  describe("正常系", () => {
    it("保存済みなら保存値（isEnabled / time / weekdays）を ok で返す", async () => {
      const reminderSettingRepository = createMockReminderSettingRepository()
      reminderSettingRepository.findByUserId.mockResolvedValue(
        buildReminderSetting({ isEnabled: true, time: "07:45", weekdays: [2, 4] }),
      )

      const result = await getReminderSetting(USER.id, { reminderSettingRepository })

      expect(result).toEqual({ ok: true, value: { isEnabled: true, time: "07:45", weekdays: [2, 4] } })
      expect(reminderSettingRepository.findByUserId).toHaveBeenCalledWith(USER.id)
    })

    it("未保存なら既定値（オフ・毎日・21:00）を ok で返す", async () => {
      const reminderSettingRepository = createMockReminderSettingRepository()
      reminderSettingRepository.findByUserId.mockResolvedValue(null)

      const result = await getReminderSetting(USER.id, { reminderSettingRepository })

      expect(result).toEqual({ ok: true, value: DEFAULT_SCHEDULE })
    })

    it("返した既定値の配列を書き換えても、次の呼び出しの既定値は変わらない", async () => {
      const reminderSettingRepository = createMockReminderSettingRepository()
      reminderSettingRepository.findByUserId.mockResolvedValue(null)
      const first = await getReminderSetting(USER.id, { reminderSettingRepository })
      if (first.ok) first.value.weekdays.push(8)

      const second = await getReminderSetting(USER.id, { reminderSettingRepository })

      expect(second).toEqual({ ok: true, value: DEFAULT_SCHEDULE })
    })
  })

  describe("異常系", () => {
    it("データベースエラー時に例外が伝播する", async () => {
      const reminderSettingRepository = createMockReminderSettingRepository()
      reminderSettingRepository.findByUserId.mockRejectedValue(new Error("Database connection failed"))

      await expect(getReminderSetting(USER.id, { reminderSettingRepository })).rejects.toThrow()
    })
  })
})
