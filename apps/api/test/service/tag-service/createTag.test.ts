import { createTag } from "../../../src/service/tag-service"

import { buildTag, createMockTagRepository } from "./fixtures"

const tagRepository = createMockTagRepository()

describe("createTag", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("color: null なら findColors の結果から選んだ色で create を呼ぶ", async () => {
      const tag = buildTag({ color: "rose" })
      tagRepository.findColors.mockResolvedValue(["blue"])
      tagRepository.create.mockResolvedValue({ kind: "saved", tag })

      const result = await createTag({ color: null, name: "React" }, { tagRepository })

      expect(result).toEqual({ ok: true, value: tag })
      expect(tagRepository.create).toHaveBeenCalledWith({ color: "rose", name: "React" })
    })

    it("color を指定したら findColors を呼ばずにその色で create を呼ぶ", async () => {
      const tag = buildTag({ color: "pink" })
      tagRepository.create.mockResolvedValue({ kind: "saved", tag })

      const result = await createTag({ color: "pink", name: "React" }, { tagRepository })

      expect(result).toEqual({ ok: true, value: tag })
      expect(tagRepository.findColors).not.toHaveBeenCalled()
      expect(tagRepository.create).toHaveBeenCalledWith({ color: "pink", name: "React" })
    })

    it("create が saved を返したら ok(tag) を返す", async () => {
      const tag = buildTag()
      tagRepository.findColors.mockResolvedValue([])
      tagRepository.create.mockResolvedValue({ kind: "saved", tag })

      const result = await createTag({ color: null, name: "React" }, { tagRepository })

      expect(result).toEqual({ ok: true, value: tag })
    })
  })

  describe("異常系", () => {
    it("create が duplicate を返したら 409 を返す", async () => {
      tagRepository.findColors.mockResolvedValue([])
      tagRepository.create.mockResolvedValue({ kind: "duplicate" })

      const result = await createTag({ color: null, name: "react" }, { tagRepository })

      expect(result).toMatchObject({ ok: false, error: { statusCode: 409, type: "CONFLICT" } })
    })
  })
})
