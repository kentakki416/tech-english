import { eq, sources, sourceTags, sql, tags } from "@repo/db"

import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * tags / source_tags の制約を実 DB で確かめる（docs/spec/source-tags/tasks/step1-db-tags.md）。
 * 定数に無い値は Drizzle の型で弾かれるので、sql の生 insert で入れる
 */

type SourceInsert = typeof sources.$inferInsert

/**
 * Postgres のエラーコード（SQLSTATE）
 */
const CHECK_VIOLATION = "23514"
const FOREIGN_KEY_VIOLATION = "23503"
const UNIQUE_VIOLATION = "23505"

/**
 * 指定した制約で失敗したことを表す matcher。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる。
 * 文言ではなく SQLSTATE と制約名で判定する（別の理由で失敗したのを見逃さないため）
 */
const buildViolationMatcher = (code: string, constraint: string) => ({
  cause: expect.objectContaining({ code, constraint }),
})

const buildSource = (name: string): SourceInsert => ({
  branch: "main",
  fetchType: "github_repository",
  includeGlobs: ["docs/**"],
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://example.com/LICENSE",
  name,
  repository: `example/${name}`,
})

const insertSource = async (name: string) => {
  const [row] = await testDb.insert(sources).values(buildSource(name)).returning()
  return row
}

const insertTag = async (name: string, color: "blue" | "rose" = "blue") => {
  const [row] = await testDb.insert(tags).values({ color, name }).returning()
  return row
}

/**
 * 定数に無い値・制約に掛かる値を入れるための生 insert
 */
const insertRawTag = async (columns: { color: string; name: string }) =>
  testDb.execute(sql`
    INSERT INTO tags (color, name, updated_at)
    VALUES (${columns.color}, ${columns.name}, now())
  `)

const linkTag = async (sourceId: number, tagId: number) =>
  testDb.insert(sourceTags).values({ sourceId, tagId })

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("tags", () => {
  describe("正常系", () => {
    it("{ color: blue, name: React } を insert でき、created_at が入る", async () => {
      const row = await insertTag("React")

      expect(row).toMatchObject({ color: "blue", name: "React" })
      expect(row.createdAt).toBeInstanceOf(Date)
    })

    it("30 文字ちょうどの name を insert できる", async () => {
      const name = "a".repeat(30)

      const row = await insertTag(name)

      expect(row.name).toBe(name)
    })
  })

  describe("異常系", () => {
    it.each(["react", "REACT"])("React があると %s は tags_name_lower_key で失敗する", async (name) => {
      await insertTag("React")

      await expect(insertRawTag({ color: "blue", name })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "tags_name_lower_key"),
      )
    })

    it("color = red は tags_color_check で失敗する", async () => {
      await expect(insertRawTag({ color: "red", name: "React" })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "tags_color_check"),
      )
    })

    it.each([
      ["空文字", ""],
      ["前の空白", " React"],
      ["後ろの空白", "React "],
      ["31 文字", "a".repeat(31)],
      ["カンマを含む", "react,vue"],
    ])("name が %s なら tags_name_check で失敗する", async (_label, name) => {
      await expect(insertRawTag({ color: "blue", name })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "tags_name_check"),
      )
    })
  })
})

describe("source_tags", () => {
  describe("正常系", () => {
    it("1 つのソースに 2 つのタグを紐付けられる", async () => {
      const source = await insertSource("a")
      const react = await insertTag("React")
      const go = await insertTag("Go", "rose")

      await linkTag(source.id, react.id)
      await linkTag(source.id, go.id)

      const rows = await testDb.select().from(sourceTags).where(eq(sourceTags.sourceId, source.id))
      expect(rows).toHaveLength(2)
    })

    it("2 つのソースに同じタグを紐付けられる", async () => {
      const sourceA = await insertSource("a")
      const sourceB = await insertSource("b")
      const react = await insertTag("React")

      await linkTag(sourceA.id, react.id)
      await linkTag(sourceB.id, react.id)

      const rows = await testDb.select().from(sourceTags).where(eq(sourceTags.tagId, react.id))
      expect(rows).toHaveLength(2)
    })

    it("タグを消すと、そのタグの紐付けだけが消える", async () => {
      const source = await insertSource("a")
      const react = await insertTag("React")
      const go = await insertTag("Go", "rose")
      await linkTag(source.id, react.id)
      await linkTag(source.id, go.id)

      await testDb.delete(tags).where(eq(tags.id, react.id))

      const rows = await testDb.select().from(sourceTags)
      expect(rows).toEqual([{ sourceId: source.id, tagId: go.id }])
    })

    it("ソースを消すと、そのソースの紐付けが消え、タグは残る", async () => {
      const sourceA = await insertSource("a")
      const sourceB = await insertSource("b")
      const react = await insertTag("React")
      await linkTag(sourceA.id, react.id)
      await linkTag(sourceB.id, react.id)

      await testDb.delete(sources).where(eq(sources.id, sourceA.id))

      const rows = await testDb.select().from(sourceTags)
      expect(rows).toEqual([{ sourceId: sourceB.id, tagId: react.id }])
      expect(await testDb.select().from(tags)).toHaveLength(1)
    })
  })

  describe("異常系", () => {
    it("同じ (source_id, tag_id) を 2 回入れると source_tags_pkey で失敗する", async () => {
      const source = await insertSource("a")
      const react = await insertTag("React")
      await linkTag(source.id, react.id)

      await expect(linkTag(source.id, react.id)).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "source_tags_pkey"),
      )
    })

    it("存在しないソースの id は source_tags_source_id_fkey で失敗する", async () => {
      const react = await insertTag("React")

      await expect(linkTag(999999, react.id)).rejects.toMatchObject(
        buildViolationMatcher(FOREIGN_KEY_VIOLATION, "source_tags_source_id_fkey"),
      )
    })

    it("存在しないタグの id は source_tags_tag_id_fkey で失敗する", async () => {
      const source = await insertSource("a")

      await expect(linkTag(source.id, 999999)).rejects.toMatchObject(
        buildViolationMatcher(FOREIGN_KEY_VIOLATION, "source_tags_tag_id_fkey"),
      )
    })
  })
})
