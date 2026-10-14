import type { PassageBlock } from "@repo/domain"

import { POLLY_MAX_BILLED_CHARACTERS } from "../../const/audio"

import { listReadAloudBlocks } from "./read-aloud-blocks"
import { buildSpeechText } from "./speech-text"
import { splitSpeechText } from "./split-speech-text"

/**
 * 1 パートあたりの課金されるリクエストの数（音声と単語の時刻）
 */
const BILLED_REQUESTS_PER_PART = 2

/**
 * 1 問の音声を作るときに Polly で課金される文字数の見込み（月の上限の判定用）。読み上げるブロックのパートの文字数の合計 × 2（音声と単語の時刻）。
 * 文字数は UTF-16 の長さで数えるので、Polly の数え方（コードポイント）以上になり、見込みは実際より少なくならない
 */
export const estimateBilledCharacters = (blocks: PassageBlock[]): number => {
  let characters = 0
  for (const block of listReadAloudBlocks(blocks)) {
    for (const part of splitSpeechText(buildSpeechText(block.text).speechText, POLLY_MAX_BILLED_CHARACTERS)) {
      characters += part.text.length
    }
  }
  return characters * BILLED_REQUESTS_PER_PART
}

/**
 * now を含む月（UTC の暦月。AWS の請求の月）の初め
 */
export const getBillingMonthStart = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
