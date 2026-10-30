import { GitHubRepositoryClient } from "../../src/client/github-repository"

const REPOSITORY_URL = "https://api.github.com/repos/reactjs/react.dev"

const LICENSE_URL = `${REPOSITORY_URL}/license`

const HTML_URL = "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })

/**
 * GitHub の API（GET /repos/{owner}/{repo} と /license）への fetch を差し替える（外部 SaaS なのでモックする）
 */
const stubFetch = (response: Response) => vi.spyOn(globalThis, "fetch").mockResolvedValue(response)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GitHubRepositoryClient.detectLicense", () => {
  describe("正常系", () => {
    it("GitHub が検出した spdx_id とライセンスのファイルの URL を返し、token があれば Authorization を付ける", async () => {
      const fetchSpy = stubFetch(createJsonResponse({ html_url: HTML_URL, license: { key: "mit", spdx_id: "MIT" }, name: "LICENSE" }))

      const result = await new GitHubRepositoryClient("ghp_token").detectLicense("reactjs/react.dev", "main")

      expect(result).toEqual({ licenseSpdx: "MIT", licenseUrl: HTML_URL })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith(`${LICENSE_URL}?ref=main`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer ghp_token",
          "User-Agent": "TechEnglishBot/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: expect.any(AbortSignal),
      })
    })

    it.each([
      ["undefined", undefined],
      ["空文字", ""],
    ])("token が %s なら Authorization を付けない", async (_label, token) => {
      const fetchSpy = stubFetch(createJsonResponse({ html_url: HTML_URL, license: { spdx_id: "Apache-2.0" } }))

      const result = await new GitHubRepositoryClient(token).detectLicense("reactjs/react.dev", "main")

      expect(result).toEqual({ licenseSpdx: "Apache-2.0", licenseUrl: HTML_URL })
      const [, init] = fetchSpy.mock.calls[0]
      expect(init?.headers).not.toHaveProperty("Authorization")
    })

    it("owner / name を URL エンコードしてパスに入れる", async () => {
      const fetchSpy = stubFetch(createJsonResponse({ html_url: HTML_URL, license: { spdx_id: "MIT" } }))

      await new GitHubRepositoryClient(undefined).detectLicense("owner/name.js", "main")

      expect(fetchSpy.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/name.js/license?ref=main")
    })

    it("ref を渡すと ?ref= を付けてそのブランチのライセンスを見る", async () => {
      const fetchSpy = stubFetch(createJsonResponse({ html_url: HTML_URL, license: { spdx_id: "MIT" } }))

      await new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "release/v2")

      expect(fetchSpy.mock.calls[0][0]).toBe(`${LICENSE_URL}?ref=release%2Fv2`)
    })

    it("404（ライセンスファイルが無い・リポジトリが無い）なら null を返す", async () => {
      stubFetch(createJsonResponse({ message: "Not Found" }, 404))

      expect(await new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "main")).toBeNull()
    })

    it("spdx_id が NOASSERTION なら licenseSpdx を null にし、ライセンスのファイルの URL は返す", async () => {
      stubFetch(createJsonResponse({ html_url: HTML_URL, license: { key: "other", spdx_id: "NOASSERTION" } }))

      expect(await new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "main")).toEqual({ licenseSpdx: null, licenseUrl: HTML_URL })
    })

    it.each([
      ["license が null", { html_url: HTML_URL, license: null }],
      ["spdx_id が null", { html_url: HTML_URL, license: { spdx_id: null } }],
    ])("%s なら licenseSpdx を null にする", async (_label, body) => {
      stubFetch(createJsonResponse(body))

      expect(await new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "main")).toEqual({ licenseSpdx: null, licenseUrl: HTML_URL })
    })

    it("html_url が null なら licenseUrl を null にする", async () => {
      stubFetch(createJsonResponse({ html_url: null, license: { spdx_id: "MIT" } }))

      expect(await new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "main")).toEqual({ licenseSpdx: "MIT", licenseUrl: null })
    })
  })

  describe("異常系", () => {
    it.each([403, 500])("%s なら throw する", async (status) => {
      stubFetch(createJsonResponse({ message: "error" }, status))

      await expect(new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "main")).rejects.toThrow()
    })

    it("レスポンスが想定外の形なら throw する", async () => {
      stubFetch(createJsonResponse({ html_url: HTML_URL, license: { spdx_id: 1 } }))

      await expect(new GitHubRepositoryClient(undefined).detectLicense("reactjs/react.dev", "main")).rejects.toThrow()
    })
  })
})

describe("GitHubRepositoryClient.findRepository", () => {
  describe("正常系", () => {
    it("default branch と full_name を返し、token があれば Authorization を付ける", async () => {
      const fetchSpy = stubFetch(createJsonResponse({ default_branch: "main", full_name: "reactjs/react.dev", id: 1 }))

      const result = await new GitHubRepositoryClient("ghp_token").findRepository("reactjs/react.dev")

      expect(result).toEqual({ defaultBranch: "main", fullName: "reactjs/react.dev" })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith(REPOSITORY_URL, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer ghp_token",
          "User-Agent": "TechEnglishBot/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: expect.any(AbortSignal),
      })
    })

    it("404（リポジトリが無い・非公開）なら null を返す", async () => {
      stubFetch(createJsonResponse({ message: "Not Found" }, 404))

      expect(await new GitHubRepositoryClient(undefined).findRepository("reactjs/react.dev")).toBeNull()
    })
  })

  describe("異常系", () => {
    it.each([403, 500])("%s なら throw する", async (status) => {
      stubFetch(createJsonResponse({ message: "error" }, status))

      await expect(new GitHubRepositoryClient(undefined).findRepository("reactjs/react.dev")).rejects.toThrow()
    })

    it("レスポンスが想定外の形なら throw する", async () => {
      stubFetch(createJsonResponse({ default_branch: null, full_name: "reactjs/react.dev" }))

      await expect(new GitHubRepositoryClient(undefined).findRepository("reactjs/react.dev")).rejects.toThrow()
    })
  })
})
