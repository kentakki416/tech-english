import { NoopEventTracker } from "../src/noop-tracker"

describe("NoopEventTracker", () => {
  describe("正常系", () => {
    it("track / trackAll は例外を投げずにイベントを捨てる", () => {
      const tracker = new NoopEventTracker()

      expect(() => {
        tracker.track({ name: "memo_created", source: "api", userId: 1 })
        tracker.trackAll([
          { name: "memo_updated", source: "api", userId: 1 },
          { name: "memo_deleted", source: "api", userId: 1 },
        ])
      }).not.toThrow()
    })

    it("flush はすぐ resolve する", async () => {
      const tracker = new NoopEventTracker()
      tracker.track({ name: "memo_created", source: "api", userId: 1 })

      await expect(tracker.flush()).resolves.toBeUndefined()
    })
  })
})
