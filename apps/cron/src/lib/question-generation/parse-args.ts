import { parseArgs } from "node:util"

import { z } from "zod"

export type GenerateQuestionsArgs = {
  /**
   * 指定があればその 1 件だけを生成する（下書きの上限を見ない）。無ければ collected を古い順に
   */
  passageId?: number
}

/**
 * passages.id は serial（int4）なので、その上限を超える値は DB に渡す前に弾く
 */
const MAX_PASSAGE_ID = 2_147_483_647

/**
 * 符号・小数点・指数・16 進などを Number に通す前に弾き、正の整数だけを受け付ける
 */
const passageIdSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(MAX_PASSAGE_ID))

/**
 * generate:questions の引数（`--passage-id=42`）を読む。未知のフラグ・位置引数・正の整数でない passage-id は throw する
 */
export const parseGenerateQuestionsArgs = (argv: string[]): GenerateQuestionsArgs => {
  const { values } = parseArgs({
    allowPositionals: false,
    args: argv,
    options: {
      "passage-id": { type: "string" },
    },
    strict: true,
  })
  const rawPassageId = values["passage-id"]
  if (rawPassageId === undefined) return {}
  const parsed = passageIdSchema.safeParse(rawPassageId)
  if (!parsed.success) throw new Error(`--passage-id must be a positive integer: ${rawPassageId}`)
  return { passageId: parsed.data }
}
