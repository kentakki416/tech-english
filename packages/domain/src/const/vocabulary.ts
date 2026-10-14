/**
 * 単語帳の答え
 *
 * - remembered: 覚えた
 * - forgot: まだ
 */
export const VOCABULARY_GRADES = ["remembered", "forgot"] as const

/**
 * 答えた後の段階ごとの、次に出すまでの日数（添字が段階）。
 * 0 = まだ → 翌日、1 → 3 日後、2 → 7 日後、3 → 30 日後。段階 4（覚えた単語）はもう出さないので無い
 */
export const VOCABULARY_REVIEW_INTERVAL_DAYS = [1, 3, 7, 30] as const

/**
 * 覚えた単語の段階。この段階のカードは出題しない
 */
export const VOCABULARY_MASTERED_STAGE = 4

/**
 * 1 回の最大枚数
 */
export const VOCABULARY_SESSION_SIZE = 10

/**
 * 1 枚の見ていた秒数の上限。これを超えた申告は切り詰める
 */
export const VOCABULARY_MAX_CARD_SECONDS = 60
