import type { IGitHubRepositoryClient } from "../../../src/client/github-repository"
import { detectRepositoryLicense } from "../../../src/service/source-service"

const mockDetectLicense = vi.fn<IGitHubRepositoryClient["detectLicense"]>()
const githubRepositoryClient: IGitHubRepositoryClient = { detectLicense: mockDetectLicense, findRepository: vi.fn() }

const LICENSE_FILE_URL = "https://github.com/owner/name/blob/main/LICENSE"

describe("detectRepositoryLicense", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it.each([
      ["MIT", true],
      ["CC-BY-4.0", true],
      ["GPL-3.0", false],
      ["CC-BY-SA-4.0", false],
    ])("%s は isAllowed: %s とライセンスのファイルの URL を返す", async (licenseSpdx, isAllowed) => {
      mockDetectLicense.mockResolvedValue({ licenseSpdx, licenseUrl: LICENSE_FILE_URL })

      const result = await detectRepositoryLicense("owner/name", { githubRepositoryClient })

      expect(result).toEqual({ ok: true, value: { isAllowed, licenseSpdx, licenseUrl: LICENSE_FILE_URL } })
      expect(mockDetectLicense).toHaveBeenCalledWith("owner/name", null)
    })

    it("ライセンスを判定できなかった（licenseSpdx: null）ときも、ライセンスのファイルの URL は返す", async () => {
      mockDetectLicense.mockResolvedValue({ licenseSpdx: null, licenseUrl: LICENSE_FILE_URL })

      const result = await detectRepositoryLicense("owner/name", { githubRepositoryClient })

      expect(result).toEqual({ ok: true, value: { isAllowed: false, licenseSpdx: null, licenseUrl: LICENSE_FILE_URL } })
    })

    it("ライセンスのファイルが無い（null）なら licenseSpdx・licenseUrl とも null で isAllowed: false を返す", async () => {
      mockDetectLicense.mockResolvedValue(null)

      const result = await detectRepositoryLicense("owner/name", { githubRepositoryClient })

      expect(result).toEqual({ ok: true, value: { isAllowed: false, licenseSpdx: null, licenseUrl: null } })
    })
  })

  describe("異常系", () => {
    it("GitHub の呼び出しが失敗したら例外が伝播する", async () => {
      mockDetectLicense.mockRejectedValue(new Error("GitHub license request failed: 403"))

      await expect(detectRepositoryLicense("owner/name", { githubRepositoryClient })).rejects.toThrow()
    })
  })
})
