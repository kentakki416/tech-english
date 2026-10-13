# step6-admin-passage-review

admin の問題一覧（`/passages`）と問題の確認・修正（`/passages/[id]`）を、確定済みのモック `apps/admin/src/app/(dashboard)/mock/passages/**` から移植し、step5 の API に繋ぐ。新しくデザインしない。

## 前提

- [step5-api-admin-passage](./step5-api-admin-passage.md)：`/api/admin/passage/*`、`@repo/api-schema` の `admin/passage.ts`、400 の `details`
- [step4-api-admin-auth](./step4-api-admin-auth.md)：Basic 認証、api client の `X-Admin-Token` と `ApiClientError`
- 画面の仕様は README の [UI 設計](../README.md#ui-設計)（[問題一覧](../README.md#問題一覧)・[問題の確認・修正](../README.md#問題の確認修正)）、admin のデザインは [product-overview の admin のデザイン](../../product-overview/README.md#admin-のデザイン)
- モックは消さない（全画面の本実装の後に消す）

## 対応内容

### 1. 置き場所

| 移植元（モック） | 移植先 |
| --- | --- |
| `mock/passages/page.tsx` | `src/app/(dashboard)/passages/page.tsx`（Server Component） |
| `mock/passages/[id]/page.tsx` | `src/app/(dashboard)/passages/[id]/page.tsx`（Server Component） |
| `mock/layout.tsx`（Literata の読み込み） | `src/app/(dashboard)/passages/layout.tsx` |
| `mock/passages/PassageTable.tsx` | `src/components/features/passage/PassageTable.tsx` |
| `mock/passages/[id]/PassageReview.tsx` | `src/components/features/passage/PassageReview.tsx`（タブごとに `QuestionsTab` / `TranslationsTab` / `GlossaryTab` / `BodyTab` / `BasicsTab` に分ける） |
| `mock/passages/[id]/PassagePreview.tsx` | `src/components/features/passage/PassagePreview.tsx`（ほぼそのまま） |
| `mock/_components/ui.ts` | `src/libs/ui-classes.ts`（content-collection step3 が先に作っていればそれを使う） |
| `libs/mock-data.ts` の型・ラベル | 型は `@repo/api-schema` から。ラベルは `src/features/passage/passage-labels.ts` |

- `MockStatePanel` と `?state=` の切り替えは移植しない（状態は API のデータで決まる）
- サイドバー（`AppSidebar.tsx`）に「問題」（`/passages`）を足す。content-collection step3 が tech-english のグループを作っていればそこに並べる

### 2. API 呼び出し（`src/features/passage/passage.api.ts`）

先頭に `import "server-only"`。`apiClient` を呼び、レスポンスは `@repo/api-schema` のスキーマで parse する（独自の型を書かない）。

```typescript
const LIST_PAGE_SIZE = 200
const MAX_LIST_ROWS = 1000

/**
 * 1 つの状態の行をまとめて取る。表（DataTable）は検索・Filter・ページ送りを画面内で行うため、
 * cursor をたどって最大 MAX_LIST_ROWS 件まで取る
 */
export const fetchAdminPassageList = async (status: AdminPassageStatus): Promise<{
  isTruncated: boolean
  passages: GetAdminPassageListResponse["passages"]
  statusCounts: GetAdminPassageListResponse["status_counts"]
}>

export const fetchAdminPassage = async (id: number): Promise<GetAdminPassageResponse | null>  /** 404 は null */
export const updateAdminPassage / publishAdminPassage / rejectAdminPassage / unpublishAdminPassage / regenerateAdminPassage
```

`passage-labels.ts`（`server-only` を付けない。Client Component から使う）：状態のラベルと `Badge` の色（README の表：収集済み `light`、生成中 `info`、下書き `primary`、公開 `success`、却下 `dark`、失敗 `error`、要確認 `warning`）、難易度（Easy / Normal / Hard）、設問の種類（要旨 / 詳細 / 文脈での語義 / 推論 / 筆者の意図）。キーは `adminPassageStatusSchema.options` などから型付けする。

### 3. 問題一覧（`/passages`）

- `page.tsx`：`searchParams.status` を `adminPassageStatusSchema.safeParse` し、不正・未指定は `draft`。`fetchAdminPassageList(status)` の結果を `PassageTable` に渡す
- `PassageTable`：モックの `useState` の状態を **props の `status`** に置き換え、件数のカードを押したら `router.push("/passages?status=published")` で切り替える（見た目は `aria-pressed` のボタンのまま）。件数は `status_counts`
- 行の変換：`sourceName = source.name`、`attentionLabel`（要確認あり / なし）、状態ごとの列（下書き＝`attention_reasons` をオレンジの点つきで列挙、公開＝`attempt_count` 件、却下＝`reject_reason`、失敗＝`generation_error`、他＝「―」）、`question_count` が 0 なら「―」、`updated_at` は `YYYY-MM-DD HH:mm`（Asia/Tokyo）
- **並び順は API の順のまま**（モックの `sort` は消す）。Filter のソースの選択肢は取得した行のソース名から作る。リンク先は `/passages/{id}`
- `isTruncated` のときは `ComponentCard` の説明文の末尾に「先頭の 1000 件を表示しています」を足す

### 4. 問題の確認・修正（`/passages/[id]`）

`page.tsx` は `fetchAdminPassage(Number(id))` が null なら `notFound()`。詳細をそのまま `PassageReview` に渡す。

**フォームの状態**（`src/components/features/passage/passage-form.ts`）：モックの `defaultValue`（非制御）を、詳細から作る 1 つの state に置き換える。

```typescript
export type PassageForm = {
  blocks: { text: string, translationJa: string | null }[]
  difficulty: number
  /**
   * clientKey は既存なら `id-12`、追加分は `new-1`。設問の対象語句はこれで指す。
   * start_offset / end_offset は保存済みの本文上の位置（追加した語句・語句か段落を変えた語句は null）。プレビューの下線に使い、保存のリクエストには含めない
   */
  glossary: (Omit<GetAdminPassageResponse["glossary"][number], "end_offset" | "id" | "start_offset"> & { clientKey: string, end_offset: number | null, id: number | null, start_offset: number | null })[]
  /** verification_choice_index は表示用に持ったまま、保存のリクエストには含めない */
  questions: (Omit<GetAdminPassageResponse["questions"][number], "id" | "order_index" | "target_glossary_entry_id"> & { id: number | null, targetGlossaryKey: string | null })[]
  timeLimitSeconds: number
  title: string
}
export function convertDetailToForm(detail: GetAdminPassageResponse): PassageForm
/** targetGlossaryKey を glossary 配列の index（target_glossary_index）に直す */
export function convertFormToRequest(form: PassageForm): UpdateAdminPassageRequest
```

**移植の要点**

- 上部：状態のバッジと要確認のバッジ（`needs_attention`）、タイトル、生成の記録（`source.name`、`source.path` と `@` + `commit_sha` の先頭 7 文字、`word_count`、`generation_model`、`generation_prompt_version`、`generated_at`、制限時間）
- 状態ごとの操作と囲み（draft / published はモックどおり。モックに無い状態は同じ `Notice` と `Badge` の組み合わせで出し、入力はすべて無効にする）

| 状態 | 操作 | 囲み |
| --- | --- | --- |
| draft | 再生成・却下・保存・公開する | 公開の 400 があれば error、`attention_reasons` があれば warning |
| published | 非公開に戻す | info「公開中の問題は編集できません」（`attempt_count` を差し込む。0 件なら挑戦の文は出さない） |
| rejected | 再生成 | info：却下の理由 |
| failed | 再生成 | error：`generation_error` |
| collected / generating | なし | info：生成待ち / 生成中 |

- 設問タブ：検証モデルとの食い違いは `verification_choice_index !== correct_choice_index`（null なら出さない）。「検証モデルの回答」も `verification_choice_index` の選択肢に出す。種類が vocabulary のときだけ「対象の語句」の select（用語集の `clientKey`）。「設問を追加」「この設問を削除」は form の配列を増減する。**`attempt_count > 0` の下書き（公開後に非公開に戻したもの）では両方を無効にする**（API も 409 を返す。[公開済みの問題を直すとき](../README.md#公開済みの問題を直すとき)）。目安の設問数の文言はモックの固定値をやめ、詳細の `recommended_question_count` を出す（300 / 450 語の境界は API の domain が持ち、admin に直書きしない。保存は `word_count` を変えず、保存後は `revalidatePath` で取り直した詳細の値になる）
- 設問を開くとプレビューがその根拠までスクロールしてハイライトする（モックの `openQuestionAndShowEvidence` のまま）。プレビューには **form の状態**（未保存の修正を含む）を渡す
- プレビューの用語集の下線は、**生の本文（バッククォートを含む）上の位置** に付けてからバッククォートを除いて表示する（`locateGlossaryEntry`）。ブロックの本文が保存済みのままで保存済みの位置にその表記があれば API の `start_offset` / `end_offset` を使い、本文を直したブロック・追加した語句・語句か段落を変えた語句は、保存時に API が求める位置（`findSurfaceRange` と同じ規則：前後が `[A-Za-z0-9]` でない最初の出現）を使う。admin は `@repo/domain` を import できないので、規則を `passage.form.ts` に写し、domain と同じであることをコメントに書く（"It is cached in the cache." の cache は 2 つ目を指す）。根拠のハイライトは `hasQuote` と同じくバッククォートを除いた本文で引用を探す
- 和訳タブ・本文タブ：ブロックの表記は heading を「見出し N」（heading だけを数える連番）、code を「コード（lang）」、他を「段落 N」（heading と code を数えない連番）。API の公開の条件・cron の要確認の理由と同じ番号にする（和訳の無い見出しが複数あっても区別できるように）
- 用語集タブ：`DataTable` の行は form の `glossary`。「語句を追加」「編集」は テンプレートの `Modal` と既存の入力欄（`src/libs/ui-classes.ts`）で語句・見出し語・品詞・段落・文脈での意味・補足を入力するダイアログを出す（モックはボタンだけなので、却下のダイアログと同じ枠で作る）。語句が選んだ段落に見つからなければ警告を出す（判定は保存時の API と同じ `findSurfaceRange` の規則。単語の途中の出現は数えないので、"cached" しか無い段落の "cache" は警告になる）。「削除」は form から消し、その語句を対象にしていた設問の `targetGlossaryKey` を null にする
- 基本情報タブ：「計算式で再計算」は詳細の `time_limit_formula` と form の難易度・設問数・`word_count` で計算し、モックと同じ形で計算の過程を出す（admin は `@repo/domain` を import できないため式の定数を API から受け取っている）。制限時間の入力は `m:ss`。「LLM の判定」の表示は元の判定を保存する列が無いので出さない
- 却下・再生成の `Modal` はモックの文言のまま。却下は理由が空なら「却下する」を押せない

### 5. Server Action（`src/app/(dashboard)/passages/[id]/actions.ts`）

```typescript
"use server"
import "server-only"

export type PassageActionResult =
  | { ok: true }
  | { details: ErrorResponse["details"], error: string, ok: false, status: number }

export async function savePassageAction(id: number, request: UpdateAdminPassageRequest): Promise<PassageActionResult>
export async function publishPassageAction(id: number): Promise<PassageActionResult>
export async function rejectPassageAction(id: number, reason: string): Promise<PassageActionResult>
export async function unpublishPassageAction(id: number): Promise<PassageActionResult>
export async function regeneratePassageAction(id: number): Promise<PassageActionResult>
```

- 成功したら `revalidatePath("/passages")` と ``revalidatePath(`/passages/${id}`)``。`ApiClientError` の 400 / 404 / 409 は `ok: false` で返し、それ以外は throw する（`global-error.tsx` に任せる）
- 「保存」の成功で「下書きを保存しました」を出す（モックの `savedMessage`）。保存の 400 の `details`（`["glossary", i, "surface"]` など）は該当の語句の行に出す
- 「公開する」：**未保存の修正があれば先に保存し**、成功したら公開する。公開の 400 は error の囲み「公開の条件を満たしていないため、公開できません」に `details` の `message` を列挙し、`path` が `["questions", i, "evidence"]` の設問の見出しに `error` のバッジ「根拠が見つかりません」、`["blocks", i, "translation_ja"]` の和訳の入力欄に `error` の枠と「和訳が空です」、`["glossary", i, *]`（位置の不一致・意味が空）は用語集タブの該当の語句の行にメッセージを出す。設問文が空（`prompt_empty`）などそれ以外は error の囲みの一覧だけに出る
- 却下・非公開・再生成の成功後は `router.refresh()` で詳細を取り直す（再生成の後は collected の表示になる）。409 は「他の操作で状態が変わりました。画面を再読み込みしてください」などを error の囲みで出す

## 動作確認

```bash
pnpm --filter admin lint
pnpm --filter admin build
```

admin にはユニットテストが無いので、`verify-web-page` skill の手順で Playwright MCP を使い実画面で確認する（port 3030、Basic 認証あり）。api と cron（または DB に直接入れた下書き）を用意する。PR には `docs/screenshots/question-generation/{before,after}.png` を添える。

一覧：

- [ ] 初期表示が下書きで、要確認のある行が先、その中で更新が古い順。件数のカードが API の件数と一致する
- [ ] カードを押すと URL が `?status=` に変わり、その状態の行と列（公開＝挑戦の件数、却下＝理由、失敗＝エラー）に切り替わる
- [ ] 検索（タイトル・ソース名）・Filter（ソース、下書きのときだけ要確認）・ページ送り（10 / 20 / 50）が動く。0 件のときの案内が出る

確認・修正：

- [ ] プレビューがモックと同じ見た目（Literata、段落番号、段落ごとの「訳」、用語集の琥珀の点線、語義設問の対象の青の破線）。チェックボックスで用語集の下線と全文訳が切り替わる
- [ ] 設問を開くとプレビューがその根拠までスクロールしてハイライトする。検証モデルと食い違う設問にバッジが出る
- [ ] 本文の英文を直して保存すると「下書きを保存しました」が出て、再読み込み後も残る。用語集の語句が本文から消える修正はエラーになる
- [ ] 用語集の追加・編集・削除、設問の追加・削除、正解の変更、対象の語句の選択が保存される
- [ ] 和訳を 1 つ空にして「公開する」→ error の囲みと該当の和訳の枠が出て、公開されない。直すと公開でき、公開中の表示（入力が無効、「非公開に戻す」だけ）になる
- [ ] 「設問を追加」で設問文を空のまま、または用語集の意味が空の語句がある下書きを「公開する」→ 公開されず、「Q4：設問文が空です」「用語集「…」：文脈での意味が空です」が出る（意味は該当の語句の行にも出る）
- [ ] "It is cached in the cache." のように語句が単語の一部としても現れる本文で、下線が保存される位置（2 つ目の cache）に付く。"cached" しか無い段落に "cache" を追加しようとするとダイアログに警告が出る
- [ ] 一覧の要確認の列で、和訳の無い見出しが 2 つあると「見出し 1 の和訳がありません」「見出し 2 の和訳がありません」と別々に出る
- [ ] 「非公開に戻す」で下書きに戻る。挑戦がある問題では「設問を追加」「この設問を削除」が無効になっている
- [ ] 却下（理由が空だと押せない）・再生成のダイアログが動き、一覧の該当の状態に移る
- [ ] 存在しない id で 404 の画面になる。ブラウザに `ADMIN_API_TOKEN` が渡っていない（開発者ツールで確認）
