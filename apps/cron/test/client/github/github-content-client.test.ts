import { GitHubContentClient, GitHubNotFoundError, GitHubRateLimitError } from "../../../src/client/github"

const USER_AGENT = "TechEnglishBot/1.0"

const createResponse = (body: string, init: { headers?: Record<string, string>; status?: number } = {}): Response =>
  new Response(body, { headers: init.headers, status: init.status ?? 200 })

const createJsonResponse = (body: unknown, init: { headers?: Record<string, string>; status?: number } = {}): Response =>
  createResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } })

/**
 * GitHub API の偽物（外部 SaaS なので fetch を差し替える）
 */
const createClient = (response: Response, token: string | undefined = undefined) => {
  const fetchMock = vi.fn<typeof fetch>(async () => response)
  return { client: new GitHubContentClient({ fetch: fetchMock, token, userAgent: USER_AGENT }), fetchMock }
}

const readRequest = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) => {
  const [url, init] = fetchMock.mock.calls[0]
  return { headers: (init?.headers ?? {}) as Record<string, string>, url: String(url) }
}

describe("GitHubContentClient", () => {
  describe("正常系", () => {
    it("getLatestCommitSha は commits/{branch} の sha を返し、token があれば Authorization を付ける", async () => {
      const { client, fetchMock } = createClient(createJsonResponse({ commit: {}, sha: "c0ffee" }), "ghp_token")

      const sha = await client.getLatestCommitSha("reactjs/react.dev", "main")

      expect(sha).toBe("c0ffee")
      expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/reactjs/react.dev/commits/main", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer ghp_token",
          "User-Agent": USER_AGENT,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: expect.any(AbortSignal),
      })
    })

    it.each([
      ["undefined", undefined],
      ["空文字", ""],
    ])("token が %s なら Authorization を付けない", async (_label, token) => {
      const { client, fetchMock } = createClient(createJsonResponse({ sha: "c0ffee" }), token)

      await client.getLatestCommitSha("reactjs/react.dev", "main")

      expect(readRequest(fetchMock).headers).not.toHaveProperty("Authorization")
    })

    it("branch を URL エンコードする", async () => {
      const { client, fetchMock } = createClient(createJsonResponse({ sha: "c0ffee" }))

      await client.getLatestCommitSha("owner/repo", "release/v1")

      expect(readRequest(fetchMock).url).toBe("https://api.github.com/repos/owner/repo/commits/release%2Fv1")
    })

    it("getFileContent は raw の Accept で本文を返し、path をセグメントごとにエンコードする", async () => {
      const { client, fetchMock } = createClient(createResponse("# Title\n\nBody\n"))

      const content = await client.getFileContent("owner/repo", "docs/my guide#1.md", "abc123")

      expect(content).toBe("# Title\n\nBody\n")
      const { headers, url } = readRequest(fetchMock)
      expect(url).toBe("https://api.github.com/repos/owner/repo/contents/docs/my%20guide%231.md?ref=abc123")
      expect(headers.Accept).toBe("application/vnd.github.raw+json")
      expect(headers["User-Agent"]).toBe(USER_AGENT)
    })

    it("getTree は recursive を付けて取得し、size の無いエントリは null にする", async () => {
      const { client, fetchMock } = createClient(createJsonResponse({
        sha: "tree",
        tree: [
          { mode: "040000", path: "docs", sha: "t1", type: "tree" },
          { mode: "100644", path: "docs/a.md", sha: "b1", size: 120, type: "blob" },
          { mode: "160000", path: "vendor/lib", sha: "s1", type: "commit" },
        ],
        truncated: true,
      }))

      const result = await client.getTree("owner/repo", "abc123", { isRecursive: true })

      expect(readRequest(fetchMock).url).toBe("https://api.github.com/repos/owner/repo/git/trees/abc123?recursive=1")
      expect(result).toEqual({
        entries: [
          { path: "docs", sha: "t1", size: null, type: "tree" },
          { path: "docs/a.md", sha: "b1", size: 120, type: "blob" },
          { path: "vendor/lib", sha: "s1", size: null, type: "commit" },
        ],
        isTruncated: true,
      })
    })

    it("getTree は isRecursive: false なら recursive を付けない", async () => {
      const { client, fetchMock } = createClient(createJsonResponse({ tree: [], truncated: false }))

      await client.getTree("owner/repo", "abc123", { isRecursive: false })

      expect(readRequest(fetchMock).url).toBe("https://api.github.com/repos/owner/repo/git/trees/abc123")
    })

    it("x-ratelimit-remaining を getRateLimitRemaining に反映する（呼ぶ前は null）", async () => {
      const { client } = createClient(createJsonResponse({ sha: "c0ffee" }, { headers: { "x-ratelimit-remaining": "4321" } }))

      expect(client.getRateLimitRemaining()).toBeNull()
      await client.getLatestCommitSha("owner/repo", "main")
      expect(client.getRateLimitRemaining()).toBe(4321)
    })
  })

  describe("異常系", () => {
    it("404 は GitHubNotFoundError", async () => {
      const { client } = createClient(createJsonResponse({ message: "Not Found" }, { status: 404 }))

      await expect(client.getLatestCommitSha("owner/repo", "main")).rejects.toBeInstanceOf(GitHubNotFoundError)
    })

    it("残り 0 の 403 は GitHubRateLimitError で、残りも記録する", async () => {
      const { client } = createClient(createJsonResponse(
        { message: "API rate limit exceeded" },
        { headers: { "x-ratelimit-remaining": "0" }, status: 403 },
      ))

      await expect(client.getFileContent("owner/repo", "a.md", "abc")).rejects.toBeInstanceOf(GitHubRateLimitError)
      expect(client.getRateLimitRemaining()).toBe(0)
    })

    it("Retry-After つきの 429（secondary rate limit）は GitHubRateLimitError", async () => {
      const { client } = createClient(createJsonResponse(
        { message: "secondary rate limit" },
        { headers: { "retry-after": "60", "x-ratelimit-remaining": "4000" }, status: 429 },
      ))

      await expect(client.getTree("owner/repo", "abc", { isRecursive: true })).rejects.toBeInstanceOf(GitHubRateLimitError)
    })

    it("残りがある 403（権限不足など）は rate limit ではない Error", async () => {
      const { client } = createClient(createJsonResponse(
        { message: "Forbidden" },
        { headers: { "x-ratelimit-remaining": "4000" }, status: 403 },
      ))

      const promise = client.getLatestCommitSha("owner/repo", "main")
      await expect(promise).rejects.toThrow("GitHub request failed: 403")
      await expect(promise).rejects.not.toBeInstanceOf(GitHubRateLimitError)
    })

    it("500 は throw する", async () => {
      const { client } = createClient(createJsonResponse({ message: "Server Error" }, { status: 500 }))

      await expect(client.getLatestCommitSha("owner/repo", "main")).rejects.toThrow("GitHub request failed: 500")
    })

    it.each([
      ["commits の sha が無い", { commit: {} }, "commit"],
      ["trees の tree が配列でない", { tree: "x", truncated: false }, "tree"],
      ["trees の type が想定外", { tree: [{ path: "a", sha: "b", type: "symlink" }], truncated: false }, "tree"],
    ])("%s JSON は throw する", async (_label, body, method) => {
      const { client } = createClient(createJsonResponse(body))

      const promise = method === "commit"
        ? client.getLatestCommitSha("owner/repo", "main")
        : client.getTree("owner/repo", "abc", { isRecursive: true })
      await expect(promise).rejects.toThrow()
    })

    it("owner/name の形でない repository は throw する", async () => {
      const { client, fetchMock } = createClient(createJsonResponse({ sha: "c0ffee" }))

      await expect(client.getLatestCommitSha("owner/repo/extra", "main")).rejects.toThrow("Invalid GitHub repository")
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
