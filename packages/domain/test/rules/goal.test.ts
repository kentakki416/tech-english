import { GOAL_METRICS } from "../../src/const/goal"
import { isGoalMetric } from "../../src/rules/goal"

describe("isGoalMetric", () => {
  describe("正常系", () => {
    it.each(GOAL_METRICS)("%s は週の目標の指標の値である", (value) => {
      expect(isGoalMetric(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "hours", "Passages", "minute"])("%j は週の目標の指標の値ではない", (value) => {
      expect(isGoalMetric(value)).toBe(false)
    })
  })
})
