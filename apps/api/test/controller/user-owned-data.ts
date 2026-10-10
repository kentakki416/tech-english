import { authAccounts, eq } from "@repo/db"

import { testDb } from "./setup"

/**
 * users から cascade でたどれるテーブル（users 自身を除く）1 つ分の、テストデータの入れ方と数え方
 */
type UserOwnedTable = {
  /**
   * そのユーザーに紐づく行数
   */
  countRows: (userId: number) => Promise<number>
  /**
   * そのユーザーに紐づく行を 1 行以上入れる
   */
  seed: (userId: number) => Promise<void>
  tableName: string
}

/**
 * users に紐づくテーブルの一覧。アカウント削除で cascade して消えることを確かめるのに使う。
 *
 * ユーザーに紐づくテーブルを足したら、ここにも足す（reading_attempts など。seed は依存する行も含めて作る）。
 * test/repository/user-delete-cascade.test.ts が、この一覧と users から cascade でたどれるテーブルが一致することを確かめている
 */
export const USER_OWNED_TABLES: readonly UserOwnedTable[] = [
  {
    countRows: async (userId) => testDb.$count(authAccounts, eq(authAccounts.userId, userId)),
    seed: async (userId) => {
      await testDb.insert(authAccounts).values({
        provider: "github",
        providerAccountId: `github-${userId}`,
        userId,
      })
    },
    tableName: "auth_accounts",
  },
]

/**
 * USER_OWNED_TABLES のすべてのテーブルに、そのユーザーの行を入れる。
 * 後のテーブルが前のテーブルの行に依存できるよう、順番に入れる
 */
export const seedUserOwnedData = async (userId: number): Promise<void> => {
  for (const table of USER_OWNED_TABLES) {
    await table.seed(userId)
  }
}

/**
 * USER_OWNED_TABLES のテーブルごとの、そのユーザーの行数（テーブル名 → 行数）
 */
export const countUserOwnedRows = async (userId: number): Promise<Record<string, number>> => {
  const entries = await Promise.all(
    USER_OWNED_TABLES.map(async (table) => [table.tableName, await table.countRows(userId)] as const),
  )
  return Object.fromEntries(entries)
}
