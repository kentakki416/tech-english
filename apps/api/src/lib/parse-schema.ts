import { z, ZodError } from "zod"

export class RequestSchemaMismatchError extends Error {
  constructor(public readonly zodError: ZodError) {
    super("Request schema mismatch")
    this.name = "RequestSchemaMismatchError"
  }
}

export class ResponseSchemaMismatchError extends Error {
  constructor(public readonly zodError: ZodError) {
    super("Response schema mismatch")
    this.name = "ResponseSchemaMismatchError"
  }
}

/**
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
 * 入力を `unknown` ではなく `z.input<Schema>` で受けて、スキーマとの不一致を実行時の 500 ではなく
 * コンパイルエラーにする。スキーマにフィールドを足すと、追従していない Controller が型エラーになる
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
