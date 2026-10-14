# step3-api-attempt-start

挑戦の開始（`POST /api/passage/:id/attempt`）と取得（`GET /api/attempt/:id`）の API、本文のセグメント分割の純関数、期限切れの読み出し時更新を作る。設計は [挑戦の状態](../README.md#挑戦の状態)・[正解を提出前に渡さない](../README.md#正解を提出前に渡さない)・[本文のトークン化](../README.md#本文のトークン化)。

## 前提

- [step2-api-passage-list](./step2-api-passage-list.md)（`passage-router.ts`・`ReadingAttemptRepository`・`lib/attempt-expiry.ts`・`lib/build-attribution.ts`）
- 削除済みユーザーの 401 は [github-auth の アカウント削除の処理](../../github-auth/README.md#アカウント削除の処理) の方針どおりこの step の Service で行う（取り決め 5.3）

## 対応内容

### 1. セグメント分割（`apps/api/src/lib/segment-passage.ts`）

DB を知らない純関数。型はこのファイルに置く（README の `PassageSegment` と同じ形。API の snake_case への変換は Controller）。

```ts
export type PassageSegment = { glossaryEntryId?: number; kind: PassageSegmentKind; text: string }
/** 元のブロック本文での位置（[start, end)）。根拠のハイライトの計算に使い、レスポンスには出さない */
export type SegmentWithRange = PassageSegment & { end: number; start: number }
export type GlossarySpan = Pick<GlossaryEntry, "blockIndex" | "endOffset" | "id" | "startOffset">

/** テストのためだけに使うので export せず、ファイル末尾の `export const forTesting = { segmentBlockText }` に入れる */
const segmentBlockText = (text: string, glossary: GlossarySpan[]): SegmentWithRange[]
export const segmentPassage = (blocks: PassageBlock[], glossary: GlossarySpan[]): SegmentWithRange[][]
export const numberParagraphs = (blocks: PassageBlock[]): (number | null)[]
export const findEvidenceSegmentRange = (text: string, segments: SegmentWithRange[], quote: string): { end: number; start: number } | null
```

`segmentBlockText` の手順：

1. インラインコード：`` /`[^`\n]+`/g `` に一致した範囲を `kind: "code"` にする。`text` はバッククォートを除いた中身、`start` / `end` はバッククォートを含む位置。対になっていないバッククォートは記号として扱う
2. 用語集の範囲（位置は [question-generation step1](../../question-generation/tasks/step1-db-questions.md) の定義どおり、バッククォートを含む `text` 上の UTF-16 の index）：`0 ≤ startOffset < endOffset ≤ text.length` のものだけ使う。インラインコードと重なるものは捨てる。用語集どうしが重なったら、開始が早い方（同じなら長い方）を残す
3. 用語集の範囲は熟語でも 1 つのセグメント `{ glossaryEntryId, kind: "word", text: text.slice(start, end) }` にする
4. それ以外の部分を `/([A-Za-z]+(?:['’-][A-Za-z]+)*)|(\s+)|([^A-Za-z\s]+)/g` で `word` / `space` / `punct` に分ける（`React's`・`re-render` は 1 語。数字は記号）
5. 不変条件：セグメントを順に並べ、`code` だけバッククォートで囲み直すと元の `text` に戻る

- `segmentPassage`：ブロックごとに、そのブロックの `blockIndex` の用語集だけを渡す。`code` のブロックは `[]`
- `numberParagraphs`：`heading` と `code` は null、それ以外を 1 から数える（設問の "paragraph 1" と対応する。web / mobile で同じ番号にするため api で付ける）
- `findEvidenceSegmentRange`：`text.indexOf(quote)` の範囲と重なるセグメントの添字の範囲（`end` は含まない）。見つからなければ null。step4 の結果の形で使う

### 2. api-schema（`packages/schema/src/api-schema/attempt.ts`）

`index.ts` に足す。`PASSAGE_BLOCK_TYPES` / `PASSAGE_SEGMENT_KINDS` / `QUESTION_TYPES` は `@repo/domain`、`passageAttributionSchema` / `passageDifficultySchema` は `./passage` から import する。

```ts
export const passageSegmentSchema = z.object({
  glossary_entry_id: z.number().optional(),
  kind: z.enum(PASSAGE_SEGMENT_KINDS),
  text: z.string(),
})
const attemptBlockSchema = z.object({
  lang: z.string().nullable(),
  paragraph_number: z.number().nullable(),
  /** code のブロックは空 */
  segments: z.array(passageSegmentSchema),
  text: z.string(),
  translation_ja: z.string().nullable(),
  type: z.enum(PASSAGE_BLOCK_TYPES),
})
const attemptGlossaryEntrySchema = z.object({ id: z.number(), lemma: z.string(), meaning_ja: z.string(), note_ja: z.string().nullable(), part_of_speech: z.string().nullable(), surface: z.string() })
/** 解答中の設問。正解・解説・根拠を持たない */
const attemptQuestionSchema = z.object({ id: z.number(), choices: z.array(z.string()).length(4), order_index: z.number(), prompt: z.string(), type: z.enum(QUESTION_TYPES) })
const attemptPassageSchema = z.object({ id: z.number(), difficulty: passageDifficultySchema, title: z.string(), word_count: z.number() })

export const inProgressAttemptSchema = z.object({
  id: z.number(),
  attribution: passageAttributionSchema,
  blocks: z.array(attemptBlockSchema),
  expires_at: z.string(),
  glossary: z.array(attemptGlossaryEntrySchema),
  passage: attemptPassageSchema,
  questions: z.array(attemptQuestionSchema),
  server_now: z.string(),
  started_at: z.string(),
  status: z.literal("in_progress"),
  time_limit_seconds: z.number(),
})
export const expiredAttemptSchema = z.object({ id: z.number(), passage: attemptPassageSchema, started_at: z.string(), status: z.literal("expired") })
```

| スキーマ | 中身 |
| --- | --- |
| `startAttemptPathParamSchema` | `{ id }`（問題の ID。`z.coerce.number().int().positive()`） |
| `startAttemptResponseSchema` | `inProgressAttemptSchema` |
| `getAttemptPathParamSchema` | `{ id }`（挑戦の ID） |
| `getAttemptResponseSchema` | `z.discriminatedUnion("status", [inProgressAttemptSchema, expiredAttemptSchema])`。step4 で提出済みの形を足す |

フロントが使う型（`AttemptBlock`、`AttemptGlossaryEntry`、`InProgressAttempt` など）も `z.infer` で export する。

### 3. Repository に足すメソッド

```ts
/** passage-repository.ts */
export type AttemptContent = { glossary: GlossaryEntry[]; passage: Passage; questions: Question[]; source: PassageSource }
/** 状態を問わない（非公開に戻された問題の挑戦中・提出済みも表示するため）。設問は order_index、用語集は (block_index, start_offset) の順 */
findAttemptContentById(passageId: number): Promise<AttemptContent | null>

/** reading-attempt-repository.ts */
export type CreateReadingAttemptInput = { passageId: number; startedAt: Date; timeLimitSeconds: number; userId: number }
/** 部分 unique index（同じ問題の in_progress）に当たったら null */
createInProgress(input: CreateReadingAttemptInput): Promise<ReadingAttempt | null>
/** そのユーザーの started_at <= aliveSince の in_progress を expired にし、件数を返す */
expireStale(userId: number, aliveSince: Date): Promise<number>
/** 他人の挑戦は null（存在を明かさない） */
findByIdForUser(id: number, userId: number, options?: ReadOptions): Promise<ReadingAttempt | null>
```

- 読み取りのメソッドは `options?: ReadOptions`（`{ fromPrimary?: boolean }`）を受け取る。`fromPrimary: true` なら read replica ではなく primary から読む。書き込み API の前提の確認・書き込みの直後の読み直しで使う（Service では `PRIMARY_READ` という定数で渡す）

- Drizzle の `createInProgress`：`onConflictDoNothing({ target: [userId, passageId], where: sql\`status = 'in_progress'\` }).returning()`（部分 index を対象にするため条件が要る。引数名は使っている drizzle-orm の版で確認する）

### 4. Service（`apps/api/src/service/attempt-service.ts`）

`service/index.ts` に `export * as attempt from "./attempt-service"` を足す。

```ts
type AttemptRepo = { passageRepository: PassageRepository; readingAttemptRepository: ReadingAttemptRepository; userRepository: UserRepository }

/** read replica の遅れを避けて primary から読む */
const PRIMARY_READ: ReadOptions = { fromPrimary: true }

export const startAttempt = async (
  input: { now: Date; passageId: number; userId: number },
  repo: AttemptRepo,
): Promise<Result<{ isCreated: boolean; view: InProgressAttemptView }>> => {
  const user = await repo.userRepository.findById(input.userId)
  if (!user) return err(unauthorizedError("User not found"))

  const aliveSince = calculateAliveSince(input.now)
  await repo.readingAttemptRepository.expireStale(input.userId, aliveSince)

  const content = await repo.passageRepository.findAttemptContentById(input.passageId)
  if (!content) return err(notFoundError("Passage not found"))

  /** 作るかどうかの前提の確認なので primary から読む（作った直後の挑戦中を read replica の遅れで見失わないため） */
  const existing = await repo.readingAttemptRepository.findAliveInProgress(input.userId, input.passageId, aliveSince, PRIMARY_READ)
  if (existing) return ok({ isCreated: false, view: buildInProgressView(existing, content, input.now) })

  /** 新しく始められるのは公開中の問題だけ。非公開に戻された問題でも挑戦中なら上で再開できる */
  if (content.passage.status !== "published") return err(notFoundError("Passage not found"))

  /** 公開中の問題は制限時間を必ず持つ（公開の条件） */
  const created = await repo.readingAttemptRepository.createInProgress({
    passageId: input.passageId,
    startedAt: input.now,
    timeLimitSeconds: content.passage.timeLimitSeconds!,
    userId: input.userId,
  })
  /** 同時に開始されて部分 unique index に当たったときは、先に作られた方を返す（作られたばかりの行なので primary から読む） */
  const attempt = created ?? await repo.readingAttemptRepository.findAliveInProgress(input.userId, input.passageId, aliveSince, PRIMARY_READ)
  if (!attempt) throw new Error("In-progress attempt disappeared after conflict")
  return ok({ isCreated: created !== null, view: buildInProgressView(attempt, content, input.now) })
}

export const getAttempt = async (input: { attemptId: number; now: Date; userId: number }, repo: Omit<AttemptRepo, "userRepository">): Promise<Result<AttemptView>>
```

`buildInProgressView`（非公開の関数。テストする場合は `forTesting` に入れる）:

- `vocabulary` の設問の `targetGlossaryEntryId` を集めて用語集から外す（[アシスト](../README.md#アシスト)）。外した用語集で `segmentPassage` するので、その語句は普通の単語になり、押すと辞書を引く
- 設問は `{ id, choices, orderIndex, prompt, type }` だけを **明示的に** 取り出す（スプレッドで渡さない。正解が混ざる事故を防ぐ）。api-schema の `z.object` も未知のキーを落とすので二重の防御になる
- `expiresAt = calculateExpiresAt(attempt.startedAt)`、`serverNow = now`、`attribution = buildAttribution(content.source, content.passage)`、`translationJa` は code のブロックでは null

`getAttempt`：`expireStale` → `findByIdForUser`（null なら 404。先に `expireStale` で書き込むので書き込み API と同じく `PRIMARY_READ` で読む。開始の直後に redirect された先の GET が 404 になる・提出の直後の結果画面が in_progress を読んで解答画面へ戻す、を防ぐ）→ `findAttemptContentById`。`in_progress` は `buildInProgressView`、`expired` は `{ id, passage, startedAt, status }`。`submitted` は提出 API ができる step4 で結果の形にする（この step では `err(conflictError(...))` を返しておく）。

### 5. Controller・Router・DI

- `controller/attempt/start.ts`（`AttemptStartController`）：`isCreated` なら 201、再開なら 200
- `controller/attempt/detail.ts`（`AttemptDetailController`）
- domain → snake_case の変換は start / detail / submit（step4）で共通なので `controller/attempt/mapper.ts` に `convertInProgressAttemptToResponse(view)` / `convertExpiredAttemptToResponse(view)` を置く。出典（`attribution`）の変換は開始確認の概要（step2 の `controller/passage/detail.ts`）とも共通なので `controller/passage/mapper.ts` の `convertAttributionToResponse` を両方から使う
- `passage-router.ts` に `start` を足して `POST /:id/attempt`、`routes/attempt-router.ts`（新規）に `detail` で `GET /:id`
- `src/index.ts`：`app.use("/api/attempt", attemptRouter({ detail }))`、`passageRouter` に `start` を渡す

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter api test
pnpm lint:fix
```

lib（`test/lib/segment-passage.test.ts`）:

- [ ] 単語・空白・記号に分かれる。`React's`・`re-render` は 1 語、`2.` は記号
- [ ] インラインコードはバッククォートを除いた `code`、対になっていないバッククォートは記号
- [ ] 熟語の用語集（`opt out of`）が `glossaryEntryId` つきの 1 セグメントになる
- [ ] インラインコードと重なる用語集・範囲外の用語集は無視、用語集どうしの重なりは先の方を残す
- [ ] 不変条件（`code` をバッククォートで囲み直して連結すると元の本文）を複数の本文で確かめる
- [ ] `code` のブロックは `[]`、`numberParagraphs` は見出しとコードを飛ばして 1 から
- [ ] `findEvidenceSegmentRange`：段落の途中の引用 / 用語集のセグメントをまたぐ引用 / 見つからない引用は null

Service（ユニット）:

- [ ] ユーザーが居なければ 401 で、`expireStale` も `createInProgress` も呼ばない
- [ ] `expireStale` が `findAliveInProgress` より先に呼ばれる。`findAliveInProgress`（最初の確認・同時開始の読み直し）と `getAttempt` の `findByIdForUser` に `{ fromPrimary: true }` を渡す
- [ ] 挑戦中があれば `isCreated: false` で、`createInProgress` を呼ばない
- [ ] 非公開の問題：挑戦中が無ければ 404、あれば再開できる（開始確認の概要も、この場合は step2 の `getPassageOverview` が `findAttemptContentById` で読んで `can_start: false` で返す）
- [ ] `createInProgress` が null（同時開始）なら `findAliveInProgress` の結果を返す
- [ ] 語義設問の対象語句が `glossary` にもセグメントの `glossaryEntryId` にも無い。設問に正解・解説・根拠が無い
- [ ] `getAttempt`：他人の挑戦は 404、`expired` は期限切れの形

Controller（インテグレーション）:

- [ ] `POST /api/passage/:id/attempt`：認証なしで 401 / 初回は 201 で DB に `in_progress`（`time_limit_seconds` は問題の値）/ 2 回目は 200 で同じ ID、行は増えない / 下書き・存在しない問題は 404 / ユーザーを消した後のトークンで 401
- [ ] 期限の境界：開始から 23:59:59 の挑戦中は 200 で再開、24:00:00 の挑戦中は `expired` に更新されて新しい挑戦が 201 で作られる
- [ ] レスポンスを `JSON.stringify` して `correct_choice_index` / `explanation_ja` / `evidence` を含まない。`server_now` と `expires_at` がある
- [ ] `GET /api/attempt/:id`：他人の ID・存在しない ID は 404 / 挑戦中は開始時と同じ形 / 24 時間たった挑戦は `status: "expired"` が返り、DB も `expired`

Repository のテスト（実 DB）:

- [ ] `createInProgress` は同じ問題の in_progress があると null、`expired` / `submitted` しか無ければ作れる
- [ ] `expireStale` は対象ユーザーの古い in_progress だけを更新する（新しい in_progress・submitted・他人の行は変えない）
- [ ] `findAttemptContentById` が設問を `order_index`、用語集を `(block_index, start_offset)` の順で返す
