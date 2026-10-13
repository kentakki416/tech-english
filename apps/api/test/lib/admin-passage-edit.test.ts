import { type AdminPassageEditInput, buildDraftEditContent } from "../../src/lib/admin-passage-edit"
import { buildAdminPassageDetail, buildEditInput, PASSAGE_BLOCKS } from "../fixture/passage-content"

const detail = buildAdminPassageDetail()

/**
 * 何も変えない保存の入力に上書きする
 */
const buildInput = (overrides: Partial<AdminPassageEditInput> = {}): AdminPassageEditInput => ({
  ...buildEditInput(detail),
  ...overrides,
})

describe("buildDraftEditContent", () => {
  describe("正常系", () => {
    it("何も変えなければ保存済みと同じ内容（位置・順序・対象の語句の index）を返す", () => {
      const result = buildDraftEditContent(detail, buildInput())

      expect(result).toEqual({
        content: {
          blocks: PASSAGE_BLOCKS,
          difficulty: 2,
          glossary: detail.glossary.map(({ createdAt: _createdAt, passageId: _passageId, updatedAt: _updatedAt, ...entry }) => entry),
          questions: detail.questions.map((question, index) => ({
            id: question.id,
            choices: question.choices,
            correctChoiceIndex: question.correctChoiceIndex,
            evidenceBlockIndex: question.evidenceBlockIndex,
            evidenceQuote: question.evidenceQuote,
            explanationJa: question.explanationJa,
            orderIndex: index,
            prompt: question.prompt,
            targetGlossaryIndex: question.type === "vocabulary" ? 1 : null,
            type: question.type,
          })),
          timeLimitSeconds: 180,
          title: "Synchronizing with Effects",
        },
        ok: true,
      })
    })

    it("英文を直すと用語集の位置を新しい英文から求め直す", () => {
      const input = buildInput()
      input.blocks[1] = { ...input.blocks[1], text: `Today, ${PASSAGE_BLOCKS[1]?.text}` }

      const result = buildDraftEditContent(detail, input)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.content.glossary.map(({ endOffset, startOffset, surface }) => ({ endOffset, startOffset, surface }))).toEqual([
        { endOffset: detail.glossary[0].endOffset + 7, startOffset: detail.glossary[0].startOffset + 7, surface: "stay in sync with" },
        { endOffset: detail.glossary[1].endOffset + 7, startOffset: detail.glossary[1].startOffset + 7, surface: "escape hatch" },
        { endOffset: detail.glossary[2].endOffset, startOffset: detail.glossary[2].startOffset, surface: "opt out of" },
      ])
    })

    it("ブロックの type / lang は保存済みのままにし、code の和訳と空白だけの和訳は持たない", () => {
      const input = buildInput()
      input.blocks[2] = { ...input.blocks[2], translationJa: "  " }
      input.blocks[3] = { text: "useEffect(() => {}, [])", translationJa: "コードの和訳" }

      const result = buildDraftEditContent(detail, input)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.content.blocks[2]).toEqual({ text: PASSAGE_BLOCKS[2]?.text, type: "paragraph" })
      expect(result.content.blocks[3]).toEqual({ lang: "jsx", text: "useEffect(() => {}, [])", type: "code" })
    })

    it("vocabulary 以外の設問の対象の語句は null にする", () => {
      const input = buildInput()
      input.questions[0] = { ...input.questions[0], targetGlossaryIndex: 2 }
      input.questions[2] = { ...input.questions[2], targetGlossaryIndex: 0, type: "detail" }

      const result = buildDraftEditContent(detail, input)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.content.questions.map((question) => question.targetGlossaryIndex)).toEqual([null, null, null])
    })

    it("新規の用語集（id: null）を対象にした設問と、並べ替えた設問の orderIndex を返す", () => {
      const input = buildInput()
      input.glossary.push({
        id: null,
        blockIndex: 2,
        lemma: "event handler",
        meaningJa: "イベントハンドラ",
        noteJa: " ",
        partOfSpeech: "",
        surface: "event handler",
      })
      input.questions = [input.questions[1], input.questions[0], { ...input.questions[2], targetGlossaryIndex: 3 }]

      const result = buildDraftEditContent(detail, input)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.content.glossary[3]).toEqual({
        id: null,
        blockIndex: 2,
        endOffset: 90,
        lemma: "event handler",
        meaningJa: "イベントハンドラ",
        noteJa: null,
        partOfSpeech: null,
        startOffset: 77,
        surface: "event handler",
      })
      expect(result.content.questions.map(({ id, orderIndex, targetGlossaryIndex }) => ({ id, orderIndex, targetGlossaryIndex }))).toEqual([
        { id: 202, orderIndex: 0, targetGlossaryIndex: null },
        { id: 201, orderIndex: 1, targetGlossaryIndex: null },
        { id: 203, orderIndex: 2, targetGlossaryIndex: 3 },
      ])
    })

    it("根拠の引用は本文に無くてもそのまま保存する（公開時に検査する）", () => {
      const input = buildInput()
      input.questions[1] = { ...input.questions[1], evidenceBlockIndex: 9, evidenceQuote: "not in the passage" }

      const result = buildDraftEditContent(detail, input)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.content.questions[1]).toMatchObject({ evidenceBlockIndex: 9, evidenceQuote: "not in the passage" })
    })
  })

  describe("異常系", () => {
    it("英文の修正で語句が本文から消えると glossary_surface_not_found を返す", () => {
      const input = buildInput()
      input.blocks[1] = { ...input.blocks[1], text: "Effects are a way out of the React paradigm." }

      expect(buildDraftEditContent(detail, input)).toEqual({
        details: [
          { code: "glossary_surface_not_found", message: expect.any(String), path: ["glossary", 0, "surface"] },
          { code: "glossary_surface_not_found", message: expect.any(String), path: ["glossary", 1, "surface"] },
        ],
        ok: false,
      })
    })

    it("用語集が code のブロックを指すと glossary_surface_not_found を返す", () => {
      const input = buildInput()
      input.glossary[0] = { ...input.glossary[0], blockIndex: 3, surface: "connect" }

      expect(buildDraftEditContent(detail, input)).toEqual({
        details: [{ code: "glossary_surface_not_found", message: expect.any(String), path: ["glossary", 0, "surface"] }],
        ok: false,
      })
    })

    it("用語集の block_index が範囲外なら block_index_out_of_range を返す（境界値）", () => {
      const input = buildInput()
      input.glossary[2] = { ...input.glossary[2], blockIndex: PASSAGE_BLOCKS.length }

      expect(buildDraftEditContent(detail, input)).toEqual({
        details: [{ code: "block_index_out_of_range", message: expect.any(String), path: ["glossary", 2, "block_index"] }],
        ok: false,
      })
    })

    it("target_glossary_index が用語集の数以上なら target_glossary_index_out_of_range を返す（境界値）", () => {
      const input = buildInput()
      input.questions[2] = { ...input.questions[2], targetGlossaryIndex: input.glossary.length }

      expect(buildDraftEditContent(detail, input)).toEqual({
        details: [{ code: "target_glossary_index_out_of_range", message: expect.any(String), path: ["questions", 2, "target_glossary_index"] }],
        ok: false,
      })
    })

    it("ブロックの数が違えば block_count_mismatch を返す", () => {
      const input = buildInput({ blocks: buildEditInput(detail).blocks.slice(0, 4) })

      expect(buildDraftEditContent(detail, input)).toEqual({
        details: [{ code: "block_count_mismatch", message: expect.any(String), path: ["blocks"] }],
        ok: false,
      })
    })

    it("保存済みに無い id・重複した id は *_id_not_found / *_id_duplicated を返す", () => {
      const input = buildInput()
      input.glossary[0] = { ...input.glossary[0], id: 999 }
      input.glossary[2] = { ...input.glossary[2], id: input.glossary[1]?.id ?? null }
      input.questions[1] = { ...input.questions[1], id: 998 }

      expect(buildDraftEditContent(detail, input)).toEqual({
        details: [
          { code: "glossary_id_not_found", message: expect.any(String), path: ["glossary", 0, "id"] },
          { code: "glossary_id_duplicated", message: expect.any(String), path: ["glossary", 2, "id"] },
          { code: "question_id_not_found", message: expect.any(String), path: ["questions", 1, "id"] },
        ],
        ok: false,
      })
    })
  })
})
