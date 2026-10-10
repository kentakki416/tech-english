import { GitHubOAuthClient } from "../../src/client/github-oauth"

const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
const USER_URL = "https://api.github.com/user"
const USER_EMAILS_URL = "https://api.github.com/user/emails"

const INPUT = {
  code: "auth-code",
  codeVerifier: "v".repeat(43),
  redirectUri: "http://localhost:3000/api/auth/callback/github",
}

const client = new GitHubOAuthClient("client-id", "client-secret")

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })

/**
 * GitHub の 3 つのエンドポイントへの fetch を URL ごとに差し替える
 */
const stubGitHubFetch = (responses: { emails?: Response; token: Response; user?: Response }) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url === ACCESS_TOKEN_URL) return responses.token
    if (url === USER_URL && responses.user) return responses.user
    if (url === USER_EMAILS_URL && responses.emails) return responses.emails
    throw new Error(`unexpected fetch: ${url}`)
  })

const GITHUB_USER = {
  id: 12345,
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
  login: "octocat",
  name: "The Octocat",
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GitHubOAuthClient.getUserInfo", () => {
  describe("正常系", () => {
    it("token の交換に code_verifier と redirect_uri を送り、取得したユーザー情報を返す", async () => {
      const fetchSpy = stubGitHubFetch({
        emails: createJsonResponse([{ email: "octocat@example.com", primary: true, verified: true }]),
        token: createJsonResponse({ access_token: "gho_token", scope: "read:user,user:email", token_type: "bearer" }),
        user: createJsonResponse(GITHUB_USER),
      })

      const result = await client.getUserInfo(INPUT)

      expect(result).toEqual({
        id: "12345",
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        email: "octocat@example.com",
        login: "octocat",
        name: "The Octocat",
      })

      /** token の交換: client の資格情報・code・PKCE の code_verifier・redirect_uri をフォームで送る */
      const [tokenUrl, tokenInit] = fetchSpy.mock.calls.find(([url]) => url === ACCESS_TOKEN_URL)!
      expect(tokenUrl).toBe(ACCESS_TOKEN_URL)
      expect(tokenInit?.method).toBe("POST")
      expect(tokenInit?.headers).toEqual({ Accept: "application/json" })
      expect(Object.fromEntries(tokenInit?.body as URLSearchParams)).toEqual({
        client_id: "client-id",
        client_secret: "client-secret",
        code: "auth-code",
        code_verifier: INPUT.codeVerifier,
        redirect_uri: INPUT.redirectUri,
      })

      /** /user と /user/emails: 交換した token と GitHub が必須とする User-Agent を付ける */
      const expectedHeaders = {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer gho_token",
        "User-Agent": "tech-english",
        "X-GitHub-Api-Version": "2022-11-28",
      }
      expect(fetchSpy).toHaveBeenCalledWith(USER_URL, { headers: expectedHeaders })
      expect(fetchSpy).toHaveBeenCalledWith(USER_EMAILS_URL, { headers: expectedHeaders })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it("primary かつ verified のメールだけを採る", async () => {
      stubGitHubFetch({
        emails: createJsonResponse([
          { email: "secondary@example.com", primary: false, verified: true },
          { email: "primary@example.com", primary: true, verified: true },
        ]),
        token: createJsonResponse({ access_token: "gho_token" }),
        user: createJsonResponse(GITHUB_USER),
      })

      const result = await client.getUserInfo(INPUT)

      expect(result?.email).toBe("primary@example.com")
    })

    it("primary でも未検証のメールは採らず null にする", async () => {
      stubGitHubFetch({
        emails: createJsonResponse([
          { email: "secondary@example.com", primary: false, verified: true },
          { email: "primary@example.com", primary: true, verified: false },
        ]),
        token: createJsonResponse({ access_token: "gho_token" }),
        user: createJsonResponse(GITHUB_USER),
      })

      const result = await client.getUserInfo(INPUT)

      expect(result?.email).toBeNull()
    })

    it("name が null / 空文字の場合は null を返す", async () => {
      stubGitHubFetch({
        emails: createJsonResponse([]),
        token: createJsonResponse({ access_token: "gho_token" }),
        user: createJsonResponse({ ...GITHUB_USER, name: "" }),
      })

      const result = await client.getUserInfo(INPUT)

      expect(result).toMatchObject({ email: null, login: "octocat", name: null })
    })
  })

  describe("異常系", () => {
    it("token の交換が { error: \"bad_verification_code\" } の場合、null を返し /user を呼ばない", async () => {
      const fetchSpy = stubGitHubFetch({
        token: createJsonResponse({ error: "bad_verification_code", error_description: "The code passed is incorrect or expired." }),
      })

      const result = await client.getUserInfo(INPUT)

      expect(result).toBeNull()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it("token の交換が { error: \"incorrect_client_credentials\" } の場合、throw する", async () => {
      stubGitHubFetch({
        token: createJsonResponse({ error: "incorrect_client_credentials" }),
      })

      await expect(client.getUserInfo(INPUT)).rejects.toThrow()
    })

    it("token の交換が非 2xx の場合、throw する", async () => {
      stubGitHubFetch({
        token: new Response("Service Unavailable", { status: 503 }),
      })

      await expect(client.getUserInfo(INPUT)).rejects.toThrow()
    })

    it("/user が 500 の場合、throw する", async () => {
      stubGitHubFetch({
        emails: createJsonResponse([]),
        token: createJsonResponse({ access_token: "gho_token" }),
        user: new Response("Internal Server Error", { status: 500 }),
      })

      await expect(client.getUserInfo(INPUT)).rejects.toThrow()
    })

    it("/user/emails が 403 の場合、throw する", async () => {
      stubGitHubFetch({
        emails: new Response("Forbidden", { status: 403 }),
        token: createJsonResponse({ access_token: "gho_token" }),
        user: createJsonResponse(GITHUB_USER),
      })

      await expect(client.getUserInfo(INPUT)).rejects.toThrow()
    })

    it("/user のレスポンスが想定外の形の場合、throw する", async () => {
      stubGitHubFetch({
        emails: createJsonResponse([]),
        token: createJsonResponse({ access_token: "gho_token" }),
        user: createJsonResponse({ login: "octocat" }),
      })

      await expect(client.getUserInfo(INPUT)).rejects.toThrow()
    })
  })
})
