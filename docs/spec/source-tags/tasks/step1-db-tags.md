# step1-db-tags

`@repo/domain` にタグの色の定数・型・色を選ぶ純関数を足し、`tags` / `content_source_tags` のテーブルを作る。migration の中で、今の `content_sources.tags`（jsonb の文字列の配列）をタグとして登録し、ソースとの紐付けを入れる。テーブルの構成と移行の方針は [README の設計](../README.md#設計)、列は [必要な DB 設計](../README.md#必要な-db-設計)。

**`content_sources.tags` 列はこの step では消さない。** api と cron がまだ読んでいるため。列を消すのは [step6](./step6-db-drop-content-sources-tags.md)（expand → contract）。

## 前提

- [content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)：`content_sources`
- `docs/tech-stack/drizzle.md` の「enum 的な列は const から CHECK 制約を作る」

## 対応内容

### `@repo/domain` の定数

並びは自動の割り当ての優先順。隣り合う色の色相が離れる順にする（[色の持ち方と自動の割り当て](../README.md#色の持ち方と自動の割り当て)）。値は Tailwind の既定のパレットの色の名前で、admin の `TagChip`（[step4](./step4-admin-tags.md)）がクラス名に変える。

```typescript
/** packages/domain/src/const/tag.ts */

/**
 * タグの色（Tailwind の既定のパレットの色の名前）。並びは色の自動の割り当ての優先順で、隣り合う色の色相が離れるようにしている。
 * 値を変えたら admin の TagChip の対応表も直す
 */
export const TAG_COLORS = ["blue", "rose", "emerald", "amber", "violet", "teal", "orange", "pink", "lime", "sky"] as const
```

### `@repo/domain` の型

```typescript
/** packages/domain/src/types/tag.ts */
import type { TAG_COLORS } from "../const/tag"

/**
 * タグの色
 */
export type TagColor = (typeof TAG_COLORS)[number]

/**
 * ソースの技術タグ
 */
export type Tag = {
  id: number
  color: TagColor
  /**
   * 表示名。登録したとおりの書き方（大文字・小文字だけが違う名前は登録できない）
   */
  name: string
  createdAt: Date
  updatedAt: Date
}
```

### `@repo/domain` のルール

```typescript
/** packages/domain/src/rules/tag.ts */
import { TAG_COLORS } from "../const/tag"
import type { TagColor } from "../types/tag"

/**
 * タグの色の値かどうか
 */
export const isTagColor = (value: string): value is TagColor =>
  (TAG_COLORS as readonly string[]).includes(value)

/**
 * タグを作るときに自動で割り当てる色。今のタグの色の一覧（usedColors）のうち、使われている数が最も少ない色を返す。
 * 同じ数の色が複数あれば TAG_COLORS の先頭に近い方
 */
export const selectTagColor = (usedColors: readonly TagColor[]): TagColor => {
  const counts = new Map<TagColor, number>(TAG_COLORS.map((color) => [color, 0]))
  for (const color of usedColors) {
    counts.set(color, (counts.get(color) ?? 0) + 1)
  }
  /**
   * 先頭から見て、より少ない色に出会ったときだけ入れ替える。同じ数なら先に見た（先頭に近い）色が残る
   */
  return TAG_COLORS.reduce((selected, color) =>
    (counts.get(color) ?? 0) < (counts.get(selected) ?? 0) ? color : selected,
  )
}
```

`src/index.ts` に足す（ファイルパス順。型は `export type`）：

```typescript
export { MAX_QUESTIONS_PER_PASSAGE, /* ... */ } from "./const/question"
export { TAG_COLORS } from "./const/tag"
export { VOCABULARY_GRADES, /* ... */ } from "./const/vocabulary"
/* ... */
export { isQuestionType } from "./rules/question"
export { isTagColor, selectTagColor } from "./rules/tag"
export { isVocabularyCardDue, /* ... */ } from "./rules/vocabulary"
/* ... */
export type { SourceDocument } from "./types/source-document"
export type { Tag, TagColor } from "./types/tag"
export type { User } from "./types/user"
```

この step では `ContentSource` 型の `tags` は残す（外すのは step3）。

### Drizzle のスキーマ

`tags`：

```typescript
/** packages/db/src/drizzle/schema/tag.ts */
import { sql } from "drizzle-orm"
import { check, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core"

import { TAG_COLORS } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"

/**
 * ソースの技術タグ。管理者が admin の「タグ」で登録し、ソースには content_source_tags で付ける
 *
 * 大文字・小文字だけが違う名前（React と react）は lower(name) の unique index で拒否する。
 * 列の正本は docs/spec/source-tags/README.md の「必要な DB 設計」。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    /**
     * TAG_COLORS（Tailwind の既定のパレットの色の名前）
     */
    color: text("color", { enum: TAG_COLORS }).notNull(),
    /**
     * 表示名。登録したとおりの書き方
     */
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    check("tags_color_check", sql`${table.color} IN (${joinSqlValues(TAG_COLORS)})`),
    /**
     * api-schema の検証（trim・1〜30 文字・カンマ禁止）と同じ。カンマはユーザーの問題一覧の URL の区切り（?tag=react,rust）
     */
    check(
      "tags_name_check",
      sql`${table.name} = btrim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 30 AND strpos(${table.name}, ',') = 0`,
    ),
    uniqueIndex("tags_name_lower_key").on(sql`lower(${table.name})`),
  ],
)
```

`content_source_tags`：

```typescript
/** packages/db/src/drizzle/schema/content-source-tag.ts */
import { foreignKey, index, integer, pgTable, primaryKey } from "drizzle-orm/pg-core"

import { contentSources } from "./content-source"
import { tags } from "./tag"

/**
 * ソースとタグの紐付け。ソースかタグを消すと紐付けも消える（CASCADE）
 *
 * 紐付けた時刻は使わないので timestamps は持たない。
 */
export const contentSourceTags = pgTable(
  "content_source_tags",
  {
    contentSourceId: integer("content_source_id").notNull(),
    tagId: integer("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contentSourceId, table.tagId], name: "content_source_tags_pkey" }),
    foreignKey({
      columns: [table.contentSourceId],
      foreignColumns: [contentSources.id],
      name: "content_source_tags_content_source_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * タグを消すとソースから外れる（admin の削除の確認で件数を出してから消す）
     */
    foreignKey({
      columns: [table.tagId],
      foreignColumns: [tags.id],
      name: "content_source_tags_tag_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * タグを使っているソースの数を数える・タグで問題を絞り込むため（主キーの先頭は content_source_id なので tag_id からは引けない）
     */
    index("content_source_tags_tag_id_idx").on(table.tagId),
  ],
)
```

`schema/index.ts` に足す（ファイル名順）：

```typescript
export * from "./content-source"
export * from "./content-source-tag"
/* ... */
export * from "./source-document"
export * from "./tag"
export * from "./user"
```

### マイグレーション

```bash
pnpm --filter @repo/domain build
pnpm --filter api db:generate --name add_tags   # packages/db/drizzle/migrations/<timestamp>_add_tags/ ができる
```

生成された `migration.sql` を目で確認する：

- `tags` に `tags_color_check`（10 色）と `tags_name_check`
- `content_source_tags` の `PRIMARY KEY("content_source_id","tag_id")`（制約名 `content_source_tags_pkey`）
- `CREATE UNIQUE INDEX "tags_name_lower_key" ON "tags" (lower("name"))`
- `content_source_tags_tag_id_idx`、FK 2 つ（`ON DELETE CASCADE ON UPDATE CASCADE`）
- `content_sources` への変更が無いこと（列はまだ消さない）

生成された SQL の末尾に、既存のタグの移行を書き足す。**マーカーのコメント（`-- source-tags: ...`）は消さない**（[動作確認](#動作確認) の移行のテストがこの間を取り出して流す）。

```sql
--> statement-breakpoint
-- source-tags: 既存のタグの移行（ここから）
/*
 * content_sources.tags（jsonb の文字列の配列）の名前を、前後の空白を除いて大文字・小文字を区別せずに 1 つにまとめ、tags に入れる。
 * - 書き方は id が最小のソース（同じソースの中では配列の先の方）のものを採る
 * - 空文字・空白だけの名前は移さない
 * - 色は lower(name) の順に、TAG_COLORS を先頭から順番に割り当てる
 *
 * 色の配列は、この migration を書いた時点の TAG_COLORS（packages/domain/src/const/tag.ts）の写し。
 * 定数に無い値を書くと tags_color_check に掛かって migration 全体がロールバックされるので、不正な色は入らない。
 * 適用済みの migration は直さないので、あとで TAG_COLORS を変えてもこの配列は変えない
 */
WITH "source_tag_names" AS (
  SELECT "content_sources"."id" AS "source_id", btrim("tag"."name") AS "name", "tag"."position"
  FROM "content_sources"
  CROSS JOIN LATERAL jsonb_array_elements_text("content_sources"."tags") WITH ORDINALITY AS "tag"("name", "position")
  WHERE btrim("tag"."name") <> ''
),
"canonical_names" AS (
  SELECT DISTINCT ON (lower("name")) "name"
  FROM "source_tag_names"
  ORDER BY lower("name"), "source_id", "position"
)
INSERT INTO "tags" ("name", "color", "created_at", "updated_at")
SELECT
  "name",
  (ARRAY['blue', 'rose', 'emerald', 'amber', 'violet', 'teal', 'orange', 'pink', 'lime', 'sky'])[
    ((row_number() OVER (ORDER BY lower("name")) - 1) % 10) + 1
  ],
  now() AT TIME ZONE 'UTC',
  now() AT TIME ZONE 'UTC'
FROM "canonical_names";
--> statement-breakpoint
/*
 * ソースとタグの紐付け。同じソースに大文字・小文字だけが違う名前が 2 つあっても 1 つの紐付けにする（DISTINCT）
 */
INSERT INTO "content_source_tags" ("content_source_id", "tag_id")
SELECT DISTINCT "content_sources"."id", "tags"."id"
FROM "content_sources"
CROSS JOIN LATERAL jsonb_array_elements_text("content_sources"."tags") AS "tag"("name")
INNER JOIN "tags" ON lower("tags"."name") = lower(btrim("tag"."name"))
WHERE btrim("tag"."name") <> '';
-- source-tags: 既存のタグの移行（ここまで）
```

- 既存のタグは今の api-schema（`trim`・1〜30 文字）と admin のフォーム（カンマで分ける）を通っているので、`tags_name_check` には掛からない。もし掛かれば migration 全体がロールバックされ、デプロイが止まる（黙って捨てない）
- `created_at`・`updated_at` は `now() AT TIME ZONE 'UTC'` を明示する。日時の列は `timestamp`（タイムゾーン無し）を UTC として扱うが、セッションを UTC に固定しているのはアプリの client（`packages/db/src/drizzle/client.ts`）だけで、drizzle-kit migrate のセッションは固定していない。`created_at` の default の `now()` や素の `now()` に任せると、ローカル（docker-compose は `TZ=Asia/Tokyo`）では 9 時間ずれて入る。`updated_at` はもともと DB の default を持たない（`columns.ts`）
- `db:migrate` は未適用の migration を 1 トランザクションで流すので、表の作成と移行は一緒に成功するか一緒に戻る

```bash
pnpm --filter api db:migrate
```

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
pnpm --filter @repo/domain test
pnpm --filter api test      # test DB に migration が流れる。vitest を直接叩かない（dev DB が消える）
pnpm lint:fix
```

api のテストは必ず `pnpm --filter api test`（= `DB_NAME=tech-english_test` を付けて test DB に向ける）で流す。`vitest` を直接実行すると `.env.local` の dev DB に繋がり、`cleanupTestData` が dev DB を全部消す。

`packages/domain/test/rules/tag.test.ts`：

- `isTagColor`
  - 正常系
    - [ ] `TAG_COLORS` のすべての値で true（`it.each(TAG_COLORS)`）
  - 異常系
    - [ ] `""`・`"red"`・`"Blue"`・`" blue"` で false
- `selectTagColor`
  - 正常系
    - [ ] 空の配列（タグが 0 個）なら `TAG_COLORS[0]`（`blue`）
    - [ ] `blue` だけ使われていれば `rose`（2 番目）
    - [ ] 全色が 1 回ずつ使われていれば（同数）`blue`。`blue` を 2 回にすると `rose`
    - [ ] 最少の色が途中にある（`blue`×2・`rose`×2・`emerald`×1・ほかは 2）なら `emerald`
    - [ ] 最少が複数ある（`amber`・`sky` が 0、ほかは 1）ならパレットの先頭に近い `amber`
    - [ ] 末尾の色（`sky`）だけが最少なら `sky`（境界）

`apps/api/test/schema/source-tags.test.ts`（実 DB。`testDb` に直接 insert して制約を確かめる。不正な値は `sql` の生 insert で入れ、`content-collection.test.ts` と同じく SQLSTATE と制約名で判定する）：

- 正常系
  - [ ] `tags` に `{ color: "blue", name: "React" }` を insert できる。`created_at` が入る
  - [ ] 1 つのソースに 2 つのタグを紐付けられる。2 つのソースに同じタグを紐付けられる
  - [ ] タグを消すと、そのタグの `content_source_tags` の行だけが消える（ソースとほかのタグの紐付けは残る）
  - [ ] ソースを消すと、そのソースの `content_source_tags` の行が消える（タグは残る）
- 異常系
  - [ ] `React` があると `react`・`REACT` は `tags_name_lower_key` で失敗する（`23505`）
  - [ ] `color = 'red'` は `tags_color_check` で失敗する（`23514`）
  - [ ] `name` が `''`・`' React'`（前後の空白）・31 文字・`'react,vue'` は `tags_name_check` で失敗する。30 文字ちょうどは入る（境界）
  - [ ] 同じ `(content_source_id, tag_id)` を 2 回入れると `content_source_tags_pkey` で失敗する
  - [ ] 存在しないソース・タグの id の紐付けは FK で失敗する（`23503`）

`apps/api/test/schema/source-tags-migration.test.ts`（実 DB。migration の移行の SQL を取り出して流す）：

`packages/db/drizzle/migrations/*_add_tags/migration.sql` を読み、`-- source-tags: 既存のタグの移行（ここから）` から `（ここまで）` までを `--> statement-breakpoint` で分けて、`testDb.execute(sql.raw(statement))` で順に流す。test DB は migration を適用済み（`tags` は空）なので、`cleanupTestData` の後に `content_sources` を入れてから流す。`content_sources` は `` testDb.execute(sql`INSERT INTO content_sources (..., tags) VALUES (...)`) `` の生の SQL で入れる（[step3](./step3-api-content-source-tags.md) で Drizzle のスキーマから `tags` の定義を外しても、このテストを直さずに済むように）。**このテストは `content_sources.tags` 列を前提にするので、[step6](./step6-db-drop-content-sources-tags.md) で列を消すときに一緒に消す。**

- 正常系
  - [ ] ソース A（id 小）`["React", "frontend"]`・ソース B `["react", " Go ", ""]`・ソース C `["go", "Frontend"]` を入れて流すと、`tags` が `React`・`frontend`・`Go` の 3 行になる（書き方は id が最小のソースのもの、前後の空白は除く、空文字は移さない）
  - [ ] 色は `lower(name)` の順（`frontend` → `go` → `react`）に `blue`・`rose`・`emerald` が割り当たる
  - [ ] 紐付け：A → `React`・`frontend`、B → `React`・`Go`、C → `Go`・`frontend`
  - [ ] 同じソースの `["React", "react"]` は紐付けが 1 行になる
  - [ ] タグが空の配列のソースしか無ければ、`tags` も `content_source_tags` も 0 行
  - [ ] 11 個の名前を移すと、11 個目（`lower(name)` の順）の色が `blue` に戻る（パレットの一周の境界）
