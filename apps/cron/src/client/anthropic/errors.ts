import { APIError, AuthenticationError, NotFoundError, PermissionDeniedError } from "@anthropic-ai/sdk"

/**
 * モデルが応答を拒否した（`stop_reason: "refusal"`）。サーバー側のフォールバック（beta）は使わず、1 件の失敗として扱う
 */
export class LlmRefusalError extends Error {
  /**
   * `stop_details.category`（`cyber` / `bio` など）。分類できない拒否は null
   */
  public readonly category: string | null

  constructor(category: string | null) {
    super(`LLM refused the request (category: ${category ?? "none"})`)
    this.name = "LlmRefusalError"
    this.category = category
  }
}

/**
 * 出力が `max_tokens`（またはコンテキストの上限）で途中で切れた。思考（thinking）のトークンも `max_tokens` に含まれるので、
 * 思考が長引くと JSON を書き終える前に切れる。text が JSON として読めても完結していないので使わない。
 * 生成では一時的な失敗として次の実行に回す（同じ上限ですぐに作り直しても切れやすく、費用だけが増えるため）
 */
export class LlmOutputTruncatedError extends Error {
  /**
   * 応答の `usage.output_tokens`（思考のトークンを含む出力トークン数）
   */
  public readonly outputTokens: number
  public readonly stopReason: string

  constructor(stopReason: string, outputTokens: number) {
    super(`LLM output was truncated at the output limit (stop_reason: ${stopReason}, output_tokens: ${outputTokens})`)
    this.name = "LlmOutputTruncatedError"
    this.outputTokens = outputTokens
    this.stopReason = stopReason
  }
}

/**
 * 応答に text ブロックが無い、または text が JSON として読めない
 */
export class LlmInvalidJsonError extends Error {
  constructor(reason: string) {
    super(`LLM output is not valid JSON: ${reason}`)
    this.name = "LlmInvalidJsonError"
  }
}

/**
 * 再試行しても直らない設定の誤りか。true ならタスク全体を止める（全件の失敗回数を無駄に増やさない）。
 *
 * - キーが無効（401）・権限が無い（403）
 * - モデル ID が存在しない（404。`GENERATION_MODEL` / `VERIFICATION_MODEL` の誤り）
 * - クレジットが足りない（`billing_error`）
 *
 * 429 / 5xx / タイムアウト / 接続エラーは SDK がリトライした後でも一時的な失敗として扱う（false）
 */
export const isFatalLlmError = (error: unknown): boolean =>
  error instanceof AuthenticationError ||
  error instanceof PermissionDeniedError ||
  error instanceof NotFoundError ||
  (error instanceof APIError && error.type === "billing_error")
