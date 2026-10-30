# step3-extractor-site-syntax

サイト用の記法の行を、Markdown として読む前に消す。

## 対応内容

- `packages/content-extractor/src/document/site-syntax.ts`：`removeSiteSyntax(source)`。行ごとに見て、コードブロックの外の `:::`・`///` で始まる行と、`{* ... *}`・`{! ... !}`・`[[TOC]]` だけの行を消し、見出しの末尾の `{#id}` を消す
- `packages/content-extractor/src/document/parse-markdown.ts`：`parseMarkdown` の入口で通す
- `packages/content-extractor/src/document/const.ts`：`EXTRACTION_VERSION` を上げる

## 動作確認

- `test/document/site-syntax.test.ts`：各記法、入れ子の `::::`、インデント、コードブロックの中を消さないこと
- `test/document/parse-markdown.test.ts`：`.mdx` の `{* ... *}` で構文エラーにならないこと
