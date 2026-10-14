# step4-cron-document-parser

Markdown / HTML を mdast → `PassageBlock[]` にし、本文候補に切り分ける純関数を `apps/cron/src/lib/document/` に作る。DB も外部 API も使わない。仕様は [README の本文候補の条件](../README.md#本文候補の条件)・[本文の抽出と解析](../README.md#本文の抽出と解析)・[本文候補への切り分け](../README.md#本文候補への切り分け)・[重複の排除](../README.md#重複の排除)。

## 前提

- [step1-db-content-sources](./step1-db-content-sources.md)（`@repo/domain` の `PassageBlock`）
- [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md)（実装の順番。コードの依存は step1 だけ）
- step2・step3 とは独立に進められる

## 対応内容

### 1. パッケージと build の設定

```bash
pnpm --filter cron add @repo/domain unified remark-parse remark-frontmatter remark-gfm remark-mdx rehype-parse rehype-remark jsdom @mozilla/readability yaml
pnpm --filter cron add -D @types/jsdom @types/mdast
```

- unified / remark / rehype は ESM のみで配布されている。cron は CommonJS で build するので、`apps/cron/tsconfig.json` の `compilerOptions` に `"module": "nodenext"` と `"moduleResolution": "nodenext"` を足す（TypeScript 5.8 以降は nodenext で ESM の `require` を許す）
- 実行時は Node の `require(esm)`（20.19 以上 / 22.12 以上で既定で有効）を使う。`apps/cron/Dockerfile` の `node:20-slim`（base と runner の 2 か所）を `node:22-slim` に上げる

### 2. ファイル構成と型

| ファイル | 中身 |
| --- | --- |
| `const.ts` | `PASSAGE_MIN_WORDS = 200` / `PASSAGE_MAX_WORDS = 600` / `MAX_CODE_LINE_RATIO = 0.4` / `MIN_ENGLISH_LETTER_RATIO = 0.9` / `MIN_PROSE_WORD_RATIO = 0.5` / `PROSE_CHARS_PER_LINE = 80` |
| `parse-markdown.ts` | `parseMarkdown(source, { isMdx })` → `{ root, title }` |
| `parse-html.ts` | `parseHtml(html, { contentSelector, excludeSelectors, url })` → `{ links, root, title }` |
| `convert-mdast-to-blocks.ts` | `convertMdastToBlocks(root)` → `DocumentBlock[]` |
| `passage-rules.ts` | `countEnglishWords` / `calculateCodeLineRatio` / `calculateEnglishLetterRatio` / `calculateProseWordRatio` / `findRejectReasons` |
| `split-into-chunks.ts` | `splitIntoChunks(blocks, documentTitle)` → `PassageChunk[]` |
| `content-hash.ts` | `calculateContentHash(blocks)` |
| `extract-document.ts` | `extractDocument(input)`：上をつなぐ入口。step5 / step6 はこれだけを呼ぶ |
| `index.ts` | `extractDocument` と型だけを re-export |

```ts
/** 見出しの深さを持つブロック。切り分けにだけ使い、保存する前に PassageBlock に戻す */
export type DocumentBlock = PassageBlock & { headingDepth?: number }

export type ChunkRejectReason = "not_english" | "not_prose" | "too_long" | "too_much_code" | "too_short"

export type PassageChunk = {
  blocks: PassageBlock[]
  contentHash: string
  /** 空なら本文候補 */
  rejectReasons: ChunkRejectReason[]
  title: string
  wordCount: number
}

export type ExtractDocumentInput =
  | { content: string; fallbackTitle: string; format: "markdown" | "mdx" }
  | { content: string; contentSelector: string | null; excludeSelectors: string[]; fallbackTitle: string; format: "html"; url: string }

export type ExtractedDocument = {
  candidates: PassageChunk[]
  /** 条件を満たさなかった塊も含む（試し実行の表示用） */
  chunks: PassageChunk[]
  /** 文書全体のブロックのハッシュ。source_documents.content_hash に入れる */
  contentHash: string
  /** HTML のみ。ページ内の a[href] を絶対 URL にしたもの（step6 のリンクの発見用）。Markdown は [] */
  links: string[]
  title: string
  wordCount: number
}
```

### 3. Markdown → mdast

```ts
export const parseMarkdown = (source: string, options: { isMdx: boolean }): { root: Root; title: string | null } => {
  const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml", "toml"]).use(remarkGfm)
  if (options.isMdx) processor.use(remarkMdx)
  const root = processor.parse(source)
  return { root, title: findFrontmatterTitle(root) ?? findFirstHeadingText(root, 1) }
}
```

- `findFrontmatterTitle`：`yaml` ノードを `yaml` パッケージで parse し、`title` が文字列なら返す。YAML が壊れていれば null（throw しない）
- `.mdx` の構文エラーは `remark-mdx` が throw する。ここでは握りつぶさず、step5 / step6 が文書単位の失敗として扱う

### 4. HTML → mdast

```ts
const REMOVED_SELECTORS = ["nav", "header", "footer", "aside", "script", "style", "button", "[aria-hidden=\"true\"]"]

export const parseHtml = (html: string, options: { contentSelector: string | null; excludeSelectors: string[]; url: string }) => {
  /** jsdom は既定でスクリプトを実行せず外部リソースも読まない。runScripts / resources は指定しない */
  const { document } = new JSDOM(html, { url: options.url }).window
  const title = document.title.trim() || document.querySelector("h1")?.textContent?.trim() || null
  /** Readability が DOM を書き換えるので、リンクは先に元の DOM から取る */
  const links = extractLinks(document)
  const contentHtml = options.contentSelector
    ? selectContentHtml(document, options.contentSelector, options.excludeSelectors)
    : extractContentHtmlWithReadability(document, options.excludeSelectors)
  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeRemark)
  const root = processor.runSync(processor.parse(contentHtml ?? "")) as Root
  return { links, root, title }
}
```

- `selectContentHtml`：`document.querySelector(selector)` が無ければ null（本文 0 語になり、試し実行で気付ける）。あれば `[...REMOVED_SELECTORS, ...excludeSelectors]` に合う子孫を `remove()` して `innerHTML` を返す
- `extractContentHtmlWithReadability`：`document.cloneNode(true)` から同じ要素を取り除き、`new Readability(clone, { keepClasses: true }).parse()?.content ?? null`（Readability は既定で `class` を消し、`<code class="language-go">` の lang が取れなくなるため）
- `extractLinks`：`a[href]` の `href`（jsdom が `url` を基準に絶対 URL にする）のうち `http:` / `https:` だけ。重複を除く
- 不正な CSS セレクタは jsdom が throw する（文書単位の失敗）
- `<pre><code class="language-go">` は `rehype-remark` が `lang: "go"` の `code` にする

### 5. mdast → `DocumentBlock[]`

| mdast | 変換 |
| --- | --- |
| `heading` | `{ headingDepth: depth, text, type: "heading" }` |
| `paragraph` | `paragraph`。テキストが空（画像だけ等）なら捨てる |
| `list` → `listItem` | 子の paragraph をつないで 1 つの `list_item`。入れ子の `list` は続けて `list_item` として並べる（1 段に平坦化）。中の `code` は `code` ブロック |
| `code` | `{ lang?, text: value, type: "code" }`。`lang` が null なら key ごと付けない。空なら捨てる |
| `blockquote` | 子の paragraph をつないで 1 つの `quote`。先頭の `[!NOTE]` 等の GitHub の注記マーカーは消す。paragraph 以外の子は再帰で変換 |
| それ以外（`table` / `image` / `html` / `thematicBreak` / `yaml` / `toml` / `definition` / `footnoteDefinition` / `mdxJsxFlowElement` / `mdxjsEsm` / `mdxFlowExpression`） | 捨てる（`default` で空配列） |

インラインの変換（`convertInlineToText`）：`text` はそのまま、`inlineCode` は `` `value` ``、`break` は空白、`image` / `imageReference` / `html` / `footnoteReference` / `mdxTextExpression` は空、それ以外（`emphasis` / `strong` / `delete` / `link` / `linkReference` / `mdxJsxTextElement`）は子を再帰（link の URL は捨てる）。

コード以外のテキストは、空白の連続を 1 つにしてから、Hugo のショートコード（Kubernetes のドキュメントに残る）を処理して trim する。用語のツールチップ `{{< glossary_tooltip text="nodes" term_id="node" >}}` は文の一部なので `text` の値（無ければ `term_id`）に置き換え、それ以外のショートコード（`/\{\{[<%].*?[%>]\}\}/g`。`{{< note >}}` など）は消す。コードは `value` をそのまま（末尾の改行だけ除く）。

### 6. 切り分け

```ts
export const splitIntoChunks = (blocks: DocumentBlock[], documentTitle: string): PassageChunk[] => {
  const sections = groupIntoSections(blocks)
  const units = sections.flatMap(splitLongSection)
  return mergeShortUnits(units).map((unit) => buildChunk(unit, documentTitle))
}
```

1. `groupIntoSections`：`headingDepth <= 3` の見出しの前で区切る（h1 は文書タイトルのことが多いが区切りとして扱う。h4 以下では区切らない）。最初の見出しより前のブロックも 1 つの節。節は `{ blocks, sectionTitle }`（`sectionTitle` は先頭の見出しのテキスト、無ければ null）
2. `splitLongSection`：600 語を超える節は、ブロックを前から足して 600 語を超える手前で分ける。分けた後ろの塊も同じ `sectionTitle` を持つ。1 ブロックで 600 語を超えるものはそのまま（`too_long` で捨てられる）
3. `mergeShortUnits`：前から順に、**今の塊が 200 語未満で、次の塊を足しても 600 語以下なら結合する**。それ以外は今の塊を確定して次へ
4. `buildChunk`：`title` は塊の中の最初の `heading` のテキスト → `sectionTitle` → `documentTitle` の順。`blocks` は `headingDepth` を落とした `PassageBlock`、`contentHash` と `wordCount` と `rejectReasons` を付ける

### 7. 本文候補の判定（`passage-rules.ts`）

| 関数 | 定義 |
| --- | --- |
| `countEnglishWords(blocks)` | `code` 以外のブロックからインラインコード（`` /`[^`]*`/g ``）を除き、空白で区切ったうち英字か数字を 1 つ以上含むトークンの数 |
| `calculateCodeLineRatio(blocks)` | コードの行数 ÷（コードの行数 + 文章の行数）。コードは `text.split("\n").length`、文章は `Math.ceil(text.length / PROSE_CHARS_PER_LINE)`（段落は 1 行で書かれることが多く、Markdown の行数では比べられないため） |
| `calculateEnglishLetterRatio(blocks)` | `code` 以外・インラインコード除外のテキストで、文字（`\p{L}`）に占める ASCII 英字の割合。文字が 0 なら 0 |
| `calculateProseWordRatio(blocks)` | `paragraph` と `quote` の英単語数 ÷ 全体の英単語数（箇条書き・リンク集だけの塊を除くため） |
| `findRejectReasons(blocks)` | 200 未満 `too_short`、600 超 `too_long`、コード 0.4 超 `too_much_code`、英字 0.9 未満 `not_english`、文章 0.5 未満 `not_prose`（境界値はすべて通す側） |

### 8. content_hash

```ts
export const calculateContentHash = (blocks: PassageBlock[]): string => {
  const normalized = blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim().toLowerCase()
  return createHash("sha256").update(normalized).digest("hex")
}
```

塊の `contentHash` は `passages.content_hash`、文書全体の `contentHash` は `source_documents.content_hash`（step6 の内容の比較）に使う。

## 動作確認

```bash
pnpm --filter cron test
pnpm --filter cron build && (cd apps/cron && node -e "require('./dist/lib/document')")   # require(esm) で読めること
pnpm lint:fix
```

fixture は `apps/cron/test/fixtures/document/` に置く。**英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）。

| fixture | 確かめること |
| --- | --- |
| `guide.mdx` | frontmatter の title、`import` 文・`<Sandpack>`・表・画像が消える、`lang` つきのコード、入れ子のリスト |
| `book.md` | frontmatter 無し → 最初の h1 がタイトル、h2 / h3 / h4 の節 |
| `go-doc.html` | `main article` の指定、`nav` / `.feedback` / `[aria-hidden]` の除去、`language-go` のコード、相対リンク |
| `article-no-selector.html` | Readability で本文だけが取れる、`language-sh` のコードが `lang` つきになる（`keepClasses`） |
| `js-rendered.html` | 本文が空で `<script>` だけ → 英単語数 0。script は実行されない |

テストは `apps/cron/test/lib/document/*.test.ts`。切り分けと判定は、N 語の段落を作るヘルパでブロックを組み立てて境界値を作る。

- 正常系
  - [ ] `parseMarkdown` / `parseHtml` + `convertMdastToBlocks` が上表の fixture で期待どおりのブロック列（`toEqual`）になる
  - [ ] インラインコードはバッククォートつきで残り、リンクはテキストだけ、Hugo のショートコードと `[!NOTE]` は消える。`glossary_tooltip` は `text`（無ければ `term_id`）の語に置き換わる（引数の順序・改行によらない）
  - [ ] `parseHtml` の `links` が絶対 URL になり、`mailto:` / `javascript:` を含まない
  - [ ] `countEnglishWords` がコードブロック・インラインコード・記号だけのトークンを数えない
  - [ ] 切り分け：h2 / h3 で区切り h4 では区切らない。150 語 + 100 語は 1 塊、250 語 + 100 語は 2 塊、150 語 + 500 語は 2 塊（前者は `too_short`）
  - [ ] 700 語の節が 600 語以下の塊に分かれ、後ろの塊のタイトルが節の見出しになる
  - [ ] 境界値：200 語・600 語・コード 40%・英字 90%・文章 50% は本文候補になる
  - [ ] `calculateContentHash` は空白の違い・大文字小文字の違いで同じ値、本文が違えば別の値
  - [ ] `extractDocument` を同じ入力で 2 回呼ぶと `contentHash` と `chunks` が同じ（冪等の前提）
- 異常系
  - [ ] 199 語は `too_short`、601 語（1 段落）は `too_long`、日本語の文書は `not_english`、リンク集のリストだけの塊は `not_prose`、コード主体は `too_much_code`
  - [ ] `contentSelector` に合う要素が無いと `chunks` が空で `wordCount = 0`
  - [ ] 壊れた `.mdx` は throw する。壊れた YAML の frontmatter は throw せず h1 をタイトルにする
