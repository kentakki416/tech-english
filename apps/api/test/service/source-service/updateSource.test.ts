import { updateSource } from "../../../src/service/source-service"

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

describe("updateSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceRepository.findByRepository.mockResolvedValue(null)
    sourceRepository.findBySiteUrl.mockResolvedValue(null)
    sourceRepository.hasSourceDocuments.mockResolvedValue(false)
  })

  describe("正常系", () => {
    it.each([
      ["includeGlobs を変える", { includeGlobs: ["src/content/reference/**/*.md"] }],
      ["includeGlobs の順序を変える", { includeGlobs: ["b/**/*.md", "a/**/*.md"] }],
      ["excludeGlobs を足す", { excludeGlobs: ["src/content/blog/**"] }],
      ["branch を変える", { branch: "canary" }],
      ["repository を変える", { repository: "reactjs/react.dev-fork" }],
    ])("%sと shouldResetCollectedCommit: true で update する", async (_label, overrides) => {
      const existing = buildGitHubSource({ id: 1, includeGlobs: ["a/**/*.md", "b/**/*.md"] })
      const input = buildGitHubInput({ includeGlobs: ["a/**/*.md", "b/**/*.md"], ...overrides })
      const updated = buildGitHubSource({ ...input, id: 1, lastCollectedCommitSha: null })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: updated })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: updated })
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: true,
      })
    })

    it("name・is_enabled・ライセンスだけを変えると収集の状態を戻さずに update する", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ isEnabled: false, licenseSpdx: "MIT", name: "React Docs" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: false,
      })
    })

    it("website は対象パスを変えても収集の状態を戻さずに update し、isEnabled: true を渡しても isEnabled: false にする", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteInput({ includeGlobs: ["/blog/**"], isEnabled: true })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildWebsiteSource({ ...input, id: 2, isEnabled: false }) })

      const result = await updateSource(2, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledWith(2, { ...input, isEnabled: false }, {
        shouldResetCollectedCommit: false,
      })
    })

    it("取得した文書があっても、取得元を変えなければ（ライセンスの訂正など）update する", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ licenseSpdx: "MIT", licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.hasSourceDocuments.mockResolvedValue(true)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("取得した文書があっても、repository の大文字・小文字の違いだけなら取得元の変更とみなさない", async () => {
      const existing = buildGitHubSource({ id: 1, repository: "ReactJS/react.dev" })
      const input = buildGitHubInput({ repository: "reactjs/react.dev" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.hasSourceDocuments.mockResolvedValue(true)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it.each([
      ["repository", buildGitHubSource({ id: 1 }), buildGitHubInput({ repository: "vercel/next.js" })],
      ["site_url", buildWebsiteSource({ id: 1 }), buildWebsiteInput({ siteUrl: "https://docs.python.org" })],
    ])("取得した文書が無ければ %s を変えられる", async (_label, existing, input) => {
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: existing })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.hasSourceDocuments).toHaveBeenCalledWith(1)
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("同じ id のソースが findByRepository で返っても 409 にならない", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ name: "React Docs" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.findByRepository.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.findByRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("同じ id のソースが findBySiteUrl で返っても 409 にならない", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteInput({ name: "Go Docs" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.findBySiteUrl.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildWebsiteSource({ ...input, id: 2 }) })

      const result = await updateSource(2, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("tagIds がすべてあれば、tagIds を含めて update し、タグつきのソースを返す", async () => {
      const existing = buildGitHubSource({ id: 1, tags: [buildTag({ id: 1 })] })
      const input = buildGitHubInput({ tagIds: [2, 3] })
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 2, name: "frontend" }), buildTag({ id: 3, name: "hooks" })])
      const updated = buildGitHubSource({ id: 1, tags: [buildTag({ id: 2, name: "frontend" }), buildTag({ id: 3, name: "hooks" })] })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: updated })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: updated })
      expect(tagRepository.findByIds).toHaveBeenCalledWith([2, 3])
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: false,
      })
    })

    it("tagIds が空なら findByIds を呼ばずに update する", async () => {
      const existing = buildGitHubSource({ id: 1, tags: [buildTag({ id: 1 })] })
      const input = buildGitHubInput({ tagIds: [] })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, expect.any(Object))
    })
  })

  describe("異常系", () => {
    it("production の設定（isWebsiteSourceAllowed: false）では website を 400 BAD_REQUEST にし、ソースを読まない", async () => {
      const result = await updateSource(2, buildWebsiteInput(), { sourceRepository, tagRepository }, PRODUCTION_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(sourceRepository.findById).not.toHaveBeenCalled()
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("production の設定でも github は update できる", async () => {
      const existing = buildGitHubSource({ id: 1 })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: existing })

      const result = await updateSource(1, buildGitHubInput(), { sourceRepository, tagRepository }, PRODUCTION_POLICY)

      expect(result.ok).toBe(true)
    })

    it("存在しない id なら 404 NOT_FOUND を返し、update を呼ばない", async () => {
      sourceRepository.findById.mockResolvedValue(null)

      const result = await updateSource(999, buildGitHubInput(), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it.each([
      ["github → website", buildGitHubSource({ id: 1 }), buildWebsiteInput()],
      ["website → github", buildWebsiteSource({ id: 1 }), buildGitHubInput()],
    ])("取得方法を変える（%s）と 400 BAD_REQUEST を返し、update を呼ばない", async (_label, existing, input) => {
      sourceRepository.findById.mockResolvedValue(existing)

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it.each([
      ["repository", buildGitHubSource({ id: 1 }), buildGitHubInput({ repository: "vercel/next.js" })],
      ["site_url", buildWebsiteSource({ id: 1 }), buildWebsiteInput({ siteUrl: "https://docs.python.org" })],
    ])("取得した文書があるソースの %s を変えると 400 BAD_REQUEST を返し、update を呼ばない", async (_label, existing, input) => {
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.hasSourceDocuments.mockResolvedValue(true)

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(sourceRepository.hasSourceDocuments).toHaveBeenCalledWith(1)
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("別のソースが同じ repository で登録済みなら 409 CONFLICT を返し、update を呼ばない", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceRepository.findByRepository.mockResolvedValue(buildGitHubSource({ id: 3, repository: "vercel/next.js" }))

      const result = await updateSource(1, buildGitHubInput({ repository: "vercel/next.js" }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("別のソースが同じ site_url で登録済みなら 409 CONFLICT を返し、update を呼ばない", async () => {
      sourceRepository.findById.mockResolvedValue(buildWebsiteSource({ id: 2 }))
      sourceRepository.findBySiteUrl.mockResolvedValue(buildWebsiteSource({ id: 4, siteUrl: "https://docs.python.org" }))

      const result = await updateSource(
        2,
        buildWebsiteInput({ siteUrl: "https://docs.python.org" }),
        { sourceRepository, tagRepository },
        LOCAL_POLICY,
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("事前の検査の後に同じ取得元が登録され update が duplicate を返したら 409 CONFLICT を返す", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceRepository.update.mockResolvedValue({ kind: "duplicate" })

      const result = await updateSource(1, buildGitHubInput({ repository: "vercel/next.js" }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("存在しない tag の id があれば 400 BAD_REQUEST と tag_ids の details を返し、update を呼ばない", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])

      const result = await updateSource(1, buildGitHubInput({ tagIds: [1, 99] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("update が missing_tags を返したら（確認の後にタグが消された）400 BAD_REQUEST と tag_ids の details を返す", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])
      sourceRepository.update.mockResolvedValue({ kind: "missing_tags" })

      const result = await updateSource(1, buildGitHubInput({ tagIds: [1] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(sourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("取得方法の変更（400）は tag の確認より先に返す（details を付けず、findByIds を呼ばない）", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))

      const result = await updateSource(1, buildWebsiteInput({ tagIds: [99] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toBeUndefined()
      }
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("tag の確認（400）は重複（409）より先に返す", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceRepository.findByRepository.mockResolvedValue(buildGitHubSource({ id: 3, repository: "vercel/next.js" }))
      tagRepository.findByIds.mockResolvedValue([])

      const result = await updateSource(
        1,
        buildGitHubInput({ repository: "vercel/next.js", tagIds: [99] }),
        { sourceRepository, tagRepository },
        LOCAL_POLICY,
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })
  })
})
