# step1-db-stats-indexes

ダッシュボードの集計（期間で絞る・問題ごとに束ねる）のためのインデックスを `reading_attempts` と `vocabulary_reviews` に足す。テーブル・列は変えない。

## 前提

- reading-practice の `reading_attempts`、vocabulary-cards の `vocabulary_reviews`（どちらも作成済み）
- 何に使うかは README の [インデックス](../README.md#インデックス)

## 対応内容

### 1. `reading_attempts`

`packages/db/src/drizzle/schema/reading-attempt.ts` のインデックスの配列の末尾に足す。

```typescript
    /**
     * admin のダッシュボード：期間内の提出（全体の利用状況）
     */
    index("reading_attempts_submitted_at_idx")
      .on(table.submittedAt)
      .where(sql`${table.status} = 'submitted'`),
    /**
     * admin のダッシュボード：問題ごとの成績・問題の分析
     */
    index("reading_attempts_passage_id_submitted_at_idx")
      .on(table.passageId, table.submittedAt)
      .where(sql`${table.status} = 'submitted'`),
```

### 2. `vocabulary_reviews`

`packages/db/src/drizzle/schema/vocabulary-review.ts` に足す。

```typescript
    /**
     * admin のダッシュボード：期間内に単語帳で答えたユーザー
     */
    index("vocabulary_reviews_created_at_idx").on(table.createdAt),
```

### 3. マイグレーション

```bash
pnpm --filter @repo/db db:generate --name add_admin_stats_indexes
```

生成された SQL が `CREATE INDEX` 3 つだけ（部分インデックスの 2 つは `WHERE "status" = 'submitted'` 付き）であることを確かめる。本番のデータは少ないうちに入れるので `CONCURRENTLY` は使わない（drizzle の migration は 1 つのトランザクションで流れ、`CONCURRENTLY` を使えないため）。

## 動作確認

```bash
pnpm --filter @repo/db build
pnpm --filter api db:migrate
pnpm build && pnpm lint:fix
pnpm --filter api test     # 既存のテストが通る（マイグレーションが test DB に流れる）
```

dev の DB で、インデックスが使われることを確かめる（データが少ないと seq scan になるので `SET enable_seqscan = off` で確かめる）。

```sql
BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN SELECT count(*) FROM reading_attempts WHERE status = 'submitted' AND submitted_at >= now() - interval '30 days';
EXPLAIN SELECT passage_id, count(*) FROM reading_attempts WHERE status = 'submitted' AND passage_id = 119 GROUP BY passage_id;
EXPLAIN SELECT count(DISTINCT user_id) FROM vocabulary_reviews WHERE created_at >= now() - interval '30 days';
ROLLBACK;
```

- [ ] 1 つめは `reading_attempts_submitted_at_idx`、2 つめは `reading_attempts_passage_id_submitted_at_idx`、3 つめは `vocabulary_reviews_created_at_idx` を使う
