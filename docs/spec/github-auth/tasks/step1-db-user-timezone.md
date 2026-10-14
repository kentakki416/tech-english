# step1-db-user-timezone

`users` に `timezone` 列を足し、`@repo/domain` の `User` 型に `timezone` を加える。API の入出力はこの step では変えない（step2 で使う）。

## 前提

- なし（github-auth の最初の step）。他機能のテーブル追加（[content-collection step1](../../content-collection/tasks/step1-db-content-sources.md) 以降）より先に入れる
- 仕様: [必要な DB 設計](../README.md#必要な-db-設計)（`timezone text NOT NULL DEFAULT 'Asia/Tokyo'`、CHECK 制約にしない理由も同節）

## 対応内容

### 1. Drizzle スキーマ（正本）

```typescript
/** packages/db/src/drizzle/schema/user.ts */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    avatarUrl: text("avatar_url"),
    email: text("email"),
    name: text("name"),
    /**
     * IANA タイムゾーン名（例: Asia/Tokyo）。学習日の判定に使う。
     * 値の検証は API の入力時に行い、DB の CHECK 制約にはしない（IANA の一覧が更新されるため）
     */
    timezone: text("timezone").notNull().default("Asia/Tokyo"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
)
```

### 2. マイグレーション

DB 接続は不要なので `packages/db` で直接生成する。

```bash
pnpm --filter @repo/db db:generate --name add_user_timezone
```

`packages/db/drizzle/migrations/{timestamp}_add_user_timezone/` に `migration.sql` と `snapshot.json` ができる。SQL は次の 1 文だけになっていることを目で確認してからコミットする（`DROP` / `CREATE TABLE` が混ざっていたらスキーマの書き間違い）。

```sql
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'Asia/Tokyo' NOT NULL;
```

- 既存の行には既定値の `Asia/Tokyo` が入る（`NOT NULL` と `DEFAULT` が同じ文なので失敗しない）
- ローカルの ClickHouse の CDC（`pg_cdc.users`）は列の追加で同期が止まることがある。止まったら `packages/db/README.md` の「ローカル DB の作り直し」の手順 1・4（CDC を外して張り直す）だけを行う（ローカル専用。prd は ClickPipes）

### 3. `@repo/domain` の `User`

```typescript
/** packages/domain/src/types/user.ts */
export type User = {
  avatarUrl: string | null
  createdAt: Date
  email: string | null
  id: number
  name: string | null
  /**
   * IANA タイムゾーン名（例: Asia/Tokyo）
   */
  timezone: string
  updatedAt: Date
}
```

### 4. `User` を組み立てている箇所の追従

`User` に必須の項目が増えるので、次の箇所が型エラーになる。すべてに `timezone` を足す。

| ファイル | 変更 |
| --- | --- |
| `apps/api/src/repository/drizzle/user-repository.ts` | `_toDomainUser` に `timezone: row.timezone` |
| `apps/api/src/repository/drizzle/auth-account-repository.ts` | 同上（`findByProvider` の `user`） |
| `apps/api/test/controller/helper.ts` | `createTestUser` が返す `User` に `timezone: row.timezone` |
| `apps/api/test/service/auth-service/authenticateWithGoogle.test.ts`、`test/service/user-service/getUserById.test.ts` | テスト用の `User` に `timezone: "Asia/Tokyo"` |

- `CreateUserInput` はこの step では変えない（insert で省略すれば DB の既定値が入る）。`timezone` を受け取るのは step2
- seed（`packages/db/drizzle/seed.ts`）も変えない。dev ユーザーは既定値の `Asia/Tokyo` になる

### 5. Repository のテスト

```typescript
/** apps/api/test/repository/user-repository.test.ts の「正常系」に追加 */
it("timezone を省略して作ると Asia/Tokyo になる", async () => {
  const created = await userRepository.create({ email: "tz@example.com" })

  expect(created.timezone).toBe("Asia/Tokyo")
  expect(await userRepository.findById(created.id)).toEqual(created)
})
```

`auth-account-repository.test.ts` の `toEqual({ ...created, user })` は `user` に `timezone` が入るだけで、そのまま通る。

## 動作確認

```bash
pnpm --filter @repo/domain build
pnpm --filter api db:migrate
pnpm --filter api test
pnpm build
pnpm lint:fix
```

- [ ] `migration.sql` が `ALTER TABLE "users" ADD COLUMN "timezone" ...` の 1 文だけ
- [ ] dev DB に migrate した後、既存ユーザーに `Asia/Tokyo` が入っている（`docker exec tech-english-postgres psql -U postgres -d tech-english_dev -c 'SELECT id, timezone FROM users'`）
- [ ] 「timezone を省略して作ると Asia/Tokyo になる」が通る
- [ ] 既存のテスト（auth / user / memo / repository）がすべて通る
- [ ] `pnpm build` が通る（api 以外に `User` を組み立てている箇所が無いことの確認）
