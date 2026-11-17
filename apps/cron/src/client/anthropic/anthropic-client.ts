import { Anthropic } from "@anthropic-ai/sdk"
import type { Message, MessageCreateParamsNonStreaming, OutputConfig } from "@anthropic-ai/sdk/resources/messages"

import { LlmInvalidJsonError, LlmOutputTruncatedError, LlmRefusalError } from "./errors"

export type LlmEffort = NonNullable<OutputConfig["effort"]>

export type StructuredMessageRequest = {
  /**
   * 指定すると `thinking: { type: "adaptive" }` と `output_config.effort` を明示して送る（生成）。
   * 省略すると thinking も effort も送らずモデルの既定に任せる（検証の Claude Haiku 4.5 は adaptive thinking を 400 で拒否し、effort も受け付けない）
   */
  adaptiveThinking?: { effort: LlmEffort }
  /**
   * 出力の JSON Schema（`convertZodToStructuredOutputSchema` で Zod から作った定数）
   */
  jsonSchema: Record<string, unknown>
  /**
   * 思考（thinking）のトークンも含む出力の上限（thinking の内容が返らなくても数えられる）。足りずに止まると `LlmOutputTruncatedError`
   */
  maxTokens: number
  model: string
  /**
   * 全件共通の指示。キャッシュするので、日時や件数など毎回変わる値を入れない
   */
  system: string
  userContent: string
}

export type LlmUsage = {
  /**
   * キャッシュに書き込んだ入力トークン数（初回や 5 分以上空いたとき）
   */
  cacheCreationInputTokens: number
  /**
   * 2 回目以降も 0 なら、最小キャッシュ長未満か system に可変値が混ざっている
   */
  cacheReadInputTokens: number
  /**
   * キャッシュを使わなかった入力トークン数
   */
  inputTokens: number
  /**
   * 思考のトークンを含む出力トークン数
   */
  outputTokens: number
}

export type StructuredMessageResponse = {
  /**
   * JSON.parse しただけの値。形の検証は呼び出し側の Zod で行う（エラーの内容を再生成の指示に使うため）
   */
  json: unknown
  /**
   * レスポンスが返したモデル ID
   */
  model: string
  usage: LlmUsage
}

export interface ILlmClient {
  /**
   * SDK が throw したエラー（リトライ後の 429 / 5xx / タイムアウト、401 / 403 など）はそのまま伝播する
   */
  createStructuredMessage(request: StructuredMessageRequest): Promise<StructuredMessageResponse>
}

/**
 * AnthropicClient が使う SDK の部分。テストでは messages.create だけの偽物を渡す
 */
export type AnthropicMessagesApi = {
  messages: {
    create(params: MessageCreateParamsNonStreaming): Promise<Message>
  }
}

/**
 * SDK のリトライの回数。429 / 408 / 409 / 5xx / タイムアウト / 接続エラーを、retry-after か指数バックオフ（0.5 秒から）で待って再試行する
 */
export const ANTHROPIC_MAX_RETRIES = 2

/**
 * 1 回のリクエストのタイムアウト（ミリ秒）。非ストリーミングで max_tokens 16000 の生成が収まる長さ
 * （SDK が非ストリーミングに許す上限で、SDK 自身の見積もりでは 16000 トークンは 7.5 分）
 */
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 10 * 60 * 1000

const TRUNCATED_STOP_REASONS: ReadonlySet<string> = new Set(["max_tokens", "model_context_window_exceeded"])

/**
 * adaptive thinking のモデルは thinking ブロックも返すので text だけを見る
 */
const parseTextBlocksAsJson = (content: Message["content"]): unknown => {
  const textBlocks = content.flatMap((block) => (block.type === "text" ? [block.text] : []))
  if (textBlocks.length === 0) throw new LlmInvalidJsonError("no text block in the response")
  try {
    return JSON.parse(textBlocks.join(""))
  } catch (error) {
    throw new LlmInvalidJsonError(error instanceof Error ? error.message : String(error))
  }
}

export class AnthropicClient implements ILlmClient {
  private _sdk: AnthropicMessagesApi

  constructor(sdk: AnthropicMessagesApi) {
    this._sdk = sdk
  }

  public async createStructuredMessage(request: StructuredMessageRequest): Promise<StructuredMessageResponse> {
    const { adaptiveThinking } = request
    /**
     * temperature などのサンプリングの引数は渡さない（新しいモデルは既定以外を受け付けないものがある）
     */
    const message = await this._sdk.messages.create({
      max_tokens: request.maxTokens,
      messages: [{ content: request.userContent, role: "user" }],
      model: request.model,
      output_config: {
        ...(adaptiveThinking ? { effort: adaptiveThinking.effort } : {}),
        format: { schema: request.jsonSchema, type: "json_schema" },
      },
      /**
       * 最小キャッシュ長未満ならエラーにならずキャッシュされないだけ
       */
      system: [{ cache_control: { type: "ephemeral" }, text: request.system, type: "text" }],
      ...(adaptiveThinking ? { thinking: { type: "adaptive" } } : {}),
    })
    if (message.stop_reason === "refusal") throw new LlmRefusalError(message.stop_details?.category ?? null)
    if (message.stop_reason !== null && TRUNCATED_STOP_REASONS.has(message.stop_reason)) {
      throw new LlmOutputTruncatedError(message.stop_reason, message.usage.output_tokens)
    }
    return {
      json: parseTextBlocksAsJson(message.content),
      model: message.model,
      usage: {
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    }
  }
}

export type CreateAnthropicClientOptions = {
  apiKey: string
  /**
   * テストで差し替える（HTTP の偽物でリトライを確かめる）。既定はグローバルの fetch
   */
  fetch?: typeof fetch
}

export const createAnthropicClient = (options: CreateAnthropicClientOptions): AnthropicClient =>
  new AnthropicClient(
    new Anthropic({
      apiKey: options.apiKey,
      fetch: options.fetch,
      maxRetries: ANTHROPIC_MAX_RETRIES,
      timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
    }),
  )
