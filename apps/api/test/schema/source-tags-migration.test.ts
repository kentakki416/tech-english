import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { sql } from "@repo/db"

import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * add_tags migration の「既存のタグの移行」を実 DB で確かめる（docs/spec/source-tags/tasks/step1-db-tags.md）。
 * migration.sql のマーカーの間を取り出して流す。content_sources は生の SQL で入れる（Drizzle のスキーマから tags を外しても直さずに済むように）。
 * このテストは content_sources.tags 列を前提にするので、列を消す step6 で一緒に消す
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../packages/db/drizzle/migrations")
const START_MARKER = "-- source-tags: 既存のタグの移行（ここから）"
const END_MARKER = "-- source-tags: 既存のタグの移行（ここまで）"
const STATEMENT_BREAKPOINT = "--> statement-breakpoint"

const loadMigrationStatements = (): string[] => {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_add_tags"))
  if (!dir) throw new Error("add_tags の migration が見つからない")
  const content = readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf-8")
  const body = content.slice(content.indexOf(START_MARKER) + START_MARKER.length, content.indexOf(END_MARKER))
  return body
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "")
}

const runMigration = async () => {
  for (const statement of loadMigrationStatements()) {
    await testDb.execute(sql.raw(statement))
  }
}

/**
 * tags を jsonb の配列で持つソースを生の SQL で入れ、採番された id を返す
 */
const insertSourceWithTags = async (name: string, tagNames: string[]): Promise<number> => {
  const result = await testDb.execute(sql`
    INSERT INTO content_sources (name, kind, fetch_type, include_globs, license_spdx, license_url, repository, branch, tags, updated_at)
    VALUES (${name}, 'docs', 'github_repository', '["docs/**"]', 'CC-BY-4.0', 'https://example.com/LICENSE', ${`example/${name}`}, 'main', ${JSON.stringify(tagNames)}::jsonb, now())
    RETURNING id
  `)
  return (result.rows[0] as { id: number }).id
}

const selectTags = async () => {
  const result = await testDb.execute(sql`SELECT name, color FROM tags ORDER BY lower(name)`)
  return result.rows as { color: string; name: string }[]
}

const selectLinks = async () => {
  const result = await testDb.execute(sql`
    SELECT cst.content_source_id AS "sourceId", t.name AS name
    FROM content_source_tags cst
    INNER JOIN tags t ON t.id = cst.tag_id
    ORDER BY cst.content_source_id, lower(t.name)
  `)
  return result.rows as { name: string; sourceId: number }[]
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("add_tags migration の既存のタグの移行", () => {
  describe("正常系", () => {
    it("大文字・小文字と前後の空白を同じ名前とみなして 1 つにまとめ、書き方は id が最小のソースのものを採り、空文字は移さない", async () => {
      await insertSourceWithTags("a", ["React", "frontend"])
      await insertSourceWithTags("b", ["react", " Go ", ""])
      await insertSourceWithTags("c", ["go", "Frontend"])

      await runMigration()

      const rows = await selectTags()
      expect(rows.map((row) => row.name)).toEqual(["frontend", "Go", "React"])
    })

    it("色は lower(name) の順に blue・rose・emerald が割り当たる", async () => {
      await insertSourceWithTags("a", ["React", "frontend"])
      await insertSourceWithTags("b", ["react", " Go ", ""])
      await insertSourceWithTags("c", ["go", "Frontend"])

      await runMigration()

      expect(await selectTags()).toEqual([
        { color: "blue", name: "frontend" },
        { color: "rose", name: "Go" },
        { color: "emerald", name: "React" },
      ])
    })

    it("ソースとタグが紐付く", async () => {
      const a = await insertSourceWithTags("a", ["React", "frontend"])
      const b = await insertSourceWithTags("b", ["react", " Go ", ""])
      const c = await insertSourceWithTags("c", ["go", "Frontend"])

      await runMigration()

      expect(await selectLinks()).toEqual([
        { name: "frontend", sourceId: a },
        { name: "React", sourceId: a },
        { name: "Go", sourceId: b },
        { name: "React", sourceId: b },
        { name: "frontend", sourceId: c },
        { name: "Go", sourceId: c },
      ])
    })

    it("同じソースの [React, react] は紐付けが 1 行になる", async () => {
      await insertSourceWithTags("a", ["React", "react"])

      await runMigration()

      expect(await selectLinks()).toHaveLength(1)
    })

    it("タグが空の配列のソースしか無ければ、tags も content_source_tags も 0 行", async () => {
      await insertSourceWithTags("a", [])

      await runMigration()

      expect(await selectTags()).toHaveLength(0)
      expect(await selectLinks()).toHaveLength(0)
    })

    it("11 個の名前を移すと、11 個目の色が blue に戻る", async () => {
      const names = Array.from({ length: 11 }, (_, index) => `tag-${String(index).padStart(2, "0")}`)
      await insertSourceWithTags("a", names)

      await runMigration()

      const rows = await selectTags()
      expect(rows).toHaveLength(11)
      expect(rows[10]).toEqual({ color: "blue", name: "tag-10" })
      expect(rows[9].color).toBe("sky")
    })
  })
})
