/**
 * 本文候補の英単語数の下限（この値ちょうどは本文候補になる）
 */
export const PASSAGE_MIN_WORDS = 200

/**
 * 本文候補の英単語数の上限（この値ちょうどは本文候補になる）
 */
export const PASSAGE_MAX_WORDS = 600

/**
 * コードの行数の割合の上限（この値ちょうどは本文候補になる）
 */
export const MAX_CODE_LINE_RATIO = 0.4

/**
 * 文字に占める ASCII 英字の割合の下限（この値ちょうどは本文候補になる）
 */
export const MIN_ENGLISH_LETTER_RATIO = 0.9

/**
 * 英単語数に占める段落・引用の英単語数の割合の下限（この値ちょうどは本文候補になる）
 */
export const MIN_PROSE_WORD_RATIO = 0.5

/**
 * 文章の 1 行とみなす文字数。段落は 1 行で書かれることが多く、Markdown の行数ではコードと比べられないため
 */
export const PROSE_CHARS_PER_LINE = 80

/**
 * 節の区切りにする見出しの深さの上限。h1〜h3 で区切り、h4 以下では区切らない
 */
export const SECTION_HEADING_MAX_DEPTH = 3
