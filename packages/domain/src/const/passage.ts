/**
 * 本文候補 / 問題の状態
 *
 * - collected: 本文だけがある。生成待ち
 * - generating: 生成タスクが処理中
 * - draft: 生成済み。管理者の確認待ち
 * - published: ユーザーが解ける
 * - rejected: 題材に不向き（LLM または管理者が判断）
 * - failed: 生成が 3 回失敗した
 */
export const PASSAGE_STATUSES = ["collected", "generating", "draft", "published", "rejected", "failed"] as const

/**
 * 難易度（1: Easy / 2: Normal / 3: Hard）
 */
export const PASSAGE_DIFFICULTIES = [1, 2, 3] as const

/**
 * 本文のブロックの種別
 */
export const PASSAGE_BLOCK_TYPES = ["heading", "paragraph", "list_item", "code", "quote"] as const

/**
 * 難易度ごとの想定の読む速さ（WPM）。「日本人の中級者が技術文書を精読する速さ」として仮置きした値
 */
export const READING_WPM_BY_DIFFICULTY = { 1: 100, 2: 120, 3: 140 } as const

/**
 * 制限時間に足す 1 問あたりの解答時間（秒）
 */
export const SECONDS_PER_QUESTION = 40

/**
 * 制限時間を切り上げる単位（秒）
 */
export const TIME_LIMIT_ROUNDING_SECONDS = 30
