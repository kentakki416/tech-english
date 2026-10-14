import type { PassageAudioManifest } from "@repo/domain"

import type { PassageAudioWithPassage, WordAudioRepository } from "../../../src/repository"
import { getVocabularySession } from "../../../src/service/vocabulary-service"
import { buildPassageAudio } from "../../fixture/passage-audio"
import { PASSAGE_BLOCKS } from "../../fixture/passage-content"
import { createMockPassageAudioRepository } from "../../fixture/passage-repository-mock"

import { buildEncounter, createMockUserRepository, createMockVocabularyRepository, FIXED_NOW, USER } from "./fixtures"

const AUDIO_BASE = "https://cdn.example.com"

const buildDueCards = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    card: { dueDate: "2026-10-15", id: index + 1, lemma: `due-${index}`, stage: index % 4 },
    encounter: buildEncounter(`due-${index}`),
  }))

/**
 * 「logic」の 1 文（PASSAGE_BLOCKS のブロック 2 全体）の最初と最後の単語に時刻を付けたマニフェスト。間の単語は省く
 */
const SENTENCE_BLOCK = PASSAGE_BLOCKS[2]?.text ?? ""

const LOGIC_MANIFEST: PassageAudioManifest = {
  blocks: [
    {
      blockIndex: 2,
      parts: [{
        durationMs: 6000,
        key: "passages/5/hash/2-0.mp3",
        words: [[120, 300, 0, 2], [5200, 5800, SENTENCE_BLOCK.length - 7, SENTENCE_BLOCK.length - 1]],
      }],
    },
  ],
}

/**
 * 音声を作った後に公開し直されていない、公開中の問題の音声
 */
