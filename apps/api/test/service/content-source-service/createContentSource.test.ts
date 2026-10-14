import { createContentSource } from "../../../src/service/content-source-service"

import {
  buildGitHubInput,
  buildGitHubSource,
  buildWebsiteInput,
  buildWebsiteSource,
  createMockContentSourceRepository,
} from "./fixtures"

const contentSourceRepository = createMockContentSourceRepository()

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

      const result = await createContentSource(input, { contentSourceRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(contentSourceRepository.findByRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(contentSourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("website は isEnabled: true を渡しても isEnabled: false で create する", async () => {
      const input = buildWebsiteInput({ isEnabled: true })
      const created = buildWebsiteSource()
      contentSourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createContentSource(input, { contentSourceRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(contentSourceRepository.findBySiteUrl).toHaveBeenCalledWith("https://go.dev")
      expect(contentSourceRepository.create).toHaveBeenCalledWith({ ...input, isEnabled: false })
    })
  })

  describe("異常系", () => {
    it("登録済みの repository なら 409 CONFLICT を返し、create を呼ばない", async () => {
      contentSourceRepository.findByRepository.mockResolvedValue(buildGitHubSource())

      const result = await createContentSource(buildGitHubInput(), { contentSourceRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.create).not.toHaveBeenCalled()
    })

    it("登録済みの site_url なら 409 CONFLICT を返し、create を呼ばない", async () => {
      contentSourceRepository.findBySiteUrl.mockResolvedValue(buildWebsiteSource())

      const result = await createContentSource(buildWebsiteInput(), { contentSourceRepository })

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

      const result = await createContentSource(input, { contentSourceRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(contentSourceRepository.create).toHaveBeenCalledTimes(1)
    })
  })
})
