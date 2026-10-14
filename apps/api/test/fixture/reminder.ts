import { eq, reminderSettings } from "@repo/db"

import { testDb } from "../controller/setup"

/**
 * 学習リマインダー（study-reminder）のテスト用のヘルパー。Repository のテストと Controller のインテグレーションテストで使う
 */

/**
 * リマインダーの設定を入れる（time は Postgres の time 型にそのまま渡す。"21:15" でよい）
 */
export const insertReminderSetting = async (
  userId: number,
  overrides: Partial<typeof reminderSettings.$inferInsert> = {},
) => {
  const [row] = await testDb
    .insert(reminderSettings)
    .values({
      isEnabled: true,
      time: "21:15",
      weekdays: [1, 3, 5],
      ...overrides,
      userId,
    })
    .returning()
  return row
}

/**
 * そのユーザーのリマインダーの設定の行（Drizzle の行。time は "21:15:00" の形）
 */
export const selectReminderSettingRows = async (userId: number) =>
  testDb.select().from(reminderSettings).where(eq(reminderSettings.userId, userId))
