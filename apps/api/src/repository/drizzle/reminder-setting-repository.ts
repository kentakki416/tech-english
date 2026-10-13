import { DrizzleClient, eq, reminderSettings } from "@repo/db"
import type { ReminderSetting } from "@repo/domain"

import type { ReminderSettingRepository, UpsertReminderSettingInput } from "../reminder-setting-repository"

/**
 * Drizzleの型
 */
type ReminderSettingRow = typeof reminderSettings.$inferSelect

/**
 * Drizzle 実装の ReminderSettingRepository
 */
export class DrizzleReminderSettingRepository implements ReminderSettingRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findByUserId(userId: number): Promise<ReminderSetting | null> {
    const [row] = await this._db.select().from(reminderSettings).where(eq(reminderSettings.userId, userId))
    return row ? this._toDomainReminderSetting(row) : null
  }

  /**
   * user_id の unique index を ON CONFLICT の対象にして 1 文で upsert する。
   * updated_at は列の $onUpdate が ON CONFLICT DO UPDATE SET にも入るので明示しない
   */
  public async upsertByUserId(userId: number, data: UpsertReminderSettingInput): Promise<ReminderSetting> {
    const values = { isEnabled: data.isEnabled, time: data.time, weekdays: data.weekdays }
    const [row] = await this._db
      .insert(reminderSettings)
      .values({ ...values, userId })
      .onConflictDoUpdate({ set: values, target: reminderSettings.userId })
      .returning()
    return this._toDomainReminderSetting(row)
  }

  /**
   * Drizzleの型 → ドメインの型に変換。time は Postgres が "21:00:00" で返すので "HH:mm" にする
   */
  private _toDomainReminderSetting(row: ReminderSettingRow): ReminderSetting {
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      time: row.time.slice(0, 5),
      userId: row.userId,
      weekdays: row.weekdays,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
