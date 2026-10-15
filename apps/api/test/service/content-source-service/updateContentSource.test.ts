import { updateContentSource } from "../../../src/service/content-source-service"

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

describe("updateContentSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contentSourceRepository.findByRepository.mockResolvedValue(null)
    contentSourceRepository.findBySiteUrl.mockResolvedValue(null)
    contentSourceRepository.hasSourceDocuments.mockResolvedValue(false)
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
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: updated })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: updated })
      expect(contentSourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: true,
        shouldResetDocumentCache: false,
      })
    })

    it("name・is_enabled・ライセンスだけを変えると収集の状態を戻さずに update する", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ isEnabled: false, licenseSpdx: "MIT", name: "React Docs" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: false,
        shouldResetDocumentCache: false,
      })
    })

    it("website は対象パスを変えても収集の状態を戻さずに update し、isEnabled をそのまま渡す", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteInput({ includeGlobs: ["/blog/**"], isEnabled: true })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildWebsiteSource({ ...input, id: 2 }) })

      const result = await updateContentSource(2, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledWith(2, input, {
        shouldResetCollectedCommit: false,
        shouldResetDocumentCache: false,
      })
    })

    it.each([
      ["content_selector を変える", { contentSelector: "main" }],
      ["content_selector を消す", { contentSelector: null }],
      ["exclude_selectors を足す", { excludeSelectors: [".feedback", "nav.toc"] }],
      ["exclude_selectors の順序を変える", { excludeSelectors: [".b", ".a"] }],
    ])("website の%sと shouldResetDocumentCache: true で update する", async (_label, overrides) => {
      const existing = buildWebsiteSource({ excludeSelectors: [".a", ".b"], id: 2 })
      const input = buildWebsiteInput({ excludeSelectors: [".a", ".b"], ...overrides })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildWebsiteSource({ ...input, id: 2 }) })

      const result = await updateContentSource(2, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledWith(2, input, {
        shouldResetCollectedCommit: false,
        shouldResetDocumentCache: true,
      })
    })

    it("取得した文書があっても、取得元を変えなければ（ライセンスの訂正など）update する", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ licenseSpdx: "MIT", licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.hasSourceDocuments.mockResolvedValue(true)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("取得した文書があっても、repository の大文字・小文字の違いだけなら取得元の変更とみなさない", async () => {
      const existing = buildGitHubSource({ id: 1, repository: "ReactJS/react.dev" })
      const input = buildGitHubInput({ repository: "reactjs/react.dev" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.hasSourceDocuments.mockResolvedValue(true)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it.each([
      ["repository", buildGitHubSource({ id: 1 }), buildGitHubInput({ repository: "vercel/next.js" })],
      ["site_url", buildWebsiteSource({ id: 1 }), buildWebsiteInput({ sitemapUrl: null, siteUrl: "https://docs.python.org", startUrl: "https://docs.python.org/3/" })],
    ])("取得した文書が無ければ %s を変えられる", async (_label, existing, input) => {
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: existing })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.hasSourceDocuments).toHaveBeenCalledWith(1)
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("同じ id のソースが findByRepository で返っても 409 にならない", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ name: "React Docs" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.findByRepository.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.findByRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("同じ id のソースが findBySiteUrl で返っても 409 にならない", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteInput({ name: "Go Docs" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.findBySiteUrl.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildWebsiteSource({ ...input, id: 2 }) })

      const result = await updateContentSource(2, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("tagIds がすべてあれば、tagIds を含めて update し、タグつきのソースを返す", async () => {
      const existing = buildGitHubSource({ id: 1, tags: [buildTag({ id: 1 })] })
      const input = buildGitHubInput({ tagIds: [2, 3] })
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 2, name: "frontend" }), buildTag({ id: 3, name: "hooks" })])
      const updated = buildGitHubSource({ id: 1, tags: [buildTag({ id: 2, name: "frontend" }), buildTag({ id: 3, name: "hooks" })] })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: updated })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: updated })
      expect(tagRepository.findByIds).toHaveBeenCalledWith([2, 3])
      expect(contentSourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: false,
        shouldResetDocumentCache: false,
      })
    })

    it("tagIds が空なら findByIds を呼ばずに update する", async () => {
      const existing = buildGitHubSource({ id: 1, tags: [buildTag({ id: 1 })] })
      const input = buildGitHubInput({ tagIds: [] })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ id: 1 }) })

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(true)
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(contentSourceRepository.update).toHaveBeenCalledWith(1, input, expect.any(Object))
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 NOT_FOUND を返し、update を呼ばない", async () => {
      contentSourceRepository.findById.mockResolvedValue(null)

      const result = await updateContentSource(999, buildGitHubInput(), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it.each([
      ["github → website", buildGitHubSource({ id: 1 }), buildWebsiteInput()],
      ["website → github", buildWebsiteSource({ id: 1 }), buildGitHubInput()],
    ])("取得方法を変える（%s）と 400 BAD_REQUEST を返し、update を呼ばない", async (_label, existing, input) => {
      contentSourceRepository.findById.mockResolvedValue(existing)

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it.each([
      ["repository", buildGitHubSource({ id: 1 }), buildGitHubInput({ repository: "vercel/next.js" })],
      ["site_url", buildWebsiteSource({ id: 1 }), buildWebsiteInput({ sitemapUrl: null, siteUrl: "https://docs.python.org", startUrl: "https://docs.python.org/3/" })],
    ])("取得した文書があるソースの %s を変えると 400 BAD_REQUEST を返し、update を呼ばない", async (_label, existing, input) => {
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.hasSourceDocuments.mockResolvedValue(true)

      const result = await updateContentSource(1, input, { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(contentSourceRepository.hasSourceDocuments).toHaveBeenCalledWith(1)
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it("別のソースが同じ repository で登録済みなら 409 CONFLICT を返し、update を呼ばない", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      contentSourceRepository.findByRepository.mockResolvedValue(buildGitHubSource({ id: 3, repository: "vercel/next.js" }))

      const result = await updateContentSource(1, buildGitHubInput({ repository: "vercel/next.js" }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it("別のソースが同じ site_url で登録済みなら 409 CONFLICT を返し、update を呼ばない", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildWebsiteSource({ id: 2 }))
      contentSourceRepository.findBySiteUrl.mockResolvedValue(buildWebsiteSource({ id: 4, siteUrl: "https://docs.python.org" }))

      const result = await updateContentSource(
        2,
        buildWebsiteInput({ sitemapUrl: null, siteUrl: "https://docs.python.org", startUrl: "https://docs.python.org/3/" }),
        { contentSourceRepository, tagRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it("事前の検査の後に同じ取得元が登録され update が duplicate を返したら 409 CONFLICT を返す", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      contentSourceRepository.update.mockResolvedValue({ kind: "duplicate" })

      const result = await updateContentSource(1, buildGitHubInput({ repository: "vercel/next.js" }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("存在しない tag の id があれば 400 BAD_REQUEST と tag_ids の details を返し、update を呼ばない", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])

      const result = await updateContentSource(1, buildGitHubInput({ tagIds: [1, 99] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it("update が missing_tags を返したら（確認の後にタグが消された）400 BAD_REQUEST と tag_ids の details を返す", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])
      contentSourceRepository.update.mockResolvedValue({ kind: "missing_tags" })

      const result = await updateContentSource(1, buildGitHubInput({ tagIds: [1] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("取得方法の変更（400）は tag の確認より先に返す（details を付けず、findByIds を呼ばない）", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))

      const result = await updateContentSource(1, buildWebsiteInput({ tagIds: [99] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toBeUndefined()
      }
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it("tag の確認（400）は重複（409）より先に返す", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      contentSourceRepository.findByRepository.mockResolvedValue(buildGitHubSource({ id: 3, repository: "vercel/next.js" }))
      tagRepository.findByIds.mockResolvedValue([])

      const result = await updateContentSource(
        1,
        buildGitHubInput({ repository: "vercel/next.js", tagIds: [99] }),
        { contentSourceRepository, tagRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })
  })
})
