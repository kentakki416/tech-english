import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk"
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages"

import {
  AnthropicClient,
  type AnthropicMessagesApi,
  createAnthropicClient,
  isFatalLlmError,
  LlmInvalidJsonError,
  LlmOutputTruncatedError,
  LlmRefusalError,
  type StructuredMessageRequest,
} from "../../../src/client/anthropic"
import { generateQuestionsOutputSchema } from "../../../src/prompt"

const GENERATION_MODEL = "claude-sonnet-5-5"

const VERIFICATION_MODEL = "claude-haiku-4-5-20251001"

const JSON_SCHEMA = {
  additionalProperties: false,
  properties: { answer: { type: "string" } },
  required: ["answer"],
  type: "object",
}

const buildRequest = (overrides: Partial<StructuredMessageRequest> = {}): StructuredMessageRequest => ({
  jsonSchema: JSON_SCHEMA,
  maxTokens: 16000,
  model: GENERATION_MODEL,
  system: "You write reading-comprehension questions.",
  userContent: "<passage title=\"Retries\">...</passage>",
  ...overrides,
})

/**
 * Messages API のレスポンス（SDK の Message）。既定は思考ブロックの後ろに JSON の text が続く正常な応答
 */
const buildMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "msg_01",
  container: null,
  content: [
    { signature: "sig", thinking: "", type: "thinking" },
    { citations: null, text: "{\"answer\":\"B\"}", type: "text" },
  ],
  diagnostics: null,
  model: GENERATION_MODEL,
  role: "assistant",
  stop_details: null,
  stop_reason: "end_turn",
  stop_sequence: null,
  type: "message",
  usage: {
    cache_creation: null,
    cache_creation_input_tokens: 120,
    cache_read_input_tokens: 1800,
    inference_geo: null,
    input_tokens: 950,
    output_tokens: 4200,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: "standard",
  },
  ...overrides,
})

/**
 * messages.create だけの SDK の偽物（外部 SaaS なので実 API は呼ばない）
 */
const createFakeSdk = (result: Message | Error) => {
  const create = vi.fn<(params: MessageCreateParamsNonStreaming) => Promise<Message>>(async () => {
    if (result instanceof Error) throw result
    return result
  })
  const sdk: AnthropicMessagesApi = { messages: { create } }
  return { create, sdk }
}

const buildApiErrorBody = (type: string) => ({ error: { message: "error", type }, type: "error" })

const createJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "retry-after-ms": "1" },
    status,
  })

