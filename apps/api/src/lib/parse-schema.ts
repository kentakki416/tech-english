import { z, ZodError, ZodSchema } from "zod"

/**
 * リクエストの Zod 検証失敗を表す独自エラー
 * グローバルエラーハンドラはこれを 400 として扱う
 */
export class RequestSchemaMismatchError extends Error {
  constructor(public readonly zodError: ZodError) {
    super("Request schema mismatch")
    this.name = "RequestSchemaMismatchError"
  }
}

/**
 * レスポンスの Zod 検証失敗を表す独自エラー
 * リクエスト検証エラーと区別するためにラップする
 * グローバルエラーハンドラはこれを 500 として扱う（サーバ起因の契約違反）
 */
export class ResponseSchemaMismatchError extends Error {
  constructor(public readonly zodError: ZodError) {
    super("Response schema mismatch")
    this.name = "ResponseSchemaMismatchError"
  }
}

/**
 * Controller でリクエスト（body / params / query）を検証するヘルパ
 * 失敗時は RequestSchemaMismatchError を throw し、グローバルエラーハンドラ経由で 400 を返す
 *
 * 入力は外部から来る未検証の値なので `unknown` を受ける
 */
export const parseRequest = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new RequestSchemaMismatchError(result.error)
  }
  return result.data
}

/**
 * Controller でレスポンスを返す前にスキーマ検証するヘルパ
 * 失敗時は ResponseSchemaMismatchError を throw し、グローバルエラーハンドラ経由で 500 を返す
 *
 * 入力を `unknown` ではなく `z.input<Schema>` で受けることで、スキーマとの不一致を
 * 実行時 500 ではなくコンパイルエラーとして検出する。スキーマにフィールドを追加したら
 * 追従していない Controller が型エラーになる
 */
export const parseResponse = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: z.input<Schema>,
): z.output<Schema> => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ResponseSchemaMismatchError(result.error)
  }
  return result.data
}
