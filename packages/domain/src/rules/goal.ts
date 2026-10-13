import { GOAL_METRICS } from "../const/goal"
import type { GoalMetric } from "../types/goal"

/**
 * 週の目標の指標の値かどうか
 */
export const isGoalMetric = (value: string): value is GoalMetric =>
  (GOAL_METRICS as readonly string[]).includes(value)
