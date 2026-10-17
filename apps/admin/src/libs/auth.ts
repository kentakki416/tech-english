import "server-only"

import { cookies } from "next/headers"

import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_OPTIONS,
} from "./auth-cookies"

/**
 * Server Action / Route Handler から呼ぶ。Server Component の中では cookie を書けない
 */
export const setAuthCookies = async (accessToken: string, refreshToken: string) => {
  const store = await cookies()
  store.set(ACCESS_TOKEN_COOKIE, accessToken, ACCESS_TOKEN_COOKIE_OPTIONS)
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS)
}

/**
 * Server Action / Route Handler から呼ぶ。Server Component の中では cookie を消せない
 */
export const clearAuthCookies = async () => {
  const store = await cookies()
  store.delete(ACCESS_TOKEN_COOKIE)
  store.delete(REFRESH_TOKEN_COOKIE)
}

export const getAccessToken = async (): Promise<string | null> => {
  const store = await cookies()
  return store.get(ACCESS_TOKEN_COOKIE)?.value ?? null
}

export const getRefreshToken = async (): Promise<string | null> => {
  const store = await cookies()
  return store.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