const READY_AUDIO: PassageAudioWithPassage = {
  audio: buildPassageAudio({ manifest: LOGIC_MANIFEST, passageId: 5 }),
  passage: { publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" },
}

const setup = () => {
  const userRepository = createMockUserRepository()
  const vocabularyRepository = createMockVocabularyRepository()
  const passageAudioRepository = createMockPassageAudioRepository()
  passageAudioRepository.findByPassageIds.mockResolvedValue(new Map())
  const wordAudioRepository = {
    findReadyKeysByLemmas: vi.fn<WordAudioRepository["findReadyKeysByLemmas"]>().mockResolvedValue(new Map()),
  } satisfies WordAudioRepository
  return {
    passageAudioRepository,
    repo: { passageAudioRepository, userRepository, vocabularyRepository, wordAudioRepository },
    userRepository,
    vocabularyRepository,
    wordAudioRepository,
  }
}

const DEPS = { audioPublicUrlBase: AUDIO_BASE, now: FIXED_NOW }

describe("getVocabularySession", () => {
  describe("正常系", () => {
    it("今日の復習が 10 枚なら新しい単語を引かない", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findDueCards.mockResolvedValue(buildDueCards(10))

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result.ok && result.value.cards).toHaveLength(10)
      expect(vocabularyRepository.findNewEncounters).not.toHaveBeenCalled()
    })

    it("今日の復習が 3 枚なら新しい単語を 7 件引き、復習 → 新しい単語の順に並べる（新しい単語の段階は null）", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findDueCards.mockResolvedValue(buildDueCards(3))
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(vocabularyRepository.findNewEncounters).toHaveBeenCalledWith(USER.id, 7)
      expect(result.ok && result.value.cards.map((card) => [card.lemma, card.stage])).toEqual([
        ["due-0", 0],
        ["due-1", 1],
        ["due-2", 2],
        ["logic", null],
      ])
    })

    it.each([
      ["Asia/Tokyo", "2026-10-15"],
      ["UTC", "2026-10-14"],
    ])("今日は users.timezone（%s）で求める（%s）", async (timezone, today) => {
      const { repo, userRepository, vocabularyRepository } = setup()
      userRepository.findById.mockResolvedValue({ ...USER, timezone })

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result).toEqual({ ok: true, value: { cards: [], today } })
      expect(vocabularyRepository.findDueCards).toHaveBeenCalledWith(USER.id, today, 10)
    })

    it("中身を組み立てられない材料（意味が無い）は飛ばす", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic", { dictionaryMeaningJa: null }), buildEncounter("effect")])

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result.ok && result.value.cards.map((card) => card.lemma)).toEqual(["effect"])
    })

    it("見出し語の音声が ready なら単語の URL、元の問題の音声が ready なら 1 文の最初の単語から最後の単語までの区間を返す", async () => {
      const { passageAudioRepository, repo, vocabularyRepository, wordAudioRepository } = setup()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])
      wordAudioRepository.findReadyKeysByLemmas.mockResolvedValue(new Map([["logic", "words/abc.mp3"]]))
      passageAudioRepository.findByPassageIds.mockResolvedValue(new Map([[5, READY_AUDIO]]))

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result.ok && result.value.cards[0]?.pronunciation).toEqual({
        sentence: { endMs: 5800, startMs: 120, url: `${AUDIO_BASE}/passages/5/hash/2-0.mp3` },
        wordUrl: `${AUDIO_BASE}/words/abc.mp3`,
      })
    })

    it("見出し語と元の問題は、カードの数だけ引かずに 1 回ずつまとめて引く（同じ問題は 1 つにする）", async () => {
      const { passageAudioRepository, repo, vocabularyRepository, wordAudioRepository } = setup()
      vocabularyRepository.findDueCards.mockResolvedValue(buildDueCards(3))
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])

      await getVocabularySession(USER.id, repo, DEPS)

      expect(wordAudioRepository.findReadyKeysByLemmas.mock.calls).toEqual([[["due-0", "due-1", "due-2", "logic"]]])
      expect(passageAudioRepository.findByPassageIds.mock.calls).toEqual([[[5]]])
    })

    it("見出し語の音声がまだ無い・元の問題の音声が無いカードは、単語も 1 文も null", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result.ok && result.value.cards[0]?.pronunciation).toEqual({ sentence: null, wordUrl: null })
    })
  })

  describe("異常系", () => {
    it("ユーザーが無ければ 401 で、単語帳のリポジトリを呼ばない", async () => {
      const { repo, userRepository, vocabularyRepository } = setup()
      userRepository.findById.mockResolvedValue(null)

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result).toMatchObject({ error: { statusCode: 401, type: "UNAUTHORIZED" }, ok: false })
      expect(vocabularyRepository.findDueCards).not.toHaveBeenCalled()
    })

    it("リポジトリが throw したらそのまま reject する", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findDueCards.mockRejectedValue(new Error("Database connection failed"))

      await expect(getVocabularySession(USER.id, repo, DEPS)).rejects.toThrow()
    })

    it.each([
      ["準備中（pending）", { ...READY_AUDIO, audio: buildPassageAudio({ manifest: null, status: "pending" }) }],
      ["非公開に戻した", { ...READY_AUDIO, passage: { ...READY_AUDIO.passage, status: "draft" as const } }],
      ["音声を作った後に公開し直した", { ...READY_AUDIO, passage: { ...READY_AUDIO.passage, publishedAt: new Date("2026-10-13T00:00:00.000Z") } }],
    ])("元の問題の音声が %s なら 1 文は null", async (_label, audio) => {
      const { passageAudioRepository, repo, vocabularyRepository } = setup()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])
      passageAudioRepository.findByPassageIds.mockResolvedValue(new Map([[5, audio]]))

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result.ok && result.value.cards[0]?.pronunciation.sentence).toBeNull()
    })

    it("カードに 1 文が無い（本文に語句が見つからない）なら 1 文は null", async () => {
      const { passageAudioRepository, repo, vocabularyRepository } = setup()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("missing", { surface: "not in the passage" })])
      passageAudioRepository.findByPassageIds.mockResolvedValue(new Map([[5, READY_AUDIO]]))

      const result = await getVocabularySession(USER.id, repo, DEPS)

      expect(result.ok && result.value.cards[0]?.pronunciation.sentence).toBeNull()
    })

    it("audioPublicUrlBase が null（本番で AUDIO_PUBLIC_URL_BASE が未設定）なら単語も 1 文も null で、音声のリポジトリを呼ばない", async () => {
      const { passageAudioRepository, repo, vocabularyRepository, wordAudioRepository } = setup()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])

      const result = await getVocabularySession(USER.id, repo, { ...DEPS, audioPublicUrlBase: null })

      expect(result.ok && result.value.cards[0]?.pronunciation).toEqual({ sentence: null, wordUrl: null })
      expect(wordAudioRepository.findReadyKeysByLemmas).not.toHaveBeenCalled()
      expect(passageAudioRepository.findByPassageIds).not.toHaveBeenCalled()
    })
  })
})
