import type { GoalMetric, UserGoal } from "@repo/domain"

/**
 * 目標の保存（upsert）の入力。すべての項目を上書きする（空は null）。
 * weeklyMetric と weeklyTarget は両方あるか両方 null（DB の CHECK 制約。破ると throw する）
 */
export type UpsertUserGoalInput = {
  goalText: string | null
  /**
   * YYYY-MM-DD
   */
  targetDate: string | null
  weeklyMetric: GoalMetric | null
  weeklyTarget: number | null
}

/**
 * ユーザーの目標（user_goals。1 ユーザー 1 行）のリポジトリ
 */
export interface UserGoalRepository {
  /**
   * 目標が未設定なら null
   */
  findByUserId(userId: number): Promise<UserGoal | null>
  /**
   * user_id の行があれば全項目を上書き、無ければ作る。存在しない userId は外部キー違反で throw する
   */
  upsertByUserId(userId: number, data: UpsertUserGoalInput): Promise<UserGoal>
}
