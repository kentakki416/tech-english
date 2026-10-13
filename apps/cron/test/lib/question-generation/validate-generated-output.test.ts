import { validateGeneratedOutput } from "../../../src/lib/question-generation"

import { buildGeneratedOutput, buildQuestion, PASSAGE } from "./helpers"

const PASSAGE_INPUT = { blocks: PASSAGE.blocks, wordCount: PASSAGE.wordCount }

describe("validateGeneratedOutput", () => {
  describe("正常系", () => {
    it("Zod・設問数・選択肢・ブロック番号の検査に合格すれば、Zod で読んだ出力を返す", () => {
      const output = buildGeneratedOutput()

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result).toEqual({ ok: true, output })
    })

    it("選択肢の前後の空白は Zod が取り除く", () => {
      const output = buildGeneratedOutput({
        questions: [
          buildQuestion({ choices: ["  First ", "Second", "Third", "Fourth"] }),
          buildQuestion(),
          buildQuestion(),
        ],
      })

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result.ok && result.output.questions[0].choices[0]).toBe("First")
    })

    it("isSuitable = false なら設問・和訳・用語集が空でも合格（以降の検査をしない）", () => {
      const output = buildGeneratedOutput({
        glossary: [],
        isSuitable: false,
        questions: [],
        translations: [],
        unsuitableReason: "ライセンス文だけで、読解の題材にならない",
      })

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result).toEqual({ ok: true, output })
    })

    it("300 語なら 3 問で合格する", () => {
      const result = validateGeneratedOutput(buildGeneratedOutput(), { ...PASSAGE_INPUT, wordCount: 300 })

      expect(result.ok).toBe(true)
    })
  })

  describe("異常系", () => {
    it("301 語で 3 問なら、4 問が必要という理由で不合格", () => {
      const result = validateGeneratedOutput(buildGeneratedOutput(), { ...PASSAGE_INPUT, wordCount: 301 })

      expect(result).toEqual({ errors: ["questions: expected 4 questions but got 3"], ok: false })
    })

    it("Zod に合わなければ、issue の path と message を理由にする", () => {
      const output = buildGeneratedOutput({
        questions: [
          buildQuestion({ choices: ["A", "B", "C"] }),
          buildQuestion({ vocabularyTarget: { blockIndex: 2, surface: "idempotent" } }),
          buildQuestion(),
        ],
      })

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result.ok).toBe(false)
      expect(!result.ok && result.errors).toEqual([
        expect.stringMatching(/^questions\.0\.choices: /),
        "questions.1.vocabularyTarget: vocabularyTarget must be null for non-vocabulary questions",
      ])
    })

    it("オブジェクトでなければ不合格", () => {
      const result = validateGeneratedOutput("not an object", PASSAGE_INPUT)

      expect(result.ok).toBe(false)
      expect(!result.ok && result.errors.length).toBeGreaterThan(0)
    })

    it("選択肢が大文字小文字と前後の空白だけ違って重複していれば不合格", () => {
      const output = buildGeneratedOutput({
        questions: [
          buildQuestion(),
          buildQuestion({ choices: ["Use a cache", "use a CACHE ", "Retry later", "Give up"] }),
          buildQuestion(),
        ],
      })

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result).toEqual({
        errors: ["questions.1.choices: choices must be distinct (ignoring case and surrounding spaces)"],
        ok: false,
      })
    })

    it("根拠のブロック番号が範囲外・code ブロックなら不合格", () => {
      const output = buildGeneratedOutput({
        questions: [
          buildQuestion({ evidence: { blockIndex: 7, quote: "Retries" } }),
          buildQuestion({ evidence: { blockIndex: 5, quote: "retry" } }),
          buildQuestion(),
        ],
      })

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result).toEqual({
        errors: [
          "questions.0.evidence.blockIndex: block 7 does not exist (the passage has blocks 0-6)",
          "questions.1.evidence.blockIndex: block 5 is a code block; refer to a block of prose",
        ],
        ok: false,
      })
    })

    it("語義設問の対象のブロック番号が code ブロックなら不合格", () => {
      const output = buildGeneratedOutput({
        questions: [
          buildQuestion(),
          buildQuestion({ type: "vocabulary", vocabularyTarget: { blockIndex: 5, surface: "retry" } }),
          buildQuestion(),
        ],
      })

      const result = validateGeneratedOutput(output, PASSAGE_INPUT)

      expect(result).toEqual({
        errors: ["questions.1.vocabularyTarget.blockIndex: block 5 is a code block; refer to a block of prose"],
        ok: false,
      })
    })
  })
})
