# packages/content-extractor（`@repo/content-extractor`）

Markdown / MDX / HTML から本文を抽出して本文候補に切り分ける処理と、サイトのページを礼儀正しく安全に取得する処理。本文の抽出は cron の収集（`collect:passages`。GitHub の Markdown）と api の URL からの取り込み（[url-import](../../docs/spec/url-import/README.md)。サイトの HTML）で共有し、サイトの取得は api の URL からの取り込みだけが使う（cron はサイトを収集しない。[github-only-collection](../../docs/spec/github-only-collection/README.md)）。env も DB も知らない（設定はコンストラクタ・引数で受け取る）。

規則の正本は [content-collection](../../docs/spec/content-collection/README.md#本文の抽出と解析)。

## ファイル

### `src/document/`（文書パーサー）

外から呼ぶのは `extractDocument` だけ（`src/document/index.ts`）。

| ファイル | 役割 |
| --- | --- |
| `parse-markdown.ts` | unified + remark-parse / frontmatter / gfm（`.mdx` は remark-mdx）で mdast に。タイトルは frontmatter の `title` → 最初の h1 |
| `markdown-jsx.ts` | `.md` に混ざった MDX の書き方の処理（react.dev の `.md` など）。MDX のコメント（`{/* ... */}`。見出しのアンカーなど）をコード・インラインコードの外で消し、HTML ブロックで書かれたコンポーネントの開始タグから終了タグまでを `mdxJsxFlowElement` にまとめる（HTML ブロックの中の Markdown は読み直す。自己終了のタグは中身の無い `mdxJsxFlowElement` にする） |
| `parse-html.ts` | jsdom（スクリプトは実行しない）で DOM に → 本文の CSS セレクタ or Readability で本文を取り出す → rehype-remark で mdast に |
| `convert-mdast-to-blocks.ts` | mdast → `PassageBlock[]`（見出しの深さつき）。JSX のコンポーネントは `const.ts` の `PROSE_COMPONENT_NAMES`（`<Intro>` / `<Note>` / `<Pitfall>` / `<DeepDive>`）だけタグを除いて中身を残し、それ以外（`<Sandpack>` / `<Diagram>` / `<Challenges>` / `<YouWillLearn>` / `<Recap>` など）は中身ごと捨てる。続き（コンポーネント・表・HTML・画像）を捨てて「:」で終わる段落は、末尾を「.」にする。`.mdx` と `.md` で同じ規則 |
| `split-into-chunks.ts` / `passage-rules.ts` | 見出し単位の切り分けと結合（分けた節の 2 つめ以降の塊は、見出しが無ければタイトルに「 (2)」のような番号を付ける）、本文候補の条件（英単語数・コードの割合・英語・文章。文章には段落・引用と `MIN_PROSE_LIST_ITEM_WORDS` 語以上の箇条書きの項目を数える） |
| `content-hash.ts` | 正規化テキストの SHA-256（`passages.content_hash` / `source_documents.content_hash`） |

壊れた MDX と不正な CSS セレクタは throw する。呼び出し側（task / service）が文書単位の失敗として扱う。`.md` は素の Markdown として読むので、閉じられていないコンポーネントは throw せず、タグだけ無かったことにして中身を残す。

- **抽出の版（`EXTRACTION_VERSION`、`src/document/const.ts`）**：`src/document` の変更のうち、ブロック・切り分け・本文候補の条件が変わるものをしたら上げる（実装した日の日付）。上げると、取得済みの文書を次の収集で切り分け直す（[passage-extraction-tuning](../../docs/spec/passage-extraction-tuning/README.md#抽出の版)）

### サイトの取得

| ファイル | 役割 |
| --- | --- |
| `src/web/` | `WebPageClient`（1 ソースにつき 1 つ。robots.txt・リクエストの間隔・取得先の制限・条件付きリクエスト。任意で取得の期限〈`deadlineAt`〉と Crawl-delay の上限〈`maxCrawlDelaySeconds`〉）、`safe-lookup.ts`（接続のときに名前解決したアドレスを検査する lookup）、`BlockedUrlError` / `WebSourceThrottledError` / `CrawlDelayTooLongError` / `WebDeadlineExceededError` |
| `src/path-filter.ts` | 対象パス / 除外パスの glob 判定（picomatch）と、glob の固定部分のディレクトリ |
| `src/url.ts` | ページの URL の正規化（クエリ・フラグメントを除く。https のみ）と取得しない拡張子 |
| `src/website-pages.ts` | 取得したページ（リダイレクトの行き先）が本文候補を作ってよい URL か（ページの拡張子・対象パス）と、HTML の抽出 |
| `src/const.ts` | User-Agent・robots.txt の照合名・Crawl-delay の上限・タイムアウト・HTML の大きさの上限・リダイレクトの上限 |

fetch はグローバルではなく undici のもの（npm の undici の `Agent` をグローバルの fetch に渡すと版の違いで動かないことがあるため）。undici は Node 20 で動く v7 に固定している（v8 は Node 22.19 以上が必要）。

取得先の制限（SSRF 対策）・robots.txt・リクエストの間隔の詳細は [content-collection のサイトの取得](../../docs/spec/content-collection/README.md#サイトの取得url-から追加) と `apps/api/CLAUDE.md` の「サイトのページの取得」。

## ESM 専用の依存（require(esm)）

このパッケージは CommonJS でビルドするが、unified / remark / rehype は ESM 専用で配布されている。そのため:

- `tsconfig.json` は `"module": "nodenext"` / `"moduleResolution": "nodenext"`（TypeScript 5.8 以降は CommonJS から ESM の import を許す）
- 実行時は Node の `require(esm)` で読む。**使う側（cron・api）は Node 20.19 以上 / 22.12 以上が必要**
- `jsdom` は v29 に固定している。v30 は Node `^22.22.2 || ^24.15.0 || >=26` を要求し、CI（Node 20）で動かないため
- ビルド後に読めるかの確認: `pnpm build && node -e "require('./dist')"`

## テスト

- `pnpm test`（Vitest）。`test/document/` は `test/fixtures/document/` の fixture を使う。**fixture の英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）
- 実在のサイトにリクエストを送るテストは書かない（`fetch`・`sleep`・`now` を差し替える。`localhost` を名前解決で弾くテストだけは実物の undici を使う。外部には接続しない）
