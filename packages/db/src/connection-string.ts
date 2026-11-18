const DEFAULT_URL = "postgresql://postgres:password@localhost:5433/tech-english_dev"

/**
 * DATABASE_URL の DB 名を、DB_NAME が指定されていればそれに置き換える
 * （テスト実行時に DB_NAME=tech-english_test で DB を切り替えるため）
 */
export const buildConnectionString = (): string => {
  const baseUrl = process.env.DATABASE_URL ?? DEFAULT_URL
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}
