import { listPublishViolations } from "../../src/lib/passage-publish-check"
import type { AdminPassageDetail } from "../../src/repository"
import { buildAdminPassageDetail, buildPassage, PASSAGE_BLOCKS } from "../fixture/passage-content"

/**
 * 詳細の設問 1 つだけを書き換える
 */
const replaceQuestion = (
  detail: AdminPassageDetail,
  index: number,
  overrides: Partial<AdminPassageDetail["questions"][number]>,
): AdminPassageDetail => ({
  ...detail,
  questions: detail.questions.map((question, questionIndex) => (questionIndex === index ? { ...question, ...overrides } : question)),
})

describe("listPublishViolations", () => {
  describe("正常系", () => {
    it("公開の条件をすべて満たす詳細は空配列を返す", () => {
      expect(listPublishViolations(buildAdminPassageDetail())).toEqual([])
    })

    it("設問が 5 問（上限）なら question_count_out_of_range にならない（境界値）", () => {
      const detail = buildAdminPassageDetail()
      const extra = [3, 4].map((orderIndex) => ({ ...detail.questions[1], id: 300 + orderIndex, orderIndex }))

      expect(listPublishViolations({ ...detail, questions: [...detail.questions, ...extra] })).toEqual([])
    })

    it("code のブロックは和訳が無くても translation_missing にならない", () => {
      const detail = buildAdminPassageDetail()

      expect(detail.passage.blocks[3]).toMatchObject({ type: "code" })
      expect(detail.passage.blocks[3]?.translationJa).toBeUndefined()
      expect(listPublishViolations(detail)).toEqual([])
    })

    it("根拠の引用はインラインコードのバッククォートを除いて照合する", () => {
      const detail = buildAdminPassageDetail()
      const blocks = PASSAGE_BLOCKS.map((block, index) =>
        (index === 4 ? { ...block, text: "You can opt out of re-running an `Effect` by specifying a dependency array." } : block))
      const glossary = detail.glossary.filter((entry) => entry.blockIndex !== 4)

      expect(listPublishViolations(replaceQuestion(
        { ...detail, glossary, passage: buildPassage({ blocks }) },
        1,
        { evidenceBlockIndex: 4, evidenceQuote: "re-running an Effect" },
      ))).toEqual([])
    })
  })

  describe("異常系", () => {
    it.each([
      ["2 問", 2],
      ["6 問", 6],
    ])("設問が %s なら question_count_out_of_range を返す（境界値）", (_label, count) => {
      const detail = buildAdminPassageDetail()
      const questions = Array.from({ length: count }, (_, index) => ({ ...detail.questions[1], id: 400 + index, orderIndex: index }))

      expect(listPublishViolations({ ...detail, questions })).toEqual([
        { code: "question_count_out_of_range", message: expect.any(String), path: ["questions"] },
      ])
    })

    it.each([
      ["空", ""],
      ["空白だけ", "  "],
    ])("設問文が%sなら prompt_empty を返す", (_label, prompt) => {
      const detail = replaceQuestion(buildAdminPassageDetail(), 1, { prompt })

      expect(listPublishViolations(detail)).toEqual([
        { code: "prompt_empty", message: "Q2：設問文が空です", path: ["questions", 1, "prompt"] },
      ])
    })

    it.each([
      ["選択肢が 3 つ", ["A", "B", "C"]],
      ["空の選択肢がある", ["A", "B", " ", "D"]],
      ["前後の空白と大文字小文字を除くと重複する", ["Event handler", "B", " event HANDLER ", "D"]],
    ])("%sなら choice_invalid を返す", (_label, choices) => {
      const detail = replaceQuestion(buildAdminPassageDetail(), 1, { choices })

      expect(listPublishViolations(detail)).toEqual([
        { code: "choice_invalid", message: expect.any(String), path: ["questions", 1, "choices"] },
      ])
    })

    it.each([
      ["-1", -1],
      ["4", 4],
    ])("正解の位置が %s なら correct_choice_missing を返す（境界値）", (_label, correctChoiceIndex) => {
      const detail = replaceQuestion(buildAdminPassageDetail(), 0, { correctChoiceIndex })

      expect(listPublishViolations(detail)).toEqual([
        { code: "correct_choice_missing", message: expect.any(String), path: ["questions", 0, "correct_choice_index"] },
      ])
    })

    it("解説が空白だけなら explanation_empty を返す", () => {
      const detail = replaceQuestion(buildAdminPassageDetail(), 2, { explanationJa: "  " })

      expect(listPublishViolations(detail)).toEqual([
        { code: "explanation_empty", message: expect.any(String), path: ["questions", 2, "explanation_ja"] },
      ])
    })

    it.each([
      ["引用が本文に無い", { evidenceQuote: "it belongs in a reducer" }],
      ["ブロックが範囲外", { evidenceBlockIndex: 5 }],
      ["引用が空", { evidenceQuote: "" }],
    ])("%sなら evidence_not_found を返す", (_label, overrides) => {
      const detail = replaceQuestion(buildAdminPassageDetail(), 1, overrides)

      expect(listPublishViolations(detail)).toEqual([
        { code: "evidence_not_found", message: expect.any(String), path: ["questions", 1, "evidence"] },
      ])
    })

    it.each([
      ["対象の語句が無い", null],
      ["用語集に無い id を指す", 999],
    ])("vocabulary で%sなら vocabulary_target_missing を返す", (_label, targetGlossaryEntryId) => {
      const detail = replaceQuestion(buildAdminPassageDetail(), 2, { targetGlossaryEntryId })

      expect(listPublishViolations(detail)).toEqual([
        { code: "vocabulary_target_missing", message: expect.any(String), path: ["questions", 2, "target_glossary_entry_id"] },
      ])
    })

    it.each([
      ["和訳が無い", undefined],
      ["和訳が空白だけ", "  "],
    ])("code 以外のブロックで%sなら translation_missing を返す", (_label, translationJa) => {
      const detail = buildAdminPassageDetail()
      const blocks = PASSAGE_BLOCKS.map((block, index) => (index === 2 ? { text: block.text, translationJa, type: block.type } : block))

      expect(listPublishViolations({ ...detail, passage: buildPassage({ blocks }) })).toEqual([
        { code: "translation_missing", message: expect.any(String), path: ["blocks", 2, "translation_ja"] },
      ])
    })

    it.each([
      ["位置がずれている", { endOffset: 50, startOffset: 38 }],
      ["表記が違う", { surface: "Escape hatch" }],
      ["ブロックが範囲外", { blockIndex: 9 }],
    ])("用語集の語句が%sなら glossary_position_mismatch を返す", (_label, overrides) => {
      const detail = buildAdminPassageDetail()
      const glossary = detail.glossary.map((entry, index) => (index === 1 ? { ...entry, ...overrides } : entry))

      expect(listPublishViolations({ ...detail, glossary })).toEqual([
        { code: "glossary_position_mismatch", message: expect.any(String), path: ["glossary", 1, "surface"] },
      ])
    })

    it.each([
      ["空", ""],
      ["空白だけ", " \n "],
    ])("用語集の意味が%sなら glossary_meaning_empty を返す", (_label, meaningJa) => {
      const detail = buildAdminPassageDetail()
      const glossary = detail.glossary.map((entry, index) => (index === 1 ? { ...entry, meaningJa } : entry))

      expect(listPublishViolations({ ...detail, glossary })).toEqual([
        {
          code: "glossary_meaning_empty",
          message: `用語集「${detail.glossary[1]?.surface}」：文脈での意味が空です`,
          path: ["glossary", 1, "meaning_ja"],
        },
      ])
    })

    it("用語集の語句の位置がずれていて意味も空なら、両方を返す", () => {
      const detail = buildAdminPassageDetail()
      const glossary = detail.glossary.map((entry, index) => (index === 0 ? { ...entry, blockIndex: 9, meaningJa: "" } : entry))

      expect(listPublishViolations({ ...detail, glossary }).map((violation) => violation.code))
        .toEqual(["glossary_position_mismatch", "glossary_meaning_empty"])
    })

    it("難易度が null なら difficulty_missing を返す", () => {
      const detail = buildAdminPassageDetail({ passage: buildPassage({ difficulty: null }) })

      expect(listPublishViolations(detail)).toEqual([
        { code: "difficulty_missing", message: expect.any(String), path: ["difficulty"] },
      ])
    })

    it("制限時間が null なら time_limit_missing を返す", () => {
      const detail = buildAdminPassageDetail({ passage: buildPassage({ timeLimitSeconds: null }) })

      expect(listPublishViolations(detail)).toEqual([
        { code: "time_limit_missing", message: expect.any(String), path: ["time_limit_seconds"] },
      ])
    })

    it("複数の条件を満たさなければすべてを返す", () => {
      const detail = replaceQuestion(
        buildAdminPassageDetail({ passage: buildPassage({ difficulty: null }) }),
        0,
        { explanationJa: "" },
      )

      expect(listPublishViolations(detail).map((violation) => violation.code)).toEqual(["explanation_empty", "difficulty_missing"])
    })
  })
})
