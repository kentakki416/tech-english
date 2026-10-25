# step1-db-source-collection-runs

収集の実行の記録（`source_collection_runs`）のテーブルと、状態の値の定数・ドメインの型を足す。仕様と理由は [README](../README.md#収集の実行の記録)。

## 対応内容

### 変えるファイル

| 層 | ファイル | 内容 |
| --- | --- | --- |
| domain | `packages/domain/src/const/source-collection-run.ts`（新規）・`types/source-collection-run.ts`（新規）・`index.ts` | 状態の値と型 |
| db | `packages/db/src/drizzle/schema/source-collection-run.ts`（新規）・`schema/index.ts` | テーブル定義 |
| db | `packages/db/drizzle/migrations/` | `db:generate` で作るマイグレーション |
| cron | `apps/cron/src/service/collection/types.ts` | `SourceCollectionStatus` を `@repo/domain` の `SourceCollectionResultStatus` の別名にする（step3 で worker に移す） |
| test | `apps/api/test/schema/source-collection-run.test.ts`（新規） | CHECK・部分 unique index・外部キー |
| docs | `packages/domain/README.md` | 定数の一覧に足す（一覧があれば） |

### ドメインの定数

`const/source-collection-run.ts`：

```ts
export const SOURCE_COLLECTION_RESULT_STATUSES = ["completed", "limit_reached", "rate_limited", "up_to_date"] as const

export const ACTIVE_SOURCE_COLLECTION_RUN_STATUSES = ["queued", "running"] as const

export const SOURCE_COLLECTION_RUN_STATUSES = [
  ...ACTIVE_SOURCE_COLLECTION_RUN_STATUSES,
  ...SOURCE_COLLECTION_RESULT_STATUSES,
  "failed",
] as const
```

`types/source-collection-run.ts`：

```ts
export type SourceCollectionResultStatus = (typeof SOURCE_COLLECTION_RESULT_STATUSES)[number]

export type SourceCollectionRunStatus = (typeof SOURCE_COLLECTION_RUN_STATUSES)[number]

export type SourceCollectionRun = {
  id: number
  createdPassageCount: number | null
  error: string | null
  fetchedDocumentCount: number | null
  finishedAt: Date | null
  sourceId: number
  startedAt: Date | null
  status: SourceCollectionRunStatus
  createdAt: Date
  updatedAt: Date
}
```

- JSDoc に各状態の意味（README の「収集の状態」の表）と、`startedAt` が worker の書き込みのトークンであることを書く。時間切れの分数は api に置く（step2）
- `SourceCollectionStatus` は `SourceCollectionResultStatus` の別名にし、各値の説明の JSDoc はドメインの側に 1 か所だけ置く

### スキーマ

`schema/source-collection-run.ts`：

```ts
export const sourceCollectionRuns = pgTable(
  "source_collection_runs",
  {
    id: serial("id").primaryKey(),
    createdPassageCount: integer("created_passage_count"),
    error: text("error"),
    fetchedDocumentCount: integer("fetched_document_count"),
    finishedAt: timestamp("finished_at", { mode: "date", precision: 3 }),
    sourceId: integer("source_id").notNull(),
    startedAt: timestamp("started_at", { mode: "date", precision: 3 }),
    status: text("status", { enum: SOURCE_COLLECTION_RUN_STATUSES }).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "source_collection_runs_status_check",
      sql`${table.status} IN (${joinSqlValues(SOURCE_COLLECTION_RUN_STATUSES)})`,
    ),
    check(
      "source_collection_runs_running_columns_check",
      sql`${table.status} <> 'running' OR ${table.startedAt} IS NOT NULL`,
    ),
    check(
      "source_collection_runs_finished_columns_check",
      sql`${table.status} IN (${joinSqlValues(ACTIVE_SOURCE_COLLECTION_RUN_STATUSES)}) OR ${table.finishedAt} IS NOT NULL`,
    ),
    foreignKey({
      columns: [table.sourceId],
      foreignColumns: [sources.id],
      name: "source_collection_runs_source_id_fkey",
    }).onDelete("cascade"),
    uniqueIndex("source_collection_runs_source_id_active_key")
      .on(table.sourceId)
      .where(sql`${table.status} IN (${joinSqlValues(ACTIVE_SOURCE_COLLECTION_RUN_STATUSES)})`),
    index("source_collection_runs_source_id_id_idx").on(table.sourceId, table.id),
  ],
)
```

- テーブルの JSDoc：収集（admin の今すぐ収集）の 1 回ごとの状態と結果
- 部分 unique index の JSDoc：同じソースの収集を 1 つに限る（SELECT で確かめると同時に押したときに両方通るため、DB で保証する）

```bash
pnpm --filter @repo/domain build
pnpm --filter @repo/db build
pnpm --filter api db:generate --name add_source_collection_runs
```

生成された `migration.sql` が `CREATE TABLE "source_collection_runs"`・外部キー・2 つの index・3 つの CHECK だけであることを確かめる。

## 動作確認

```bash
pnpm --filter api db:migrate
pnpm --filter api test   # vitest を直接叩かない（dev DB が消える）
pnpm --filter cron exec tsc --noEmit
```

`apps/api/test/schema/source-collection-run.test.ts`（実 DB）：

| ケース | 期待 |
| --- | --- |
| 同じソースに `queued` の行がある状態で、`queued` / `running` の行を足す | unique 違反 |
| 同じソースに `completed` / `failed` の行が複数ある状態で、`queued` の行を足す | 入る |
| 別のソースなら `queued` が並んでも | 入る |
| `status` が値の集合の外 | CHECK 違反 |
| `running` で `started_at` が null・終わった状態で `finished_at` が null | CHECK 違反 |
| ソースを消す | 記録も消える |
