/**
 * パスが prefix と完全に一致するか、path segment の境界で prefix の下にあるか（大文字小文字は区別しない）
 *
 * 単純な `path.startsWith(prefix)` は `/api/auth/github` が `/api/auth/github-foo` も
 * 通してしまうため、登録されたエンドポイントと意図しないパスが衝突するリスクがある。
 * `/` 区切り（= path segment 境界）で一致するものだけを通す。
 *
 * 大文字小文字を区別しないのは、Express 5 の mount と Router が区別しないため。
 * 区別して比べると、`/API/Health` のように Router には届くのに判定だけが外れる。
 *
 * 例（prefix = "/api/auth/github"）:
 * - "/api/auth/github"          → true（完全一致）
 * - "/api/auth/github/callback" → true（segment 境界の prefix）
 * - "/API/Auth/GitHub"          → true（大文字小文字は区別しない）
 * - "/api/auth/github-foo"      → false（segment 境界ではない）
 */
export const isPathUnderPrefix = (path: string, prefix: string): boolean => {
  const normalizedPath = path.toLowerCase()
  const normalizedPrefix = prefix.toLowerCase()
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)
}
