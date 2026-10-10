import type { IGitHubLicenseClient } from "../../../src/client/github-license"
import { detectRepositoryLicense } from "../../../src/service/content-source-service"

const mockDetectLicense = vi.fn<IGitHubLicenseClient["detectLicense"]>()
const githubLicenseClient: IGitHubLicenseClient = { detectLicense: mockDetectLicense }

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
    ])("%s は isAllowed: %s を返す", async (licenseSpdx, isAllowed) => {
      mockDetectLicense.mockResolvedValue(licenseSpdx)

      const result = await detectRepositoryLicense("owner/name", { githubLicenseClient })

      expect(result).toEqual({ ok: true, value: { isAllowed, licenseSpdx } })
      expect(mockDetectLicense).toHaveBeenCalledWith("owner/name")
    })

    it("検出できなかった（null）なら licenseSpdx: null・isAllowed: false を返す", async () => {
      mockDetectLicense.mockResolvedValue(null)

      const result = await detectRepositoryLicense("owner/name", { githubLicenseClient })

      expect(result).toEqual({ ok: true, value: { isAllowed: false, licenseSpdx: null } })
    })
  })

  describe("異常系", () => {
    it("GitHub の呼び出しが失敗したら例外が伝播する", async () => {
      mockDetectLicense.mockRejectedValue(new Error("GitHub license request failed: 403"))

      await expect(detectRepositoryLicense("owner/name", { githubLicenseClient })).rejects.toThrow()
    })
  })
})
