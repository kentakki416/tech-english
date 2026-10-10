import { env } from "@/env"

import { clearAuthCookies, getAccessToken, getRefreshToken, setAuthCookies } from "./auth"

const API_BASE_URL = env.API_URL

/** status とボディを保持するので、呼び出し側が元の status をそのまま返せる */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(`API error: ${status}`)
    this.name = "ApiClientError"
  }
}

const buildHeaders = async (extra?: HeadersInit): Promise<HeadersInit> => {
  const token = await getAccessToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    ...extra,
  }
}

/** refresh API が non-2xx なら cookie をクリアする（＝要再ログイン） */
const tryRefresh = async (): Promise<boolean> => {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    await clearAuthCookies()
    return false
  }
  const json = await res.json() as { access_token: string; refresh_token: string }
  await setAuthCookies(json.access_token, json.refresh_token)
  return true
}

/**
 * 401 なら tryRefresh して 1 回だけ再試行する。retry=false で再帰を 1 段に制限し、
 * 「refresh しても 401」で無限ループにならないようにしている。
 */
const fetchWithAuth = async (input: string, init: RequestInit, retry = true): Promise<Response> => {
  const headers = await buildHeaders(init.headers)
  const res = await fetch(`${API_BASE_URL}${input}`, { ...init, headers })
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh()
    if (refreshed) return fetchWithAuth(input, init, false)
  }
  return res
}

const throwApiError = async (res: Response): Promise<never> => {
  const body = await res.json().catch(() => undefined)
  throw new ApiClientError(res.status, body)
}

/**
 * 「ブラウザから Express を直接叩かない」原則の実体。cookies() に依存するため
 * Server Component / Server Action / Route Handler からのみ使う。
 *
 * 戻り値はランタイム検証をしないので、検証が必要なら呼び出し側で zod を使う。
 */
export const apiClient = {
  delete: async <T = unknown>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "DELETE" })
    if (!res.ok) await throwApiError(res)
    return res.json() as Promise<T>
  },
  get: async <T>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "GET" })
    if (!res.ok) await throwApiError(res)
    return res.json() as Promise<T>
  },
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "POST" })
    if (!res.ok) await throwApiError(res)
    return res.json() as Promise<T>
  },
  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "PUT" })
    if (!res.ok) await throwApiError(res)
    return res.json() as Promise<T>
  },
}
