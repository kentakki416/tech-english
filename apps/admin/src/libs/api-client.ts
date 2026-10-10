import "server-only"

import { env } from "../env"

/**
 * Express API を叩く server-side 専用クライアント。
 *
 * admin は DB を直接触らず必ず API を経由する。ブラウザから API を直接叩かないよう
 * `server-only` でガードしているので、client component からは import できない。
 * client 側からデータが必要な場合は Server Component か Route Handler を経由する。
 */
const API_BASE_URL = env.API_URL

export const apiClient = {
  delete: async <T = unknown>(path: string): Promise<T> => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },

  get: async <T>(path: string): Promise<T> => {
    const res = await fetch(`${API_BASE_URL}${path}`)
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },

  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },

  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
}
