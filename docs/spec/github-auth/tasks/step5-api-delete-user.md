# step5-api-delete-user

api にアカウント削除（`DELETE /api/user`）を足し、`POST /api/auth/refresh` で削除済みユーザーを 401 にする。`users` を物理削除したときにユーザーのデータがすべて cascade で消えることをテストで固定する。

## 前提

- [step2-api-auth-github](./step2-api-auth-github.md)
- ユーザーに紐づくテーブルが揃っていること: [reading-practice step1](../../reading-practice/tasks/step1-db-reading-attempts.md)、[learning-record step1](../../learning-record/tasks/step1-db-user-goals.md)、[study-reminder step1](../../study-reminder/tasks/step1-db-reminder-settings.md)（cascade のテストで使う）
- 仕様: [アカウントの削除](../README.md#アカウントの削除)、[アカウント削除の処理](../README.md#アカウント削除の処理)

## 対応内容

### 1. api-schema（`packages/schema/src/api-schema/user.ts`）

```typescript
/**
 * 削除の確認で入力させる文言。web / mobile の入力欄もこの値と比べる
 */
export const DELETE_ACCOUNT_CONFIRMATION_TEXT = "delete my account"

// ========================================================
// DELETE /api/user - アカウントの削除
// ========================================================

/**
 * アカウント削除のリクエストスキーマ。成功は 204（ボディなし）なのでレスポンススキーマは持たない
 */
export const deleteUserRequestSchema = z.object({
  confirmation: z.literal(DELETE_ACCOUNT_CONFIRMATION_TEXT),
  /** 削除を実行した端末の refresh token。渡されたらその場で失効させる */
  refresh_token: z.string().min(1).optional(),
})

export type DeleteUserRequest = z.infer<typeof deleteUserRequestSchema>
```

`confirmation` が一致しないリクエストは `parseRequest` が 400 にする（Service には届かない）。

### 2. Repository

`UserRepository` に `deleteById(id: number): Promise<void>` を足す。既存の `MemoRepository.deleteById` と同じく、対象が無ければ throw する（Drizzle は `delete(users).where(eq(users.id, id)).returning({ id: users.id })` が空なら throw、Prisma は `user.delete`）。関連テーブルは DB の `ON DELETE CASCADE` で消えるので、Repository で個別に消さない。

契約テスト（`test/repository/user-repository.test.ts`）: 削除後に `findById` が null／紐づく `auth_accounts` も消える／存在しない id は throw。

### 3. Service（`apps/api/src/service/user-service.ts`）

```typescript
type RefreshVerifier = (token: string) => { jti: string; userId: number } | null

/**
 * アカウントの削除。users の行を消し、関連データは外部キーの cascade で消す。
 * 既に無いユーザーでも成功にする（二重送信・削除済みの端末から呼ばれても同じ結果になる）
 */
export const deleteUser = async (
  userId: number,
  input: { refreshToken?: string },
  repo: { refreshTokenRepository: RefreshTokenRepository; userRepository: UserRepository },
  verifier: RefreshVerifier,
): Promise<Result<void>> => {
  const user = await repo.userRepository.findById(userId)
  if (user) await repo.userRepository.deleteById(userId)

  /** 他人の refresh token を消させないよう、本人のものだけ失効させる */
  const payload = input.refreshToken ? verifier(input.refreshToken) : null
  if (payload && payload.userId === userId) await repo.refreshTokenRepository.delete(payload.jti)

  logger.info("UserService: User deleted", { userId })
  return ok(undefined)
}
```

DB の削除を先に行う。Redis の失敗で 500 になっても、再送すれば（ユーザーは消えているので）jti の失効だけが行われる。

### 4. Controller / Router / DI

- `src/controller/user/delete.ts` の `UserDeleteController(userRepository, refreshTokenRepository)`: `parseRequest(deleteUserRequestSchema, req.body)` → `service.user.deleteUser(req.userId!, { refreshToken: refresh_token }, ..., (token) => verifyRefreshToken(token) を { jti, userId } に詰め替え)` → `res.status(204).end()`
- `user-router.ts` に `delete?: UserDeleteController` → `router.delete("/", ...)`
- `src/index.ts` で生成して `userRouter({ delete, get, update })` に渡す。`/api/user` は `PUBLIC_PATHS` に入れない（認証必須）

### 5. refresh 時のユーザー存在確認（`service/auth-service.ts` の `refreshTokens`）

```typescript
export const refreshTokens = async (
  input: { refreshToken: string },
  repo: { refreshTokenRepository: RefreshTokenRepository; userRepository: UserRepository },
  verifier: RefreshVerifier,
  generators: TokenGenerators,
): Promise<Result<RefreshTokensSuccess>> => {
  /** 既存: verifier → Redis の jti と userId の照合（不一致は 401） */

  /** 削除済みユーザーの端末に残った refresh token。jti を消してから 401 にする（README「アカウント削除の処理」） */
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    await repo.refreshTokenRepository.delete(payload.jti)
    return err(unauthorizedError("User not found"))
  }

  /** 既存: ローテーション（旧 jti を削除 → 新しい token を発行して保存） */
}
```

`AuthRefreshController` のコンストラクタに `userRepository` を足し、`src/index.ts` の生成を `new AuthRefreshController(refreshTokenRepository, userRepository)` にする。

既存の `test/controller/auth/refresh.test.ts` は `userId = 1` を DB に作らずに使っているので、`createTestUser()` で作ったユーザーの id を使い、`beforeEach` / `afterAll` に `cleanupTestData()` / `disconnectTestDb()` を足す。`test/service/auth-service/refreshTokens.test.ts` も `userRepository.findById` のモックを足す。

### 6. 書き込み系 API の 401

ユーザー単位で書き込む API（挑戦の開始・提出、目標・リマインダーの保存）は、各機能の Service が `repo.userRepository.findById(userId)` が null なら `err(unauthorizedError(...))` を返す（[reading-practice step3](../../reading-practice/tasks/step3-api-attempt-start.md) / [step4](../../reading-practice/tasks/step4-api-attempt-submit.md)、[learning-record step3](../../learning-record/tasks/step3-api-user-goal.md)、[study-reminder step2](../../study-reminder/tasks/step2-api-user-reminder.md) が実装する）。この step では、`DELETE /api/user` の後に同じ access token で叩くと 401 になることを、実装済みの API についてインテグレーションテストで確かめる（下のチェックリスト）。未実装のものは各 step のテストに含める。

### 7. cascade のテスト（`apps/api/test/repository/user-delete-cascade.test.ts`）

**カタログのテスト**（将来テーブルが増えても検出できるようにする）: `users` から cascade でたどれるテーブルを再帰で集め、それらを参照する外部キーがすべて `ON DELETE CASCADE`（`confdeltype = 'c'`）であることを確かめる。

```typescript
const result = await testDb.execute<{ constraint_name: string; table_name: string }>(sql`
  WITH RECURSIVE owned(table_oid) AS (
    SELECT 'users'::regclass::oid
    UNION
    SELECT c.conrelid FROM pg_constraint c JOIN owned o ON c.confrelid = o.table_oid
    WHERE c.contype = 'f' AND c.confdeltype = 'c'
  )
  SELECT c.conname AS constraint_name, c.conrelid::regclass::text AS table_name
  FROM pg_constraint c
  WHERE c.contype = 'f' AND c.confrelid IN (SELECT table_oid FROM owned) AND c.confdeltype <> 'c'
`)

/** users（とその子孫）を参照しているのに cascade しない外部キーがあると、ユーザーを削除できないかデータが残る */
expect(result.rows).toEqual([])
```

あわせて、`users` から cascade でたどれるテーブル名の一覧が `["attempt_answers", "attempt_word_lookups", "auth_accounts", "reading_attempts", "reminder_settings", "user_goals", "users"]` と一致することも確かめる（テーブルを足したら、この一覧と README の表を更新する合図になる）。

**データのテスト**（`test/controller/user/delete.test.ts` 内）: 1 人のユーザーに `auth_accounts`・`user_goals`・`reminder_settings`・`reading_attempts`（＋ `attempt_answers`・`attempt_word_lookups`）を入れ、別のユーザーにも同じものを入れてから `DELETE /api/user` を呼ぶ。挑戦の行に必要な `content_sources` → `source_documents` → `passages` → `questions` は `testDb` で必須列だけ埋めて作る（列は各テーブルの step のスキーマに合わせる。共通で使うならテストヘルパに切り出す）。

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter api test
pnpm lint:fix
```

Service ユニット:

- [ ] `deleteUser` 正常系: ユーザーがいれば `deleteById` を呼び、本人の refresh token の jti を `delete` する
- [ ] `deleteUser` 正常系: ユーザーが既に無い → `deleteById` を呼ばずに成功、jti は失効させる
- [ ] `deleteUser` 正常系: 他人の refresh token・検証できない token は `delete` しない、`refreshToken` 省略でも成功
- [ ] `refreshTokens` 異常系: ユーザーが無い → 401 `UNAUTHORIZED`、旧 jti が消え、新しい token は発行・保存されない

Controller インテグレーション（`test/controller/user/delete.test.ts`、`test/controller/auth/refresh.test.ts`）:

- [ ] 204 でボディが空。対象ユーザーと関連データがすべて消え、別のユーザーのデータは残る
- [ ] `refresh_token` を渡すと Redis からその jti が消える。渡さなくても 204
- [ ] `confirmation` が `"Delete my account"` / 欠落 → 400 で何も消えない
- [ ] トークンなし → 401
- [ ] 2 回続けて呼ぶ → 2 回とも 204
- [ ] 削除後、同じ access token で `PATCH /api/user` → 401（挑戦の開始・提出、目標・リマインダーの保存も実装済みなら同様に 401）
- [ ] 削除後、別の端末の refresh token で `POST /api/auth/refresh` → 401 で、その jti が Redis から消える
- [ ] 削除後、同じ GitHub アカウントで `POST /api/auth/github` → `is_new_user: true` で新しいユーザーができる
- [ ] cascade のカタログのテストが通る（cascade しない外部キーを一時的に足すと落ちることも一度確かめる）
