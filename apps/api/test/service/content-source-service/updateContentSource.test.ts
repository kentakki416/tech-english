import { updateContentSource } from "../../../src/service/content-source-service"

import {
  buildGitHubInput,
  buildGitHubSource,
  buildWebsiteInput,
  buildWebsiteSource,
  createMockContentSourceRepository,
} from "./fixtures"

const contentSourceRepository = createMockContentSourceRepository()

describe("updateContentSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contentSourceRepository.findByRepository.mockResolvedValue(null)
    contentSourceRepository.findBySiteUrl.mockResolvedValue(null)
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
      contentSourceRepository.update.mockResolvedValue(updated)

      const result = await updateContentSource(1, input, { contentSourceRepository })

      expect(result).toEqual({ ok: true, value: updated })
      expect(contentSourceRepository.update).toHaveBeenCalledWith(1, input, { shouldResetCollectedCommit: true })
    })

    it("name・is_enabled・ライセンスだけを変えると shouldResetCollectedCommit: false で update する", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ isEnabled: false, licenseSpdx: "MIT", name: "React Docs" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue(buildGitHubSource({ ...input, id: 1 }))

      const result = await updateContentSource(1, input, { contentSourceRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledWith(1, input, { shouldResetCollectedCommit: false })
    })

    it("website は対象パスを変えても shouldResetCollectedCommit: false で update し、isEnabled をそのまま渡す", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteInput({ includeGlobs: ["/blog/**"], isEnabled: true })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue(buildWebsiteSource({ ...input, id: 2 }))

      const result = await updateContentSource(2, input, { contentSourceRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledWith(2, input, { shouldResetCollectedCommit: false })
    })

    it("同じ id のソースが findByRepository で返っても 409 にならない", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubInput({ name: "React Docs" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.findByRepository.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue(buildGitHubSource({ ...input, id: 1 }))

      const result = await updateContentSource(1, input, { contentSourceRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.findByRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })

    it("同じ id のソースが findBySiteUrl で返っても 409 にならない", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteInput({ name: "Go Docs" })
      contentSourceRepository.findById.mockResolvedValue(existing)
      contentSourceRepository.findBySiteUrl.mockResolvedValue(existing)
      contentSourceRepository.update.mockResolvedValue(buildWebsiteSource({ ...input, id: 2 }))

      const result = await updateContentSource(2, input, { contentSourceRepository })

      expect(result.ok).toBe(true)
      expect(contentSourceRepository.update).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 NOT_FOUND を返し、update を呼ばない", async () => {
      contentSourceRepository.findById.mockResolvedValue(null)

      const result = await updateContentSource(999, buildGitHubInput(), { contentSourceRepository })

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

      const result = await updateContentSource(1, input, { contentSourceRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })

    it("別のソースが同じ repository で登録済みなら 409 CONFLICT を返し、update を呼ばない", async () => {
      contentSourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      contentSourceRepository.findByRepository.mockResolvedValue(buildGitHubSource({ id: 3, repository: "vercel/next.js" }))

      const result = await updateContentSource(1, buildGitHubInput({ repository: "vercel/next.js" }), { contentSourceRepository })

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
        { contentSourceRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.update).not.toHaveBeenCalled()
    })
  })
})
