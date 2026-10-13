import { z } from "zod"

import type { PassageCursor } from "../repository"

/**
 * カーソルの JSON（キーを短くして URL を短く保つ）
 */
const cursorPayloadSchema = z.object({
  id: z.number().int().positive(),
  /**
   * publishedAt の ISO 8601（ミリ秒まで。DB の timestamp(3) と同じ精度）
   */
  pa: z.string().datetime(),
})

/**
 * JSON として読めなければ null を返す（壊れたカーソルを例外ではなく値で扱うため）
 */
const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * ユーザー向けの問題一覧のカーソルを、JSON を base64url にした文字列にする
 */
export const encodePassageCursor = (cursor: PassageCursor): string =>
  Buffer.from(JSON.stringify({ id: cursor.id, pa: cursor.publishedAt.toISOString() }), "utf8").toString("base64url")

/**
 * encodePassageCursor の逆。壊れている（base64url・JSON・形のどれかが不正）なら null（service が 400 にする）
 */
export const decodePassageCursor = (value: string): PassageCursor | null => {
  const parsed = cursorPayloadSchema.safeParse(tryParseJson(Buffer.from(value, "base64url").toString("utf8")))
  if (!parsed.success) return null
  return { id: parsed.data.id, publishedAt: new Date(parsed.data.pa) }
}
