import "server-only"

import { redirect } from "next/navigation"

import { env } from "../env"

import { getAccessToken } from "./auth"

/**
 * Express API を叩く server-side 専用クライアント。
 *
 * admin は DB を直接触らず必ず API を経由する。ブラウザから API を直接叩かないよう
 * `server-only` でガードしているので、client component からは import できない。
 * client 側からデータが必要な場合は Server Component か Route Handler を経由する。
 */
const API_BASE_URL = env.API_URL

const SIGN_OUT_PATH = "/api/auth/signout"

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

type RequestOptions = {
  onUnauthorized?: "signOut" | "throw"
}

const buildHeaders = async (hasBody: boolean): Promise<HeadersInit> => {
  const token = await getAccessToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
  }
}

const throwApiError = async (res: Response): Promise<never> => {
  const body = await res.json().catch(() => undefined)
  throw new ApiClientError(res.status, body)
}

/**
 * access token の更新（refresh）はここではしない。Server Component の中では cookie を書けないので、proxy が画面の描画の前に済ませている。
 *
 * 401（proxy で更新した後でも弾かれた。鍵の作り直しや admin の削除など）は、cookie を消す /api/auth/signout に redirect する。
 * cookie を消さずにサインイン画面へ送ると、サインイン画面が「有効な access の cookie がある」と見て元の画面に戻し、
 * 往復が止まらなくなる。
 *
 * redirect は例外（NEXT_REDIRECT）で実現しているので、呼び出し側の try/catch が握りつぶすと遷移しない。
 * api の呼び出しを try/catch で囲むときは、catch の先頭で unstable_rethrow する。
 *
 * `onUnauthorized: "throw"` は、ブラウザの fetch から呼ばれる Route Handler のためにある。redirect すると fetch が
 * サインイン画面の HTML を受け取るので、401 を ApiClientError で投げ、Route Handler が 401 を返せるようにする
 */
const requestApi = async (path: string, method: string, body?: unknown, options: RequestOptions = {}): Promise<Response> => {
  const hasBody = body !== undefined
  const res = await fetch(`${API_BASE_URL}${path}`, {
    body: hasBody ? JSON.stringify(body) : undefined,
    headers: await buildHeaders(hasBody),
    method,
  })
  if (res.status === 401 && options.onUnauthorized !== "throw") redirect(SIGN_OUT_PATH)
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

  get: async <T>(path: string, options?: RequestOptions): Promise<T> => {
    const res = await requestApi(path, "GET", undefined, options)
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
