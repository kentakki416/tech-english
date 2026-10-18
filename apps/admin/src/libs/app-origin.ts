import "server-only"

import { env } from "../env"

/**
 * admin の origin（末尾の / やパスを落とした `https://admin.example.com`）。
 * NEXT_PUBLIC_APP_URL をそのまま使うと、末尾に / があるだけで戻り先の origin の比較が必ず失敗し、
 * redirect_uri も `//api/auth/callback/google` になって Google の登録と一致しなくなる
 */
export const APP_ORIGIN = new URL(env.NEXT_PUBLIC_APP_URL).origin

/**
 * Google の OAuth の redirect_uri。Google Cloud の「承認済みのリダイレクト URI」に登録する値と一致させる
 */
export const GOOGLE_REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback/google`
