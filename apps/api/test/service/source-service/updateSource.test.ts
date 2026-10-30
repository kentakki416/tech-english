import { updateSource } from "../../../src/service/source-service"

import {
  buildGitHubSource,
  buildGitHubUpdateInput,
  buildTag,
  buildWebsiteSource,
  buildWebsiteUpdateInput,
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
  })

  describe("正常系", () => {
    it.each([
      ["includeGlobs を変える", { includeGlobs: ["src/content/reference/**/*.md"] }],
      ["includeGlobs の順序を変える", { includeGlobs: ["b/**/*.md", "a/**/*.md"] }],
      ["excludeGlobs を足す", { excludeGlobs: ["src/content/blog/**"] }],
    ])("%sと shouldResetCollectedCommit: true で update する", async (_label, overrides) => {
      const existing = buildGitHubSource({ id: 1, includeGlobs: ["a/**/*.md", "b/**/*.md"] })
      const input = buildGitHubUpdateInput({ includeGlobs: ["a/**/*.md", "b/**/*.md"], ...overrides })
      const updated = buildGitHubSource({ ...input, id: 1, lastCollectedCommitSha: null })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: updated })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result).toEqual({ ok: true, value: updated })
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: true,
      })
    })

    it("name・is_enabled だけを変えると収集の状態を戻さずに update する", async () => {
      const existing = buildGitHubSource({ id: 1 })
      const input = buildGitHubUpdateInput({ isEnabled: false, name: "React Docs" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ ...input, id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, {
        shouldResetCollectedCommit: false,
      })
    })

    it("website は対象パス・ライセンスを変えても収集の状態を戻さずに、入力のまま update する", async () => {
      const existing = buildWebsiteSource({ id: 2 })
      const input = buildWebsiteUpdateInput({ includeGlobs: ["/blog/**"], licenseSpdx: "LicenseRef-personal-use", licenseUrl: "https://go.dev" })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildWebsiteSource({ ...input, id: 2 }) })

      const result = await updateSource(2, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.update).toHaveBeenCalledWith(2, input, {
        shouldResetCollectedCommit: false,
      })
    })

    it("取得元を変えないので、重複の確認（findByRepository / findBySiteUrl）をしない", async () => {
      const existing = buildGitHubSource({ id: 1 })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: existing })

      const result = await updateSource(1, buildGitHubUpdateInput(), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(sourceRepository.findByRepository).not.toHaveBeenCalled()
      expect(sourceRepository.findBySiteUrl).not.toHaveBeenCalled()
    })

    it("tagIds がすべてあれば、tagIds を含めて update し、タグつきのソースを返す", async () => {
      const existing = buildGitHubSource({ id: 1, tags: [buildTag({ id: 1 })] })
      const input = buildGitHubUpdateInput({ tagIds: [2, 3] })
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
      const input = buildGitHubUpdateInput({ tagIds: [] })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: buildGitHubSource({ id: 1 }) })

      const result = await updateSource(1, input, { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(true)
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(sourceRepository.update).toHaveBeenCalledWith(1, input, expect.any(Object))
    })

    it("production の設定でも github は update できる", async () => {
      const existing = buildGitHubSource({ id: 1 })
      sourceRepository.findById.mockResolvedValue(existing)
      sourceRepository.update.mockResolvedValue({ kind: "saved", source: existing })

      const result = await updateSource(1, buildGitHubUpdateInput(), { sourceRepository, tagRepository }, PRODUCTION_POLICY)

      expect(result.ok).toBe(true)
    })
  })

  describe("異常系", () => {
    it("production の設定（isWebsiteSourceAllowed: false）では website を 400 BAD_REQUEST にし、ソースを読まない", async () => {
      const result = await updateSource(2, buildWebsiteUpdateInput(), { sourceRepository, tagRepository }, PRODUCTION_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(sourceRepository.findById).not.toHaveBeenCalled()
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it("存在しない id なら 404 NOT_FOUND を返し、update を呼ばない", async () => {
      sourceRepository.findById.mockResolvedValue(null)

      const result = await updateSource(999, buildGitHubUpdateInput(), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })

    it.each([
      ["github → website", buildGitHubSource({ id: 1 }), buildWebsiteUpdateInput()],
      ["website → github", buildWebsiteSource({ id: 1 }), buildGitHubUpdateInput()],
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

    it("存在しない tag の id があれば 400 BAD_REQUEST と tag_ids の details を返し、update を呼ばない", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])

      const result = await updateSource(1, buildGitHubUpdateInput({ tagIds: [1, 99] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

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

      const result = await updateSource(1, buildGitHubUpdateInput({ tagIds: [1] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

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

      const result = await updateSource(1, buildWebsiteUpdateInput({ tagIds: [99] }), { sourceRepository, tagRepository }, LOCAL_POLICY)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.details).toBeUndefined()
      }
      expect(tagRepository.findByIds).not.toHaveBeenCalled()
      expect(sourceRepository.update).not.toHaveBeenCalled()
    })
  })
})
