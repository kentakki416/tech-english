import type { DictionaryEntry } from "@repo/domain"

import type { DictionaryRepository } from "../../../src/repository"
import { lookupWord } from "../../../src/service/dictionary-service"

const dictionaryRepository = { findByHeadwords: vi.fn<DictionaryRepository["findByHeadwords"]>() }
const repo = { dictionaryRepository }

const FIXED_DATE = new Date("2026-10-12T00:00:00.000Z")

const buildEntry = (id: number, headword: string): DictionaryEntry => ({
  id,
  headword,
  meaningJa: `${headword} の意味`,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
})

describe("lookupWord", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("原形に戻した候補をまとめて 1 回で引き、候補の順で最初に見つかった項目を返す", async () => {
      dictionaryRepository.findByHeadwords.mockResolvedValue([buildEntry(2, "run"), buildEntry(1, "runne")])

      const result = await lookupWord({ word: "Running" }, repo)

      expect(result).toEqual({ ok: true, value: buildEntry(1, "runne") })
      expect(dictionaryRepository.findByHeadwords).toHaveBeenCalledTimes(1)
      expect(dictionaryRepository.findByHeadwords).toHaveBeenCalledWith(["running", "runn", "runne", "run"])
    })

    it("見出し語そのままがあればそれを返す", async () => {
      dictionaryRepository.findByHeadwords.mockResolvedValue([buildEntry(1, "run"), buildEntry(2, "running")])

      const result = await lookupWord({ word: "running" }, repo)

      expect(result.ok && result.value.headword).toBe("running")
    })
  })

  describe("異常系", () => {
    it("どの候補も辞書に無ければ 404 を返す", async () => {
      dictionaryRepository.findByHeadwords.mockResolvedValue([])

      const result = await lookupWord({ word: "xyzzy" }, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })
  })
})
