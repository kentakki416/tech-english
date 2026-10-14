import { env } from "@/env"

import { getAccessToken } from "./auth"

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

/**
 * access token の更新はここでは行わない。Server Component は cookie を書き換えられず、更新した refresh token を
 * 保存できないため。更新は描画より前に proxy（src/libs/token-refresh.ts）が行い、ここに届く cookie は更新済み
 */
const fetchWithAuth = async (input: string, init: RequestInit): Promise<Response> => {
  const headers = await buildHeaders(init.headers)
  return fetch(`${API_BASE_URL}${input}`, { ...init, headers })
}

const throwApiError = async (res: Response): Promise<never> => {
  const body = await res.json().catch(() => undefined)
  throw new ApiClientError(res.status, body)
}

/**
 * 204 No Content はボディが無いので json() を呼ばない
 */
const readJson = async <T>(res: Response): Promise<T> =>
  (res.status === 204 ? undefined : await res.json()) as T

/**
 * 「ブラウザから Express を直接叩かない」原則の実体。cookies() に依存するため
 * Server Component / Server Action / Route Handler からのみ使う。
 *
 * 戻り値はランタイム検証をしないので、検証が必要なら呼び出し側で zod を使う。
 */
export const apiClient = {
  /**
   * body は省略できる（`DELETE /api/user` のように確認の値を送る API だけが渡す）
   */
  delete: async <T = unknown>(path: string, body?: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      method: "DELETE",
    })
    if (!res.ok) await throwApiError(res)
    return readJson<T>(res)
  },
  get: async <T>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "GET" })
    if (!res.ok) await throwApiError(res)
    return readJson<T>(res)
  },
  patch: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "PATCH" })
    if (!res.ok) await throwApiError(res)
    return readJson<T>(res)
  },
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "POST" })
    if (!res.ok) await throwApiError(res)
    return readJson<T>(res)
  },
  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "PUT" })
    if (!res.ok) await throwApiError(res)
    return readJson<T>(res)
  },
}
