import type { DataWarehouse } from "@repo/data-warehouse"

import type { EventRow } from "../../src/repository"
import { DataWarehouseEventRepository } from "../../src/repository/data-warehouse"

const buildRow = (overrides: Partial<EventRow> = {}): EventRow => ({
  eventId: "11111111-1111-4111-8111-111111111111",
  name: "memo_deleted",
  occurredAt: "2026-01-01T12:34:56.789Z",
  properties: { memo_id: 5 },
  source: "api",
  userId: 42,
  ...overrides,
})

describe("DataWarehouseEventRepository", () => {
  describe("正常系", () => {
    it("events テーブルへ 1 回でまとめて insert する", async () => {
      const insertAll = vi.fn<DataWarehouse["insertAll"]>(async () => undefined)
      const repo = new DataWarehouseEventRepository({ close: vi.fn(), insertAll })

      await repo.insertAll([buildRow(), buildRow({ eventId: "2" })])

      expect(insertAll).toHaveBeenCalledTimes(1)
      expect(insertAll.mock.calls[0]?.[0]).toBe("events")
      expect(insertAll.mock.calls[0]?.[1]).toHaveLength(2)
    })

    it("received_at と schema_version を付与し、properties を JSON 文字列にする", async () => {
      const insertAll = vi.fn<DataWarehouse["insertAll"]>(async () => undefined)
      const repo = new DataWarehouseEventRepository({ close: vi.fn(), insertAll })

      await repo.insertAll([buildRow()])

      const row = insertAll.mock.calls[0]?.[1][0] ?? {}
      expect(row.schema_version).toBe(1)
      expect(row.properties).toBe(JSON.stringify({ memo_id: 5 }))
      expect(row.received_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
    })

    /** ISO 8601 の T / Z をそのまま渡すと DateTime64 のパースに失敗する */
    it("occurred_at を ClickHouse の DateTime64 形式に変換する", async () => {
      const insertAll = vi.fn<DataWarehouse["insertAll"]>(async () => undefined)
      const repo = new DataWarehouseEventRepository({ close: vi.fn(), insertAll })

      await repo.insertAll([buildRow()])

      expect(insertAll.mock.calls[0]?.[1][0]?.occurred_at).toBe("2026-01-01 12:34:56.789")
    })
  })

  describe("異常系", () => {
    it("空配列のとき insertAll を呼ばない", async () => {
      const insertAll = vi.fn<DataWarehouse["insertAll"]>(async () => undefined)
      const repo = new DataWarehouseEventRepository({ close: vi.fn(), insertAll })

      await repo.insertAll([])

      expect(insertAll).not.toHaveBeenCalled()
    })
  })
})
