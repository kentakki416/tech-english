# step3-api-vocabulary-review

1 枚の答えの保存 `POST /api/vocabulary/review` を実装する。答えから次の段階と次に出す日を求め、`vocabulary_cards` の upsert と `vocabulary_reviews` の追加を 1 トランザクションで行う。`client_review_id` で冪等にする。

## 前提

- [step1-db-vocabulary-cards](./step1-db-vocabulary-cards.md)（テーブルと `scheduleVocabularyReview`・`normalizeVocabularyLemma`・`VOCABULARY_MAX_CARD_SECONDS`）
- [step2-api-vocabulary-session](./step2-api-vocabulary-session.md)（`VocabularyRepository`・候補の CTE・`vocabulary-router.ts`・API スキーマのファイル）
- 仕様は README の [復習の間隔](../README.md#復習の間隔)・[答えの保存](../README.md#答えの保存)・[時間の計測](../README.md#時間の計測)

## 対応内容

### 1. API スキーマ

step2 の `packages/schema/src/api-schema/vocabulary.ts` に足す。

```typescript
import { VOCABULARY_GRADES, WORD_LOOKUP_SOURCES } from "@repo/domain"

// ========================================================
// POST /api/vocabulary/review - 1 枚の答えの保存
// ========================================================

/**
 * 1 枚の答えの保存のリクエストスキーマ。active_seconds は上限を超えてもサーバーが切り詰めるので 400 にしない
 */
export const reviewVocabularyCardRequestSchema = z.object({
  active_seconds: z.number().int().min(0),
  /**
   * クライアントが作る UUID。通信のやり直しで同じ答えを送り直すときは同じ値を使う
   */
  client_review_id: z.string().uuid(),
  grade: z.enum(VOCABULARY_GRADES),
  /**
   * GET /api/vocabulary/session の lemma をそのまま送る
   */
  lemma: z.string().trim().min(1).max(200),
})

export type ReviewVocabularyCardRequest = z.infer<typeof reviewVocabularyCardRequestSchema>

/**
 * 1 枚の答えの保存のレスポンススキーマ（答えた後のカードの状態）。due_date は覚えた単語なら null
 */
export const reviewVocabularyCardResponseSchema = z.object({
  due_date: z.string().nullable(),
  lemma: z.string(),
  stage: z.number().int().min(0).max(4),
})

export type ReviewVocabularyCardResponse = z.infer<typeof reviewVocabularyCardResponseSchema>
```

- `active_seconds` に上限を付けない（クライアントの計測が上限を超えても答えは保存したいので、サーバーで `VOCABULARY_MAX_CARD_SECONDS` に切り詰める。長文読解の `active_seconds` と同じ扱い）

### 2. Repository

step2 の `VocabularyRepository` に書き込みのメソッドを足す。

```typescript
/** apps/api/src/repository/vocabulary-repository.ts に足す */

/**
 * 答えの保存の入力。カードは (user_id, lemma) で upsert する
 */
export type SaveVocabularyReviewInput = {
  activeSeconds: number
  clientReviewId: string
  /**
   * 答えた後の次に出す日。覚えた単語は null
   */
  dueDate: string | null
  grade: VocabularyGrade
  lemma: string
  reviewedAt: Date
  stageAfter: number
  stageBefore: number | null
  studyDate: string
  userId: number
}

export interface VocabularyRepository {
  /** …（step2 のメソッド） */

  /**
   * 見出し語のカード。無ければ null
   */
  findCardByLemma(userId: number, lemma: string, tx: TransactionContext): Promise<VocabularyCard | null>
  /**
   * client_review_id の答えが保存済みなら、そのカードの今の状態。無ければ null
   */
  findReviewedCard(userId: number, clientReviewId: string, tx: TransactionContext): Promise<VocabularyCard | null>
  /**
   * 見出し語が出題の候補にあり、意味が用意できるか（step2 の候補の CTE を見出し語で絞る）
   */
  hasEncounter(userId: number, lemma: string, tx: TransactionContext): Promise<boolean>
  /**
   * 同じユーザーの答えの保存を直列にするため、users の行を FOR NO KEY UPDATE でロックする。ユーザーが無ければ false
   */
  lockUserForReview(userId: number, tx: TransactionContext): Promise<boolean>
  /**
   * カードを upsert し、答えを 1 行足す（同じ tx の中で呼ぶ）。保存後のカードを返す
   */
  saveReview(input: SaveVocabularyReviewInput, tx: TransactionContext): Promise<VocabularyCard>
}
```

#### Drizzle 実装

```typescript
public async lockUserForReview(userId: number, tx: TransactionContext): Promise<boolean> {
  const rows = await resolveDrizzleClient(this._db, tx)
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("no key update")
  return rows.length > 0
}

public async saveReview(input: SaveVocabularyReviewInput, tx: TransactionContext): Promise<VocabularyCard> {
  const db = resolveDrizzleClient(this._db, tx)
  const values = { dueDate: input.dueDate, lastReviewedAt: input.reviewedAt, stage: input.stageAfter }
  const [card] = await db
    .insert(vocabularyCards)
    .values({ ...values, lemma: input.lemma, userId: input.userId })
    .onConflictDoUpdate({ set: values, target: [vocabularyCards.userId, vocabularyCards.lemma] })
    .returning()
  await db.insert(vocabularyReviews).values({
    activeSeconds: input.activeSeconds,
    cardId: card.id,
    clientReviewId: input.clientReviewId,
    grade: input.grade,
    stageAfter: input.stageAfter,
    stageBefore: input.stageBefore,
    studyDate: input.studyDate,
    userId: input.userId,
  })
  return convertVocabularyCardRowToDomain(card)
}
```

- **ロックは `FOR NO KEY UPDATE`**。`FOR UPDATE` にすると、同じユーザーの他のテーブルへの insert（外部キーの確認が取る `FOR KEY SHARE`）まで待たせるため。`FOR NO KEY UPDATE` 同士はぶつかるので、同じユーザーの答えの保存だけが直列になる（既存の `.for("update")` は `passage-repository.ts`）
- `findReviewedCard` は `vocabulary_reviews` を `(user_id, client_review_id)` で引いて `vocabulary_cards` に join し、カードの今の状態を返す
- `hasEncounter` は step2 の `_buildEncountersCte(userId)` に `SELECT EXISTS (SELECT 1 FROM encounters WHERE lemma = ${lemma})` を続ける
- `vocabulary_reviews (user_id, client_review_id)` の unique 違反は、ロックとその後の `findReviewedCard` で起きない。起きたら想定外として throw のまま 500 にする
- `convertVocabularyCardRowToDomain` は既存の `_toDomainMemo` と同じ形（`dueDate` は `date` の `mode: "string"` なので `"YYYY-MM-DD"` のまま）

### 3. Service

今日の分かどうかの判定は `@repo/domain` の `rules/vocabulary.ts` に純関数で足す（テストは `test/rules/vocabulary.test.ts`。今日が境界・`null` は今日の分ではない）。

```typescript
/**
 * カードが今日の分か（次に出す日が今日以前）。覚えた単語（次に出す日なし）は今日の分ではない。today は users.timezone での今日（YYYY-MM-DD）
 */
export const isVocabularyCardDue = (card: Pick<VocabularyCard, "dueDate">, today: string): boolean =>
  card.dueDate !== null && card.dueDate <= today
```

step2 の `src/service/vocabulary-service.ts` に足す。行動イベントは送らない（長文読解の提出と同じく、答えは `vocabulary_reviews` に残るため）。

```typescript
/**
 * 答えた後のカードの状態
 */
export type VocabularyReviewResult = Pick<VocabularyCard, "dueDate" | "lemma" | "stage">

const convertCardToReviewResult = (card: VocabularyCard): VocabularyReviewResult => ({
  dueDate: card.dueDate,
  lemma: card.lemma,
  stage: card.stage,
})

/**
 * 1 枚の答えを保存する。次の段階と次に出す日は users.timezone での今日から求める（README「復習の間隔」）。
 *
 * - 同じ client_review_id の答えが保存済みなら何もせず、そのカードの今の状態を返す（冪等）
 * - 今日の分ではないカード（次に出す日が今日より後・覚えた単語）への答えは保存せず、そのカードの今の状態を返す
 * - カードが無く、出題の候補にも無い（意味が用意できない）見出し語は 404
 * - 見ていた秒数は 0〜VOCABULARY_MAX_CARD_SECONDS に切り詰める
 */
export const reviewVocabularyCard = async (
  userId: number,
  input: { activeSeconds: number; clientReviewId: string; grade: VocabularyGrade; lemma: string },
  repo: { transactionRunner: TransactionRunner; userRepository: UserRepository; vocabularyRepository: VocabularyRepository },
  deps: { now: Date },
): Promise<Result<VocabularyReviewResult>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)
  const lemma = normalizeVocabularyLemma(input.lemma)
  const activeSeconds = Math.min(input.activeSeconds, VOCABULARY_MAX_CARD_SECONDS)

  return repo.transactionRunner.run(async (tx): Promise<Result<VocabularyReviewResult>> => {
    /**
     * 同じユーザーの答えを直列にする。通信のやり直しで同じ答えが同時に届いても、後の方は先の方の行を見て何もしない
     */
    const isLocked = await repo.vocabularyRepository.lockUserForReview(userId, tx)
    if (!isLocked) return err(unauthorizedError("User not found"))

    const reviewed = await repo.vocabularyRepository.findReviewedCard(userId, input.clientReviewId, tx)
    if (reviewed) return ok(convertCardToReviewResult(reviewed))

    const card = await repo.vocabularyRepository.findCardByLemma(userId, lemma, tx)
    if (!card && !(await repo.vocabularyRepository.hasEncounter(userId, lemma, tx))) {
      return err(notFoundError("Word not found in the vocabulary"))
    }
    /**
     * 戻るボタンで古い 1 回分を答え直した・別の端末で先に答えた、のような重なった答えで段階を 2 つ進めない
     */
    if (card && !isVocabularyCardDue(card, today)) return ok(convertCardToReviewResult(card))

    const stageBefore = card?.stage ?? null
    const schedule = scheduleVocabularyReview(stageBefore, input.grade, today)
    const saved = await repo.vocabularyRepository.saveReview(
      {
        activeSeconds,
        clientReviewId: input.clientReviewId,
        dueDate: schedule.dueDate,
        grade: input.grade,
        lemma,
        reviewedAt: deps.now,
        stageAfter: schedule.stage,
        stageBefore,
        studyDate: today,
        userId,
      },
      tx,
    )
    return ok(convertCardToReviewResult(saved))
  })
}
```

- 先に `findUser` でタイムゾーンを読み、tx の中でロックしてからもう一度ユーザーの有無を確かめる（その間に削除されたら 401。外部キー違反の 500 にしない）
- 同じ見出し語のカードが、覚えた単語（段階 4）でも答えは受け付ける（2 台の端末で開いていた場合など）。段階の計算は step1 の `scheduleVocabularyReview` に任せる

### 4. Controller

`src/controller/vocabulary/review.ts`（`VocabularyReviewController`）。step2 の Controller と同じ形で、`TransactionRunner` も受ける。

```typescript
/** apps/api/src/controller/vocabulary/review.ts */
export class VocabularyReviewController {
  constructor(
    private _transactionRunner: TransactionRunner,
    private _userRepository: UserRepository,
    private _vocabularyRepository: VocabularyRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const data = parseRequest(reviewVocabularyCardRequestSchema, req.body)

    const result = await service.vocabulary.reviewVocabularyCard(
      req.userId!,
      { activeSeconds: data.active_seconds, clientReviewId: data.client_review_id, grade: data.grade, lemma: data.lemma },
      {
        transactionRunner: this._transactionRunner,
        userRepository: this._userRepository,
        vocabularyRepository: this._vocabularyRepository,
      },
      { now: new Date() },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(reviewVocabularyCardResponseSchema, {
      due_date: result.value.dueDate,
      lemma: result.value.lemma,
      stage: result.value.stage,
    })
    return res.status(200).json(response)
  }
}
```

- 保存済みの答えを返すときも 200（作り直しではないので 201 にしない。長文読解の提出と同じ）

### 5. Router と DI

`vocabulary-router.ts` の `VocabularyRouterControllers` に `review?: VocabularyReviewController` を足し、`router.post("/review", ...)` を登録する（コメントは `/** POST /api/vocabulary/review */`）。`src/index.ts` で既存の `transactionRunner` を渡して Controller を作り、`vocabularyRouter({ review, session, summary })` に足す。

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm lint:fix
```

### Repository のテスト

`test/repository/vocabulary-repository.test.ts` に足す（実 DB。tx は既存の `DrizzleTransactionRunner` で作る）:

- 正常系
  - [ ] `saveReview` で、カードの無い見出し語ならカードが 1 行でき、答えが 1 行足される（`toMatchObject`）
  - [ ] 同じ見出し語の 2 回目の `saveReview` で、同じカード（`id` が同じ）の段階・次に出す日・`last_reviewed_at` が更新され、答えは 2 行になる
  - [ ] 段階 4 で `dueDate: null` を保存できる
  - [ ] `findReviewedCard` が保存済みの `client_review_id` でカードの今の状態を返し、他のユーザーの同じ `client_review_id` では `null`
  - [ ] `hasEncounter` が候補にある見出し語で `true`、候補に無い・意味が用意できない見出し語で `false`
  - [ ] `lockUserForReview` が存在するユーザーで `true`、存在しないユーザーで `false`
- 異常系
  - [ ] 同じユーザー・同じ `client_review_id` の答えをもう 1 行入れると throw する（unique 違反）
  - [ ] `users` の行を消すと、カードと答えが消える（cascade）

### Service のユニットテスト

`test/service/vocabulary-service/reviewVocabularyCard.test.ts`（Repository と `transactionRunner.run` は `vi.fn()`。`run` は渡された関数をそのまま呼ぶ）:

- 正常系
  - [ ] カードの無い見出し語で「覚えた」→ `saveReview` が `stageBefore: null`・`stageAfter: 1`・`dueDate` は 3 日後・`studyDate` は今日で呼ばれる
  - [ ] 段階 2 のカードで「まだ」→ `stageAfter: 0`・翌日
  - [ ] 段階 3 のカードで「覚えた」→ `stageAfter: 4`・`dueDate: null`
  - [ ] 見出し語は小文字にして扱う（`"Effect"` で `findCardByLemma` が `"effect"` で呼ばれる）
  - [ ] `activeSeconds` の 60 はそのまま、61 は 60 に切り詰める（境界値）
  - [ ] 「今日」は `users.timezone` で決まる（`2026-10-14T15:30:00Z` は `Asia/Tokyo` で `studyDate: "2026-10-15"`、`dueDate` もそこから数える）
  - [ ] 保存済みの `client_review_id` なら `saveReview` を呼ばず、そのカードの今の状態を返す
  - [ ] 次に出す日が過ぎたカードは今日の分として保存する
  - [ ] 次に出す日が明日のカード（今日の分ではない）・覚えた単語（`dueDate: null`）には `saveReview` を呼ばず、そのカードの今の状態を返す（境界値）
- 異常系
  - [ ] ユーザーが無ければ 401 で、`transactionRunner.run` を呼ばない
  - [ ] ロックでユーザーが見つからなければ 401 で、`saveReview` を呼ばない
  - [ ] カードが無く `hasEncounter` が `false` なら `ok: false`・`statusCode: 404` で、`saveReview` を呼ばない

### Controller のインテグレーションテスト

`test/controller/vocabulary/review.test.ts`（実 DB、ユーザーは `createTestUser`。候補は step2 の fixture で作る）:

- 正常系
  - [ ] 新しい単語に「覚えた」で 200 と `{ due_date: <3 日後>, lemma, stage: 1 }`（`toEqual`）、`vocabulary_cards` に 1 行・`vocabulary_reviews` に 1 行（`toMatchObject`。`study_date`・`active_seconds`・`stage_before: null`）
  - [ ] 今日の分の段階 2 のカードに「まだ」で `stage: 0`・翌日、答えは 1 行（`stage_before: 2`）
  - [ ] **答えたカード（次に出す日が今日より後）に別の `client_review_id` でもう一度答えても、1 回目と同じ状態が返り、段階は変わらず答えは 1 行のまま**（戻るボタンで古い 1 回分を答え直したとき）
  - [ ] **同じ `client_review_id` で 2 回送ると、2 回目も 200 で同じ状態が返り、カードの段階は 1 つしか進まず、答えは 1 行のまま**
  - [ ] **同じ `client_review_id` の 2 つのリクエストを `Promise.all` で同時に送っても、答えは 1 行・段階は 1 つだけ進む**（ロックの確認）
  - [ ] `active_seconds: 999` は 200 で、保存は 60
  - [ ] 答えた後に `GET /api/vocabulary/session` を呼ぶと、そのカードが（次に出す日まで）返らない
  - [ ] 答えた後に `GET /api/vocabulary/summary` の `new_count` が 1 減り、`learning_count` が 1 増える
- 異常系
  - [ ] トークンなし・無効なトークンで 401
  - [ ] トークンのユーザーが存在しない（`generateAccessToken(999999)`）と 401 で、行は作られない
  - [ ] 候補に無い見出し語で 404、行は作られない
  - [ ] 400 になり DB が変わらない：`client_review_id` が UUID でない・欠落、`grade` が `"skip"`、`lemma` が空文字・空白だけ・201 文字、`active_seconds` が `-1`・`1.5`・欠落

### 手動確認

```bash
LEMMA=$(curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/api/vocabulary/session | jq -r '.cards[0].lemma')
ID=$(uuidgen | tr 'A-Z' 'a-z')
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"client_review_id\":\"$ID\",\"lemma\":\"$LEMMA\",\"grade\":\"remembered\",\"active_seconds\":8}" \
  localhost:8080/api/vocabulary/review
```

- [ ] `{"due_date":"<3 日後>","lemma":"…","stage":1}` が返り、同じコマンドをもう一度流しても同じ結果で `stage` が 2 にならない
