import {
  buildPassagePrompt,
  buildVerifyQuestionsUserContent,
  VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA,
  VERIFY_QUESTIONS_SYSTEM_PROMPT,
  verifyQuestionsOutputSchema,
} from "../../src/prompt"

import { readPassageFixture } from "./helpers"

const fixture = readPassageFixture("retrying-requests.json")

const QUESTIONS = [
  {
    choices: [
      "To explain when automatic retries are safe",
      "To list HTTP status codes",
      "To describe credit card payments",
      "To compare HTTP clients",
    ],
    prompt: "What is the main purpose of this passage?",
  },
  {
    choices: ["They are retried.", "They are returned right away.", "They are logged.", "They become 5xx errors."],
    prompt: "According to the passage, what happens to 4xx errors?",
  },
]

const buildInput = () => ({ blocks: fixture.blocks, questions: QUESTIONS, title: fixture.title, wordCount: fixture.wordCount })

describe("buildVerifyQuestionsUserContent", () => {
  describe("正常系", () => {
    it("生成と同じ形の番号つきブロック（設問数なし）の後に、設問と A〜D の選択肢を並べる", () => {
      const content = buildVerifyQuestionsUserContent(buildInput())

      expect(content).toBe([
        buildPassagePrompt({ blocks: fixture.blocks, title: fixture.title, wordCount: fixture.wordCount }),
        "",
        "<questions>",
        "<question number=\"1\">",
        "<prompt>What is the main purpose of this passage?</prompt>",
        "<choice letter=\"A\">To explain when automatic retries are safe</choice>",
        "<choice letter=\"B\">To list HTTP status codes</choice>",
        "<choice letter=\"C\">To describe credit card payments</choice>",
        "<choice letter=\"D\">To compare HTTP clients</choice>",
        "</question>",
        "<question number=\"2\">",
        "<prompt>According to the passage, what happens to 4xx errors?</prompt>",
        "<choice letter=\"A\">They are retried.</choice>",
        "<choice letter=\"B\">They are returned right away.</choice>",
        "<choice letter=\"C\">They are logged.</choice>",
        "<choice letter=\"D\">They become 5xx errors.</choice>",
        "</question>",
        "</questions>",
        "",
        "Answer all 2 questions.",
      ].join("\n"))
      expect(content).not.toContain("question_count")
    })

    it("和訳（translationJa）は渡さない", () => {
      const content = buildVerifyQuestionsUserContent({
        ...buildInput(),
        blocks: [{ text: "Keep it simple.", translationJa: "シンプルに保つ。", type: "paragraph" }],
      })

      expect(content).not.toContain("シンプルに保つ。")
    })
  })
})

describe("VERIFY_QUESTIONS_SYSTEM_PROMPT", () => {
  describe("正常系", () => {
    it("日付・本文などの毎回変わる値を含まない（プロンプトキャッシュが効くように）", () => {
      expect(VERIFY_QUESTIONS_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      expect(VERIFY_QUESTIONS_SYSTEM_PROMPT).not.toContain(fixture.title)
      expect(VERIFY_QUESTIONS_SYSTEM_PROMPT).not.toContain("${")
    })

    it("推測でも必ず 1 つ選ぶ指示と、段落番号の読み方を含む", () => {
      expect(VERIFY_QUESTIONS_SYSTEM_PROMPT).toContain("Answer every question with exactly one choice, even when you are unsure")
      expect(VERIFY_QUESTIONS_SYSTEM_PROMPT).toContain("it means the block with that paragraph attribute, not the index attribute")
    })
  })
})

describe("verifyQuestionsOutputSchema", () => {
  describe("正常系", () => {
    it("設問番号と選択肢の index の配列を受け付ける", () => {
      const answers = [{ choiceIndex: 0, questionNumber: 1 }, { choiceIndex: 3, questionNumber: 2 }]

      expect(verifyQuestionsOutputSchema.parse({ answers })).toEqual({ answers })
    })

    it("API に渡す JSON Schema は範囲の制約を落とし、全オブジェクトに additionalProperties: false を付ける", () => {
      expect(VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA).toEqual({
        additionalProperties: false,
        properties: {
          answers: {
            description: "One answer for every question",
            items: {
              additionalProperties: false,
              properties: {
                choiceIndex: { description: "0-based index of the chosen choice (0 = A, 1 = B, 2 = C, 3 = D)", type: "integer" },
                questionNumber: { description: "The number attribute of <question>", type: "integer" },
              },
              required: ["choiceIndex", "questionNumber"],
              type: "object",
            },
            type: "array",
          },
        },
        required: ["answers"],
        type: "object",
      })
    })
  })

  describe("異常系", () => {
    it.each([
      [{ choiceIndex: 4, questionNumber: 1 }],
      [{ choiceIndex: -1, questionNumber: 1 }],
      [{ choiceIndex: 0, questionNumber: 0 }],
      [{ choiceIndex: 1.5, questionNumber: 1 }],
    ])("範囲外の回答は不合格（%j）", (answer) => {
      expect(verifyQuestionsOutputSchema.safeParse({ answers: [answer] }).success).toBe(false)
    })
  })
})

describe("解答キーを見ない検証のプロンプトの組み立て結果", () => {
  it("fixture の本文で、API に送る system prompt・user message・出力のスキーマを書き出す", async () => {
    /**
     * プロンプトを変えるとこのファイルの差分が出る（`pnpm test -u` で更新）
     */
    const rendered = [
      `=== system ===\n${VERIFY_QUESTIONS_SYSTEM_PROMPT}`,
      `=== user ===\n${buildVerifyQuestionsUserContent(buildInput())}`,
      `=== output_config.format.schema ===\n${JSON.stringify(VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA, null, 2)}`,
    ].join("\n\n")

    await expect(`${rendered}\n`).toMatchFileSnapshot("./__snapshots__/verify-questions.prompt.txt")
  })
})
