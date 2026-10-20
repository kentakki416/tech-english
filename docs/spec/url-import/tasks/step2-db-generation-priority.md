# step2-db-generation-priority

`passages.generation_prioritized_at` を足し、生成タスク（`generate:questions`）が値のある本文候補を先に取るようにする。値を書くのは step3。理由は [README](../README.md#生成の優先)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/db/src/drizzle/schema/passage.ts` | `generationPrioritizedAt` |
| `packages/db/drizzle/migrations/` | `db:generate --name add_passage_generation_prioritized_at` |
| `packages/domain/src/types/passage.ts` | `Passage.generationPrioritizedAt` |
| `apps/api/src/repository/drizzle/passage-repository.ts` | 行 → ドメインの変換に足す |
| `apps/cron/src/repository/drizzle/passage-repository.ts` | `claimNextCollected` の並び |
| api・cron のテストの fixture・期待値 | 新しい項目 |
| `apps/cron/CLAUDE.md` | generate:questions の表の `claimNextCollected` の説明（取得の順番） |
| `docs/spec/question-generation/README.md` | DB 設計の表と ER 図、生成タスクの取得の順番 |

### スキーマ

`passage.ts`（`generationModel` の後ろ。キーはアルファベット順）：

```ts
    generationPrioritizedAt: timestamp("generation_prioritized_at", { mode: "date", precision: 3 }),
```

- まわりの列と同じく JSDoc に「生成を優先した時刻（URL から取り込んだとき）。生成タスクはこの値がある本文候補を古い順に先に取る。生成した後も残す」と書く

```bash
pnpm --filter @repo/db db:generate --name add_passage_generation_prioritized_at
```

生成された SQL が次の 1 文だけであることを確かめる。

```sql
ALTER TABLE "passages" ADD COLUMN "generation_prioritized_at" timestamp(3);
```

### ドメインの型

`Passage`（`generationModel` の後ろ）：

```ts
  generationPrioritizedAt: Date | null
```

- JSDoc はスキーマの列と同じ内容

### 生成タスクの取得

`apps/cron/src/repository/drizzle/passage-repository.ts` の `claimNextCollected`：

```ts
      .orderBy(sql`${passages.generationPrioritizedAt} ASC NULLS LAST`, asc(passages.createdAt), asc(passages.id))
```

- interface の JSDoc の「collected のうち最も古い（created_at → id）1 行」を、「collected のうち、生成を優先したもの（generation_prioritized_at の古い順）→ 古いもの（created_at → id）の順で 1 行」に直す

## 動作確認

`test/repository/drizzle/passage-repository.test.ts`（cron）：

- `claimNextCollected` の SQL が `order by "passages"."generation_prioritized_at" ASC NULLS LAST, "passages"."created_at" asc, "passages"."id" asc` を含む

```bash
pnpm --filter api db:migrate
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
pnpm --filter api test
pnpm --filter cron test
pnpm --filter api exec tsc --noEmit
pnpm --filter cron exec tsc --noEmit
```

- 生成タスクは Claude API を呼ぶので dev では流さず、SQL で並びを確かめる（`collected` の 1 件に `generation_prioritized_at` を入れて先頭に来ること。確かめたら NULL に戻す）

```bash
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT id, generation_prioritized_at, created_at FROM passages WHERE status = 'collected' ORDER BY generation_prioritized_at ASC NULLS LAST, created_at, id LIMIT 3"
```
