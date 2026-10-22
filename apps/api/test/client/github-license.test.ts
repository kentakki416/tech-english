import { GitHubLicenseClient } from "../../src/client/github-license"

const LICENSE_URL = "https://api.github.com/repos/reactjs/react.dev/license"

const HTML_URL = "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })

/**
 * GitHub の GET /repos/{owner}/{repo}/license への fetch を差し替える（外部 SaaS なのでモックする）
 */
const stubFetch = (response: Response) => vi.spyOn(globalThis, "fetch").mockResolvedValue(response)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GitHubLicenseClient.detectLicense", () => {
  describe("正常系", () => {
    it("GitHub が検出した spdx_id とライセンスのファイルの URL を返し、token があれば Authorization を付ける", async () => {
      const fetchSpy = stubFetch(createJsonResponse({ html_url: HTML_URL, license: { key: "mit", spdx_id: "MIT" }, name: "LICENSE" }))

      const result = await new GitHubLicenseClient("ghp_token").detectLicense("reactjs/react.dev")

      expect(result).toEqual({ licenseSpdx: "MIT", licenseUrl: HTML_URL })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith(LICENSE_URL, {
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

      const result = await new GitHubLicenseClient(token).detectLicense("reactjs/react.dev")

      expect(result).toEqual({ licenseSpdx: "Apache-2.0", licenseUrl: HTML_URL })
      const [, init] = fetchSpy.mock.calls[0]
      expect(init?.headers).not.toHaveProperty("Authorization")
    })

    it("owner / name を URL エンコードしてパスに入れる", async () => {
      const fetchSpy = stubFetch(createJsonResponse({ html_url: HTML_URL, license: { spdx_id: "MIT" } }))

      await new GitHubLicenseClient(undefined).detectLicense("owner/name.js")

      expect(fetchSpy.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/name.js/license")
    })

    it("404（ライセンスファイルが無い・リポジトリが無い）なら null を返す", async () => {
      stubFetch(createJsonResponse({ message: "Not Found" }, 404))

      expect(await new GitHubLicenseClient(undefined).detectLicense("reactjs/react.dev")).toBeNull()
    })

    it("spdx_id が NOASSERTION なら licenseSpdx を null にし、ライセンスのファイルの URL は返す", async () => {
      stubFetch(createJsonResponse({ html_url: HTML_URL, license: { key: "other", spdx_id: "NOASSERTION" } }))

      expect(await new GitHubLicenseClient(undefined).detectLicense("reactjs/react.dev")).toEqual({ licenseSpdx: null, licenseUrl: HTML_URL })
    })

    it.each([
      ["license が null", { html_url: HTML_URL, license: null }],
      ["spdx_id が null", { html_url: HTML_URL, license: { spdx_id: null } }],
    ])("%s なら licenseSpdx を null にする", async (_label, body) => {
      stubFetch(createJsonResponse(body))

      expect(await new GitHubLicenseClient(undefined).detectLicense("reactjs/react.dev")).toEqual({ licenseSpdx: null, licenseUrl: HTML_URL })
    })
  })

  describe("異常系", () => {
    it.each([403, 500])("%s なら throw する", async (status) => {
      stubFetch(createJsonResponse({ message: "error" }, status))

      await expect(new GitHubLicenseClient(undefined).detectLicense("reactjs/react.dev")).rejects.toThrow()
    })

    it("レスポンスが想定外の形なら throw する", async () => {
      stubFetch(createJsonResponse({ html_url: HTML_URL, license: { spdx_id: 1 } }))

      await expect(new GitHubLicenseClient(undefined).detectLicense("reactjs/react.dev")).rejects.toThrow()
    })
  })
})
