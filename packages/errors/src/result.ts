/**
 * 業務エラーの詳細の 1 項目（どの入力・どの条件が原因か）
 */
export type ApiErrorDetail = {
  /**
   * 原因の種類を識別するコード（例: "evidence_not_found"）
   */
  code: string
  /**
   * 利用者向けの説明
   */
  message: string
  /**
   * 原因の場所（例: ["questions", 1, "evidence"]）。全体に関わるものは空配列
   */
  path: (number | string)[]
}

/**
 * サービス層が呼び出し元に返す「業務エラー」の型
 * 例外 (throw) ではなく、戻り値として返すことで呼び出し側が型安全に扱える
 */
export type ApiError = {
  /**
   * 原因の詳細。無ければ省略する
   */
  details?: ApiErrorDetail[]
  /**
   * HTTP ステータスコード（4xx 系）
   */
  statusCode: number
  type: ApiErrorType
  /**
   * ユーザー向けのエラーメッセージ
   */
  message: string
}

export type ApiErrorType =
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNAUTHORIZED"

/**
 * `ok: false` で返すのは業務エラーだけ。DB 障害などの予期しないエラーは例外として throw する
 */
export type Result<T> =
  | { ok: true; value: T }
  | { error: ApiError; ok: false }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

export const err = <T = never>(error: ApiError): Result<T> => ({ error, ok: false })

/**
 * details を渡すとレスポンスにも含める（渡さなければキー自体を持たない）
 */
export const badRequestError = (message: string, details?: ApiErrorDetail[]): ApiError => ({
  ...(details === undefined ? {} : { details }),
  message,
  statusCode: 400,
  type: "BAD_REQUEST",
})

export const notFoundError = (message: string): ApiError => ({
  message,
  statusCode: 404,
  type: "NOT_FOUND",
})

export const conflictError = (message: string): ApiError => ({
  message,
  statusCode: 409,
  type: "CONFLICT",
})

export const unauthorizedError = (message: string): ApiError => ({
  message,
  statusCode: 401,
  type: "UNAUTHORIZED",
})

export const forbiddenError = (message: string): ApiError => ({
  message,
  statusCode: 403,
  type: "FORBIDDEN",
})
