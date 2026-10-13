import type { PassageBlock } from "@repo/domain"

import { buildSpeechText } from "./speech-text"

/**
 * 読み上げるブロック。code のブロックと、読み上げ用テキストが空白だけのブロック（バッククォートだけなど）を除き、元の blockIndex を保つ
 */
export const listReadAloudBlocks = (blocks: PassageBlock[]): { blockIndex: number; text: string }[] =>
  blocks.flatMap((block, blockIndex) => {
    if (block.type === "code") return []
    if (buildSpeechText(block.text).speechText.trim() === "") return []
    return [{ blockIndex, text: block.text }]
  })
