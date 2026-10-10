import { createHash, timingSafeEqual } from "node:crypto"

/**
 * 文字列の SHA-256 ダイジェストを求める。
 * timingSafeEqual は長さが違うと throw するため、比べる前に両方を同じ長さ（32 バイト）にそろえる。
 */
const computeSha256Digest = (value: string): Buffer => createHash("sha256").update(value).digest()

/**
 * X-Admin-Token が ADMIN_API_TOKEN と一致するかを定数時間で比べる。
 * ダイジェスト同士を比べるので、比較にかかる時間からトークンの長さも漏れない。
 */
export const isAdminTokenValid = (token: string | undefined, expected: string): boolean =>
  token !== undefined && token.length > 0 && timingSafeEqual(computeSha256Digest(token), computeSha256Digest(expected))