describe("AnthropicClient", () => {
  describe("正常系", () => {
    it("model / max_tokens / output_config / messages を渡し、system の text ブロックに cache_control を付ける", async () => {
      const { create, sdk } = createFakeSdk(buildMessage())

      await new AnthropicClient(sdk).createStructuredMessage(buildRequest())

      expect(create).toHaveBeenCalledTimes(1)
      /**
       * temperature などのサンプリングの引数・thinking・effort は渡さない（toEqual なので余計なキーがあれば落ちる）
       */
      expect(create.mock.calls[0][0]).toEqual({
        max_tokens: 16000,
        messages: [{ content: "<passage title=\"Retries\">...</passage>", role: "user" }],
        model: GENERATION_MODEL,
        output_config: { format: { schema: JSON_SCHEMA, type: "json_schema" } },
        system: [{ cache_control: { type: "ephemeral" }, text: "You write reading-comprehension questions.", type: "text" }],
      })
    })

    it("thinking ブロックの後ろの text ブロックの JSON を返し、usage と model を詰め替える", async () => {
      const { sdk } = createFakeSdk(buildMessage({ model: "claude-sonnet-5-5-20261001" }))

      const response = await new AnthropicClient(sdk).createStructuredMessage(buildRequest())

      expect(response).toEqual({
        json: { answer: "B" },
        model: "claude-sonnet-5-5-20261001",
        usage: { cacheCreationInputTokens: 120, cacheReadInputTokens: 1800, inputTokens: 950, outputTokens: 4200 },
      })
    })

    it("キャッシュのトークン数が null なら 0 にする", async () => {
      const message = buildMessage()
      const { sdk } = createFakeSdk({
        ...message,
        usage: { ...message.usage, cache_creation_input_tokens: null, cache_read_input_tokens: null },
      })

      const response = await new AnthropicClient(sdk).createStructuredMessage(buildRequest())

      expect(response.usage).toEqual({ cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 950, outputTokens: 4200 })
    })

    it("解答キーを見ない検証の呼び出し（別のモデル・別のスキーマ・thinking ブロックなし）も同じメソッドで扱える", async () => {
      const verificationSchema = { ...JSON_SCHEMA, properties: { answers: { items: { type: "integer" }, type: "array" } } }
      const { create, sdk } = createFakeSdk(buildMessage({
        content: [{ citations: null, text: "{\"answers\":[2,0,3]}", type: "text" }],
        model: VERIFICATION_MODEL,
      }))

      const response = await new AnthropicClient(sdk).createStructuredMessage(buildRequest({
        jsonSchema: verificationSchema,
        maxTokens: 2000,
        model: VERIFICATION_MODEL,
        system: "Answer each question.",
      }))

      expect(response.json).toEqual({ answers: [2, 0, 3] })
      expect(response.model).toBe(VERIFICATION_MODEL)
      expect(create.mock.calls[0][0]).toMatchObject({
        max_tokens: 2000,
        model: VERIFICATION_MODEL,
        output_config: { format: { schema: verificationSchema, type: "json_schema" } },
      })
    })
  })

  describe("異常系", () => {
    it("stop_reason が refusal なら stop_details の category を持つ LlmRefusalError", async () => {
      const { sdk } = createFakeSdk(buildMessage({
        content: [],
        stop_details: { category: "cyber", explanation: "declined", type: "refusal" },
        stop_reason: "refusal",
      }))

      const promise = new AnthropicClient(sdk).createStructuredMessage(buildRequest())

      await expect(promise).rejects.toThrow(LlmRefusalError)
      await expect(promise).rejects.toMatchObject({ category: "cyber" })
    })

    it("refusal で stop_details が無ければ category は null", async () => {
      const { sdk } = createFakeSdk(buildMessage({ content: [], stop_details: null, stop_reason: "refusal" }))

      await expect(new AnthropicClient(sdk).createStructuredMessage(buildRequest())).rejects.toMatchObject({
        category: null,
        name: "LlmRefusalError",
      })
    })

    it.each(["max_tokens", "model_context_window_exceeded"] as const)(
      "stop_reason が %s なら LlmOutputTruncatedError（途中で切れた JSON を読まない）",
      async (stopReason) => {
        const { sdk } = createFakeSdk(buildMessage({
          content: [{ citations: null, text: "{\"answer\":", type: "text" }],
          stop_reason: stopReason,
        }))

        const promise = new AnthropicClient(sdk).createStructuredMessage(buildRequest())

        await expect(promise).rejects.toThrow(LlmOutputTruncatedError)
        await expect(promise).rejects.toMatchObject({ stopReason })
      },
    )

    it("text が JSON でなければ LlmInvalidJsonError", async () => {
      const { sdk } = createFakeSdk(buildMessage({ content: [{ citations: null, text: "Sure! Here is", type: "text" }] }))

      await expect(new AnthropicClient(sdk).createStructuredMessage(buildRequest())).rejects.toThrow(LlmInvalidJsonError)
    })

    it("text ブロックが無ければ LlmInvalidJsonError", async () => {
      const { sdk } = createFakeSdk(buildMessage({ content: [{ signature: "sig", thinking: "", type: "thinking" }] }))

      await expect(new AnthropicClient(sdk).createStructuredMessage(buildRequest())).rejects.toThrow(
        "LLM output is not valid JSON: no text block in the response",
      )
    })

    it("SDK が throw したエラーはそのまま伝播する", async () => {
      const error = new RateLimitError(429, buildApiErrorBody("rate_limit_error"), "rate limited", new Headers())
      const { sdk } = createFakeSdk(error)

      await expect(new AnthropicClient(sdk).createStructuredMessage(buildRequest())).rejects.toBe(error)
    })

    it("JSON としては読めるが出力のスキーマに合わない応答はそのまま返し、呼び出し側の Zod で不合格になる", async () => {
      const { sdk } = createFakeSdk(buildMessage({
        content: [{
          citations: null,
          text: JSON.stringify({
            difficulty: 2,
            glossary: [],
            isSuitable: true,
            questions: [{
              choices: ["enable", "disable", "inspect"],
              correctChoiceIndex: 0,
              evidence: { blockIndex: 1, quote: "opt in to" },
              explanationJa: "有効にするの意味。",
              prompt: "The phrase \"opt in to\" is closest in meaning to",
              type: "vocabulary",
              vocabularyTarget: null,
            }],
            translations: [],
            unsuitableReason: null,
          }),
          type: "text",
        }],
      }))

      const response = await new AnthropicClient(sdk).createStructuredMessage(buildRequest())
      const result = generateQuestionsOutputSchema.safeParse(response.json)

      expect(result.success).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([
        ["questions", 0, "choices"],
        ["questions", 0, "vocabularyTarget"],
      ])
    })
  })
})

