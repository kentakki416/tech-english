import { readFileSync } from "node:fs"
import path from "node:path"

import type { PassageBlock } from "@repo/domain"

export type PassageFixture = {
  blocks: PassageBlock[]
  title: string
  wordCount: number
}

/**
 * test/fixtures/prompt/ の本文の fixture を読む（英文は自作。wordCount は countEnglishWords の値）
 */
export const readPassageFixture = (name: string): PassageFixture =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures/prompt", name), "utf8")) as PassageFixture
