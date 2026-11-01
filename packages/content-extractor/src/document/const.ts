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
 * 英単語数に占める段落・引用・MIN_PROSE_LIST_ITEM_WORDS 語以上の箇条書きの項目の英単語数の割合の下限（この値ちょうどは本文候補になる）
 */
export const MIN_PROSE_WORD_RATIO = 0.5

/**
 * 箇条書きの項目を文章に数える英単語数の下限（この値ちょうどは数える）。項目ごとに判定する。
 * 数文の項目が並ぶ節を本文候補にし、目次・リンク集の数語の項目（react.dev の learn で中央値 9 語）は数えない
 */
export const MIN_PROSE_LIST_ITEM_WORDS = 12

/**
 * 文章の 1 行とみなす文字数。段落は 1 行で書かれることが多く、Markdown の行数ではコードと比べられないため
 */
export const PROSE_CHARS_PER_LINE = 80

/**
 * 節の区切りにする見出しの深さの上限。h1〜h3 で区切り、h4 以下では区切らない
 */
export const SECTION_HEADING_MAX_DEPTH = 3

/**
 * 中身を本文として残す MDX / JSX のコンポーネント（文章を包むもの。react.dev の `<Intro>` / `<Note>` など）。タグだけ除いて中の文章を残す。
 * ここに無いコンポーネント（`<Sandpack>` / `<Diagram>` / `<Illustration>` / `<Challenges>` のようにコード・図・演習を包むもの）は中身ごと捨てる。
 * `<YouWillLearn>`（ページの目次）・`<Recap>`（ページ全体のまとめ）も捨てる。見出しが無いので隣の節の本文候補にくっつき、節の話題と混ざるため。
 * `.mdx` の JSX と、`.md` の HTML ブロックで書かれたコンポーネントの両方に使う
 */
export const PROSE_COMPONENT_NAMES: ReadonlySet<string> = new Set([
  "DeepDive",
  "Intro",
  "Note",
  "Pitfall",
])

/**
 * 抽出の版。`source_documents.extraction_version` と、GitHub のソースの `last_collected_extraction_version` に記録する。
 * src/document の変更のうち、ブロック・切り分け・本文候補の条件が変わるものをしたら上げる（実装した日の日付）。
 * 上げると、取得済みの文書を次の収集で切り分け直す（URL から追加で取り込んだサイトのページは、取り込み直したとき）
 */
export const EXTRACTION_VERSION = "2026-10-30.5"
