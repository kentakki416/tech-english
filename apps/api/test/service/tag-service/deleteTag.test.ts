import { deleteTag } from "../../../src/service/tag-service"

import { createMockTagRepository } from "./fixtures"

const tagRepository = createMockTagRepository()

describe("deleteTag", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("delete が true なら ok({ deleted: true }) を返す", async () => {
      tagRepository.delete.mockResolvedValue(true)

      const result = await deleteTag(1, { tagRepository })

      expect(result).toEqual({ ok: true, value: { deleted: true } })
      expect(tagRepository.delete).toHaveBeenCalledWith(1)
    })
  })

  describe("異常系", () => {
    it("delete が false なら 404 を返す", async () => {
      tagRepository.delete.mockResolvedValue(false)

      const result = await deleteTag(999, { tagRepository })

      expect(result).toMatchObject({ ok: false, error: { statusCode: 404, type: "NOT_FOUND" } })
    })
  })
})
