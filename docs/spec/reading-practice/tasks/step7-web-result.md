# step7-web-result

web の結果・解説画面（`/attempts/[id]/result`）を、確定済みのモック（`apps/web/src/app/mock/attempts/[id]/result/ResultScreen.tsx`）を移植して作る。根拠のハイライトとスクロールを持つ。画面の仕様は [UI 設計の結果・解説](../README.md#結果解説)、表示する項目は [結果と解説](../README.md#結果と解説)。

## 前提

- [step4-api-attempt-submit](./step4-api-attempt-submit.md)（`GET /api/attempt/:id` の提出済みの形）
- [step6-web-attempt](./step6-web-attempt.md)（`attemptApi.getDetail`、拡張した `PassageReader`〈`highlight`〉、`useDictionaryLookup`）
- [step5-web-passage-list](./step5-web-passage-list.md)（`removeAttemptProgress`、`/passages/random`）

## 対応内容

### 1. ページ（`src/app/attempts/[id]/result/page.tsx`）

Server Component。`getAttemptPathParamSchema` で検証し、失敗・404 は `notFound()`。

| `status` | 処理 |
| --- | --- |
| `submitted` | `<ResultScreen result={attempt} />` と `<ClearAttemptProgress attemptId={attempt.id} />` |
| `in_progress` | `redirect(\`/attempts/${id}\`)`（まだ提出していない） |
| `expired` | `redirect(\`/passages/${attempt.passage.id}\`)` |

過去の挑戦の結果は学習履歴（learning-record）からこの URL で開かれる。

`ClearAttemptProgress`（`src/components/features/attempt/ClearAttemptProgress.tsx`、`"use client"`）：マウント時に `removeAttemptProgress(attemptId)` するだけで何も描画しない。提出が成功して結果画面に来たときに端末の途中経過を消す（step6 の提出では消さない理由はそちらを参照）。

### 2. 結果画面（`src/components/features/attempt/ResultScreen.tsx`）

`"use client"`。モックの `ResultScreen` を移植し、`MOCK_*` を `result`（`SubmittedAttempt`）に置き換える。`ChoiceRow` はモックのまま同じファイルに置く。

| 区画 | データ |
| --- | --- |
| 正誤のマス | `result.questions.map((question) => question.is_correct)`、`ScoreSquares` の `animate`（180ms 後から 140ms 間隔で灯る。`motion-safe:`） |
| スコア | `correct_count` / `question_count` |
| かかった時間 | `elapsed_seconds` ／ 制限 `time_limit_seconds`。バーの幅は `Math.min(elapsed / limit, 1.25) / 1.25`、縦線は `1 / 1.25` の位置。`is_overtime` なら「{elapsed − limit} 超過」のバッジとローズのバー |
| 読む速さ | `words_per_minute`（null なら「―」）と「設問を解く時間を含む」 |
| アシストの使用 | 「和訳 `translated_block_count` 段落」「単語 `word_lookup_count` 回」 |
| 設問ごとの結果 | 番号・種類のバッジ（`QUESTION_TYPE_LABELS`）・正誤。開くと設問文・選択肢（`correct_choice_index` がミントの枠と「正解」、`selected_choice_index` が「あなたの回答」、誤りならローズ）・解説・根拠のボタン |
| 調べた単語 | `word_lookups`：語句（Literata）・意味（`meaning_ja`。null なら「―」）・出どころ（`glossary` は「文脈」、`dictionary` は「辞書」）。0 件なら「この挑戦では単語を調べていません。」 |
| 出典 | 種別バッジとソース名、「ページ」（`page_url`）、「取得時点」（GitHub は `permalink_url` へのリンクで「コミット {commit_sha の先頭 7 文字}」、サイトは「{retrieved_at の日付} 時点の内容」）、「ライセンス」（`license_spdx` を `license_url` へのリンクに）、「一部を抜粋・改変しています。」 |

- `QUESTION_TYPE_LABELS`（`要旨` / `詳細` / `語義` / `推論` / `意図`）は step5 が作った `src/components/features/passage/labels.ts` のものを使う
- 日付はサーバー描画とずれないよう、`retrieved_at.slice(0, 10)` をそのまま出す

**設問の開閉**：不正解の設問は最初から開き、正解の設問は閉じる（`useState` の初期値）。行を押すと開閉。

**根拠のハイライトとスクロール**

```ts
const firstWrong = result.questions.find((question) => !question.is_correct && question.evidence !== null)
const [highlightQuestionId, setHighlightQuestionId] = useState<number | null>(firstWrong?.id ?? null)

const highlight = (() => {
  const evidence = result.questions.find((question) => question.id === highlightQuestionId)?.evidence
  return evidence ? { blockIndex: evidence.block_index, segmentEnd: evidence.segment_end, segmentStart: evidence.segment_start } : null
})()

const showEvidence = (question: SubmittedAttempt["questions"][number]) => {
  if (!question.evidence) return
  setHighlightQuestionId(question.id)
  const blockIndex = question.evidence.block_index
  window.requestAnimationFrame(() => {
    document.getElementById(`block-${blockIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  })
}
```

- 押した設問のボタンは「本文で根拠を表示中」（琥珀）、それ以外は「本文の根拠を見る」。`evidence` が null の設問はボタンを出さない
- PC 幅では本文の列が独立してスクロールするので、`scrollIntoView` はその列の中で中央に合わせる。スマホ幅では本文は最下部にあり、ページ全体がスクロールする（どちらも同じ呼び出しでよい）
- 最初のハイライトはスクロールしない（画面の上から読み始めるため）

**本文**：`PassageReader` に `result.blocks`・`result.glossary`（語義設問の対象語句も含む全件）・`highlight` を渡す。単語のカードと段落の和訳も使える（`onLookupDictionary` は `useDictionaryLookup()`。結果画面では調べた単語を記録しないので `onLookupWord` は渡さない）。

**上部バーと操作**

| 操作 | 行き先 | 見た目 |
| --- | --- | --- |
| ‹ 問題一覧 | `/passages` | 控えめ |
| マイページへ | `/` | 控えめ（PC 幅のみ上部バー） |
| もう一度解く | `/passages/{passage.id}`（開始確認から新しい挑戦を始める） | 副ボタン |
| 次の問題を解く | `/passages/random`（ランダムに 1 問の開始確認へ） | 主要ボタン |

スマホ幅（1024px 未満）では「もう一度解く」「次の問題を解く」を下端に固定し、並びはモックどおり（上部バー → スコアと時間 → 設問ごとの結果 → 調べた単語 → 出典 → 本文。モックの `flex-col-reverse`）。

## 動作確認

```bash
pnpm --filter web build
pnpm lint:fix
```

`verify-web-page` skill の手順で確認する（PC 幅 1280px とスマホ幅 390px）。step6 の画面で実際に解いて提出した挑戦を使う。

- [ ] 提出後に `/attempts/{id}/result` に着地し、`console_messages` の error が 0 件。見た目がモックの「時間内」「時間超過」と同じ
- [ ] 正誤のマスが順に灯る（OS の「視差効果を減らす」をオンにすると灯らない）
- [ ] スコア・かかった時間・制限時間・WPM・アシストの使用が DB の値と合う。超過した挑戦は超過のバッジとローズのバー
- [ ] 不正解の設問だけが最初から開いていて、最初の不正解の設問の根拠が本文でハイライトされている
- [ ] 「本文の根拠を見る」で該当箇所がハイライトされ、その段落が中央までスクロールする。ボタンが「本文で根拠を表示中」になる
- [ ] 本文の単語のカードと段落の和訳が使える。語義設問の対象語句を押すと用語集の意味（「この文での意味」）が出る
- [ ] 調べた単語の一覧に、解答中に調べた単語が重複なしで出る（用語集は「文脈」、辞書は「辞書」）
- [ ] 出典にページ・取得時点（コミットのリンク / 取得日）・ライセンスのリンク・改変の表示がある
- [ ] 「もう一度解く」で開始確認、「次の問題を解く」でランダムな問題の開始確認、「マイページへ」でマイページに移る
- [ ] 結果画面を開いた後、`localStorage` から `attempt-progress:{id}` が消えている
- [ ] 挑戦中の挑戦の `/attempts/{id}/result` は解答画面へ、他人の挑戦 ID は 404 の画面
- [ ] スクリーンショットを `docs/screenshots/reading-practice-result/after.png` に撮る（新規ページのため before なし）
