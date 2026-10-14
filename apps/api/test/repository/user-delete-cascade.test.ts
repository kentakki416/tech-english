import { sql } from "@repo/db"

import { disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { USER_OWNED_TABLES } from "../controller/user-owned-data"

/**
 * アカウント削除は users の行を物理削除し、関連テーブルは外部キーの ON DELETE CASCADE で消す（github-auth README「アカウント削除の処理」）。
 * そのため、users（とその子孫）を参照する外部キーがすべて cascade であることを DB のカタログから確かめる。
 * テーブルが増えても、外部キーを張れば自動でこのテストの対象になる
 */

/**
 * users から cascade でたどれるテーブル（users 自身を含む）
 */
const USER_OWNED_TABLES_QUERY = sql`
  WITH RECURSIVE owned(table_oid) AS (
    SELECT 'users'::regclass::oid
    UNION
    SELECT c.conrelid FROM pg_constraint c JOIN owned o ON c.confrelid = o.table_oid
    WHERE c.contype = 'f' AND c.confdeltype = 'c'
  )
  SELECT table_oid::regclass::text AS table_name FROM owned ORDER BY table_name
`

/**
 * users（とその子孫）を参照しているのに cascade しない外部キー
 */
const NON_CASCADING_FOREIGN_KEYS_QUERY = sql`
  WITH RECURSIVE owned(table_oid) AS (
    SELECT 'users'::regclass::oid
    UNION
    SELECT c.conrelid FROM pg_constraint c JOIN owned o ON c.confrelid = o.table_oid
    WHERE c.contype = 'f' AND c.confdeltype = 'c'
  )
  SELECT c.conname AS constraint_name, c.conrelid::regclass::text AS table_name
  FROM pg_constraint c
  WHERE c.contype = 'f' AND c.confrelid IN (SELECT table_oid FROM owned) AND c.confdeltype <> 'c'
  ORDER BY table_name, constraint_name
`

type NonCascadingForeignKey = { constraint_name: string; table_name: string }

/**
 * カタログのクエリが検出できることを確かめるために、トランザクション内で一時的に作って rollback する
 */
class RollbackForTest extends Error {}

afterAll(async () => {
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("users の削除の cascade", () => {
  describe("正常系", () => {
    it("users（とその子孫）を参照する外部キーはすべて ON DELETE CASCADE である", async () => {
      const result = await testDb.execute<NonCascadingForeignKey>(NON_CASCADING_FOREIGN_KEYS_QUERY)

      /**
       * cascade しない外部キーがあると、ユーザーを削除できないかデータが残る
       */
      expect(result.rows).toEqual([])
    })

    it("users から cascade でたどれるテーブルが一覧と一致する", async () => {
      const result = await testDb.execute<{ table_name: string }>(USER_OWNED_TABLES_QUERY)

      /**
       * テーブルを足したらこの一覧と github-auth README の「アカウント削除の処理」の表、
       * test/controller/user-owned-data.ts の USER_OWNED_TABLES を更新する
       */
      expect(result.rows.map((row) => row.table_name)).toEqual([
        "attempt_answers",
        "attempt_word_lookups",
        "auth_accounts",
        "reading_attempts",
        "reminder_settings",
        "user_goals",
        "users",
      ])
    })

    it("test/controller/user-owned-data.ts の USER_OWNED_TABLES が、users から cascade でたどれるテーブルを網羅している", async () => {
      const result = await testDb.execute<{ table_name: string }>(USER_OWNED_TABLES_QUERY)
      const ownedTableNames = result.rows.map((row) => row.table_name).filter((name) => name !== "users")

      /**
       * 網羅していないと、アカウント削除のデータのテスト（test/controller/user/delete.test.ts）で消えることを確かめられない
       */
      expect(USER_OWNED_TABLES.map((table) => table.tableName).sort()).toEqual(ownedTableNames)
    })
  })

  describe("異常系", () => {
    it("cascade しない外部キーで users を参照するテーブルがあると、カタログのクエリが検出する", async () => {
      let detected: NonCascadingForeignKey[] = []

      await expect(
        testDb.transaction(async (tx) => {
          await tx.execute(sql`
            CREATE TABLE tmp_non_cascading (
              id serial PRIMARY KEY,
              user_id integer NOT NULL CONSTRAINT tmp_non_cascading_user_id_fkey REFERENCES users (id)
            )
          `)
          const result = await tx.execute<NonCascadingForeignKey>(NON_CASCADING_FOREIGN_KEYS_QUERY)
          detected = result.rows
          throw new RollbackForTest()
        }),
      ).rejects.toThrow(RollbackForTest)

      expect(detected).toContainEqual({ constraint_name: "tmp_non_cascading_user_id_fkey", table_name: "tmp_non_cascading" })
    })
  })
})
