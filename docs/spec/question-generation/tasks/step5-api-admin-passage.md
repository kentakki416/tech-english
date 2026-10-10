# step5-api-admin-passage

admin 向けの問題の API（一覧・詳細・保存・公開・却下・非公開・再生成）と、公開の条件の検査を作る。

## 前提

- [step4-api-admin-auth](./step4-api-admin-auth.md)：`admin-router.ts`、`X-Admin-Token`
- [step1-db-questions](./step1-db-questions.md)、[content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)
- [reading-practice step1-db-reading-attempts](../../reading-practice/tasks/step1-db-reading-attempts.md)：挑戦の有無を `reading_attempts` で数える。`attempt_word_lookups.glossary_entry_id` が `ON DELETE SET NULL` であること（でないと、調べられた語句を用語集から消す保存が FK 違反で 500 になる）
- API の一覧と制約は README の [必要な API](../README.md#必要な-api)・[公開済みの問題を直すとき](../README.md#公開済みの問題を直すとき)、公開の条件は [出力の検証と後処理](../README.md#出力の検証と後処理)
- `PassageRepository` は reading-practice step2 と共有する。先にあればメソッドを足し、無ければ作る

## 対応内容

### 1. エラーに詳細を持たせる（共通パッケージの拡張）

公開の条件の一覧と「どの設問・どの和訳か」を admin に返すため、400 に詳細を付けられるようにする。既存の呼び出しはそのまま動く。

```typescript
/** packages/errors/src/result.ts */
export type ApiErrorDetail = { code: string, message: string, path: (number | string)[] }
export type ApiError = { details?: ApiErrorDetail[], message: string, statusCode: number, type: ApiErrorType }
export const badRequestError = (message: string, details?: ApiErrorDetail[]): ApiError => ({ details, message, statusCode: 400, type: "BAD_REQUEST" })

/** packages/schema/src/api-schema/common.ts の errorResponseSchema に足す */
details: z.array(z.object({ code: z.string(), message: z.string(), path: z.array(z.union([z.number(), z.string()])) })).optional(),
```

`apps/api/src/lib/send-error.ts` は `error.details` があればレスポンスに含める。

### 2. スキーマ（`packages/schema/src/api-schema/admin/passage.ts`）

enum は domain の定数から作る。`index.ts` に re-export を足す（ファイル名順）。

| エンドポイント | リクエスト | レスポンス |
| --- | --- | --- |
| `GET /api/admin/passage` | `getAdminPassageListQueryStringSchema`：`status`（既定 `draft`）・`source_id`・`needs_attention`（`"true"`/`"false"`）・`cursor`（文字列）・`limit`（1〜200、既定 50） | `{ has_more, next_cursor: string \| null, passages: [...], status_counts: { collected, draft, failed, generating, published, rejected } }` |
| `GET /api/admin/passage/:id` | `getAdminPassagePathParamSchema` | `adminPassageDetailSchema` |
| `PUT /api/admin/passage/:id` | `updateAdminPassageRequestSchema` | `adminPassageDetailSchema`（再計算した位置を返す） |
| `POST .../publish`・`/unpublish`・`/regenerate` | path param のみ | `{ id, status }` |
| `POST .../reject` | `{ reason: string }`（trim して 1〜1000 文字） | `{ id, status }` |

- 一覧の行：`id`、`attempt_count`、`attention_reasons`、`difficulty`、`generation_error`、`needs_attention`、`question_count`、`reject_reason`、`source: { id, name }`、`status`、`title`、`updated_at`、`word_count`
- 詳細：一覧の項目に加え `blocks[]`（`lang` / `text` / `translation_ja` / `type`）、`questions[]`（`id` / `choices` / `correct_choice_index` / `evidence: { block_index, quote }` / `explanation_ja` / `order_index` / `prompt` / `target_glossary_entry_id` / `type` / `verification_choice_index`）、`glossary[]`（`id` / `block_index` / `end_offset` / `lemma` / `meaning_ja` / `note_ja` / `part_of_speech` / `start_offset` / `surface`）、`source: { commit_sha, id, name, path, retrieved_at }`、生成の記録（`generated_at` / `generation_model` / `generation_prompt_version`）、`published_at`、`reviewed_at`、`time_limit_seconds`、**`time_limit_formula`**（`rounding_seconds` / `seconds_per_question` / `wpm_by_difficulty: [{ difficulty, wpm }]`。admin は domain を import できないので、「計算式で再計算」の定数を API から渡す）
- 保存のリクエスト：`title`（1〜255）、`difficulty`、`time_limit_seconds`（正の整数）、`blocks[]`（`text` と `translation_ja` だけ。数と種類は変えられない）、`glossary[]`（`id: number | null` で既存 / 新規、`block_index`・`surface`・`lemma`・`meaning_ja`・`note_ja`・`part_of_speech`。**位置は受け取らない**）、`questions[]`（`id: number | null`、`choices` 4 つ、`correct_choice_index`、`evidence`、`explanation_ja`、`prompt`、`type`、`target_glossary_index: number | null`＝同じリクエストの `glossary` の index。新規の語句を対象にできるように id ではなく index で指す）。1〜5 問
- 保存は途中の状態（空の選択肢・解説など）も許す。正しさは公開の検査で見る

### 3. Repository（`src/repository/passage-repository.ts` にメソッドを足す）

```typescript
export type AdminPassageListCursor = { id: number, needsAttention: boolean, updatedAt: Date }
export type AdminPassageListQuery = { cursor: AdminPassageListCursor | null, limit: number, needsAttention?: boolean, sourceId?: number, status: PassageStatus }
export type AdminPassageListItem = { attemptCount: number, passage: Passage, questionCount: number, source: { id: number, name: string } }
export type AdminPassageDetail = { attemptCount: number, glossary: GlossaryEntry[], passage: Passage, questions: Question[], source: { id: number, name: string } }
export type DraftEditContent = {
  blocks: PassageBlock[]
  difficulty: PassageDifficulty
  glossary: (Pick<GlossaryEntry, "blockIndex" | "endOffset" | "lemma" | "meaningJa" | "noteJa" | "partOfSpeech" | "startOffset" | "surface"> & { id: number | null })[]
  questions: (Pick<Question, "choices" | "correctChoiceIndex" | "evidenceBlockIndex" | "evidenceQuote" | "explanationJa" | "orderIndex" | "prompt" | "type"> & { id: number | null, targetGlossaryIndex: number | null })[]
  timeLimitSeconds: number
  title: string
}

export interface PassageRepository {
  countByStatus(): Promise<Record<PassageStatus, number>>
  findAdminDetail(id: number): Promise<AdminPassageDetail | null>
  /** limit + 1 件まで返す（has_more の判定は service） */
  findAdminList(query: AdminPassageListQuery): Promise<AdminPassageListItem[]>
  /** 生成した内容を消して collected に戻す。状態が from に無ければ false */
  resetForRegeneration(id: number, from: PassageStatus[]): Promise<boolean>
  /** 状態を遷移させる。状態が from に無ければ false（同時操作の保護） */
  transitionStatus(id: number, input: { from: PassageStatus[], publishedAt?: Date, rejectReason?: string, reviewedAt?: Date, to: PassageStatus }): Promise<boolean>
  /** 下書きの内容を 1 トランザクションで置き換える。draft でなければ false */
  updateDraftContent(id: number, content: DraftEditContent): Promise<boolean>
}
```

- **並び順**：draft は `needs_attention DESC, updated_at ASC, id ASC`、それ以外は `updated_at DESC, id DESC`。cursor はその並びのキーセット（draft なら `(na < c.na) OR (na = c.na AND (updated_at, id) > (c.updatedAt, c.id))`）
- `attempt_count` / `question_count` は `reading_attempts` / `questions` を数えるサブクエリ。挑戦は **状態を問わず** 数える（挑戦中のユーザーも設問 ID に回答を送るため）。ソースは `source_documents` → `content_sources` を join
- `countByStatus` は絞り込みを無視した全体の件数（無い状態は 0 で埋める）
- `updateDraftContent`：① passages をガード付き（`status = 'draft'`）で更新、0 行なら false ② 用語集：リクエストに無い id を削除、既存を id で更新（`passage_id` も条件に入れる）、新規を insert して index → id の配列を作る ③ 設問：リクエストに無い id を削除、残す行の `order_index` を一時的に `-(order_index + 1)` へ退避してから最終値で更新（`(passage_id, order_index)` の unique 違反を避ける）、新規を insert。`target_glossary_entry_id` は ② の配列から引く
- `resetForRegeneration`：questions / glossary を削除し、passages の `blocks` から `translationJa` を外す。`difficulty` / `time_limit_seconds` / 生成の記録 / `generation_started_at` / `generation_error` / `reject_reason` / `reviewed_at` を null、`needs_attention = false`、`attention_reasons = []`、**`generation_attempt_count = 0`**（失敗から戻した直後の 1 回の失敗で再び failed にならないように）。英文とタイトルは残す
- Drizzle と Prisma の両方に実装し、Prisma 実装は `type` / `status` を type guard で検証する。不足する演算子は `@repo/db` の re-export に足す

### 4. 純関数（`apps/api/src/lib/`）

```typescript
/** admin-passage-cursor.ts：base64url の JSON。壊れていれば null（service が 400 にする） */
export const encodeAdminPassageCursor = (cursor: AdminPassageListCursor): string
export const decodeAdminPassageCursor = (value: string): AdminPassageListCursor | null

/** admin-passage-edit.ts：保存のリクエストを DraftEditContent にする */
export const buildDraftEditContent = (
  detail: AdminPassageDetail,
  input: UpdateAdminPassageRequest,
): { content: DraftEditContent, ok: true } | { details: ApiErrorDetail[], ok: false }

/** passage-publish-check.ts：公開の条件を満たさない項目を返す。空なら公開できる */
export const listPublishViolations = (detail: AdminPassageDetail): ApiErrorDetail[]
```

`buildDraftEditContent`：ブロックの `type` / `lang` は既存のまま、code の和訳は null。用語集は **新しい本文に対して `findSurfaceRange` で位置を求め直す**（見つからなければ `glossary_surface_not_found`、path `["glossary", i, "surface"]`）。`block_index` / `target_glossary_index` が範囲外なら `*_out_of_range`。vocabulary 以外の設問の `target_glossary_index` は null にする。`orderIndex` は配列の順。根拠は位置を持たない列なので、引用をそのまま保存する（公開時に検査）。

`listPublishViolations`（README の公開の条件。`message` は「Q2：根拠の引用が段落 2 の本文に見つかりません」の形で `numberParagraphs` を使う）：

| code | path | 条件 |
| --- | --- | --- |
| `question_count_out_of_range` | `["questions"]` | 3〜5 問でない |
| `choice_invalid` | `["questions", i, "choices"]` | 4 つでない・空がある・重複がある（前後の空白を除き小文字で比較） |
| `correct_choice_missing` | `["questions", i, "correct_choice_index"]` | 0〜3 でない |
| `explanation_empty` | `["questions", i, "explanation_ja"]` | 解説が空 |
| `evidence_not_found` | `["questions", i, "evidence"]` | ブロックが範囲外か `hasQuote` が false |
| `vocabulary_target_missing` | `["questions", i, "target_glossary_entry_id"]` | vocabulary で、用語集の項目と紐づいていない |
| `translation_missing` | `["blocks", i, "translation_ja"]` | code 以外で和訳が空 |
| `glossary_position_mismatch` | `["glossary", i, "surface"]` | `isSurfaceAt` が false |
| `difficulty_missing` / `time_limit_missing` | `["difficulty"]` / `["time_limit_seconds"]` | null |

### 5. Service（`src/service/admin-passage-service.ts`、`service/index.ts` に `adminPassage` として足す）

すべて `repo: { passageRepository: PassageRepository }` を受け `Promise<Result<T>>` を返す。存在しなければ `notFoundError`。

| 関数 | 許す状態（それ以外は `conflictError`） | 処理 |
| --- | --- | --- |
| `getAdminPassageList(query)` | ― | cursor を decode（壊れていれば `badRequestError`）、`findAdminList` と `countByStatus`、`limit + 1` 件目で `hasMore` と `nextCursor` |
| `getAdminPassageDetail(id)` | ― | `findAdminDetail` |
| `updateAdminPassage(id, input)` | draft | ブロック数が違えば 400。リクエストの設問 id が既存に無ければ 400。**`attemptCount > 0` のとき設問の id の集合が既存と完全に同じでなければ 409**（数の変更・削除・追加を禁止）。`buildDraftEditContent` が不合格なら `badRequestError(message, details)`。`updateDraftContent` が false なら 409。最後に `findAdminDetail` を返す |
| `publishAdminPassage(id, now)` | draft | `listPublishViolations` が空でなければ `badRequestError(message, details)`。`transitionStatus`（`to: "published"`、`publishedAt` / `reviewedAt` に now） |
| `rejectAdminPassage(id, reason, now)` | draft | `transitionStatus`（`rejectReason`、`reviewedAt`） |
| `unpublishAdminPassage(id)` | published | `transitionStatus`（`to: "draft"`。`published_at` は残す） |
| `regenerateAdminPassage(id)` | draft / rejected / failed | `attemptCount > 0` なら 409。`resetForRegeneration` |

遷移の Repository が false を返したら（検査の後に状態が変わった）409 にする。

### 6. Controller と Router

- `src/controller/admin/passage/{list,detail,update,publish,reject,unpublish,regenerate}.ts`（`AdminPassageListController` など。コンストラクタで `PassageRepository` を受ける。try-catch を書かず `sendError`）
- 詳細と保存は同じ変換を使うので `src/controller/admin/passage/convert-detail-to-response.ts` に `convertAdminPassageDetailToResponse(detail)` を置く（`time_limit_formula` は domain の定数から作る）
- `admin-router.ts` に `controllers.passage`（`list` / `detail` / `update` / `publish` / `reject` / `unpublish` / `regenerate`）を足す。`controllers` 引数がまだ無ければ step4 の取り決めどおり足し、step4 のテストの呼び出しを `adminRouter({})` に直す
- `src/index.ts`：`DrizzlePassageRepository`（reading-practice と共有。既にあれば使い回す）からコントローラーを作り `adminRouter({ passage: {...} })` に渡す

## 動作確認

```bash
pnpm --filter @repo/api-schema build && pnpm --filter api test && pnpm --filter api lint
```

lib のユニットテスト：

- [ ] `listPublishViolations`：README の条件ごとに 1 つずつ壊した詳細で該当の `code` と `path` が返る / 正しい詳細で空
- [ ] `buildDraftEditContent`：英文を直すと用語集の位置が再計算される / 語句が本文から消えると `glossary_surface_not_found` / vocabulary 以外の対象が null になる
- [ ] cursor の encode → decode が往復する、壊れた文字列は null

Service のユニットテスト（`test/service/admin-passage-service/`、Repository は `vi.fn()`。`Result` の `statusCode` / `type` を見る）：

- [ ] 正常系：一覧で `limit + 1` 件返ると `hasMore: true` と次の cursor / 保存・公開・却下・非公開・再生成がそれぞれの Repository を正しい引数で呼ぶ
- [ ] 異常系：draft 以外の保存・公開・却下 → 409、published 以外の非公開 → 409、collected / generating / published の再生成 → 409
- [ ] 異常系：挑戦がある問題で設問を 1 つ消す・足す・別の id にする → 409。挑戦が 0 件なら 200
- [ ] 異常系：公開の条件を満たさない → 400 で `details` を持つ。遷移の Repository が false → 409

Repository の契約テスト（`test/repository/passage-repository.test.ts`、Drizzle / Prisma の両方）：

- [ ] 一覧：draft が「要確認 → 更新が古い順」、他が新しい順。cursor で 2 ページ目が重複・欠落なく続く。`source_id` / `needs_attention` の絞り込み
- [ ] `countByStatus` が全状態を 0 埋めで返す。`attemptCount` / `questionCount` が数えられる
- [ ] `updateDraftContent`：設問の並べ替え（Q1 と Q2 の入れ替え）が unique 違反にならない / 削除・追加 / 新規の用語集を対象にした設問の紐づけ / draft 以外で false
- [ ] `resetForRegeneration` で設問・用語集が消え、和訳と生成の記録が空、`generation_attempt_count = 0`

Controller のインテグレーションテスト（`test/controller/admin/passage/`、実 DB、`X-Admin-Token` 付き。ソース・文書・問題・挑戦を投入するヘルパーを置く）：

- [ ] 各エンドポイントの正常系（`toEqual` + `expect.any`）と、トークンなしで 401
- [ ] 公開の条件を満たさない問題の公開で 400 と `details` / 挑戦がある問題の再生成で 409 / 存在しない id で 404 / 理由が空白だけの却下で 400
- [ ] 保存後に GET すると英文の修正に合わせて用語集の `start_offset` が変わっている
