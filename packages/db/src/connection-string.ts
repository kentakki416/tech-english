const DEFAULT_URL = "postgresql://postgres:password@localhost:5433/project-template_dev"

/**
 * DATABASE_URL を取得しつつ、DB_NAME が指定されていれば DB 名部分を上書きする
 * テスト実行時の DB 切り替え（DB_NAME=project-template_test）に対応
 *
 * Prisma / Drizzle の両 client と drizzle.config.ts が同じ規則で接続先を決めるために共有する。
 */
export const buildConnectionString = (): string => {
  const baseUrl = process.env.DATABASE_URL ?? DEFAULT_URL
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}
