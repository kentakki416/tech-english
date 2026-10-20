# step2-cron-extraction-rules

本文の抽出と文章の判定の規則を変える。`<YouWillLearn>`・`<Recap>` を中身ごと捨て、12 語以上の箇条書きの項目を文章に数え、続きが捨てられて「:」で終わる段落の「:」を「.」にする。仕様と理由は [README](../README.md#抽出の規則)。

この step だけでは取得済みの文書は切り分け直さない（step3）。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/cron/src/lib/document/const.ts` | `PROSE_COMPONENT_NAMES` から `YouWillLearn`・`Recap` を外す、`MIN_PROSE_LIST_ITEM_WORDS` |
| `apps/cron/src/lib/document/passage-rules.ts` | 文章の割合に長い箇条書きの項目を数える |
| `apps/cron/src/lib/document/convert-mdast-to-blocks.ts` | 「:」で終わる段落の置き換え |
| `apps/cron/test/lib/document/*.test.ts` | 下の「動作確認」 |
| `docs/spec/content-collection/README.md` | 「本文候補の条件」「本文の抽出と解析」「本文候補への切り分け」の英単語数・文章の判定の段落、「調整できる箇所」のしきい値の行 |

### `const.ts`

```ts
export const MIN_PROSE_WORD_RATIO = 0.5

export const MIN_PROSE_LIST_ITEM_WORDS = 12
```

```ts
export const PROSE_COMPONENT_NAMES: ReadonlySet<string> = new Set([
  "DeepDive",
  "Intro",
  "Note",
  "Pitfall",
])
```

- `MIN_PROSE_WORD_RATIO` のコメントの「段落・引用」を「段落・引用・`MIN_PROSE_LIST_ITEM_WORDS` 語以上の箇条書きの項目」に直す
- `PROSE_COMPONENT_NAMES` のコメントの、中身ごと捨てるコンポーネントの例に `<YouWillLearn>`・`<Recap>` を足す（見出しが無く隣の節の本文候補にくっつくため、という理由を添える）

### `passage-rules.ts`

```ts
const isProseWordBlock = (block: PassageBlock): boolean =>
  block.type === "paragraph"
  || block.type === "quote"
  || (block.type === "list_item" && countEnglishWords([block]) >= MIN_PROSE_LIST_ITEM_WORDS)

const calculateProseWordRatio = (blocks: PassageBlock[]): number => {
  const totalWords = countEnglishWords(blocks)
  const proseWords = countEnglishWords(blocks.filter(isProseWordBlock))
  return totalWords === 0 ? 0 : proseWords / totalWords
}
```

- `calculateProseWordRatio` のコメントを「paragraph・quote と `MIN_PROSE_LIST_ITEM_WORDS` 語以上の list_item の英単語数 ÷ 全体の英単語数」に直す

### `convert-mdast-to-blocks.ts`

```ts
const DANGLING_COLON_PATTERN = /:$/

const isDroppedContentNode = (node: RootContent): boolean => {
  switch (node.type) {
  case "html":
    return !node.value.trimStart().startsWith("<!--")
  case "mdxJsxFlowElement":
  case "table":
    return true
  case "paragraph":
    return node.children.some((child) => child.type === "image" || child.type === "imageReference")
  default:
    return false
  }
}

const isFollowedByDroppedContent = (nodes: RootContent[], convertedBlocks: DocumentBlock[][], index: number): boolean => {
  for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex++) {
    if ((convertedBlocks[nextIndex]?.length ?? 0) > 0) return false
    const nextNode = nodes[nextIndex]
    if (nextNode && isDroppedContentNode(nextNode)) return true
  }
  return true
}

const convertSiblings = (nodes: RootContent[]): DocumentBlock[] => {
  const convertedBlocks = nodes.map(convertNode)
  return convertedBlocks.flatMap((blocks, index) =>
    nodes[index]?.type === "paragraph" && isFollowedByDroppedContent(nodes, convertedBlocks, index)
      ? blocks.map((block) => ({ ...block, text: block.text.replace(DANGLING_COLON_PATTERN, ".") }))
      : blocks)
}

const convertJsxElement = (node: MdxJsxFlowElement): DocumentBlock[] =>
  node.name !== null && PROSE_COMPONENT_NAMES.has(node.name) ? convertSiblings(node.children) : []

export const convertMdastToBlocks = (root: Root): DocumentBlock[] => convertSiblings(root.children)
```

- `isFollowedByDroppedContent` と `convertSiblings` には、置き換える条件（内容のあるノードを捨てたか、後ろにブロックを作るノードが無い）と、空のノード（ショートコード・コメントだけの段落、区切り線）は飛ばして先を見ることを JSDoc に書く
- 箇条書きの項目・引用（`convertContainerChildren`）は変えない

## 動作確認

### テスト

`passage-rules.test.ts`：

- `calculateProseWordRatio`：12 語の `list_item` は文章に数え、11 語の `list_item` は数えない
- `findRejectReasons` の境界値：段落 154 語と 11 語の項目 14 個（154 / 308 = 50%）は本文候補になる。今の「文章 50%」（段落 150 語と 150 語の項目 1 つ）は項目が文章に数えられて境界値にならないので置き換える
- `findRejectReasons` の異常系：段落 150 語と 11 語の項目 14 個（150 / 304）は `not_prose`。今の「文章 150 / 301 語」（151 語の項目）も同じ理由で置き換える。12 語の項目 14 個なら本文候補になる

`convert-mdast-to-blocks.test.ts`（`convertMarkdown` で Markdown から作る）：

- 「:」で終わる段落の後ろに `<Sandpack>` があれば「.」にする
- 後ろが表・画像だけの段落・HTML のときも「.」にする
- 文書の最後の「:」で終わる段落は「.」にする
- 後ろにコード・箇条書き・引用・段落があれば「:」のまま
- 後ろにショートコードだけの段落（`{{< tabs >}}`）・区切り線があり、その先にコードがあれば「:」のまま
- 後ろが HTML のコメントだけで、その先にコードがあれば「:」のまま
- `<Note>` の中の「:」で終わる段落の後ろに `<Sandpack>` があれば「.」にする
- 箇条書きの項目の末尾の「:」は、後ろに `<Sandpack>` があっても変えない
- 末尾が「:」でない段落は、後ろに `<Sandpack>` があっても変えない

`parse-markdown.test.ts`：

- `components.md` の期待値から `<YouWillLearn>` の 2 項目と `<Recap>` の 1 項目を消す（fixture は変えない。中身ごと捨てることの確かめになる）

`parse-html.test.ts`：

- `<p>For example:</p><table>...</table><p>Next.</p>` の段落が `For example.` になる（サイトの HTML にも効くこと）

```bash
pnpm --filter cron test
pnpm --filter cron exec tsc --noEmit
```

### react.dev の learn で測る

react.dev を手元に clone し、`src/content/learn/**/*.md` を `extractDocument` にまとめて通して、[README の効果](../README.md#reactdev-の-learn-での効果)の値（除外前の 52 ページで、本文候補 134・`not_prose` 3・最初の見出しより前に箇条書きがある本文候補 2・`<Recap>` がくっついた本文候補 0）になることを確かめる。

試し実行でも 1 件ずつ確かめられる（dev の React 公式ドキュメントのソース）。

```bash
pnpm --filter cron collect:passages --source-id=<React 公式ドキュメントのソースの id> --dry-run
```
