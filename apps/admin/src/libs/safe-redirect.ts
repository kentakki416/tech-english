import "server-only"

import { APP_ORIGIN } from "./app-origin"

/**
 * サインイン後の戻り先を、自分の origin の中のパスに限る（オープンリダイレクト対策）。
 * 外を指すもの・解釈できないものは "/" にする。
 *
 * `/` で始まるかの文字列の検査だけだと、`/\evil.example.com` や `/\t/evil.example.com` が通り、
 * ブラウザの URL の解釈で外のサイトになる。URL として解釈してから origin を比べる。
 *
 * 解釈した後の pathname が `//` で始まるものも捨てる。`/.//evil.example.com` は origin が自分のままでも
 * pathname が `//evil.example.com` になり、そのまま Location に入れると外のサイトになる
 */
export const resolveSafeRedirectPath = (value: string | null | undefined): string => {
  if (!value) return "/"
  try {
    const url = new URL(value, APP_ORIGIN)
    if (url.origin !== APP_ORIGIN || url.pathname.startsWith("//")) return "/"
    return `${url.pathname}${url.search}`
  } catch {
    return "/"
  }
}
