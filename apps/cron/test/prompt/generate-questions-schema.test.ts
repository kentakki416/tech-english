import { convertZodToStructuredOutputSchema } from "../../src/client/anthropic"
import {
  GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA,
  generateQuestionsOutputSchema,
  type GenerateQuestionsOutput,
} from "../../src/prompt"

/**
 * README の「LLM の呼び出し」の表どおりの出力（fixture の retrying-requests.json に対するもの）
 */
const buildValidOutput = (): GenerateQuestionsOutput => ({
  difficulty: 2,
  glossary: [
    {
      blockIndex: 1,
      lemma: "opt in to",
      meaningJa: "（任意の機能を）有効にする",
      noteJa: "設定で明示的に選んで使い始めるときに使う",
      partOfSpeech: "句動詞",
      surface: "opt in to",
    },
    {
      blockIndex: 2,
      lemma: "idempotent",
      meaningJa: "冪等な（何度実行しても結果が同じ）",
      noteJa: null,
      partOfSpeech: "形容詞",
      surface: "idempotent",
    },
  ],
  isSuitable: true,
  questions: [
    {
      choices: [
        "To explain when retrying a request is safe",
        "To compare GET and POST requests",
        "To describe how to charge a credit card",
        "To list the causes of server restarts",
      ],
      choicesJa: [
        "リクエストのリトライが安全な場合を説明するため",
        "GET と POST のリクエストを比べるため",
        "クレジットカードへの請求のしかたを説明するため",
        "サーバーが再起動する原因を挙げるため",
      ],
      correctChoiceIndex: 0,
      evidence: { blockIndex: 2, quote: "Retries are only safe when a request is idempotent" },
      explanationJa: "第 2 段落で、リトライが安全なのは冪等なリクエストのときだけだと説明している。",
      prompt: "What is the main purpose of paragraph 2?",
      promptJa: "第 2 段落の主な目的は何か。",
      type: "main_idea",
      vocabularyTarget: null,
    },
    {
      choices: ["enable", "disable", "inspect", "replace"],
      choicesJa: null,
      correctChoiceIndex: 0,
      evidence: { blockIndex: 1, quote: "the client can opt in to automatic retries" },
      explanationJa: "opt in to は「（任意の機能を）有効にする」の意味。",
      prompt: "The phrase \"opt in to\" in paragraph 1 is closest in meaning to",
      promptJa: "第 1 段落の \"opt in to\" に最も意味が近いものはどれか。",
      type: "vocabulary",
      vocabularyTarget: { blockIndex: 1, surface: "opt in to" },
    },
  ],
  translations: [
    { blockIndex: 0, translationJa: "リトライと冪等性" },
    { blockIndex: 1, translationJa: "ネットワークの呼び出しは、コードと関係のない理由で失敗します。" },
  ],
  unsuitableReason: null,
})

/**
 * JSON Schema を再帰的にたどって、全ノードを列挙する
 */
const collectSchemaNodes = (node: unknown): Record<string, unknown>[] => {
  if (typeof node !== "object" || node === null) return []
  if (Array.isArray(node)) return node.flatMap(collectSchemaNodes)
  const record = node as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(collectSchemaNodes)]
}

