# step1-db-content-sources

`content_sources` / `source_documents` / `passages`（全列）のテーブルと、`@repo/domain` の定数・型を作る。列と制約の理由は [README の必要な DB 設計](../README.md#必要な-db-設計)、`passages` の列の正本は [question-generation の必要な DB 設計](../../question-generation/README.md#必要な-db-設計)。

## 前提

- [github-auth step1-db-user-timezone](../../github-auth/tasks/step1-db-user-timezone.md) / [step2-api-auth-github](../../github-auth/tasks/step2-api-auth-github.md) が終わっている（マイグレーションを順番に作るため。テーブルの依存は無い）
- この step のあとに [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md) が `questions` / `passage_glossary_entries` を足す。`passages` はこの step で全列を作り、後続の step では列を足さない

## 対応内容

### 1. `@repo/domain` の定数

値は README の[許可リスト](../README.md#使える英文の条件)と question-generation の[問題の状態](../../question-generation/README.md#問題の状態)のとおり。

```ts
/** packages/domain/src/const/content-source.ts */
/** ソースの種別。問題一覧の絞り込みに使う */
export const SOURCE_KINDS = ["docs", "github"] as const
/** 取得方法 */
export const SOURCE_FETCH_TYPES = ["github_repository", "website"] as const
/** 登録を許可するライセンス（SPDX 識別子） */
export const ALLOWED_LICENSES = [
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "CC-BY-4.0", "PSF-2.0", "CC0-1.0", "Unlicense",
] as const

/** packages/domain/src/const/passage.ts */
export const PASSAGE_STATUSES = ["collected", "generating", "draft", "published", "rejected", "failed"] as const
export const PASSAGE_DIFFICULTIES = [1, 2, 3] as const
export const PASSAGE_BLOCK_TYPES = ["heading", "paragraph", "list_item", "code", "quote"] as const
```

### 2. `@repo/domain` の型と type guard

型は定数から導出する（`packages/domain/README.md`）。`ContentSource` は取得方法ごとの必須列を型で表すため `fetchType` の判別共用体にする。

```ts
/** packages/domain/src/types/content-source.ts */
export type SourceKind = (typeof SOURCE_KINDS)[number]
export type SourceFetchType = (typeof SOURCE_FETCH_TYPES)[number]
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number]

type ContentSourceBase = {
  id: number
  excludeGlobs: string[]
  includeGlobs: string[]
  isEnabled: boolean
  kind: SourceKind
  lastCollectedAt: Date | null
  licenseSpdx: AllowedLicense
  licenseUrl: string
  name: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export type GitHubRepositorySource = ContentSourceBase & {
  branch: string
  fetchType: "github_repository"
  lastCollectedCommitSha: string | null
  publicUrlStripPrefix: string | null
  publicUrlTemplate: string | null
  /** owner/name */
  repository: string
}

export type WebsiteSource = ContentSourceBase & {
  contentSelector: string | null
  excludeSelectors: string[]
  fetchType: "website"
  sitemapUrl: string | null
  /** オリジン（https://go.dev） */
  siteUrl: string
  startUrl: string | null
}

export type ContentSource = GitHubRepositorySource | WebsiteSource
```

- `types/source-document.ts`：`SourceDocument`（`id` / `blobSha` / `commitSha` / `contentHash` / `etag` / `fetchedAt` / `httpStatus` / `lastModified` / `path` / `sitemapLastmod` / `sourceId` / `title` / `createdAt` / `updatedAt`。取得方法ごとの列はすべて `| null`）
- `types/passage.ts`：`PassageStatus` / `PassageDifficulty` / `PassageBlockType`（定数から導出）、`PassageBlock`（`lang?` / `text` / `translationJa?` / `type`。[正本](../../question-generation/README.md#本文の構造passageblock)）、`Passage`（question-generation の ER 図の全列を camelCase に。`difficulty: PassageDifficulty | null`、`attentionReasons: string[]`、`blocks: PassageBlock[]`）
- `rules/content-source.ts`：`isSourceKind` / `isSourceFetchType` / `isAllowedLicense`
- `rules/passage.ts`：`isPassageStatus` / `isPassageDifficulty`（`question-generation step1` が `calculateTimeLimitSeconds` などを同じファイルに足す）
- `src/index.ts` に re-export を足す（ファイルパス順。型は `export type`）

type guard は Prisma 実装の `_toDomain()` が使う（`schema.prisma` は TS の定数を参照できず `String` 列になるため）。書き方は `rules/membership-tier.ts` と同じ。

### 3. Drizzle のスキーマ

`packages/db/package.json` の `dependencies` に `"@repo/domain": "workspace:^"` を足す。CHECK の作り方は `packages/db/README.md` の「enum 的な列は const から CHECK 制約を作る」と同じ。

```ts
/** packages/db/src/drizzle/schema/content-source.ts */
const joinSqlValues = (values: readonly string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `)

/**
 * 英文の取得元。取得方法ごとの列は nullable にし、必須は CHECK で保証する
 */
export const contentSources = pgTable(
  "content_sources",
  {
    id: serial("id").primaryKey(),
    branch: text("branch"),
    contentSelector: text("content_selector"),
    excludeGlobs: jsonb("exclude_globs").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    excludeSelectors: jsonb("exclude_selectors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    fetchType: text("fetch_type", { enum: SOURCE_FETCH_TYPES }).notNull(),
    includeGlobs: jsonb("include_globs").$type<string[]>().notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    kind: text("kind", { enum: SOURCE_KINDS }).notNull(),
    lastCollectedAt: timestamp("last_collected_at", { mode: "date", precision: 3 }),
    lastCollectedCommitSha: text("last_collected_commit_sha"),
    licenseSpdx: text("license_spdx", { enum: ALLOWED_LICENSES }).notNull(),
    licenseUrl: text("license_url").notNull(),
    name: text("name").notNull(),
    publicUrlStripPrefix: text("public_url_strip_prefix"),
    publicUrlTemplate: text("public_url_template"),
    repository: text("repository"),
    sitemapUrl: text("sitemap_url"),
    siteUrl: text("site_url"),
    startUrl: text("start_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    check("content_sources_kind_check", sql`${table.kind} IN (${joinSqlValues(SOURCE_KINDS)})`),
    check("content_sources_fetch_type_check", sql`${table.fetchType} IN (${joinSqlValues(SOURCE_FETCH_TYPES)})`),
    check("content_sources_license_spdx_check", sql`${table.licenseSpdx} IN (${joinSqlValues(ALLOWED_LICENSES)})`),
    check(
      "content_sources_github_repository_check",
      sql`${table.fetchType} <> 'github_repository' OR (${table.repository} IS NOT NULL AND ${table.branch} IS NOT NULL)`,
    ),
    check(
      "content_sources_website_check",
      sql`${table.fetchType} <> 'website' OR (${table.siteUrl} IS NOT NULL AND (${table.sitemapUrl} IS NOT NULL OR ${table.startUrl} IS NOT NULL))`,
    ),
    uniqueIndex("content_sources_repository_key").on(table.repository),
    uniqueIndex("content_sources_site_url_key").on(table.siteUrl),
  ],
)
```

`source-document.ts`（`sourceDocuments`）：

- 列：`id` / `blobSha` / `commitSha` / `contentHash` / `etag` / `fetchedAt`（timestamp(3)）/ `httpStatus`（`smallint`）/ `lastModified`（text。レスポンスヘッダをそのまま保存）/ `path`（not null）/ `sitemapLastmod`（timestamp(3)）/ `sourceId`（integer not null）/ `title` / `...timestamps`
- `foreignKey({ columns: [table.sourceId], foreignColumns: [contentSources.id], name: "source_documents_source_id_fkey" }).onDelete("restrict").onUpdate("cascade")`（ソースを削除する機能は無く、問題が参照し続けるため restrict）
- `uniqueIndex("source_documents_source_id_path_key").on(table.sourceId, table.path)`
- `index("source_documents_source_id_fetched_at_idx").on(table.sourceId, table.fetchedAt)`

`passage.ts`（`passages`）：

| 列 | Drizzle | 備考 |
| --- | --- | --- |
| `attention_reasons` | `jsonb().$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)` | |
| `blocks` | `jsonb().$type<PassageBlock[]>().notNull()` | 型は `@repo/domain` の `PassageBlock` |
| `content_hash` | `text().notNull()` | unique |
| `difficulty` | `smallint().$type<PassageDifficulty>()` | nullable |
| `generated_at` / `generation_started_at` / `published_at` / `reviewed_at` | `timestamp(..., { mode: "date", precision: 3 })` | nullable |
| `generation_attempt_count` | `integer().notNull().default(0)` | |
| `generation_error` / `generation_model` / `generation_prompt_version` / `reject_reason` / `source_commit_sha` | `text()` | nullable |
| `needs_attention` | `boolean().notNull().default(false)` | |
| `source_document_id` | `integer().notNull()` | FK |
| `source_path` / `title` | `text().notNull()` | |
| `source_retrieved_at` | `timestamp(...).notNull()` | |
| `status` | `text("status", { enum: PASSAGE_STATUSES }).notNull().default("collected")` | |
| `time_limit_seconds` / `word_count` | `integer()`（`word_count` は not null） | |

制約と index：

- `check("passages_status_check", ...)`（`PASSAGE_STATUSES`）、`check("passages_difficulty_check", sql\`${table.difficulty} IN (...)\`)`（`PASSAGE_DIFFICULTIES` を `sql.join`。NULL は CHECK を通る）
- `foreignKey(... "passages_source_document_id_fkey").onDelete("restrict").onUpdate("cascade")`（`passages` は物理削除しない）
- `uniqueIndex("passages_content_hash_key").on(table.contentHash)`
- `index("passages_status_created_at_idx").on(table.status, table.createdAt)`
- `index("passages_source_document_id_idx").on(table.sourceDocumentId)`（step2 のソースごとの件数集計で `source_documents` と結合するため）

`schema/index.ts` に `content-source` / `passage` / `source-document` の `export *` を足す（ファイル名順）。

### 4. `@repo/db` の export

- `src/index.ts` のクエリ演算子に `asc` / `count` / `gte` / `inArray` / `isNotNull` / `isNull` / `or` を足す（step2・step5・step6 が使う）
- Prisma の型の re-export に `ContentSource` / `Passage` / `SourceDocument` を足す

### 5. Prisma のスキーマ

`packages/db/prisma/schema.prisma` に `ContentSource` / `SourceDocument` / `Passage` を足し、`pnpm --filter @repo/db prisma:generate` する。CHECK 制約は Prisma で表現できないので書かない（適用するのは Drizzle のマイグレーション）。

```prisma
model SourceDocument {
    id             Int       @id @default(autoincrement())
    sourceId       Int       @map("source_id")
    path           String
    fetchedAt      DateTime? @map("fetched_at")
    httpStatus     Int?      @map("http_status") @db.SmallInt
    // ...（他の列も Drizzle と同じ名前・nullable で）
    createdAt      DateTime  @default(now()) @map("created_at")
    updatedAt      DateTime  @updatedAt @map("updated_at")

    source   ContentSource @relation(fields: [sourceId], references: [id], onDelete: Restrict)
    passages Passage[]

    @@unique([sourceId, path])
    @@index([sourceId, fetchedAt])
    @@map("source_documents")
}
```

- jsonb は `Json`（default は `@default("[]")`）、`repository` / `siteUrl` は `String? @unique`、`difficulty` は `Int? @db.SmallInt`
- 制約・index 名が Drizzle 側と一致すること（Prisma の既定の命名 `{table}_{columns}_key` / `_idx` / `_fkey` に Drizzle 側を合わせてある）

### 6. マイグレーション

```bash
pnpm --filter @repo/domain build
pnpm --filter api db:generate   # packages/db/drizzle/migrations/<timestamp>_<name>/ ができる
pnpm --filter api db:migrate
```

生成された SQL を目で確認する：3 つの CHECK（kind / fetch_type / license_spdx）と取得方法ごとの CHECK 2 つ、`passages` の status / difficulty の CHECK、unique index 4 つ、FK 2 つ、jsonb の default が `'[]'::jsonb` になっていること。

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
pnpm --filter api test      # test DB にマイグレーションが流れる
pnpm lint:fix
```

`apps/api/test/schema/content-collection.test.ts`（実 DB。`testDb` に直接 insert して制約を確かめる。不正な値は `sql` の生 insert で入れる）：

- 正常系
  - [ ] github_repository（repository・branch あり）と website（site_url・sitemap_url のみ / start_url のみ）を insert できる
  - [ ] website を 2 件入れても `repository` が NULL 同士なので unique に掛からない（github 2 件の `site_url` も同様）
  - [ ] `passages` を必須列だけで insert すると `status = collected`・`generation_attempt_count = 0`・`needs_attention = false`・`attention_reasons = []` になる
  - [ ] `blocks` の jsonb が `PassageBlock[]` として読み戻せる（`lang` の有無を含む）
- 異常系
  - [ ] github_repository で `repository` か `branch` が NULL なら失敗する
  - [ ] website で `site_url` が NULL、または `sitemap_url` と `start_url` が両方 NULL なら失敗する
  - [ ] `license_spdx = 'CC-BY-SA-4.0'`、`kind` / `fetch_type` / `status` が定数に無い値、`difficulty = 4` は失敗する
  - [ ] `repository` / `site_url` の重複、`source_documents (source_id, path)` の重複、`passages.content_hash` の重複は失敗する
  - [ ] `passages` が参照している `source_documents` の行は削除できない（restrict）
