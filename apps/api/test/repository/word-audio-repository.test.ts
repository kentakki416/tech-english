import { DrizzleWordAudioRepository } from "../../src/repository/drizzle/word-audio-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { insertWordAudio } from "../fixture/vocabulary"

const wordAudioRepository = new DrizzleWordAudioRepository(testDb)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("WordAudioRepository", () => {
  describe("findReadyKeysByLemmas", () => {
    describe("正常系", () => {
      it("ready の見出し語だけを、見出し語 → mp3 のキーで返す（pending・generating・failed は返さない）", async () => {
        await insertWordAudio("cache")
        await insertWordAudio("escape hatch")
        await insertWordAudio("queue", { audioKey: null, generatedAt: null, status: "pending", textHash: null })
        await insertWordAudio("idempotent", { audioKey: null, generatedAt: null, generationStartedAt: new Date(), status: "generating", textHash: null })
        await insertWordAudio("resilient", { audioKey: null, generatedAt: null, status: "failed", textHash: null })

        const keys = await wordAudioRepository.findReadyKeysByLemmas(["cache", "escape hatch", "queue", "idempotent", "resilient"])

        expect(keys).toEqual(new Map([["cache", "words/cache.mp3"], ["escape hatch", "words/escape-hatch.mp3"]]))
      })

      it("voice の変更で ready のまま作り直している行（generation_started_at がある）も前のキーを返す。同じ見出し語を重ねて渡してもよい", async () => {
        await insertWordAudio("cache", { generationStartedAt: new Date() })

        expect(await wordAudioRepository.findReadyKeysByLemmas(["cache", "cache"])).toEqual(new Map([["cache", "words/cache.mp3"]]))
      })
    })

    describe("異常系", () => {
      it("空の配列なら DB を引かずに空、行の無い見出し語は含まない", async () => {
        expect(await wordAudioRepository.findReadyKeysByLemmas([])).toEqual(new Map())
        expect(await wordAudioRepository.findReadyKeysByLemmas(["unknown"])).toEqual(new Map())
      })
    })
  })
})
