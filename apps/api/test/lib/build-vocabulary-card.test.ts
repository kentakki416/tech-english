import { buildVocabularyCard } from "../../src/lib/build-vocabulary-card"
import type { VocabularyEncounter } from "../../src/repository"
import { PASSAGE_BLOCKS } from "../fixture/passage-content"

const OPT_OUT_TEXT = PASSAGE_BLOCKS[4].text
const OPT_OUT_START = OPT_OUT_TEXT.indexOf("opt out of")

const GLOSSARY_ENCOUNTER: VocabularyEncounter = {
  dictionaryMeaningJa: "…を選ばないことにする",
  glossary: {
    blockIndex: 4,
    endOffset: OPT_OUT_START + "opt out of".length,
    id: 31,
    meaningJa: "〜をやめる、（既定の動作を）無効にする",
    noteJa: "対になるのは opt in",
    partOfSpeech: "熟語",
    startOffset: OPT_OUT_START,
    surface: "opt out of",
  },
  lemma: "opt out of",
  passage: { blocks: PASSAGE_BLOCKS, id: 5, title: "Synchronizing with Effects" },
  surface: "opt out of",
}

const DICTIONARY_ENCOUNTER: VocabularyEncounter = {
  dictionaryMeaningJa: "論理 / 理屈",
  glossary: null,
  lemma: "logic",
  passage: { blocks: PASSAGE_BLOCKS, id: 5, title: "Synchronizing with Effects" },
  surface: "logic",
}

describe("buildVocabularyCard", () => {
  describe("正常系", () => {
    it("用語集の行があれば、意味・補足・品詞・語句は用語集のもの、出どころは glossary、1 文は位置から切り出す", () => {
      expect(buildVocabularyCard(GLOSSARY_ENCOUNTER, 2)).toEqual({
        lemma: "opt out of",
        meaningJa: "〜をやめる、（既定の動作を）無効にする",
        meaningSource: "glossary",
        noteJa: "対になるのは opt in",
        partOfSpeech: "熟語",
        passage: { id: 5, title: "Synchronizing with Effects" },
        sentence: {
          blockEndOffset: OPT_OUT_TEXT.length,
          blockStartOffset: 0,
          highlightEnd: OPT_OUT_START + 10,
          highlightStart: OPT_OUT_START,
          text: OPT_OUT_TEXT,
        },
        sentenceBlockIndex: 4,
        stage: 2,
        surface: "opt out of",
      })
    })

    it("用語集の行が無ければ辞書の意味を使い、補足・品詞は null、1 文は本文を前から探す（code のブロックは飛ばす）", () => {
      const card = buildVocabularyCard(DICTIONARY_ENCOUNTER, null)

      expect(card).toMatchObject({ meaningJa: "論理 / 理屈", meaningSource: "dictionary", noteJa: null, partOfSpeech: null, stage: null, surface: "logic" })
      expect(card?.sentence?.text).toBe("If a piece of logic runs because the user clicked a button, it belongs in an event handler, not in an Effect.")
      expect(card?.sentenceBlockIndex).toBe(2)
    })

    it("code のブロックにしか無い語句は 1 文を作らない", () => {
      const card = buildVocabularyCard({ ...DICTIONARY_ENCOUNTER, lemma: "connect", surface: "connect" }, null)
      expect(card?.sentence).toBeNull()
      expect(card?.sentenceBlockIndex).toBeNull()
    })
  })

  describe("異常系", () => {
    it("本文が null（問題が公開中でない）なら 1 文は null", () => {
      const passage = { ...GLOSSARY_ENCOUNTER.passage, blocks: null }
      expect(buildVocabularyCard({ ...GLOSSARY_ENCOUNTER, passage }, 0)).toMatchObject({ sentence: null, sentenceBlockIndex: null })
      expect(buildVocabularyCard({ ...DICTIONARY_ENCOUNTER, passage }, 0)).toMatchObject({ sentence: null, sentenceBlockIndex: null })
    })

    it("語句が本文に見つからなければ 1 文は null", () => {
      expect(buildVocabularyCard({ ...DICTIONARY_ENCOUNTER, surface: "nowhere" }, null)?.sentence).toBeNull()
    })

    it("用語集の行も辞書の意味も無ければ null", () => {
      expect(buildVocabularyCard({ ...DICTIONARY_ENCOUNTER, dictionaryMeaningJa: null }, null)).toBeNull()
    })
  })
})
