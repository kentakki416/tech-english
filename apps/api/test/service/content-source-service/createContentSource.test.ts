import { createContentSource } from "../../../src/service/content-source-service"

import {
  buildGitHubInput,
  buildGitHubSource,
  buildTag,
  buildWebsiteInput,
  buildWebsiteSource,
  createMockContentSourceRepository,
  createMockTagRepository,
} from "./fixtures"

const contentSourceRepository = createMockContentSourceRepository()
const tagRepository = createMockTagRepository()

describe("createContentSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contentSourceRepository.findByRepository.mockResolvedValue(null)
    contentSourceRepository.findBySiteUrl.mockResolvedValue(null)
  })

  describe("正常系", () => {
    it("github は渡した値のまま create し、作成したソースを返す", async () => {
      const input = buildGitHubInput({ isEnabled: true })
      const created = buildGitHubSource()
      contentSourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createContentSource(input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(contentSourceRepository.findByRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(contentSourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("website は isEnabled: true を渡しても isEnabled: false で create する", async () => {
      const input = buildWebsiteInput({ isEnabled: true })
      const created = buildWebsiteSource()
      contentSourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createContentSource(input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(contentSourceRepository.findBySiteUrl).toHaveBeenCalledWith("https://go.dev")
      expect(contentSourceRepository.create).toHaveBeenCalledWith({ ...input, isEnabled: false })
    })

    it("tagIds がすべてあれば、tagIds を含めて create し、タグつきのソースを返す", async () => {
      const input = buildGitHubInput({ tagIds: [1, 2] })
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 }), buildTag({ id: 2, name: "frontend" })])
      const created = buildGitHubSource({ tags: [buildTag({ id: 2, name: "frontend" }), buildTag({ id: 1 })] })
      contentSourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createContentSource(input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(tagRepository.findByIds).toHaveBeenCalledWith([1, 2])
      expect(contentSourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("tagIds が空なら findByIds を呼ばずに create する", async () => {
      const input = buildGitHubInput({ tagIds: [] })
      const created = buildGitHubSource()
      contentSourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createContentSource(input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(contentSourceRepository.create).toHaveBeenCalledWith(input)
    })
  })

  describe("異常系", () => {
    it("登録済みの repository なら 409 CONFLICT を返し、create を呼ばない", async () => {
      contentSourceRepository.findByRepository.mockResolvedValue(buildGitHubSource())

      const result = await createContentSource(buildGitHubInput(), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.create).not.toHaveBeenCalled()
    })

    it("登録済みの site_url なら 409 CONFLICT を返し、create を呼ばない", async () => {
      contentSourceRepository.findBySiteUrl.mockResolvedValue(buildWebsiteSource())

      const result = await createContentSource(buildWebsiteInput(), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.create).not.toHaveBeenCalled()
    })

    it.each([
      ["github", buildGitHubInput()],
      ["website", buildWebsiteInput()],
    ])("事前の検査の後に同じ取得元が登録され create が duplicate を返したら（%s）409 CONFLICT を返す", async (_label, input) => {
      contentSourceRepository.create.mockResolvedValue({ kind: "duplicate" })

      const result = await createContentSource(input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.create).toHaveBeenCalledTimes(1)
    })

    it("存在しない tag の id があれば 400 BAD_REQUEST と tag_ids の details を返し、create を呼ばない", async () => {
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])

      const result = await createContentSource(buildGitHubInput({ tagIds: [1, 99, 100] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.create).not.toHaveBeenCalled()
    })

    it("存在しない tag の id は、登録済みの取得元（409）より先に 400 にする", async () => {
      tagRepository.findByIds.mockResolvedValue([])
      contentSourceRepository.findByRepository.mockResolvedValue(buildGitHubSource())

      const result = await createContentSource(buildGitHubInput({ tagIds: [99] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.create).not.toHaveBeenCalled()
    })

    it("create が missing_tags を返したら（確認の後にタグが消された）400 BAD_REQUEST と tag_ids の details を返す", async () => {
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])
      contentSourceRepository.create.mockResolvedValue({ kind: "missing_tags" })

      const result = await createContentSource(buildGitHubInput({ tagIds: [1] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.create).toHaveBeenCalledTimes(1)
    })
  })
})
