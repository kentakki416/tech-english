import { createHash } from "node:crypto"

import type { PassageBlock } from "@repo/domain"

/**
 * 本文の正規化テキスト（空白の連続を 1 つにし、小文字化したもの）の SHA-256。
 * 塊のハッシュは passages.content_hash（重複の排除）、文書全体のハッシュは source_documents.content_hash（内容の比較）に使う
 */
export const calculateContentHash = (blocks: PassageBlock[]): string => {
  const normalized = blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim().toLowerCase()
  return createHash("sha256").update(normalized).digest("hex")
}
