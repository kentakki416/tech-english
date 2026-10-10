# step1-db-reminder-settings

`reminder_settings` テーブル（Drizzle のスキーマ・マイグレーション・`schema.prisma`）と、`@repo/domain` の `ReminderSetting` 型を作る。API はまだ作らない（[step2](./step2-api-user-reminder.md)）。

## 前提

- テーブルとしての依存は既存の `users` だけ。ただしマイグレーションのスナップショットを直列に保つため、実装の順番（取り決めの 5.6）どおり次の step のマイグレーションを取り込んでから `db:generate` する
  - [github-auth step1-db-user-timezone](../../github-auth/tasks/step1-db-user-timezone.md)
  - [content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)
  - [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md)
- 列の定義と制約の理由は README の [必要な DB 設計](../README.md#必要な-db-設計) と [曜日の表現](../README.md#曜日の表現)

## 対応内容

### 1. `@repo/domain` の型

`packages/domain/src/types/reminder.ts` を新設する。型だけを置き、既定値（オフ・毎日・21:00）は置かない（既定値は step2 の service が持つ。`types/` は実行時のコードを持たないため）。

```typescript
/** packages/domain/src/types/reminder.ts */

/**
 * 学習リマインダーの設定（1 ユーザー 1 行）
 */
export type ReminderSetting = {
  id: number
  isEnabled: boolean
  /**
   * 通知する時刻。"HH:mm"（端末の時刻、15 分刻み）
   */
  time: string
  userId: number
  /**
   * 通知する曜日。ISO の曜日番号（1 = 月曜 〜 7 = 日曜）の昇順の配列。1 つ以上
   */
  weekdays: number[]
  createdAt: Date
  updatedAt: Date
}
```

- `time` は DB では `time` 型だが、domain では **`"HH:mm"` の文字列に正規化** する（Postgres は `"21:00:00"` を返すため、変換は step2 の Repository 実装で行う）
- `packages/domain/src/index.ts` に `export type { ReminderSetting } from "./types/reminder"` を足す（ファイル名順。`./types/memo` と `./types/user` の間）

### 2. Drizzle のスキーマ

`packages/db/src/drizzle/schema/reminder-setting.ts` を新設する。FK と unique の書き方は既存の `auth-account.ts` に合わせる。

```typescript
/** packages/db/src/drizzle/schema/reminder-setting.ts */
import { boolean, foreignKey, integer, jsonb, pgTable, serial, time, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { users } from "./user"

/**
 * 学習リマインダーの設定（docs/spec/study-reminder）。1 ユーザー 1 行
 *
 * weekdays の値域（1〜7・1 つ以上・重複なし）と time の 15 分刻みは API の Zod で検証する。
 * 既定値は DB に持たせない（未保存のユーザーには API が既定値を返す。既定値を 2 か所に書かない）。
 */
export const reminderSettings = pgTable(
  "reminder_settings",
  {
    id: serial("id").primaryKey(),
    isEnabled: boolean("is_enabled").notNull(),
    /**
     * 端末の時刻。秒は使わないので precision 0
     */
    time: time("time", { precision: 0 }).notNull(),
    userId: integer("user_id").notNull(),
    /**
     * ISO の曜日番号（1 = 月曜 〜 7 = 日曜）の配列
     */
    weekdays: jsonb("weekdays").$type<number[]>().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "reminder_settings_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("reminder_settings_user_id_key").on(table.userId),
  ],
)
```

- `users` の削除で cascade する（[github-auth のアカウント削除の処理](../../github-auth/README.md#アカウント削除の処理)）
- `user_id` の unique index が upsert（step2 の `ON CONFLICT (user_id)`）の対象になる。別に通常の index は作らない
- index 名・制約名は Prisma の命名（`{table}_{column}_key` / `_fkey`）に合わせる（Prisma の `@unique` と同じ名前になり、両者の定義がずれない）
- `packages/db/src/drizzle/schema/index.ts` に `export * from "./reminder-setting"` を足す（ファイル名順。`./memo` と `./user` の間）

### 3. `schema.prisma`

Drizzle と同じ形に合わせる（`packages/db/README.md` の「併存の方針」）。

```prisma
// 学習リマインダーの設定（1 ユーザー 1 行。docs/spec/study-reminder）
model ReminderSetting {
    id        Int      @id @default(autoincrement())
    userId    Int      @unique @map("user_id")
    isEnabled Boolean  @map("is_enabled")
    /// ISO の曜日番号（1 = 月曜 〜 7 = 日曜）の配列
    weekdays  Json
    /// 端末の時刻（15 分刻み）。Prisma では 1970-01-01 の DateTime として読み書きされる
    time      DateTime @db.Time(0)
    createdAt DateTime @default(now()) @map("created_at")
    updatedAt DateTime @updatedAt @map("updated_at")

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@map("reminder_settings")
}
```

- `model User` に `reminderSetting ReminderSetting?` を足す（`accounts AuthAccount[]` の下）
- PostgreSQL の `Json` は `jsonb` になる。`time` 列は Prisma では `DateTime`（日付部分は 1970-01-01）になるので、`"HH:mm"` との変換は step2 の Prisma 実装で行う
- `packages/db/src/index.ts` の Prisma の型の re-export に `ReminderSetting` を足す（アルファベット順。`PrismaClient` と `User` の間）

### 4. マイグレーション

```bash
pnpm --filter api db:generate --name reminder_settings
```

生成された `packages/db/drizzle/migrations/{timestamp}_reminder_settings/migration.sql` を目で確認する。

- `"time" time(0) NOT NULL`、`"weekdays" jsonb NOT NULL`、`"is_enabled" boolean NOT NULL`（どれも DEFAULT なし）
- `CREATE UNIQUE INDEX "reminder_settings_user_id_key" ON "reminder_settings" ("user_id")`
- `FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE cascade`
- `reminder_settings` 以外のテーブルへの差分が混ざっていない（混ざっていたら前の step のマイグレーションの取り込み漏れ）

### 5. Prisma Client の生成とビルド

```bash
pnpm --filter @repo/db prisma:generate
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
```

## 動作確認

```bash
pnpm --filter api db:migrate
pnpm --filter api test   # test DB にもマイグレーションが流れ、既存のテストが通る
pnpm build
pnpm lint:fix
```

- [ ] `db:migrate` が成功し、`\d reminder_settings` で列・unique index・FK（`ON DELETE CASCADE`）が見える
- [ ] `pnpm --filter api test` が既存のテストを含めて通る（`cleanupTestData` の TRUNCATE 対象に新しいテーブルが自動で入る）
- [ ] `pnpm build` が通る（`@repo/domain` → `@repo/db` → 各 app の順に turbo が解決する）

psql で制約を確認する（dev DB。確認後に消す）。

```bash
docker exec -it project-template-postgres psql -U postgres -d project-template_dev
```

```sql
INSERT INTO users (name, updated_at) VALUES ('reminder-check', now()) RETURNING id;
\set id <返った id>
INSERT INTO reminder_settings (user_id, is_enabled, weekdays, time, updated_at)
  VALUES (:id, true, '[1,3,5]', '21:15', now());                                   -- 成功
INSERT INTO reminder_settings (user_id, is_enabled, weekdays, time, updated_at)
  VALUES (:id, false, '[1]', '07:00', now());                                      -- unique 違反で失敗
INSERT INTO reminder_settings (user_id, is_enabled, weekdays, time, updated_at)
  VALUES (999999, true, '[1]', '07:00', now());                                    -- FK 違反で失敗
SELECT time, weekdays FROM reminder_settings WHERE user_id = :id;                  -- 21:15:00 / [1, 3, 5]
DELETE FROM users WHERE id = :id;
SELECT count(*) FROM reminder_settings WHERE user_id = :id;                        -- 0（cascade）
```

- [ ] 上のコメントどおりの結果になる
- [ ] Repository の契約テスト（Drizzle / Prisma の両実装、`time` の変換、cascade）は [step2](./step2-api-user-reminder.md) で書く
