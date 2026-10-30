import type { IGitHubRepositoryClient } from "../../../src/client/github-repository"
import { suggestSourceFromUrl } from "../../../src/service/source-service"

import { LOCAL_POLICY, PRODUCTION_POLICY } from "./fixtures"

const mockDetectLicense = vi.fn<IGitHubRepositoryClient["detectLicense"]>()
const mockFindRepository = vi.fn<IGitHubRepositoryClient["findRepository"]>()
const githubRepositoryClient: IGitHubRepositoryClient = { detectLicense: mockDetectLicense, findRepository: mockFindRepository }

const LICENSE_FILE_URL = "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"

const LEARN_URL = "https://github.com/reactjs/react.dev/tree/main/src/content/learn"

const RELEASE_BRANCH_URL = "https://github.com/reactjs/react.dev/tree/release/v2/docs"

const suggestGitHub = async (url: string) =>
  suggestSourceFromUrl({ fetchType: "github_repository", url }, { githubRepositoryClient }, PRODUCTION_POLICY)

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
    it("GitHub のディレクトリの URL は、ブランチ・対象パス・検出したライセンスを返す", async () => {
      const result = await suggestGitHub(LEARN_URL)

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

    it("GitHub のトップの URL は、ブランチを default branch・対象パスをリポジトリ全体にする", async () => {
      mockFindRepository.mockResolvedValue({ defaultBranch: "master", fullName: "rust-lang/rfcs" })

      const result = await suggestGitHub("https://github.com/rust-lang/rfcs")

      expect(result).toMatchObject({ ok: true, value: { branch: "master", defaultBranch: "master", includeGlobs: ["**"], repository: "rust-lang/rfcs" } })
      expect(mockDetectLicense).toHaveBeenCalledWith("rust-lang/rfcs", "master")
    })

    it("改名・大文字の違うリポジトリは、GitHub の full_name を小文字にした名前を返し、その名前でライセンスを見る", async () => {
      mockFindRepository.mockResolvedValue({ defaultBranch: "main", fullName: "ReactJS/React.dev" })

      const result = await suggestGitHub("https://github.com/facebook/react.dev")

      expect(result).toMatchObject({ ok: true, value: { repository: "reactjs/react.dev" } })
      expect(mockFindRepository).toHaveBeenCalledWith("facebook/react.dev")
      expect(mockDetectLicense).toHaveBeenCalledWith("reactjs/react.dev", "main")
    })

    it.each([
      ["許可リストのライセンス", { licenseSpdx: "MIT", licenseUrl: LICENSE_FILE_URL }, { isAllowed: true, licenseSpdx: "MIT", licenseUrl: LICENSE_FILE_URL }],
      ["許可リスト外のライセンス", { licenseSpdx: "GPL-3.0", licenseUrl: LICENSE_FILE_URL }, { isAllowed: false, licenseSpdx: "GPL-3.0", licenseUrl: LICENSE_FILE_URL }],
      ["判定できないライセンス", { licenseSpdx: null, licenseUrl: LICENSE_FILE_URL }, { isAllowed: false, licenseSpdx: null, licenseUrl: LICENSE_FILE_URL }],
      ["ライセンスのファイルが無い", null, { isAllowed: false, licenseSpdx: null, licenseUrl: null }],
    ])("default branch の %s は detectedLicense にそのまま入る", async (_label, detected, expected) => {
      mockDetectLicense.mockResolvedValue(detected)

      const result = await suggestGitHub(LEARN_URL)

      expect(result).toMatchObject({ ok: true, value: { detectedLicense: expected } })
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
    })

    it("default branch でないブランチでライセンスが見つからなければ、default branch のライセンスを見ずに、ファイルが無いときの値を返す", async () => {
      mockDetectLicense.mockResolvedValue(null)

      const result = await suggestGitHub(RELEASE_BRANCH_URL)

      expect(result).toMatchObject({
        ok: true,
        value: {
          branch: "release",
          defaultBranch: "main",
          detectedLicense: { isAllowed: false, licenseSpdx: null, licenseUrl: null },
          includeGlobs: ["v2/docs/**"],
        },
      })
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
      expect(mockDetectLicense).toHaveBeenCalledWith("reactjs/react.dev", "release")
    })

    it("default branch でないブランチでライセンスが見つかれば、そのライセンスを返す", async () => {
      const result = await suggestGitHub("https://github.com/reactjs/react.dev/tree/canary/src")

      expect(result).toMatchObject({ ok: true, value: { branch: "canary", detectedLicense: { isAllowed: true } } })
      expect(mockDetectLicense).toHaveBeenCalledTimes(1)
    })

    it("サイトの URL は、ローカルならサイトの URL・対象パス・個人の学習用を返し、GitHub を呼ばない", async () => {
      const result = await suggestSourceFromUrl({ fetchType: "website", url: "http://go.dev/doc/" }, { githubRepositoryClient }, LOCAL_POLICY)

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
    it.each([
      ["リポジトリが無い github.com の URL", "https://github.com/reactjs"],
      ["サイトの URL", "https://go.dev/doc/"],
    ])("GitHub で %s なら not_repository_url の 400 を返し、GitHub を呼ばない", async (_label, url) => {
      const result = await suggestGitHub(url)

      expectSuggestionError(result, "not_repository_url")
      expect(mockFindRepository).not.toHaveBeenCalled()
    })

    it("GitHub でリポジトリが無ければ repository_not_found の 400 を返し、ライセンスを見ない", async () => {
      mockFindRepository.mockResolvedValue(null)

      const result = await suggestGitHub(LEARN_URL)

      expectSuggestionError(result, "repository_not_found")
      expect(mockDetectLicense).not.toHaveBeenCalled()
    })

    it("サイトで github.com の URL なら github_url の 400 を返し、GitHub を呼ばない", async () => {
      const result = await suggestSourceFromUrl({ fetchType: "website", url: LEARN_URL }, { githubRepositoryClient }, LOCAL_POLICY)

      expectSuggestionError(result, "github_url")
      expect(mockFindRepository).not.toHaveBeenCalled()
    })

    it("サイトでローカル以外なら website_unavailable の 400 を返し、GitHub を呼ばない", async () => {
      const result = await suggestSourceFromUrl({ fetchType: "website", url: "https://github.com/reactjs/react.dev" }, { githubRepositoryClient }, PRODUCTION_POLICY)

      expectSuggestionError(result, "website_unavailable")
      expect(mockFindRepository).not.toHaveBeenCalled()
    })

    it("GitHub の呼び出しが失敗したら例外が伝播する", async () => {
      mockFindRepository.mockRejectedValue(new Error("GitHub repository request failed: 403"))

      await expect(suggestGitHub(LEARN_URL)).rejects.toThrow()
    })
  })
})
