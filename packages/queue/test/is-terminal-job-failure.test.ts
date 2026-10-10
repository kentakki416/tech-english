import { UnrecoverableError } from "bullmq"

import { forTesting } from "../src/bullmq-queue"

const { isTerminalJobFailure } = forTesting

/**
 * 失敗が「終局（もうリトライされない）」かの判定。
 *
 * これを誤ると log level を誤判定し、アラートが鳴らない（= データ喪失に
 * 気付けない）か、逆に自動回復する失敗で鳴り続ける。
 */
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

    /**
     * BullMQ は UnrecoverableError を attempts の上限を待たず failed set に移す。
     * 回数だけで判定すると初回失敗を「リトライされる」と誤判定する。
     */
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
    /**
     * attemptsMade は failed イベントの発火時点で既に加算済み（1 オリジン）。
     * `+1` して比較すると最終失敗を 1 回早く終局にしてしまう。
     */
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
