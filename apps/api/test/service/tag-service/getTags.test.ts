import { getTags } from "../../../src/service/tag-service"

import { buildTag, createMockTagRepository } from "./fixtures"

const tagRepository = createMockTagRepository()

describe("getTags", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("findAll の結果をそのまま ok で返す", async () => {
      const rows = [
        { ...buildTag({ id: 1, name: "React" }), sourceCount: 2 },
        { ...buildTag({ id: 2, color: "rose", name: "Rust" }), sourceCount: 0 },
      ]
      tagRepository.findAll.mockResolvedValue(rows)

      const result = await getTags({ tagRepository })

      expect(result).toEqual({ ok: true, value: rows })
    })

    it("0 件なら空の配列を返す", async () => {
      tagRepository.findAll.mockResolvedValue([])

      const result = await getTags({ tagRepository })

      expect(result).toEqual({ ok: true, value: [] })
    })
  })
})
