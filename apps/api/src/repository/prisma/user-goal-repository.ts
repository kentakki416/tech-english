import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { isGoalMetric, type UserGoal } from "@repo/domain"

import type { UpsertUserGoalInput, UserGoalRepository } from "../user-goal-repository"

/**
 * Prismaの型
 */
type UserGoalRow = PrismaTypes.UserGoalGetPayload<{}>

/**
 * Prismaの型 → ドメインの型。weekly_metric は domain の判定関数で検証し（未知の値は throw）、
 * target_date（UTC の 0 時の Date）は YYYY-MM-DD に戻す
 */
const convertUserGoalRowToDomain = (row: UserGoalRow): UserGoal => {
  if (row.weeklyMetric !== null && !isGoalMetric(row.weeklyMetric)) {
    throw new Error(`Invalid goal metric: id=${row.id}, weeklyMetric=${row.weeklyMetric}`)
  }
  return {
    id: row.id,
    goalText: row.goalText,
    targetDate: row.targetDate === null ? null : row.targetDate.toISOString().slice(0, 10),
    userId: row.userId,
    weeklyMetric: row.weeklyMetric,
    weeklyTarget: row.weeklyTarget,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * YYYY-MM-DD → Prisma の date 列に入れる Date（UTC の 0 時）
 */
const convertTargetDateToPrisma = (targetDate: string | null): Date | null =>
  targetDate === null ? null : new Date(`${targetDate}T00:00:00.000Z`)

/**
 * Prisma 実装の UserGoalRepository
 */
export class PrismaUserGoalRepository implements UserGoalRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findByUserId(userId: number): Promise<UserGoal | null> {
    const row = await this._prisma.userGoal.findUnique({ where: { userId } })
    return row ? convertUserGoalRowToDomain(row) : null
  }

  /**
   * user_id の unique で 1 ユーザー 1 行に保つ（あれば update、無ければ create）
   */
  public async upsertByUserId(userId: number, data: UpsertUserGoalInput): Promise<UserGoal> {
    const values = {
      goalText: data.goalText,
      targetDate: convertTargetDateToPrisma(data.targetDate),
      weeklyMetric: data.weeklyMetric,
      weeklyTarget: data.weeklyTarget,
    }
    const row = await this._prisma.userGoal.upsert({
      create: { ...values, userId },
      update: values,
      where: { userId },
    })
    return convertUserGoalRowToDomain(row)
  }
}
