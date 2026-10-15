import { UnrecoverableError } from "bullmq"

import { forTesting } from "../src/bullmq-queue"

const { isTerminalJobFailure } = forTesting

describe("isTerminalJobFailure", () => {
  describe("正常系", () => {
    it("試行を使い切っていなければ終局ではない", () => {
      const result = isTerminalJobFailure({
        attemptsMade: 1,
        error: new Error("transient"),
        maxAttempts: 3,
      })

      expect(result).toBe(false)
    })

    it("試行を使い切ったら終局", () => {
      const result = isTerminalJobFailure({
        attemptsMade: 3,
        error: new Error("transient"),
        maxAttempts: 3,
      })

      expect(result).toBe(true)
    })

    it("UnrecoverableError は初回失敗でも終局", () => {
      const result = isTerminalJobFailure({
        attemptsMade: 1,
        error: new UnrecoverableError("cannot recover"),
        maxAttempts: 3,
      })

      expect(result).toBe(true)
    })
  })

  describe("境界値", () => {
    it("最終試行の 1 つ前は終局ではない", () => {
      const result = isTerminalJobFailure({
        attemptsMade: 2,
        error: new Error("transient"),
        maxAttempts: 3,
      })

      expect(result).toBe(false)
    })

    it("attempts が 1 なら初回失敗が終局", () => {
      const result = isTerminalJobFailure({
        attemptsMade: 1,
        error: new Error("transient"),
        maxAttempts: 1,
      })

      expect(result).toBe(true)
    })

    /** job が取れず attemptsMade が 0 に落ちるケースでも終局扱いにしない */
    it("attemptsMade が 0 なら終局ではない", () => {
      const result = isTerminalJobFailure({
        attemptsMade: 0,
        error: new Error("transient"),
        maxAttempts: 1,
      })

      expect(result).toBe(false)
    })
  })
})
