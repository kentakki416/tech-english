# step1-db-extraction-version

抽出の版を記録する列を 2 つ足し、ドメインの型と api・cron の読み込みに通す。値を書くのは step3。仕様と理由は [README](../README.md#抽出の版)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/db/src/drizzle/schema/source-document.ts` | `extractionVersion` |
| `packages/db/src/drizzle/schema/content-source.ts` | `lastCollectedExtractionVersion` |
| `packages/db/drizzle/migrations/` | `db:generate` で作るマイグレーション |
| `packages/domain/src/types/source-document.ts` | `SourceDocument.extractionVersion` |
| `packages/domain/src/types/content-source.ts` | `GitHubRepositorySource.lastCollectedExtractionVersion` |
| `apps/api/src/repository/drizzle/content-source-repository.ts` | `_toDomain` |
| `apps/cron/src/repository/drizzle/content-source-repository.ts` | `_toDomain` |
| `apps/cron/src/repository/drizzle/source-document-repository.ts` | `_toDomain` |
| api・cron のテストの fixture | 新しい項目（`null`）を足す |
| `docs/spec/content-collection/README.md` | 「必要な DB 設計」の表と ER 図に 2 つの列 |

### スキーマ

`source-document.ts`（`etag` の後ろ）：

```ts
    extractionVersion: text("extraction_version"),
```

`content-source.ts`（`lastCollectedCommitSha` の後ろ）：

```ts
    lastCollectedExtractionVersion: text("last_collected_extraction_version"),
```

- まわりの列と同じく、列の意味を JSDoc に書く。`extraction_version` は「文書を切り分けたときの抽出の版（cron の `EXTRACTION_VERSION`）。NULL はこの列を足してから一度も切り分けていない文書」、`last_collected_extraction_version` は「GitHub のみ。`last_collected_commit_sha` を記録したときの抽出の版」

```bash
pnpm --filter @repo/db db:generate --name add_extraction_versions
```

生成された SQL が次の 2 文だけであることを確かめる。

```sql
ALTER TABLE "content_sources" ADD COLUMN "last_collected_extraction_version" text;
ALTER TABLE "source_documents" ADD COLUMN "extraction_version" text;
```

### ドメインの型

`SourceDocument`（`etag` の後ろ）：

```ts
  extractionVersion: string | null
```

`GitHubRepositorySource`（`lastCollectedCommitSha` の後ろ）：

```ts
  lastCollectedExtractionVersion: string | null
```

- JSDoc はスキーマの列と同じ内容を書く（`null` はこの列を足してから一度も切り分けていない文書、`lastCollectedCommitSha` を記録したときの抽出の版）

### 読み込み

api と cron の `content-source-repository.ts` の `_toDomain`（GitHub の分岐）：

```ts
        lastCollectedCommitSha: row.lastCollectedCommitSha,
        lastCollectedExtractionVersion: row.lastCollectedExtractionVersion,
```

cron の `source-document-repository.ts` の `_toDomain`：

```ts
      etag: row.etag,
      extractionVersion: row.extractionVersion,
```

- admin のレスポンス（`content-source-mapper.ts`）には出さない（管理者が見る値ではない）
- api の `update` は `lastCollectedExtractionVersion` を変えない（取得範囲を変えたときは今までどおり `lastCollectedCommitSha` だけを `null` にする）

### fixture

型に足した項目が必須になるので、`GitHubRepositorySource` と `SourceDocument` を組み立てているテストの fixture に `null` を足す（`tsc` が場所を教える）。

- `apps/api/test/service/content-source-service/fixtures.ts`・`apps/api/test/repository/content-source-repository.test.ts` など
- `apps/cron/test/service/collection/helpers.ts`・`apps/cron/test/repository/drizzle/*.test.ts` など

## 動作確認

```bash
pnpm --filter api db:migrate
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
pnpm --filter api test
pnpm --filter cron test
pnpm --filter api exec tsc --noEmit
pnpm --filter cron exec tsc --noEmit
```

- dev DB に列が足され、既存の行が `NULL` であること

```bash
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT count(*) FILTER (WHERE extraction_version IS NULL) AS null_count, count(*) FROM source_documents"
```

- admin のソースの一覧・詳細・編集が今までどおり開けること
