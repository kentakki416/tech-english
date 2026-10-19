import { buildDraftContent, type BuildDraftContentInput } from "../../../src/lib/question-generation"

import { buildGeneratedOutput, buildQuestion, PASSAGE, PROSE_BLOCK_INDEXES } from "./helpers"

const buildInput = (overrides: Partial<BuildDraftContentInput> = {}): BuildDraftContentInput => ({
  blocks: PASSAGE.blocks,
  output: buildGeneratedOutput(),
  random: () => 0.999,
  wordCount: PASSAGE.wordCount,
  ...overrides,
})

/**
 * 本文のブロックでの surface の最初の位置
 */
const locate = (blockIndex: number, surface: string) => {
  const startOffset = PASSAGE.blocks[blockIndex].text.indexOf(surface)
  return { endOffset: startOffset + surface.length, startOffset }
}

describe("buildDraftContent", () => {
  describe("正常系", () => {
    it("用語集の位置を本文から求めて位置の順に並べ、見つからない語句を droppedGlossary に入れる", () => {
      const { content, droppedGlossary } = buildDraftContent(buildInput())

      expect(content.glossary).toEqual([
        { blockIndex: 1, ...locate(1, "opt in to"), lemma: "opt in to", meaningJa: "〜を選んで有効にする", noteJa: null, partOfSpeech: "句動詞", surface: "opt in to" },
        {
          blockIndex: 2,
          ...locate(2, "idempotent"),
          lemma: "idempotent",
          meaningJa: "冪等な",
          noteJa: "何度実行しても結果が同じになる性質",
          partOfSpeech: "形容詞",
          surface: "idempotent",
        },
        { blockIndex: 2, ...locate(2, "Under the hood"), lemma: "under the hood", meaningJa: "内部では", noteJa: null, partOfSpeech: "熟語", surface: "Under the hood" },
        { blockIndex: 6, ...locate(6, "caveat"), lemma: "caveat", meaningJa: "注意点", noteJa: null, partOfSpeech: "名詞", surface: "caveat" },
      ])
      expect(droppedGlossary).toEqual([{ blockIndex: 4, surface: "jitters" }])
      for (const entry of content.glossary) {
        expect(PASSAGE.blocks[entry.blockIndex].text.slice(entry.startOffset, entry.endOffset)).toBe(entry.surface)
      }
    })

    it("code・範囲外のブロックを指す語句は捨て、同じ位置の重複は 1 つにする", () => {
      const output = buildGeneratedOutput()
      const caveat = output.glossary[4]
      const { content, droppedGlossary } = buildDraftContent(buildInput({
        output: {
          ...output,
          glossary: [
            caveat,
            { ...caveat, meaningJa: "但し書き" },
            { ...caveat, blockIndex: 5, surface: "retry" },
            { ...caveat, blockIndex: 9, surface: "caveat" },
          ],
          questions: [buildQuestion(), buildQuestion(), buildQuestion()],
        },
      }))

      expect(content.glossary.map((entry) => [entry.blockIndex, entry.surface, entry.meaningJa])).toEqual([[6, "caveat", "注意点"]])
      expect(droppedGlossary).toEqual([{ blockIndex: 5, surface: "retry" }, { blockIndex: 9, surface: "caveat" }])
    })

    it("和訳を code 以外のブロックに入れ、全部あれば要確認の理由は無い", () => {
      const { content } = buildDraftContent(buildInput())

      expect(content.blocks.map((block) => block.translationJa)).toEqual([
        "リトライと冪等性",
        "ネットワークの呼び出しは、コードとは無関係な多くの理由で失敗する。",
        "リトライが安全なのは、リクエストが冪等なときだけだ。",
        "試行のたびに待ち時間を少しずつ長くする（指数バックオフ）。",
        "何千ものクライアントが同時にリトライしないよう、ランダムなジッターを加える。",
        undefined,
        "注意点：リトライで誤ったリクエストは直せないので、4xx エラーはすぐに返される。",
      ])
      expect(content.blocks[5]).toEqual(PASSAGE.blocks[5])
      expect(content.attentionReasons).toEqual([])
    })

    it("語義設問の対象が用語集の既存の項目（同じ blockIndex と surface）に紐づく", () => {
      const { content } = buildDraftContent(buildInput())

      const vocabularyQuestion = content.questions[1]
      expect(vocabularyQuestion.type).toBe("vocabulary")
      expect(vocabularyQuestion.targetGlossaryIndex).not.toBeNull()
      expect(content.glossary[vocabularyQuestion.targetGlossaryIndex ?? -1].surface).toBe("idempotent")
      expect(content.questions.filter((question) => question.type !== "vocabulary").map((question) => question.targetGlossaryIndex))
        .toEqual([null, null])
    })

    it("語義設問の対象が用語集に無く本文にあれば、意味が空の項目を足して紐づけ、要確認にする", () => {
      const output = buildGeneratedOutput()
      const { content } = buildDraftContent(buildInput({
        output: {
          ...output,
          questions: [
            output.questions[0],
            { ...output.questions[1], vocabularyTarget: { blockIndex: 2, surface: "discard duplicates" } },
            output.questions[2],
          ],
        },
      }))

      const target = content.glossary[content.questions[1].targetGlossaryIndex ?? -1]
      expect(target).toEqual({
        blockIndex: 2,
        ...locate(2, "discard duplicates"),
        lemma: "discard duplicates",
        meaningJa: "",
        noteJa: null,
        partOfSpeech: null,
        surface: "discard duplicates",
      })
      expect(content.glossary).toHaveLength(5)
      expect(content.attentionReasons).toEqual(["Q2：対象の語句「discard duplicates」を用語集に追加しました。意味を入力してください"])
    })

    it("選択肢をシャッフルし、正解の選択肢の文字列が correctChoiceIndex の位置にある", () => {
      const output = buildGeneratedOutput()

      const { content } = buildDraftContent(buildInput({ random: () => 0 }))

      content.questions.forEach((question, index) => {
        const original = output.questions[index]
        expect(question.choices).not.toEqual(original.choices)
        expect(question.choices[question.correctChoiceIndex]).toBe(original.choices[original.correctChoiceIndex])
      })
    })

    it("選択肢の和訳も同じ順に並べ替え、和訳が同じ位置の英文と組のまま。語義設問の和訳は null のまま", () => {
      const output = buildGeneratedOutput()

      const { content } = buildDraftContent(buildInput({ random: () => 0 }))

      content.questions.forEach((question, index) => {
        const original = output.questions[index]
        const originalChoicesJa = original.choicesJa
        if (originalChoicesJa === null) {
          expect(question.choicesJa).toBeNull()
          return
        }
        expect(question.choicesJa).toEqual(question.choices.map((choice) => originalChoicesJa[original.choices.indexOf(choice)]))
      })
      expect(content.questions[1]).toMatchObject({ choicesJa: null, type: "vocabulary" })
    })

    it("設問は配列の順の orderIndex（0 始まり）を持ち、検証前なので verificationChoiceIndex は null", () => {
      const output = buildGeneratedOutput()

      const { content } = buildDraftContent(buildInput())

      expect(content.questions.map((question) => question.orderIndex)).toEqual([0, 1, 2])
      expect(content.questions[2]).toEqual({
        choices: output.questions[2].choices,
        choicesJa: output.questions[2].choicesJa,
        correctChoiceIndex: 2,
        evidenceBlockIndex: 6,
        evidenceQuote: "4xx errors are returned right away",
        explanationJa: output.questions[2].explanationJa,
        orderIndex: 2,
        prompt: output.questions[2].prompt,
        promptJa: output.questions[2].promptJa,
        targetGlossaryIndex: null,
        type: "detail",
        verificationChoiceIndex: null,
      })
    })

    it("難易度をそのまま入れ、制限時間を計算式で求める（149 語・難易度 2・3 問 → 210 秒）", () => {
      const { content } = buildDraftContent(buildInput())

      expect(content.difficulty).toBe(2)
      expect(content.timeLimitSeconds).toBe(210)
    })

    it("前回の生成の和訳が本文に残っていても、今回の和訳で入れ直す", () => {
      const blocks = PASSAGE.blocks.map((block) => ({ ...block, translationJa: "前回の和訳" }))
      const output = buildGeneratedOutput()

      const { content } = buildDraftContent(buildInput({
        blocks,
        output: { ...output, translations: output.translations.filter((translation) => translation.blockIndex !== 3) },
      }))

      expect(content.blocks[3].translationJa).toBeUndefined()
      expect(content.blocks[5].translationJa).toBeUndefined()
      expect(content.blocks[0].translationJa).toBe("リトライと冪等性")
    })
  })

  describe("異常系", () => {
    it("和訳の無いブロックは要確認（見出しは numberHeadings の「見出し N」、他は numberParagraphs の段落番号）。code・範囲外の和訳は無視する", () => {
      const output = buildGeneratedOutput()
      const { content } = buildDraftContent(buildInput({
        output: {
          ...output,
          translations: [
            ...output.translations.filter((translation) => translation.blockIndex !== 0 && translation.blockIndex !== 4),
            { blockIndex: 5, translationJa: "コードの訳" },
            { blockIndex: 10, translationJa: "範囲外" },
          ],
        },
      }))

      expect(content.blocks[5].translationJa).toBeUndefined()
      expect(content.attentionReasons).toEqual(["見出し 1 の和訳がありません", "段落 4 の和訳がありません"])
      expect(PROSE_BLOCK_INDEXES.filter((index) => content.blocks[index].translationJa === undefined)).toEqual([0, 4])
    })

    it("和訳の無い見出しが複数あっても、見出しの番号で理由を区別できる", () => {
      const output = buildGeneratedOutput()
      const blocks = PASSAGE.blocks.map((block, index) => (index === 3 ? { text: "How retries work", type: "heading" as const } : block))
      const { content } = buildDraftContent(buildInput({
        blocks,
        output: {
          ...output,
          translations: output.translations.filter((translation) => translation.blockIndex !== 0 && translation.blockIndex !== 3),
        },
      }))

      expect(content.attentionReasons).toEqual(["見出し 1 の和訳がありません", "見出し 2 の和訳がありません"])
    })

    it("根拠の引用が該当ブロックの本文に無ければ要確認（保存はする）", () => {
      const output = buildGeneratedOutput()
      const { content } = buildDraftContent(buildInput({
        output: {
          ...output,
          questions: [
            buildQuestion({ evidence: { blockIndex: 2, quote: "Retries are always safe" } }),
            output.questions[1],
            buildQuestion({ evidence: { blockIndex: 0, quote: "Timeouts" } }),
          ],
        },
      }))

      expect(content.attentionReasons).toEqual([
        "Q1：根拠の引用が段落 2 の本文に見つかりません",
        "Q3：根拠の引用が見出し 1 の本文に見つかりません",
      ])
      expect(content.questions[0].evidenceQuote).toBe("Retries are always safe")
    })

    it("語義設問の対象が本文に無ければ紐づけず要確認", () => {
      const output = buildGeneratedOutput()
      const { content } = buildDraftContent(buildInput({
        output: {
          ...output,
          questions: [
            output.questions[0],
            { ...output.questions[1], vocabularyTarget: { blockIndex: 2, surface: "throttle" } },
            output.questions[2],
          ],
        },
      }))

      expect(content.questions[1].targetGlossaryIndex).toBeNull()
      expect(content.glossary).toHaveLength(4)
      expect(content.attentionReasons).toEqual(["Q2：対象の語句「throttle」が段落 2 に見つかりません"])
    })
  })
})