describe("generateQuestionsOutputSchema", () => {
  describe("正常系", () => {
    it("README の表どおりの出力が通る", () => {
      const result = generateQuestionsOutputSchema.safeParse(buildValidOutput())

      expect(result.success).toBe(true)
    })

    it("選択肢の前後の空白を除く", () => {
      const output = buildValidOutput()
      output.questions[1].choices = ["  enable ", "disable", "inspect", "replace"]

      const result = generateQuestionsOutputSchema.parse(output)

      expect(result.questions[1].choices[0]).toBe("enable")
    })

    it("isSuitable = false で配列が空の出力も通る", () => {
      const result = generateQuestionsOutputSchema.safeParse({
        difficulty: 1,
        glossary: [],
        isSuitable: false,
        questions: [],
        translations: [],
        unsuitableReason: "目次だけで本文が無い",
      })

      expect(result.success).toBe(true)
    })
  })

  describe("異常系", () => {
    const mutations: [string, (output: GenerateQuestionsOutput) => void, (number | string)[]][] = [
      ["選択肢が 3 つ", (output) => {
        output.questions[0].choices = output.questions[0].choices.slice(0, 3)
      }, ["questions", 0, "choices"]],
      ["空文字（空白だけ）の選択肢", (output) => {
        output.questions[0].choices[2] = "   "
      }, ["questions", 0, "choices", 2]],
      ["correctChoiceIndex = 4", (output) => {
        output.questions[0].correctChoiceIndex = 4
      }, ["questions", 0, "correctChoiceIndex"]],
      ["難易度 0", (output) => {
        (output as { difficulty: number }).difficulty = 0
      }, ["difficulty"]],
      ["vocabulary なのに vocabularyTarget が null", (output) => {
        output.questions[1].vocabularyTarget = null
      }, ["questions", 1, "vocabularyTarget"]],
      ["vocabulary 以外なのに対象語句がある", (output) => {
        output.questions[0].vocabularyTarget = { blockIndex: 1, surface: "opt in to" }
      }, ["questions", 0, "vocabularyTarget"]],
      ["設問の種類が QUESTION_TYPES に無い", (output) => {
        (output.questions[0] as { type: string }).type = "summary"
      }, ["questions", 0, "type"]],
      ["ブロック番号が負", (output) => {
        output.questions[0].evidence.blockIndex = -1
      }, ["questions", 0, "evidence", "blockIndex"]],
      ["和訳が空文字", (output) => {
        output.translations[0].translationJa = ""
      }, ["translations", 0, "translationJa"]],
      ["設問文の和訳が空白だけ", (output) => {
        output.questions[0].promptJa = "  "
      }, ["questions", 0, "promptJa"]],
      ["選択肢の和訳が 3 つ", (output) => {
        output.questions[0].choicesJa = ["a", "b", "c"]
      }, ["questions", 0, "choicesJa"]],
      ["vocabulary 以外なのに選択肢の和訳が null", (output) => {
        output.questions[0].choicesJa = null
      }, ["questions", 0, "choicesJa"]],
      ["vocabulary なのに選択肢の和訳がある", (output) => {
        output.questions[1].choicesJa = ["有効にする", "無効にする", "調べる", "置き換える"]
      }, ["questions", 1, "choicesJa"]],
    ]

    it.each(mutations)("%s は不合格になり、issue の path が該当の値を指す", (_label, mutate, expectedPath) => {
      const output = buildValidOutput()
      mutate(output)

      const result = generateQuestionsOutputSchema.safeParse(output)

      expect(result.success).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(expectedPath)
    })

    it("必須のキーが無い出力は不合格になる", () => {
      const output: Partial<GenerateQuestionsOutput> = buildValidOutput()
      delete output.unsuitableReason

      const result = generateQuestionsOutputSchema.safeParse(output)

      expect(result.success).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(["unsuitableReason"])
    })
  })
})

describe("GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA", () => {
  describe("正常系", () => {
    it("structured output が受け付けない制約（文字数・数値の範囲・配列の長さ・$schema）を含まない", () => {
      const nodes = collectSchemaNodes(GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA)

      for (const keyword of ["$schema", "maximum", "maxItems", "maxLength", "minimum", "minLength", "pattern"]) {
        expect(nodes.filter((node) => keyword in node)).toEqual([])
      }
      expect(nodes.filter((node) => "minItems" in node && node.minItems !== 0 && node.minItems !== 1)).toEqual([])
    })

    it("全オブジェクトが additionalProperties: false で、全キーを required にする（任意の値は null で表す）", () => {
      const objectNodes = collectSchemaNodes(GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA).filter((node) => node.type === "object")

      expect(objectNodes.length).toBeGreaterThan(0)
      for (const node of objectNodes) {
        expect(node.additionalProperties).toBe(false)
        expect(node.required).toEqual(Object.keys(node.properties as object))
      }
    })

    it("難易度と設問の種類を enum で、任意の値を null との anyOf で表す", () => {
      const schema = GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA as {
        properties: {
          difficulty: unknown
          questions: { items: { properties: { type: unknown; vocabularyTarget: { anyOf: { type: string }[] } } } }
          unsuitableReason: unknown
        }
      }

      expect(schema.properties.difficulty).toEqual({ enum: [1, 2, 3], type: "number" })
      expect(schema.properties.questions.items.properties.type).toEqual({
        enum: ["main_idea", "detail", "vocabulary", "inference", "purpose"],
        type: "string",
      })
      expect(schema.properties.questions.items.properties.vocabularyTarget.anyOf.map((variant) => variant.type)).toEqual([
        "object",
        "null",
      ])
      expect(schema.properties.unsuitableReason).toMatchObject({ anyOf: [{ type: "string" }, { type: "null" }] })
    })

    it("refine を付けたスキーマから作り直しても、キーの順序まで同じ JSON になる", () => {
      const rebuilt = convertZodToStructuredOutputSchema(generateQuestionsOutputSchema)

      expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA))
    })
  })
})