describe("createAnthropicClient", () => {
  /**
   * 実物の SDK に HTTP の偽物（fetch）を渡して、SDK のリトライの設定を確かめる。
   * レスポンスの retry-after-ms: 1 でリトライの待ち時間を 1 ミリ秒にする
   */
  const createClientWithFetch = (responses: (() => Response)[]) => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      const next = responses.shift()
      if (!next) throw new Error("unexpected request")
      return next()
    })
    return { client: createAnthropicClient({ apiKey: "test-api-key", fetch: fetchMock }), fetchMock }
  }

  describe("正常系", () => {
    it("429 は SDK がリトライし、2 回目の成功を返す", async () => {
      const { client, fetchMock } = createClientWithFetch([
        () => createJsonResponse(429, buildApiErrorBody("rate_limit_error")),
        () => createJsonResponse(200, buildMessage()),
      ])

      const response = await client.createStructuredMessage(buildRequest())

      expect(response.json).toEqual({ answer: "B" })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("Messages API に API キーと、structured output・キャッシュ指定つきの本文を送る", async () => {
      const { client, fetchMock } = createClientWithFetch([() => createJsonResponse(200, buildMessage())])

      await client.createStructuredMessage(buildRequest())

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("https://api.anthropic.com/v1/messages")
      expect(new Headers(init?.headers).get("x-api-key")).toBe("test-api-key")
      expect(JSON.parse(String(init?.body))).toEqual({
        max_tokens: 16000,
        messages: [{ content: "<passage title=\"Retries\">...</passage>", role: "user" }],
        model: GENERATION_MODEL,
        output_config: { format: { schema: JSON_SCHEMA, type: "json_schema" } },
        system: [{ cache_control: { type: "ephemeral" }, text: "You write reading-comprehension questions.", type: "text" }],
      })
    })
  })

  describe("異常系", () => {
    it("5xx が続けば最大 2 回リトライ（計 3 回）してから InternalServerError を throw する", async () => {
      const { client, fetchMock } = createClientWithFetch(
        Array.from({ length: 3 }, () => () => createJsonResponse(529, buildApiErrorBody("overloaded_error"))),
      )

      await expect(client.createStructuredMessage(buildRequest())).rejects.toThrow(InternalServerError)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it("401 はリトライせずに AuthenticationError を throw し、isFatalLlmError が true", async () => {
      const { client, fetchMock } = createClientWithFetch([
        () => createJsonResponse(401, buildApiErrorBody("authentication_error")),
      ])

      const error = await client.createStructuredMessage(buildRequest()).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AuthenticationError)
      expect(isFatalLlmError(error)).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})

describe("isFatalLlmError", () => {
  const headers = new Headers()

  it.each([
    ["AuthenticationError（キーが無効）", new AuthenticationError(401, buildApiErrorBody("authentication_error"), "invalid x-api-key", headers)],
    ["PermissionDeniedError（権限が無い）", new PermissionDeniedError(403, buildApiErrorBody("permission_error"), "forbidden", headers)],
    ["NotFoundError（モデル ID の誤り）", new NotFoundError(404, buildApiErrorBody("not_found_error"), "model not found", headers)],
    ["billing_error（クレジット不足）", new APIError(402, buildApiErrorBody("billing_error"), "billing", headers, "billing_error")],
  ])("%s は true", (_label, error) => {
    expect(isFatalLlmError(error)).toBe(true)
  })

  it.each([
    ["RateLimitError", new RateLimitError(429, buildApiErrorBody("rate_limit_error"), "rate limited", headers)],
    ["InternalServerError", new InternalServerError(500, buildApiErrorBody("api_error"), "internal", headers)],
    ["BadRequestError", new BadRequestError(400, buildApiErrorBody("invalid_request_error"), "bad request", headers)],
    ["APIConnectionError", new APIConnectionError({ message: "connection reset" })],
    ["LlmRefusalError", new LlmRefusalError("cyber")],
    ["LlmOutputTruncatedError", new LlmOutputTruncatedError("max_tokens")],
    ["Error", new Error("unexpected")],
  ])("%s は false", (_label, error) => {
    expect(isFatalLlmError(error)).toBe(false)
  })
})
