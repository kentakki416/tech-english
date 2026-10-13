import { z } from "zod"

import type { SpeechMark } from "../../lib/audio"

/**
 * Speech Marks の 1 行（https://docs.aws.amazon.com/polly/latest/dg/output.html）。start / end は UTF-8 のバイト位置
 */
const speechMarkLineSchema = z.object({
  end: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
  type: z.string(),
  value: z.string(),
})

/**
 * Speech Marks（1 行 1 つの JSON）を parse する。空行を飛ばし、word 以外（sentence など）は捨てる。壊れた行があれば throw
 */
export const parseSpeechMarks = (ndjson: string): SpeechMark[] =>
  ndjson
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line, index) => {
      let json: unknown
      try {
        json = JSON.parse(line)
      } catch (error) {
        throw new Error(`Invalid speech mark #${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const parsed = speechMarkLineSchema.safeParse(json)
      if (!parsed.success) throw new Error(`Invalid speech mark #${index + 1}: ${parsed.error.message}`)
      const { end, start, time, type, value } = parsed.data
      return type === "word" ? [{ end, start, time, value }] : []
    })
