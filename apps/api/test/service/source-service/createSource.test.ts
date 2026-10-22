import { createSource } from "../../../src/service/source-service"

import {
  buildGitHubInput,
  buildGitHubSource,
  buildTag,
  buildWebsiteInput,
  buildWebsiteSource,
  createMockSourceRepository,
  createMockTagRepository,
  LOCAL_POLICY,
  PRODUCTION_POLICY,
} from "./fixtures"

const sourceRepository = createMockSourceRepository()
const tagRepository = createMockTagRepository()

describe("createSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceRepository.findByRepository.mockResolvedValue(null)
    sourceRepository.findBySiteUrl.mockResolvedValue(null)
  })

  describe("正常系", () => {
    it("github は渡した値のまま create し、作成したソースを返す", async () => {
      const input = buildGitHubInput({ isEnabled: true })
      const created = buildGitHubSource()
      sourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createSource(input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: created })
      expect(sourceRepository.findByRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(sourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("website は isEnabled: true を渡しても isEnabled: false で create する", async () => {
      const input = buildWebsiteInput({ isEnabled: true })
      const created = buildWebsiteSource()
      sourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createSource(input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: created })
      expect(sourceRepository.findBySiteUrl).toHaveBeenCalledWith("https://go.dev")
      expect(sourceRepository.create).toHaveBeenCalledWith({ ...input, isEnabled: false })
    })

    it("tagIds がすべてあれば、tagIds を含めて create し、タグつきのソースを返す", async () => {
      const input = buildGitHubInput({ tagIds: [1, 2] })
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 }), buildTag({ id: 2, name: "frontend" })])
      const created = buildGitHubSource({ tags: [buildTag({ id: 2, name: "frontend" }), buildTag({ id: 1 })] })
      sourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createSource(input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: created })
      expect(tagRepository.findByIds).toHaveBeenCalledWith([1, 2])
      expect(sourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("tagIds が空なら findByIds を呼ばずに create する", async () => {
      const input = buildGitHubInput({ tagIds: [] })
      const created = buildGitHubSource()
      sourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createSource(input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: created })
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(sourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("production の設定でも github は create できる", async () => {
      const created = buildGitHubSource()
      sourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createSource(buildGitHubInput(), { sourceRepository, tagRepository }, PRODUCTION_POLICY)

      expect(result).toEqual({ ok: true, value: created })
    })
  })

  describe("異常系", () => {
    it("production の設定（isWebsiteSourceAllowed: false）では website を 400 BAD_REQUEST にし、create を呼ばない", async () => {
      const result = await createSource(buildWebsiteInput(), { sourceRepository, tagRepository }, PRODUCTION_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(sourceRepository.create).not.toHaveBeenCalled()
    })

    it("登録済みの repository なら 409 CONFLICT を返し、create を呼ばない", async () => {
      sourceRepository.findByRepository.mockResolvedValue(buildGitHubSource())

      const result = await createSource(buildGitHubInput(), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(sourceRepository.create).not.toHaveBeenCalled()
    })

    it("登録済みの site_url なら 409 CONFLICT を返し、create を呼ばない", async () => {
      sourceRepository.findBySiteUrl.mockResolvedValue(buildWebsiteSource())

      const result = await createSource(buildWebsiteInput(), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(sourceRepository.create).not.toHaveBeenCalled()
    })

    it.each([
      ["github", buildGitHubInput()],
      ["website", buildWebsiteInput()],
    ])("事前の検査の後に同じ取得元が登録され create が duplicate を返したら（%s）409 CONFLICT を返す", async (_label, input) => {
      sourceRepository.create.mockResolvedValue({ kind: "duplicate" })

      const result = await createSource(input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(sourceRepository.create).toHaveBeenCalledTimes(1)
    })

    it("存在しない tag の id があれば 400 BAD_REQUEST と tag_ids の details を返し、create を呼ばない", async () => {
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])

      const result = await createSource(buildGitHubInput({ tagIds: [1, 99, 100] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(sourceRepository.create).not.toHaveBeenCalled()
    })

    it("存在しない tag の id は、登録済みの取得元（409）より先に 400 にする", async () => {
      tagRepository.findByIds.mockResolvedValue([])
      sourceRepository.findByRepository.mockResolvedValue(buildGitHubSource())

      const result = await createSource(buildGitHubInput({ tagIds: [99] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(sourceRepository.create).not.toHaveBeenCalled()
    })

    it("create が missing_tags を返したら（確認の後にタグが消された）400 BAD_REQUEST と tag_ids の details を返す", async () => {
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])
      sourceRepository.create.mockResolvedValue({ kind: "missing_tags" })

      const result = await createSource(buildGitHubInput({ tagIds: [1] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(sourceRepository.create).toHaveBeenCalledTimes(1)
    })
  })
})
