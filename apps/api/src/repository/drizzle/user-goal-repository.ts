import { DrizzleClient, eq, userGoals } from "@repo/db"
import type { UserGoal } from "@repo/domain"

import type { UpsertUserGoalInput, UserGoalRepository } from "../user-goal-repository"

/**
 * Drizzleの型
 */
type UserGoalRow = typeof userGoals.$inferSelect

/**
 * Drizzle 実装の UserGoalRepository
 */
export class DrizzleUserGoalRepository implements UserGoalRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findByUserId(userId: number): Promise<UserGoal | null> {
    const [row] = await this._db.select().from(userGoals).where(eq(userGoals.userId, userId))
    return row ? this._toDomainUserGoal(row) : null
  }

  /**
   * user_id の unique index を ON CONFLICT の対象にして 1 文で upsert する。
   * onConflictDoUpdate の set には $onUpdate が効かないので updatedAt を明示する
   */
  public async upsertByUserId(userId: number, data: UpsertUserGoalInput): Promise<UserGoal> {
    const values = {
      goalText: data.goalText,
      targetDate: data.targetDate,
      weeklyMetric: data.weeklyMetric,
      weeklyTarget: data.weeklyTarget,
    }
    const [row] = await this._db
      .insert(userGoals)
      .values({ ...values, userId })
      .onConflictDoUpdate({ set: { ...values, updatedAt: new Date() }, target: userGoals.userId })
      .returning()
    return this._toDomainUserGoal(row)
  }

  /**
   * Drizzleの型 → ドメインの型に変換（target_date は mode: "string" なので YYYY-MM-DD のまま）
   */
  private _toDomainUserGoal(row: UserGoalRow): UserGoal {
    return {
      id: row.id,
      goalText: row.goalText,
      targetDate: row.targetDate,
      userId: row.userId,
      weeklyMetric: row.weeklyMetric,
      weeklyTarget: row.weeklyTarget,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
