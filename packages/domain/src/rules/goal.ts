import { GOAL_METRICS } from "../const/goal"
import type { GoalMetric } from "../types/goal"

export const isGoalMetric = (value: string): value is GoalMetric =>
  (GOAL_METRICS as readonly string[]).includes(value)
