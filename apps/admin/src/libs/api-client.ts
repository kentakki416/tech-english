import "server-only"

import { env } from "../env"

/**
 * admin は DB を直接触らず必ず API を経由する。ブラウザから API を直接叩かないよう
 * `server-only` でガードしているので、client component からは import できない。
 * client 側からデータが必要な場合は Server Component か Route Handler を経由する。
 *
 * /api/admin/* は X-Admin-Token で保護されているため、すべてのリクエストに ADMIN_API_TOKEN を付ける。
 * **トークンはこのモジュールの外に出さない**（Client Component に渡す props やエラーにも含めない）。
 */
const API_BASE_URL = env.API_URL

const ADMIN_TOKEN_HEADER = "X-Admin-Token"

/**
 * status と API のエラーボディを保持するので、呼び出し側（Server Action 等）が 400 / 404 / 409 を見分けて画面に出せる
 */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(`API error: ${status}`)
    this.name = "ApiClientError"
  }
}

/**
 * ヘッダの組み立てはここ 1 か所にまとめる（X-Admin-Token の付け忘れを防ぐ）
 */
const buildHeaders = (hasBody: boolean): HeadersInit => ({
  ...(hasBody ? { "Content-Type": "application/json" } : {}),
  [ADMIN_TOKEN_HEADER]: env.ADMIN_API_TOKEN,
})

const throwApiError = async (res: Response): Promise<never> => {
  const body = await res.json().catch(() => undefined)
  throw new ApiClientError(res.status, body)
}

const requestApi = async (path: string, method: string, body?: unknown): Promise<Response> => {
  const hasBody = body !== undefined
  const res = await fetch(`${API_BASE_URL}${path}`, {
    body: hasBody ? JSON.stringify(body) : undefined,
    headers: buildHeaders(hasBody),
    method,
  })
  if (!res.ok) await throwApiError(res)
  return res
}

/**
 * 204（ボディなし）は undefined にする（削除の API が返す）
 */
const readJson = async <T>(res: Response): Promise<T> =>
  (res.status === 204 ? undefined : await res.json()) as T

/**
 * 戻り値はランタイム検証をしないので、検証が必要なら呼び出し側で @repo/api-schema の zod スキーマを使う
 */
export const apiClient = {
  delete: async <T = unknown>(path: string): Promise<T> => {
    const res = await requestApi(path, "DELETE")
    return readJson<T>(res)
  },

  get: async <T>(path: string): Promise<T> => {
    const res = await requestApi(path, "GET")
    return res.json() as Promise<T>
  },

  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await requestApi(path, "POST", body)
    return res.json() as Promise<T>
  },

  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await requestApi(path, "PUT", body)
    return res.json() as Promise<T>
  },
}
