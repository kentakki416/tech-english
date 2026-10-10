import { FakeEventTracker } from "@repo/events"

import { MemoRepository } from "../../../src/repository"
import { createMemo, deleteMemo, updateMemo } from "../../../src/service/memo-service"

const buildMemo = () => ({
  body: "body",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  id: 5,
  title: "title",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
})

const buildRepo = (overrides: Partial<MemoRepository> = {}): MemoRepository => ({
  create: vi.fn(async () => buildMemo()),
  deleteById: vi.fn(async () => undefined),
  findAll: vi.fn(async () => []),
  findById: vi.fn(async () => buildMemo()),
  update: vi.fn(async () => buildMemo()),
  ...overrides,
})

describe("memo-service の行動イベント送出", () => {
  describe("正常系", () => {
    it("createMemo 成功時に memo_created を memo_id 付きで記録する", async () => {
      const eventTracker = new FakeEventTracker()

      await createMemo({ body: "b", title: "t" }, { memoRepository: buildRepo() }, {
        eventTracker,
        userId: 42,
      })

      expect(eventTracker.inputs).toEqual([
        { name: "memo_created", properties: { memo_id: 5 }, source: "api", userId: 42 },
      ])
    })

    it("updateMemo 成功時に memo_updated を記録する", async () => {
      const eventTracker = new FakeEventTracker()

      await updateMemo(5, { body: "b", title: "t" }, { memoRepository: buildRepo() }, {
        eventTracker,
        userId: 42,
      })

      expect(eventTracker.inputs.map((i) => i.name)).toEqual(["memo_updated"])
    })

    /** 物理削除なので DB から復元できない。ここで記録しないと永久に失われる */
    it("deleteMemo 成功時に memo_deleted を記録する", async () => {
      const eventTracker = new FakeEventTracker()

      await deleteMemo(5, { memoRepository: buildRepo() }, { eventTracker, userId: 42 })

      expect(eventTracker.inputs).toEqual([
        { name: "memo_deleted", properties: { memo_id: 5 }, source: "api", userId: 42 },
      ])
    })
  })

  describe("異常系", () => {
    /**
     * /api/memo は PUBLIC_PATHS に含まれ未ログインでも呼べる。
     * 匿名ユーザーは追跡しない方針なので、userId が無いときは記録しない。
     */
    it("未ログイン（userId が undefined）のときイベントを記録しない", async () => {
      const eventTracker = new FakeEventTracker()

      await deleteMemo(5, { memoRepository: buildRepo() }, { eventTracker, userId: undefined })

      expect(eventTracker.inputs).toHaveLength(0)
    })

    it("メモが存在せず失敗したときはイベントを記録しない", async () => {
      const eventTracker = new FakeEventTracker()
      const repo = buildRepo({ findById: vi.fn(async () => null) })

      const result = await deleteMemo(999, { memoRepository: repo }, { eventTracker, userId: 42 })

      expect(result.ok).toBe(false)
      expect(eventTracker.inputs).toHaveLength(0)
    })

    /**
     * service は track() を try/catch で包まない。
     *
     * 「分析イベントの失敗でユーザーのリクエストを失敗させない」という不変条件は
     * **EventTracker の実装側が守る**（QueueEventTracker は内部で catch する。
     * 検証は packages/events のテスト）。service まで防御的に書くと全呼び出しが
     * try/catch だらけになるため、契約で担保する方針にしている。
     *
     * このテストはその契約を明示するためのもの。実装が契約を破ると
     * リクエストが失敗する、という事実を記録しておく。
     */
    it("EventTracker の実装が throw するとリクエストまで失敗する（契約違反の場合）", async () => {
      const contractViolatingTracker = {
        flush: async () => undefined,
        track: () => {
          throw new Error("tracker exploded")
        },
        trackAll: () => undefined,
      }

      await expect(
        deleteMemo(5, { memoRepository: buildRepo() }, {
          eventTracker: contractViolatingTracker,
          userId: 42,
        }),
      ).rejects.toThrow("tracker exploded")
    })
  })
})
