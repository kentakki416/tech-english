import { eq, sources, sourceTags, tags } from "@repo/db"

import { DrizzleTagRepository } from "../../src/repository/drizzle/tag-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

const tagRepository = new DrizzleTagRepository(testDb)

const insertSource = async (repository: string) => {
  const [row] = await testDb
    .insert(sources)
    .values({
      branch: "main",
      excludeGlobs: [],
      fetchType: "github_repository",
      includeGlobs: ["docs/**/*.md"],
      kind: "docs",
      licenseSpdx: "MIT",
      licenseUrl: "https://example.com/LICENSE",
      name: repository,
      publicUrlStripPrefix: "",
      publicUrlTemplate: "https://example.com/{path}",
      repository,
    })
    .returning()
  return row
}

const insertTag = async (name: string, color: typeof tags.$inferInsert.color = "blue") => {
  const [row] = await testDb.insert(tags).values({ color, name }).returning()
  return row
}

const countTags = async () => (await testDb.select().from(tags)).length

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DrizzleTagRepository", () => {
  describe("正常系", () => {
    it("create したタグを findByIds で同じ値で取得できる", async () => {
      const result = await tagRepository.create({ color: "rose", name: "React" })

      expect(result.kind).toBe("saved")
      if (result.kind !== "saved") return
      expect(result.tag).toEqual({
        id: expect.any(Number),
        color: "rose",
        name: "React",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
      expect(await tagRepository.findByIds([result.tag.id])).toEqual([result.tag])
    })

    it("findAll は名前の順（大文字・小文字を区別しない）で返し、sourceCount は紐付けの数になる", async () => {
      const cherry = await insertTag("cherry")
      const banana = await insertTag("Banana")
      const apple = await insertTag("apple")
      const sourceA = await insertSource("owner/a")
      const sourceB = await insertSource("owner/b")
      await testDb.insert(sourceTags).values([
        { sourceId: sourceA.id, tagId: apple.id },
        { sourceId: sourceB.id, tagId: apple.id },
        { sourceId: sourceA.id, tagId: banana.id },
      ])

      const result = await tagRepository.findAll()

      expect(result).toEqual([
        { ...apple, sourceCount: 2 },
        { ...banana, sourceCount: 1 },
        { ...cherry, sourceCount: 0 },
      ])
    })

    it("findColors は全タグの色を重複込みで返す", async () => {
      await insertTag("a", "blue")
      await insertTag("b", "blue")
      await insertTag("c", "rose")

      const result = await tagRepository.findColors()

      expect([...result].sort()).toEqual(["blue", "blue", "rose"])
    })

    it("findColors はタグが 0 個なら空の配列を返す", async () => {
      expect(await tagRepository.findColors()).toEqual([])
    })

    it("findByIds は存在する id だけを返す", async () => {
      const react = await insertTag("React")
      await insertTag("Vue")

      const result = await tagRepository.findByIds([react.id, 999999])

      expect(result).toEqual([react])
    })

    it("findByIds は空の配列なら空の配列を返す", async () => {
      await insertTag("React")

      expect(await tagRepository.findByIds([])).toEqual([])
    })

    it("update は名前と色を書き、updatedAt が進む", async () => {
      const react = await insertTag("React")
      await new Promise((resolve) => setTimeout(resolve, 5))

      const result = await tagRepository.update(react.id, { color: "pink", name: "ReactJS" })

      expect(result.kind).toBe("saved")
      if (result.kind !== "saved") return
      expect(result.tag).toMatchObject({ id: react.id, color: "pink", name: "ReactJS" })
      expect(result.tag.updatedAt.getTime()).toBeGreaterThan(react.updatedAt.getTime())
      const [row] = await testDb.select().from(tags).where(eq(tags.id, react.id))
      expect(row).toMatchObject({ color: "pink", name: "ReactJS" })
    })

    it("update は自分自身の名前の大文字・小文字だけを変えても duplicate にならない", async () => {
      const react = await insertTag("react")

      const result = await tagRepository.update(react.id, { color: "blue", name: "React" })

      expect(result.kind).toBe("saved")
      const [row] = await testDb.select().from(tags).where(eq(tags.id, react.id))
      expect(row.name).toBe("React")
    })

    it("delete は true を返し、そのタグの source_tags も消えるが、ソースとほかのタグの紐付けは残る", async () => {
      const react = await insertTag("React")
      const vue = await insertTag("Vue")
      const source = await insertSource("owner/a")
      await testDb.insert(sourceTags).values([
        { sourceId: source.id, tagId: react.id },
        { sourceId: source.id, tagId: vue.id },
      ])

      const result = await tagRepository.delete(react.id)

      expect(result).toBe(true)
      expect(await testDb.select().from(tags)).toEqual([vue])
      expect(await testDb.select().from(sourceTags)).toEqual([{ sourceId: source.id, tagId: vue.id }])
      expect(await testDb.select().from(sources)).toHaveLength(1)
    })
  })

  describe("異常系", () => {
    it("React があると create({ name: \"react\" }) は throw せず duplicate を返し、行は増えない", async () => {
      await insertTag("React")

      const result = await tagRepository.create({ color: "blue", name: "react" })

      expect(result).toEqual({ kind: "duplicate" })
      expect(await countTags()).toBe(1)
    })

    it.each(["Vue", "vue"])("ほかのタグと同じ名前（%s）への update は duplicate を返し、行は変わらない", async (name) => {
      const react = await insertTag("React", "blue")
      await insertTag("Vue", "rose")

      const result = await tagRepository.update(react.id, { color: "pink", name })

      expect(result).toEqual({ kind: "duplicate" })
      const [row] = await testDb.select().from(tags).where(eq(tags.id, react.id))
      expect(row).toEqual(react)
    })

    it("存在しない id の update は not_found を返す", async () => {
      const result = await tagRepository.update(999999, { color: "blue", name: "React" })

      expect(result).toEqual({ kind: "not_found" })
    })

    it("存在しない id の delete は false を返す", async () => {
      expect(await tagRepository.delete(999999)).toBe(false)
    })
  })
})
