import { z, ZodError } from "zod"

/**
 * リクエストの Zod 検証失敗を表す独自エラー
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
 */
export class ResponseSchemaMismatchError extends Error {
  constructor(public readonly zodError: ZodError) {
    super("Response schema mismatch")
    this.name = "ResponseSchemaMismatchError"
  }
}

/**
 * Controller でリクエスト（body / params / query）を検証するヘルパ
 * 失敗時は RequestSchemaMismatchError を throw する
 *
 * 入力は外部から来る未検証の値なので `unknown` を受ける。
 * 戻り値はスキーマの出力型（`z.output`）にする。`.catch()` / `.transform()` を使うスキーマは
 * 入力型と出力型が異なり、`ZodSchema<T>` で受けると T が出力型に推論されないため
 */
export const parseRequest = <Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new RequestSchemaMismatchError(result.error)
  }
  return result.data
}

/**
 * Controller でレスポンスを返す前にスキーマ検証するヘルパ
 * 失敗時は ResponseSchemaMismatchError を throw する
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
