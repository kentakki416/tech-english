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
 * 出力が `max_tokens`（またはコンテキストの上限）で途中で切れた。JSON として完結していないので、検証の不合格と同じ扱いにする
 */
export class LlmOutputTruncatedError extends Error {
  public readonly stopReason: string

  constructor(stopReason: string) {
    super(`LLM output was truncated (stop_reason: ${stopReason})`)
    this.name = "LlmOutputTruncatedError"
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
