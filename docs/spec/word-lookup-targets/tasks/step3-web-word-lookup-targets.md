# step3-web-word-lookup-targets

web の本文で、押せない単語（`can_look_up: false`）を普通の文字で表示する。解答画面と結果画面は同じ部品（`PassageReader`）を使うので、1 か所で両方に効く。仕様は [README](../README.md#押せる語)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/web/src/components/features/passage/PassageReader.tsx` | `renderSegments` で押せない単語を普通の文字にする |

### `renderSegments`

押せない単語は、読み上げの印だけを付けた `span` にする（`data-word` を付けないので、`article` のクリックで拾われない）。

```tsx
    if (segment.kind !== "word") return <Fragment key={key}>{segment.text}</Fragment>
    if (segment.can_look_up === false) {
      return <span key={key} className={isReading ? READING_WORD_CLASS : undefined}>{segment.text}</span>
    }
```

- `can_look_up` が無い（`undefined`）ときは今までどおり押せる単語にする（api が古い間も押せなくならないように）
- クリックを拾う側（`data-word` を読む処理）は変えない
- 関数のコメントの「単語だけ押せる」を「押せる単語（`can_look_up` が false でない単語）だけ押せる」にする

デザインモック（`app/mock/**`）は変えない（モックは本文を自前で分割していて品詞を持たず、見た目はホバーの有無しか変わらないため）。

## 動作確認

`verify-web-page` skill の手順で、web（port 3000）の解答画面と結果画面を開く。

- `the`・`of`・`is` にホバーしても色・カーソルが変わらず、押しても単語のカードが出ない
- 名詞・動詞は今までどおりホバーで色が変わり、押すと英和辞書の意味が出る
- 用語集の語句（形容詞の用語集を含む）は押すと「この文での意味」が出る。同じ語句の 2 回目の出現でも同じ
- 読み上げで、押せない単語にもハイライトが付く
- console のエラーが 0 件
- before / after のスクショ（同じ段落で、ホバーできる単語とできない単語が分かるもの）を `docs/screenshots/word-lookup-targets/` に撮る
