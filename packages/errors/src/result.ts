/**
 * 業務エラーの詳細の 1 項目（どの入力・どの条件が原因か）。admin の公開の条件の検査などで、
 * 複数の原因をまとめて返すときに使う
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
  /**
   * エラーの種類を識別するタグ（ログ・分岐用）
   */
  type: ApiErrorType
  /**
   * ユーザー向けのエラーメッセージ
   */
  message: string
}

/**
 * 業務エラーのタグ一覧
 */
export type ApiErrorType =
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNAUTHORIZED"

/**
 * サービス層の戻り値の型
 * 成功時は ok: true で value を返す
 * 業務エラー時は ok: false で error を返す
 * DB 障害などの予期しないエラーは例外として throw する
 */
export type Result<T> =
  | { ok: true; value: T }
  | { error: ApiError; ok: false }

/**
 * 成功の Result を生成する
 */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

/**
 * 業務エラーの Result を生成する
 */
export const err = <T = never>(error: ApiError): Result<T> => ({ error, ok: false })

/**
 * 400 Bad Request のエラーを生成する。details を渡すとレスポンスにも含める（渡さなければキー自体を持たない）
 */
export const badRequestError = (message: string, details?: ApiErrorDetail[]): ApiError => ({
  ...(details === undefined ? {} : { details }),
  message,
  statusCode: 400,
  type: "BAD_REQUEST",
})

/**
 * 404 Not Found のエラーを生成する
 */
export const notFoundError = (message: string): ApiError => ({
  message,
  statusCode: 404,
  type: "NOT_FOUND",
})

/**
 * 409 Conflict のエラーを生成する
 */
export const conflictError = (message: string): ApiError => ({
  message,
  statusCode: 409,
  type: "CONFLICT",
})

/**
 * 401 Unauthorized のエラーを生成する
 */
export const unauthorizedError = (message: string): ApiError => ({
  message,
  statusCode: 401,
  type: "UNAUTHORIZED",
})

/**
 * 403 Forbidden のエラーを生成する
 */
export const forbiddenError = (message: string): ApiError => ({
  message,
  statusCode: 403,
  type: "FORBIDDEN",
})
