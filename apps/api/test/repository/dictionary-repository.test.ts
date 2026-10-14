import { dictionaryEntries } from "@repo/db"

import type { DictionaryRepository } from "../../src/repository/dictionary-repository"
import { DrizzleDictionaryRepository } from "../../src/repository/drizzle/dictionary-repository"
import { PrismaDictionaryRepository } from "../../src/repository/prisma/dictionary-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"

/**
 * Prisma / Drizzle の両実装が DictionaryRepository として同じ振る舞いをすることを確かめる
 */
const implementations: [string, DictionaryRepository][] = [
  ["Drizzle", new DrizzleDictionaryRepository(testDb)],
  ["Prisma", new PrismaDictionaryRepository(testPrisma)],
]

beforeEach(async () => {
  await cleanupTestData()
  await testDb.insert(dictionaryEntries).values([
    { headword: "render", meaningJa: "…を(…の状態に)する" },
    { headword: "run", meaningJa: "走る" },
    { headword: "running", meaningJa: "走ること" },
  ])
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s DictionaryRepository", (_name, dictionaryRepository) => {
  describe("findByHeadwords", () => {
    describe("正常系", () => {
      it("見出し語が一致する項目だけを返す（一致しない候補は無視する）", async () => {
        const entries = await dictionaryRepository.findByHeadwords(["runn", "run", "render", "xyzzy"])

        expect([...entries].sort((left, right) => left.headword.localeCompare(right.headword))).toEqual([
          { id: expect.any(Number), headword: "render", meaningJa: "…を(…の状態に)する", createdAt: expect.any(Date), updatedAt: expect.any(Date) },
          { id: expect.any(Number), headword: "run", meaningJa: "走る", createdAt: expect.any(Date), updatedAt: expect.any(Date) },
        ])
      })

      it("大文字の候補は一致しない（見出し語は小文字で持つ）", async () => {
        expect(await dictionaryRepository.findByHeadwords(["Run"])).toEqual([])
      })

      it("候補が空なら空配列を返す", async () => {
        expect(await dictionaryRepository.findByHeadwords([])).toEqual([])
      })
    })
  })
})
