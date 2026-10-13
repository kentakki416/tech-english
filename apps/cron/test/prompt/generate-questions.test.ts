import { calculateQuestionCount, QUESTION_TYPES } from "@repo/domain"

import {
  buildGenerateQuestionsUserContent,
  GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA,
  GENERATE_QUESTIONS_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from "../../src/prompt"

import { readPassageFixture } from "./helpers"

const fixture = readPassageFixture("retrying-requests.json")

const buildInput = (retryErrors: string[] = []) => ({
  blocks: fixture.blocks,
  questionCount: calculateQuestionCount(fixture.wordCount),
  retryErrors,
  title: fixture.title,
  wordCount: fixture.wordCount,
})

describe("buildGenerateQuestionsUserContent", () => {
  describe("正常系", () => {
    it("fixture の本文を、ブロック番号と段落番号を振ったブロックにして設問数の指示を付ける", () => {
      const { blocks } = fixture

      const content = buildGenerateQuestionsUserContent(buildInput())

      expect(content).toBe([
        "<passage title=\"Retries &amp; Idempotency\" word_count=\"149\" question_count=\"3\">",
        "<block index=\"0\" type=\"heading\">Retries & Idempotency</block>",
        `<block index="1" type="paragraph" paragraph="1">${blocks[1].text}</block>`,
        `<block index="2" type="paragraph" paragraph="2">${blocks[2].text}</block>`,
        "<block index=\"3\" type=\"list_item\" paragraph=\"3\">Wait a little longer after each attempt (exponential backoff).</block>",
        `<block index="4" type="list_item" paragraph="4">${blocks[4].text}</block>`,
        "<block index=\"5\" type=\"code\" lang=\"ts\" translate=\"no\">const response = await client.get(\"/items?limit=10&page=2\", {",
        "  retry: { attempts: 3, delayMs: 500 },",
        "})",
        "if (response.status < 500) return response</block>",
        `<block index="6" type="quote" paragraph="5">${blocks[6].text}</block>`,
        "</passage>",
        "",
        "Create exactly 3 questions for this passage.",
      ].join("\n"))
    })

    it("見出しとコードには段落番号を付けず、code だけに translate=\"no\" を付ける", () => {
      const content = buildGenerateQuestionsUserContent(buildInput())

      const blockTags = content.split("\n").filter((line) => line.startsWith("<block "))
      expect(blockTags.map((line) => line.slice(0, line.indexOf(">") + 1))).toEqual([
        "<block index=\"0\" type=\"heading\">",
        "<block index=\"1\" type=\"paragraph\" paragraph=\"1\">",
        "<block index=\"2\" type=\"paragraph\" paragraph=\"2\">",
        "<block index=\"3\" type=\"list_item\" paragraph=\"3\">",
        "<block index=\"4\" type=\"list_item\" paragraph=\"4\">",
        "<block index=\"5\" type=\"code\" lang=\"ts\" translate=\"no\">",
        "<block index=\"6\" type=\"quote\" paragraph=\"5\">",
      ])
    })

    it("lang の無い code には lang 属性を付けない", () => {
      const content = buildGenerateQuestionsUserContent({
        blocks: [{ text: "npm install tiny-retry", type: "code" }],
        questionCount: 3,
        retryErrors: [],
        title: "Install",
        wordCount: 200,
      })

      expect(content).toContain("<block index=\"0\" type=\"code\" translate=\"no\">npm install tiny-retry</block>")
    })

    it("属性値はエスケープし、ブロックの本文はエスケープしない", () => {
      const content = buildGenerateQuestionsUserContent({
        blocks: [{ text: "Use `a < b && c > d` to compare \"values\".", type: "paragraph" }],
        questionCount: 3,
        retryErrors: [],
        title: "Compare \"values\" with <, > & =",
        wordCount: 200,
      })

      expect(content).toContain("<passage title=\"Compare &quot;values&quot; with &lt;, &gt; &amp; =\" word_count=\"200\" question_count=\"3\">")
      expect(content).toContain("<block index=\"0\" type=\"paragraph\" paragraph=\"1\">Use `a < b && c > d` to compare \"values\".</block>")
    })

    it("和訳（translationJa）があっても渡さない", () => {
      const content = buildGenerateQuestionsUserContent({
        blocks: [{ text: "Keep it simple.", translationJa: "シンプルに保つ。", type: "paragraph" }],
        questionCount: 3,
        retryErrors: [],
        title: "Simple",
        wordCount: 200,
      })

      expect(content).not.toContain("シンプルに保つ。")
    })

    it("同じ入力からは同じ文字列ができる", () => {
      expect(buildGenerateQuestionsUserContent(buildInput())).toBe(buildGenerateQuestionsUserContent(buildInput()))
    })

    it("retryErrors が空なら不合格の理由を付けない", () => {
      const content = buildGenerateQuestionsUserContent(buildInput())

      expect(content).not.toContain("previous_attempt_errors")
      expect(content.endsWith("Create exactly 3 questions for this passage.")).toBe(true)
    })

    it("retryErrors があるときだけ、不合格の理由を末尾に箇条書きで付ける", () => {
      const content = buildGenerateQuestionsUserContent(
        buildInput(["questions: expected 3 questions but got 2", "questions.1.choices: duplicated choices"]),
      )

      expect(content.startsWith(buildGenerateQuestionsUserContent(buildInput()))).toBe(true)
      expect(content.endsWith([
        "Create exactly 3 questions for this passage.",
        "",
        "<previous_attempt_errors>",
        "Your previous output for this passage was rejected for the following reasons. Fix them and output the whole JSON object again.",
        "- questions: expected 3 questions but got 2",
        "- questions.1.choices: duplicated choices",
        "</previous_attempt_errors>",
      ].join("\n"))).toBe(true)
    })
  })
})

describe("GENERATE_QUESTIONS_SYSTEM_PROMPT", () => {
  describe("正常系", () => {
    it("日付・版・本文などの毎回変わる値を含まない（プロンプトキャッシュが効くように）", () => {
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).not.toContain(PROMPT_VERSION)
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).not.toContain(fixture.title)
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).not.toContain("${")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).not.toContain("undefined")
    })

    it("全ての設問の種類と難易度の目安を含む", () => {
      for (const type of QUESTION_TYPES) {
        expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain(`  - ${type}: `)
      }
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("- 1 (Easy: ")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("- 2 (Normal: ")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("- 3 (Hard: ")
    })

    it("README の設問・和訳・用語集の主なルールを含む", () => {
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Write exactly question_count questions.")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Use at least two different types")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Never use \"All of the above\", \"None of the above\"")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("copied verbatim from that block's text")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("use this number, never the block index")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Always add the same word or phrase to the glossary")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Translate every block except code blocks")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Keep inline code (text in backquotes) exactly as it is")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Pick 8 to 20 words")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("the one meaning that fits this context")
      expect(GENERATE_QUESTIONS_SYSTEM_PROMPT).toContain("Do not give character positions.")
    })
  })
})

describe("問題生成のプロンプトの組み立て結果", () => {
  it("fixture の本文で、API に送る system prompt・user message・出力のスキーマを書き出す", async () => {
    /**
     * プロンプトを変えるとこのファイルの差分が出る（`pnpm test -u` で更新）。PROMPT_VERSION を上げ忘れていないかを確かめる
     */
    const rendered = [
      `=== PROMPT_VERSION ===\n${PROMPT_VERSION}`,
      `=== system ===\n${GENERATE_QUESTIONS_SYSTEM_PROMPT}`,
      `=== user ===\n${buildGenerateQuestionsUserContent(buildInput())}`,
      `=== user (再生成) ===\n${buildGenerateQuestionsUserContent(buildInput(["questions.0.choices: Too small: expected array to have >=4 items"]))}`,
      `=== output_config.format.schema ===\n${JSON.stringify(GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA, null, 2)}`,
    ].join("\n\n")

    await expect(`${rendered}\n`).toMatchFileSnapshot("./__snapshots__/generate-questions.prompt.txt")
  })
})
