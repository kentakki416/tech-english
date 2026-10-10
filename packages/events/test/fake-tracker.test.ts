import { FakeEventTracker } from "../src/fake-tracker"

describe("FakeEventTracker", () => {
  describe("正常系", () => {
    it("track したイベントを順に貯める", () => {
      const tracker = new FakeEventTracker()

      tracker.track({ name: "memo_created", source: "api", userId: 1 })
      tracker.trackAll([
        { name: "memo_updated", source: "api", userId: 1 },
        { name: "memo_deleted", source: "api", userId: 1 },
      ])

      expect(tracker.inputs.map((i) => i.name)).toEqual([
        "memo_created",
        "memo_updated",
        "memo_deleted",
      ])
    })
  })
})
