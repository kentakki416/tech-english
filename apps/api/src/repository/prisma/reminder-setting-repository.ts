import { z } from "zod"

import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import type { ReminderSetting } from "@repo/domain"

import type { ReminderSettingRepository, UpsertReminderSettingInput } from "../reminder-setting-repository"

/**
 * Prismaの型
 */
type ReminderSettingRow = PrismaTypes.ReminderSettingGetPayload<{}>

/**
 * weekdays（Json）の検証。ISO の曜日番号（1〜7 の整数）の配列でなければ parse が throw する（as でキャストしない）
 */
const weekdaysSchema = z.array(z.number().int().min(1).max(7))

/**
 * Prisma 実装の ReminderSettingRepository
 */
export class PrismaReminderSettingRepository implements ReminderSettingRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findByUserId(userId: number): Promise<ReminderSetting | null> {
    const row = await this._prisma.reminderSetting.findUnique({ where: { userId } })
    return row ? this._toDomainReminderSetting(row) : null
  }

  /**
   * user_id の unique で 1 ユーザー 1 行に保つ（あれば update、無ければ create）
   */
  public async upsertByUserId(userId: number, data: UpsertReminderSettingInput): Promise<ReminderSetting> {
    const values = { isEnabled: data.isEnabled, time: this._toPrismaTime(data.time), weekdays: data.weekdays }
    const row = await this._prisma.reminderSetting.upsert({
      create: { ...values, userId },
      update: values,
      where: { userId },
    })
    return this._toDomainReminderSetting(row)
  }

  /**
   * Prismaの型 → ドメインの型。time（1970-01-01 の UTC の DateTime）は "HH:mm" に戻し、
   * weekdays（Json）は曜日番号の配列であることを検証する（違えば throw）
   */
  private _toDomainReminderSetting(row: ReminderSettingRow): ReminderSetting {
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      time: row.time.toISOString().slice(11, 16),
      userId: row.userId,
      weekdays: weekdaysSchema.parse(row.weekdays),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  /**
   * "HH:mm" → 1970-01-01 の UTC の DateTime（Prisma の @db.Time の表現）
   */
  private _toPrismaTime(time: string): Date {
    return new Date(`1970-01-01T${time}:00.000Z`)
  }
}
