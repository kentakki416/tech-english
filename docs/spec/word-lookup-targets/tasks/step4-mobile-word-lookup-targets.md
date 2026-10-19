# step4-mobile-word-lookup-targets

mobile の本文で、押せない単語（`can_look_up: false`）を押せないようにする。解答画面と結果画面は同じ部品（`PassageReader`）を使う。仕様は [README](../README.md#押せる語)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/mobile/src/components/features/passage/PassageReader.tsx` | `SegmentText` で押せない単語の `onPress` を付けない |

### `SegmentText`

押せない単語は `onPress` を付けず、長押し（段落の和訳を重ねる）は今までどおり付ける。

```tsx
  const canLookUp = segment.can_look_up !== false
  return (
    <Text
      style={[isHighlighted && styles.highlight, isReading && styles.readingWord]}
      onLongPress={onPeekStart ? () => onPeekStart(blockIndex) : undefined}
      onPress={canLookUp ? () => onPressWord(segment) : undefined}
      onPressOut={onPeekEnd}
    >
      {segment.text}
    </Text>
  )
```

- 長押しを残す理由：単語の上でも段落の長押しの和訳を出すため（`onLongPress` は今も単語から段落の長押しとして扱っている）
- `can_look_up` が無いときは今までどおり押せる単語にする（web と同じ）

デザインモック（`components/mock/**`）は変えない（web と同じ理由）。

## 動作確認

Expo の web 表示で確かめる（question-translation の step6 と同じ手順。確かめたら設定を元に戻す）。シミュレーター・実機があればそちらで確かめる。

- `the`・`of` を押しても単語のカードが出ない。名詞・動詞は英和辞書、用語集の語句は「この文での意味」が出る
- 押せない単語の上で長押ししても、段落の和訳が重なる
- 読み上げで、押せない単語にもハイライトが付く
- console のエラーが 0 件
- スクショを `docs/screenshots/word-lookup-targets/mobile-after.png` に撮る
