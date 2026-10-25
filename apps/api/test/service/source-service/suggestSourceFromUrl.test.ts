import type { IGitHubRepositoryClient } from "../../../src/client/github-repository"
import { suggestSourceFromUrl } from "../../../src/service/source-service"

import { LOCAL_POLICY, PRODUCTION_POLICY } from "./fixtures"

const mockDetectLicense = vi.fn<IGitHubRepositoryClient["detectLicense"]>()
const mockFindRepository = vi.fn<IGitHubRepositoryClient["findRepository"]>()
const githubRepositoryClient: IGitHubRepositoryClient = { detectLicense: mockDetectLicense, findRepository: mockFindRepository }

const LICENSE_FILE_URL = "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"

const LEARN_URL = "https://github.com/reactjs/react.dev/tree/main/src/content/learn"

const expectSuggestionError = (result: Awaited<ReturnType<typeof suggestSourceFromUrl>>, code: string) => {
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.statusCode).toBe(400)
    expect(result.error.type).toBe("BAD_REQUEST")
    expect(result.error.details).toEqual([expect.objectContaining({ code, path: ["url"] })])
  }
}

describe("suggestSourceFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindRepository.mockResolvedValue({ defaultBranch: "main", fullName: "reactjs/react.dev" })
    mockDetectLicense.mockResolvedValue({ licenseSpdx: "CC-BY-4.0", licenseUrl: LICENSE_FILE_URL })
  })

  describe("正常系", () => {
    it("ディレクトリの URL は、ブランチ・対象パス・検出したライセンスを返す", async () => {
      const result = await suggestSourceFromUrl(LEARN_URL, { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toEqual({
        ok: true,
        value: {
          branch: "main",
          defaultBranch: "main",
          detectedLicense: { isAllowed: true, licenseSpdx: "CC-BY-4.0", licenseUrl: LICENSE_FILE_URL },
          fetchType: "github_repository",
          includeGlobs: ["src/content/learn/**"],
          repository: "reactjs/react.dev",
        },
      })
      expect(mockFindRepository).toHaveBeenCalledWith("reactjs/react.dev")
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
      expect(mockDetectLicense).toHaveBeenCalledWith("reactjs/react.dev", "main")
    })

    it("トップの URL は、ブランチを default branch・対象パスをリポジトリ全体にする", async () => {
      mockFindRepository.mockResolvedValue({ defaultBranch: "master", fullName: "rust-lang/rfcs" })

      const result = await suggestSourceFromUrl("https://github.com/rust-lang/rfcs", { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toMatchObject({ ok: true, value: { branch: "master", defaultBranch: "master", includeGlobs: ["**"], repository: "rust-lang/rfcs" } })
      expect(mockDetectLicense).toHaveBeenCalledWith("rust-lang/rfcs", "master")
    })

    it("改名・大文字の違うリポジトリは、GitHub の full_name を小文字にした名前を返し、その名前でライセンスを見る", async () => {
      mockFindRepository.mockResolvedValue({ defaultBranch: "main", fullName: "ReactJS/React.dev" })

      const result = await suggestSourceFromUrl("https://github.com/facebook/react.dev", { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toMatchObject({ ok: true, value: { repository: "reactjs/react.dev" } })
      expect(mockFindRepository).toHaveBeenCalledWith("facebook/react.dev")
      expect(mockDetectLicense).toHaveBeenCalledWith("reactjs/react.dev", "main")
    })

    it.each([
      ["許可リストのライセンス", { licenseSpdx: "MIT", licenseUrl: LICENSE_FILE_URL }, { isAllowed: true, licenseSpdx: "MIT", licenseUrl: LICENSE_FILE_URL }],
      ["許可リスト外のライセンス", { licenseSpdx: "GPL-3.0", licenseUrl: LICENSE_FILE_URL }, { isAllowed: false, licenseSpdx: "GPL-3.0", licenseUrl: LICENSE_FILE_URL }],
      ["判定できないライセンス", { licenseSpdx: null, licenseUrl: LICENSE_FILE_URL }, { isAllowed: false, licenseSpdx: null, licenseUrl: LICENSE_FILE_URL }],
      ["ライセンスのファイルが無い", null, { isAllowed: false, licenseSpdx: null, licenseUrl: null }],
    ])("%s は detectedLicense にそのまま入る", async (_label, detected, expected) => {
      mockDetectLicense.mockResolvedValue(detected)

      const result = await suggestSourceFromUrl(LEARN_URL, { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toMatchObject({ ok: true, value: { detectedLicense: expected } })
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
    })

    it("default branch でないブランチでライセンスが見つからなければ、default branch のライセンスを見直す", async () => {
      mockDetectLicense.mockResolvedValueOnce(null).mockResolvedValueOnce({ licenseSpdx: "MIT", licenseUrl: LICENSE_FILE_URL })

      const result = await suggestSourceFromUrl("https://github.com/reactjs/react.dev/tree/release/v2/docs", { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toMatchObject({
        ok: true,
        value: {
          branch: "release",
          defaultBranch: "main",
          detectedLicense: { isAllowed: true, licenseSpdx: "MIT", licenseUrl: LICENSE_FILE_URL },
          includeGlobs: ["v2/docs/**"],
        },
      })
      expect(mockDetectLicense).toHaveBeenCalledTimes(2)
      expect(mockDetectLicense).toHaveBeenNthCalledWith(1, "reactjs/react.dev", "release")
      expect(mockDetectLicense).toHaveBeenNthCalledWith(2, "reactjs/react.dev", null)
    })

    it("default branch でないブランチでライセンスが見つかれば、見直さない", async () => {
      const result = await suggestSourceFromUrl("https://github.com/reactjs/react.dev/tree/canary/src", { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toMatchObject({ ok: true, value: { branch: "canary", detectedLicense: { isAllowed: true } } })
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
    })

    it("サイトの URL は、ローカルならサイトの URL・対象パス・個人の学習用を返し、GitHub を呼ばない", async () => {
      const result = await suggestSourceFromUrl("http://go.dev/doc/", { githubRepositoryClient }, LOCAL_POLICY)

      expect(result).toEqual({
        ok: true,
        value: {
          fetchType: "website",
          includeGlobs: ["/doc/**"],
          licenseSpdx: "LicenseRef-personal-use",
          licenseUrl: "https://go.dev",
          siteUrl: "https://go.dev",
        },
      })
      expect(mockFindRepository).not.toHaveBeenCalled()
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("github.com の URL にリポジトリが無ければ not_repository_url の 400 を返し、GitHub を呼ばない", async () => {
      const result = await suggestSourceFromUrl("https://github.com/reactjs", { githubRepositoryClient }, PRODUCTION_POLICY)

      expectSuggestionError(result, "not_repository_url")
      expect(mockFindRepository).not.toHaveBeenCalled()
    })

    it("ローカル以外でサイトの URL なら website_unavailable の 400 を返す", async () => {
      const result = await suggestSourceFromUrl("https://go.dev/doc/", { githubRepositoryClient }, PRODUCTION_POLICY)

      expectSuggestionError(result, "website_unavailable")
      expect(mockFindRepository).not.toHaveBeenCalled()
    })

    it("リポジトリが無ければ repository_not_found の 400 を返し、ライセンスを見ない", async () => {
      mockFindRepository.mockResolvedValue(null)

      const result = await suggestSourceFromUrl(LEARN_URL, { githubRepositoryClient }, PRODUCTION_POLICY)

      expectSuggestionError(result, "repository_not_found")
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })

    it("default branch でライセンスが見つからなければ、見直さずにファイルが無いときの値を返す", async () => {
      mockDetectLicense.mockResolvedValue(null)

      const result = await suggestSourceFromUrl(LEARN_URL, { githubRepositoryClient }, PRODUCTION_POLICY)

      expect(result).toMatchObject({ ok: true, value: { detectedLicense: { isAllowed: false, licenseSpdx: null, licenseUrl: null } } })
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
    })

    it("GitHub の呼び出しが失敗したら例外が伝播する", async () => {
      mockFindRepository.mockRejectedValue(new Error("GitHub repository request failed: 403"))

      await expect(suggestSourceFromUrl(LEARN_URL, { githubRepositoryClient }, PRODUCTION_POLICY)).rejects.toThrow()
    })
  })
})
