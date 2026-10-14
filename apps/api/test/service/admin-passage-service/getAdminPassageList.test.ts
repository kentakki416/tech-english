import { decodeAdminPassageCursor, encodeAdminPassageCursor } from "../../../src/lib/admin-passage-cursor"
import type { AdminPassageListItem } from "../../../src/repository"
import { getAdminPassageList } from "../../../src/service/admin-passage-service"
import { buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository, EMPTY_STATUS_COUNTS } from "./fixtures"

const passageRepository = createMockPassageRepository()

const buildItem = (id: number, overrides: { needsAttention?: boolean; updatedAt?: Date } = {}): AdminPassageListItem => ({
  attemptCount: 0,
  passage: buildPassage({ id, ...overrides }),
  questionCount: 3,
  source: { id: 1, name: "React 公式ドキュメント" },
})

describe("getAdminPassageList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.countByStatus.mockResolvedValue({ ...EMPTY_STATUS_COUNTS, draft: 3 })
  })

  describe("正常系", () => {
    it("limit + 1 件返ると hasMore: true で、limit 件目から次の cursor を作る（境界値）", async () => {
      const last = buildItem(2, { needsAttention: true, updatedAt: new Date("2026-10-12T05:00:00.123Z") })
      passageRepository.findAdminList.mockResolvedValue([buildItem(1), last, buildItem(3)])

      const result = await getAdminPassageList({ limit: 2, status: "draft" }, { passageRepository })

      expect(result).toEqual({
        ok: true,
        value: {
          hasMore: true,
          items: [buildItem(1), last],
          nextCursor: expect.any(String),
          statusCounts: { ...EMPTY_STATUS_COUNTS, draft: 3 },
        },
      })
      if (!result.ok || !result.value.nextCursor) return
      expect(decodeAdminPassageCursor(result.value.nextCursor)).toEqual({
        id: 2,
        needsAttention: true,
        updatedAt: new Date("2026-10-12T05:00:00.123Z"),
      })
    })

    it("limit 件ちょうどなら hasMore: false で nextCursor は null（境界値）", async () => {
      passageRepository.findAdminList.mockResolvedValue([buildItem(1), buildItem(2)])

      const result = await getAdminPassageList({ limit: 2, status: "draft" }, { passageRepository })

      expect(result).toEqual({
        ok: true,
        value: { hasMore: false, items: [buildItem(1), buildItem(2)], nextCursor: null, statusCounts: expect.any(Object) },
      })
    })

    it("cursor を decode し、絞り込みと一緒に findAdminList に渡す", async () => {
      const cursor = { id: 7, needsAttention: false, updatedAt: new Date("2026-10-11T00:00:00.000Z") }
      passageRepository.findAdminList.mockResolvedValue([])

      const result = await getAdminPassageList(
        { cursor: encodeAdminPassageCursor(cursor), limit: 50, needsAttention: false, sourceId: 3, status: "published" },
        { passageRepository },
      )

      expect(result.ok).toBe(true)
      expect(passageRepository.findAdminList).toHaveBeenCalledWith({
        cursor,
        limit: 50,
        needsAttention: false,
        sourceId: 3,
        status: "published",
      })
      expect(passageRepository.countByStatus).toHaveBeenCalledTimes(1)
    })

    it("cursor が無ければ cursor: null で findAdminList を呼ぶ", async () => {
      passageRepository.findAdminList.mockResolvedValue([])

      await getAdminPassageList({ limit: 50, status: "draft" }, { passageRepository })

      expect(passageRepository.findAdminList).toHaveBeenCalledWith({
        cursor: null,
        limit: 50,
        needsAttention: undefined,
        sourceId: undefined,
        status: "draft",
      })
    })
  })

  describe("異常系", () => {
    it("壊れた cursor なら 400 を返し、Repository を呼ばない", async () => {
      const result = await getAdminPassageList({ cursor: "broken", limit: 50, status: "draft" }, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 400, type: "BAD_REQUEST" }), ok: false })
      expect(passageRepository.findAdminList).not.toHaveBeenCalled()
    })
  })
})
