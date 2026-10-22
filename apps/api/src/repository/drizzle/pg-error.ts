/**
 * Postgres の unique 制約違反の SQLSTATE
 */
const UNIQUE_VIOLATION = "23505"

/**
 * unique 制約違反か。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる。
 * どの制約かは見ないので、呼び出し側は「そのテーブルの unique 制約が重複の登録しか表さない」ときだけ使う
 * （sources は repository / site_url、tags は lower(name)）
 */
export const isUniqueViolation = (error: unknown): boolean => {
  const cause = typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === UNIQUE_VIOLATION
}

/**
 * Postgres の外部キー制約違反の SQLSTATE
 */
const FOREIGN_KEY_VIOLATION = "23503"

/**
 * 外部キー制約違反か。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる
 */
export const isForeignKeyViolation = (error: unknown): boolean => {
  const cause = typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === FOREIGN_KEY_VIOLATION
}
