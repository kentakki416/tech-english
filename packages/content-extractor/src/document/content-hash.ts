import { createHash } from "node:crypto"

import type { PassageBlock } from "@repo/domain"

/**
 * 本文の正規化テキスト（空白の連続を 1 つにし、小文字化したもの）の SHA-256。
 */
export const calculateContentHash = (blocks: PassageBlock[]): string => {
  const normalized = blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim().toLowerCase()
  return createHash("sha256").update(normalized).digest("hex")
}
