/**
 * 挑戦の状態
 *
 * - in_progress: 解答中。1 ユーザー × 1 問題につき最大 1 つ
 * - submitted: 提出済み。採点結果と時間がある
 * - expired: 開始から ATTEMPT_EXPIRY_SECONDS が過ぎた in_progress
 */
export const ATTEMPT_STATUSES = ["in_progress", "submitted", "expired"] as const

/**
 * 調べた単語の出どころ
 *
 * - glossary: 用語集（文脈での意味）
 * - dictionary: 英和辞書
 */
export const WORD_LOOKUP_SOURCES = ["glossary", "dictionary"] as const

/**
 * 挑戦の有効期限（開始からの秒数）。これを過ぎた in_progress は expired にする
 */
export const ATTEMPT_EXPIRY_SECONDS = 24 * 60 * 60
