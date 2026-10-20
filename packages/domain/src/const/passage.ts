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

/**
 * 塊を本文候補にしない理由
 *
 * - not_english: 英語でない
 * - not_prose: 文章でない（箇条書き・リンク集が主体）
 * - too_long: 長すぎる
 * - too_much_code: コードが多い
 * - too_short: 短すぎる
 */
export const CHUNK_REJECT_REASONS = ["not_english", "not_prose", "too_long", "too_much_code", "too_short"] as const

/**
 * 切り分け直した文書の collected のうち、新しい本文候補に無いものを却下するときの理由（admin の「却下」に出る）
 */
export const SUPERSEDED_PASSAGE_REJECT_REASON = "切り分け直したため、前の切り分けの本文候補を外した"
