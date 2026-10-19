# step1-api-word-lookup-targets

api の本文の分割で、wink-nlp で品詞を判定して単語のセグメントに `can_look_up` を付け、用語集の語句は本文のすべての出現をセグメントにする。仕様と理由は [README](../README.md#品詞の判定)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/api/package.json` | `wink-nlp`・`wink-eng-lite-web-model` |
| `apps/api/src/lib/part-of-speech.ts`（新規） | `findLookupTargetRanges(text)`：名詞・固有名詞・動詞のトークンの位置 |
| `packages/domain/src/rules/passage-text.ts` | `findSurfaceRanges(text, surface)`：語の境界で区切られたすべての出現 |
| `apps/api/src/lib/segment-passage.ts` | 単語の `canLookUp`、用語集のすべての出現 |
| `apps/api/src/service/attempt-service.ts` | `stripSegmentRange` で `canLookUp` を残す |
| `apps/api/src/controller/attempt/mapper.ts` | セグメントの `can_look_up` |
| `packages/schema/src/api-schema/attempt.ts` | `passageSegmentSchema` に `can_look_up` |
| `docs/spec/reading-practice/README.md` | 本文のトークン化に `can_look_up` と用語集のすべての出現 |

### 依存

```bash
pnpm --filter api add wink-nlp wink-eng-lite-web-model
```

api は `module: node16`（CommonJS）なので、両方とも `require` で読めることを `pnpm --filter api build` と `node -e "require('./dist/lib/part-of-speech')"` で確かめる。

### `src/lib/part-of-speech.ts`

```ts
import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"

const LOOKUP_TARGET_TAGS = new Set(["NOUN", "PROPN", "VERB"])

const nlp = winkNLP(model)

export const findLookupTargetRanges = (text: string): { end: number; start: number }[] => {
  const tokens = nlp.readDoc(text).tokens()
  const values = tokens.out(nlp.its.value)
  const tags = tokens.out(nlp.its.pos)
  const ranges: { end: number; start: number }[] = []
  let cursor = 0
  values.forEach((value, index) => {
    const start = text.indexOf(value, cursor)
    if (start === -1) return
    cursor = start + value.length
    if (LOOKUP_TARGET_TAGS.has(tags[index] ?? "")) ranges.push({ end: cursor, start })
  })
  return ranges
}
```

- 関数のコメントに「単語を押せる対象（名詞・固有名詞・動詞）の wink-nlp のトークンの位置を返す」、`LOOKUP_TARGET_TAGS` に `PROPN` を含める理由（README の設計）、`nlp` にモジュールの読み込み時に 1 回だけモデルを読むことを書く
- インラインコードの置き換えは `segment-passage.ts` で行う（インラインコードのパターンを 1 か所にするため）
- wink-nlp の `out` の戻り値の型が `string[]` でなければ、型に合わせて直す

### `packages/domain/src/rules/passage-text.ts`

`findSurfaceRange` と同じ語の境界の判定で、すべての出現を返す関数を足す。

```ts
export const findSurfaceRanges = (text: string, surface: string): { endOffset: number; startOffset: number }[] => {
  if (surface.length === 0) return []
  const ranges: { endOffset: number; startOffset: number }[] = []
  let startOffset = text.indexOf(surface)
  while (startOffset !== -1) {
    const endOffset = startOffset + surface.length
    if (!isAlphanumericAt(text, startOffset - 1) && !isAlphanumericAt(text, endOffset)) {
      ranges.push({ endOffset, startOffset })
    }
    startOffset = text.indexOf(surface, startOffset + 1)
  }
  return ranges
}
```

- `findSurfaceRange` は `findSurfaceRanges(text, surface)[0] ?? null` に置き換えてよい（判定を 1 か所にする）
- `packages/domain/src/index.ts` で export し、`pnpm --filter @repo/domain build`

### `src/lib/segment-passage.ts`

- `PassageSegment` に `canLookUp?: boolean` を足す（コメント「kind が word のときだけ。用語集の語句は常に true」）
- `GlossarySpan` を `Pick<GlossaryEntry, "blockIndex" | "endOffset" | "id" | "startOffset" | "surface">` にする
- `tokenizePlainText` に単語を押せる位置を渡し、単語のセグメントに `canLookUp` を付ける

```ts
const tokenizePlainText = (text: string, start: number, end: number, lookupTargetRanges: TextRange[]): SegmentWithRange[] =>
  [...text.slice(start, end).matchAll(TOKEN_PATTERN)].map((match) => {
    const segmentStart = start + match.index
    const segmentEnd = segmentStart + match[0].length
    if (match[1] !== undefined) {
      const canLookUp = lookupTargetRanges.some((range) => isOverlapping(range, { end: segmentEnd, start: segmentStart }))
      return { canLookUp, end: segmentEnd, kind: "word", start: segmentStart, text: match[0] }
    }
    const kind: PassageSegmentKind = match[2] !== undefined ? "space" : "punct"
    return { end: segmentEnd, kind, start: segmentStart, text: match[0] }
  })
```

- 用語集のセグメントは `canLookUp: true`
- `segmentBlockText` の先頭で、インラインコードを同じ長さの `X` と空白に置き換えた本文で `findLookupTargetRanges` を 1 回呼び、`tokenizePlainText` の各呼び出しに渡す

```ts
const maskInlineCode = (text: string): string => text.replace(INLINE_CODE_PATTERN, (code) => `X${" ".repeat(code.length - 1)}`)
```

- `segmentPassage` で、ブロックごとに用語集のすべての出現を集めてから `segmentBlockText` に渡す

```ts
const collectGlossaryOccurrences = (text: string, blockIndex: number, glossary: GlossarySpan[]): GlossarySpan[] => {
  const storedSpans = glossary.filter((entry) => entry.blockIndex === blockIndex)
  const otherOccurrences = glossary.flatMap((entry) =>
    findSurfaceRanges(text, entry.surface)
      .filter((range) => !storedSpans.some((stored) => stored.startOffset === range.startOffset && stored.endOffset === range.endOffset))
      .map((range) => ({ ...entry, blockIndex, endOffset: range.endOffset, startOffset: range.startOffset })),
  )
  return [...storedSpans, ...otherOccurrences]
}

export const segmentPassage = (blocks: PassageBlock[], glossary: GlossarySpan[]): SegmentWithRange[][] =>
  blocks.map((block, blockIndex) =>
    block.type === "code" ? [] : segmentBlockText(block.text, collectGlossaryOccurrences(block.text, blockIndex, glossary)),
  )
```

- `collectGlossaryOccurrences` のコメントに「保存してある位置と、同じ表記のほかの出現（語の境界で区切られたもの）を返す。保存してある位置と同じ範囲の出現は、表記が同じ別の項目のものでも外す。ほかの重なりは `selectGlossarySpans` が 1 つにする」と書く
- 保存してある位置と同じ範囲を外すのは、表記が同じ項目が 2 つある（admin の編集や生成で起こりうる）ときに、`selectGlossarySpans` の ID の順で別の項目の意味が出ないようにするため

### `src/service/attempt-service.ts`

レスポンスに出すセグメントから位置を外す `stripSegmentRange` は、列を選んで作り直しているので `canLookUp` も残す。

```ts
const stripSegmentRange = ({ canLookUp, glossaryEntryId, kind, text }: SegmentWithRange): PassageSegment => ({
  ...(canLookUp === undefined ? {} : { canLookUp }),
  ...(glossaryEntryId === undefined ? {} : { glossaryEntryId }),
  kind,
  text,
})
```

### `src/controller/attempt/mapper.ts`

```ts
const convertSegmentToResponse = (segment: PassageSegment): PassageSegmentResponse => ({
  ...(segment.canLookUp === undefined ? {} : { can_look_up: segment.canLookUp }),
  ...(segment.glossaryEntryId === undefined ? {} : { glossary_entry_id: segment.glossaryEntryId }),
  kind: segment.kind,
  text: segment.text,
})
```

### `packages/schema/src/api-schema/attempt.ts`

```ts
export const passageSegmentSchema = z.object({
  can_look_up: z.boolean().optional(),
  glossary_entry_id: z.number().int().optional(),
  kind: z.enum(PASSAGE_SEGMENT_KINDS),
  text: z.string(),
})
```

- `can_look_up` のコメントに「kind が word のときだけ。押して意味を引けるか（名詞・動詞と用語集の語句）。押せない単語も読み上げのハイライトのために word のまま」と書く

### 仕様書

`docs/spec/reading-practice/README.md` の「本文のトークン化」と「② 単語の意味」は、この設計の PR で直してある。実装と食い違いが出たら直す。

## 動作確認

### テスト

`pnpm --filter api test`（`vitest` を直接実行しない）。

| ファイル | 足すケース |
| --- | --- |
| `test/lib/part-of-speech.test.ts`（新規） | `the`・`of`・`is`・`can` が入らない、名詞（`widget`）と動詞（`run`）が入る、`React's` の `React` の位置が入る |
| `test/lib/segment-passage.test.ts` | 機能語の単語が `canLookUp: false`、名詞・動詞が `true`、用語集の語句は品詞に関係なく `true`（形容詞の用語集）、`third-party` は `true`、`don't` は `false`、空白・記号・コードには `canLookUp` が無い、インラインコードの後ろの単語も品詞で判定する |
| 同上 | 用語集の語句の 2 回目の出現（同じ段落・別の段落）も `glossaryEntryId` を持つ、語の一部（`opt` の用語集で `option`）は用語集にしない、大文字小文字が違う出現は用語集にしない、2 回目の出現がほかの用語集と重なったら開始が早い方が残る、表記が同じ項目が 2 つあれば保存してある位置ではその項目を使う |
| `test/controller/attempt/start.test.ts` ほか | 期待値のセグメントに `can_look_up` が入る。語義の設問の対象語句は、2 回目の出現も用語集にならない |
| `packages/domain` の `passage-text` のテスト | `findSurfaceRanges` がすべての出現を返し、語の一部を飛ばす |

### 手で確かめる

```bash
pnpm --filter api build && node -e "require('./apps/api/dist/lib/part-of-speech')"
```

- dev の api で挑戦を開始し、レスポンスのセグメントで `the`・`of` が `can_look_up: false`、名詞・動詞が `true` になっていること
