import { OAuth2Client } from "google-auth-library"

import { GoogleOAuthClient } from "../../src/client/google-oauth"

const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

const client = new GoogleOAuthClient("client-id", "client-secret")

const GOOGLE_USER = {
  id: "google-123",
  email: "someone@example.com",
  name: "Someone",
  picture: "https://example.com/a.png",
}

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })

/**
 * code の交換（OAuth2Client.getToken）と userinfo の fetch を差し替える
 */
const stubGoogle = (userInfo: Response) => {
  vi.spyOn(OAuth2Client.prototype, "getToken").mockImplementation(async () => ({
    res: null,
    tokens: { access_token: "ya29.token" },
  }))
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url === USERINFO_URL) return userInfo
    throw new Error(`unexpected fetch: ${url}`)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GoogleOAuthClient.getUserInfo", () => {
  describe("正常系", () => {
    it.each([
      { emailVerified: true, label: "true", userInfo: { ...GOOGLE_USER, verified_email: true } },
      { emailVerified: false, label: "false", userInfo: { ...GOOGLE_USER, verified_email: false } },
      { emailVerified: false, label: "無い", userInfo: GOOGLE_USER },
    ])("verified_email が $label なら emailVerified を $emailVerified にする", async ({ emailVerified, userInfo }) => {
      const fetchSpy = stubGoogle(createJsonResponse(userInfo))

      const result = await client.getUserInfo("auth-code", "http://localhost:3030/auth/callback/google")

      expect(result).toEqual({
        id: "google-123",
        email: "someone@example.com",
        emailVerified,
        name: "Someone",
        picture: "https://example.com/a.png",
      })
      expect(fetchSpy).toHaveBeenCalledWith(USERINFO_URL, { headers: { Authorization: "Bearer ya29.token" } })
    })
  })
})
