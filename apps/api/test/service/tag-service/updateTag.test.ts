import { updateTag } from "../../../src/service/tag-service"

import { buildTag, createMockTagRepository } from "./fixtures"

const tagRepository = createMockTagRepository()

describe("updateTag", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("渡した { color, name } で update を呼び、ok(tag) を返す", async () => {
      const tag = buildTag({ id: 3, color: "pink", name: "Vue" })
      tagRepository.update.mockResolvedValue({ kind: "saved", tag })

      const result = await updateTag(3, { color: "pink", name: "Vue" }, { tagRepository })

      expect(result).toEqual({ ok: true, value: tag })
      expect(tagRepository.update).toHaveBeenCalledWith(3, { color: "pink", name: "Vue" })
    })
  })

  describe("異常系", () => {
    it("not_found なら 404 を返す", async () => {
      tagRepository.update.mockResolvedValue({ kind: "not_found" })

      const result = await updateTag(999, { color: "blue", name: "React" }, { tagRepository })

      expect(result).toMatchObject({ ok: false, error: { statusCode: 404, type: "NOT_FOUND" } })
    })

    it("duplicate なら 409 を返す", async () => {
      tagRepository.update.mockResolvedValue({ kind: "duplicate" })

      const result = await updateTag(1, { color: "blue", name: "react" }, { tagRepository })

      expect(result).toMatchObject({ ok: false, error: { statusCode: 409, type: "CONFLICT" } })
    })
  })
})
