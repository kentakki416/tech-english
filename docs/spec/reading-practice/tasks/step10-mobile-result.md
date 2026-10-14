# step10-mobile-result

mobile の結果・解説画面（`attempts/[id]/result`）を、確定済みのモック（`apps/mobile/src/app/mock/attempts/[id]/result.tsx`）を移植して作る。表示する項目は web の [step7-web-result](./step7-web-result.md) と同じで、ここでは mobile の違い（縦に 1 列・下端に固定のボタン・`FlatList` での根拠へのスクロール）を書く。画面の仕様は [mobile の画面の結果・解説](../README.md#mobile-の画面)。

## 前提

- [step4-api-attempt-submit](./step4-api-attempt-submit.md)（`GET /api/attempt/:id` の提出済みの形）
- [step9-mobile-attempt](./step9-mobile-attempt.md)（`FlatList` 化した `PassageReader`〈`ref` / `ListHeaderComponent` / `highlight`〉、`useDictionaryLookup`、`attemptApi.getDetail`）
- [step8-mobile-passage-list](./step8-mobile-passage-list.md)（`attempt.store.ts`、`removeAttemptProgress`、`passageApi.getRandom`）

## 対応内容

### 1. 画面（`src/app/attempts/[id]/result.tsx`）

- `useAttemptStore` に提出済みの挑戦があればそれで描画し（提出直後は通信を待たない）、無ければ `attemptApi.getDetail(id)`。学習履歴（learning-record step5）からはこのルートで開かれ、ストアに無いので取得する
- `in_progress` なら `router.replace(\`/attempts/${id}\`)`、`expired` なら `router.replace("/passages")`、404 は「この結果は表示できません。」
- マウント時に `removeAttemptProgress(id)`（step9 の提出では消さない）

### 2. 構成

本文の `FlatList`（`PassageReader`）1 つに全体を載せ、本文より上の区画を `ListHeaderComponent` にする。`ScrollView` の中に `FlatList` を入れると画面外のブロックも描画されて step9 の描画性能の対策が効かなくなるため。

```tsx
<SafeAreaView edges={["top"]} style={styles.screen}>
  <ResultTopBar />
  <PassageReader
    ref={readerRef}
    ListHeaderComponent={<ResultHeader highlightQuestionId={highlightQuestionId} result={result} onShowEvidence={showEvidence} />}
    blocks={result.blocks}
    glossary={result.glossary}
    highlight={highlight}
    peekBlock={peekBlock}
    translatedBlocks={translatedBlocks}
    onLookupDictionary={lookupDictionary}
    onPeekEnd={endPeek}
    onPeekStart={startPeek}
    onToggleTranslation={toggleTranslation}
    onWordCard={setWordCard}
  />
  {wordCard && <WordCard content={wordCard} onClose={closeWordCard} />}
  <ResultBottomBar passageId={result.passage.id} />
</SafeAreaView>
```

| 部品（`src/components/features/attempt/`） | 中身（モックの該当部分を移植） |
| --- | --- |
| `ResultTopBar` | 「‹ 問題一覧」（`router.replace("/passages")`）と「マイページへ」（`router.replace("/")`） |
| `ResultHeader` | `surface` の区画（タイトル・36px のスコアのマス〈`isAnimated`〉・`3 / 4 問正解`・`5:12 ／ 制限 5:30` と時間のバー・WPM と「設問を解く時間を含む」・アシストの使用）→ 設問ごとの結果 → 調べた単語 → 出典 → 「本文（根拠の箇所をハイライトしています）」 |
| `ResultBottomBar` | 下端に固定の「もう一度解く」（副）と「次の問題を解く」（主要）。`SafeAreaView edges={["bottom"]}` |

- 値の出し方（時間のバーの比率・超過のバッジ・`words_per_minute` が null なら「―」・選択肢の色・調べた単語の出どころの表示・出典の各項目）は web の step7 の表と同じ。リンクは `Linking.openURL`
- **不正解の設問はすべて最初から開き**、正解の設問は閉じる（README の [結果・解説](../README.md#結果解説) どおり。mobile のモックは最初の不正解だけを開いているが README に合わせる）
- `is_answer_key_changed` が true の設問（提出後に正解が直されて、正誤の保存値といまの正解が食い違う）は、`ResultQuestionItem` の選択肢の下に「提出後にこの設問の正解が修正されました（正誤は提出したときの採点のままです）」を補足の文字（`appStyles.caption`：`fgMuted` の 12px）で出す。web の step7 と同じ
- 本文は解答画面と同じ部品で、単語のカード・段落の「訳」・長押しの和訳（振動つき）が使える。用語集は語義設問の対象語句も含む全件。結果画面では調べた単語を記録しない（`onLookupWord` を渡さない）

### 3. 根拠のハイライトとスクロール

```ts
const readerRef = useRef<FlatList<AttemptBlock>>(null)
const firstWrong = result.questions.find((question) => !question.is_correct && question.evidence !== null)
const [highlightQuestionId, setHighlightQuestionId] = useState<number | null>(firstWrong?.id ?? null)

const showEvidence = useCallback((question: SubmittedAttempt["questions"][number]) => {
  if (!question.evidence) return
  setHighlightQuestionId(question.id)
  readerRef.current?.scrollToIndex({ animated: true, index: question.evidence.block_index, viewOffset: 80 })
}, [])
```

- `highlight` は web の step7 と同じく、選んだ設問の `evidence` から `{ blockIndex, segmentEnd, segmentStart }` を作る
- まだ描画していない遠いブロックへの `scrollToIndex` は失敗するので、`PassageReader` の `FlatList` に `onScrollToIndexFailed` を付ける：`info.averageItemLength * info.index` までスクロールしてから、100ms 後に同じ `scrollToIndex` をもう一度呼ぶ（step9 のリーダーに足す）
- ボタンの表示は「● 本文の根拠を見る」/ 押した設問だけ「● 本文で根拠を表示中」（琥珀）。`evidence` が null の設問はボタンを出さない
- 最初のハイライト（最初の不正解の設問）ではスクロールしない

### 4. 下端のボタン

| ボタン | 動き |
| --- | --- |
| もう一度解く | `router.push(\`/passages/${passageId}\`)`（開始確認のモーダルから新しい挑戦を始める） |
| 次の問題を解く | `passageApi.getRandom({ difficulty: [], kind: null, tag: [], unattemptedOnly: false })` → `router.push(\`/passages/${id}\`)`。null なら `Alert.alert("問題がありません", ...)`。取得中は二重に押せないようにする |

## 動作確認

```bash
pnpm --filter mobile lint:fix
pnpm --filter mobile start
```

iOS と Android で、step9 の画面で実際に解いて提出した挑戦を使う。

- [ ] 提出後すぐに結果画面が出る（読み込み中の表示を挟まない）。見た目がモックの「時間内」「時間超過」と同じ
- [ ] 36px のスコアのマスが順に灯る
- [ ] スコア・時間・WPM・アシストの使用が DB の値と合う。超過した挑戦は超過のバッジとローズのバー
- [ ] 不正解の設問がすべて開いていて、最初の不正解の設問の根拠が本文でハイライトされている
- [ ] 提出後に設問の正解を直した挑戦では、食い違う設問だけに正解の修正の注記が出て、スコアと正誤は提出時のまま
- [ ] 「本文の根拠を見る」で本文の該当段落までスクロールし、ハイライトが切り替わる。本文の最後の方の段落（まだ描画していない段落）でもスクロールできる
- [ ] 本文の単語のカード・「訳」・長押しの和訳が使える。語義設問の対象語句は用語集の意味
- [ ] 調べた単語の一覧（重複なし、「文脈」/「辞書」）と出典（リンクが開く）
- [ ] 「もう一度解く」で開始確認のモーダル、「次の問題を解く」でランダムな問題の開始確認、「マイページへ」でマイページのタブ
- [ ] 結果画面を開いた後、AsyncStorage から `attempt-progress:{id}` が消えている
- [ ] アプリを再起動して学習履歴（learning-record step5 の実装後）から開いても結果が出る
- [ ] 本文の長い問題で、ヘッダーの区画から本文の最後までスクロールしてもカクつかない
