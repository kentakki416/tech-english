# step6-db-drop-content-sources-tags

使わなくなった `content_sources.tags`（jsonb の文字列の配列）の列を消す。expand → contract の contract にあたる。方針は [README の既存のデータの移行](../README.md#既存のデータの移行)。

**step1〜5 を入れたデプロイの後の、別のデプロイで出す。** deploy workflow は migration をアプリより先に流す（`.github/workflows/deploy-aws-min.yml` の `build → migrate → deploy-api`）。step3 より前の api が動いている間に列を消すと、古い api が `content_sources.tags` を読んで失敗する（ユーザー向けの問題一覧も含む）。

## 前提

- [step3-api-content-source-tags](./step3-api-content-source-tags.md)：api・cron・seed が `content_sources.tags` を読み書きしていない（スキーマに列だけが残っている）
- step1〜5 を入れたデプロイが本番で済んでいる

## 対応内容

### 列を読み書きしているコードが残っていないことを確かめる

```bash
rg -n "contentSources\.tags|content_sources\.tags|\"tags\"" apps/api/src apps/cron/src packages/db/drizzle packages/db/src
```

`packages/db/src/drizzle/schema/content-source.ts` の列の定義と、step1 の migration（`*_add_tags/migration.sql`）の移行の SQL だけが出ればよい。ほかに出たら、step3 の直し漏れなので先に直す。

### スキーマから列を消す

`packages/db/src/drizzle/schema/content-source.ts` から `tags` の行（step3 で「使わない」とコメントした列）を消す。`jsonb` / `sql` の import がほかで使われていなければ一緒に消す（`includeGlobs` などが `jsonb` を使っているので、ふつうは残る）。

```typescript
/** packages/db/src/drizzle/schema/content-source.ts（抜粋） */
    /**
     * サイトのみ。開始ページの URL
     */
    startUrl: text("start_url"),
    ...timestamps,
```

### マイグレーション

```bash
pnpm --filter @repo/db build
pnpm --filter api db:generate --name drop_content_sources_tags
```

生成された `migration.sql` を目で確認する。次の 1 文だけであること：

```sql
ALTER TABLE "content_sources" DROP COLUMN "tags";
```

```bash
pnpm --filter api db:migrate
```

### 列に依存するテストを片付ける

- `apps/api/test/schema/source-tags-migration.test.ts` を消す。step1 の migration から移行の SQL（`-- source-tags: 既存のタグの移行（ここから）`〜`（ここまで）`）を取り出して流すテストで、`content_sources.tags` 列が無いと流せない。列を消した後は二度と流れない SQL なので残す意味が無い（SQL 自体は migration のファイルに残る）
- `apps/api/test/schema/content-collection.test.ts` の `content_sources` の既定値のテストの期待値から `tags: []` を消す

```typescript
/** apps/api/test/schema/content-collection.test.ts（抜粋） */
      expect(row).toMatchObject({
        ...GITHUB_SOURCE,
        contentSelector: null,
        excludeGlobs: [],
        excludeSelectors: [],
        isEnabled: false,
        lastCollectedAt: null,
        lastCollectedCommitSha: null,
        siteUrl: null,
      })
```

- テストの fixture・`insertSource` などのヘルパーで `tags` を渡している箇所があれば消す（`rg -n "tags" apps/api/test` で確かめる。`content_source_tags` を使うテストは残す）

## 動作確認

```bash
pnpm --filter @repo/db build
pnpm --filter api test      # test DB に migration が流れる。vitest を直接叩かない（dev DB が消える）
pnpm --filter cron test
pnpm build
pnpm lint:fix
```

api のテストは必ず `pnpm --filter api test`（test DB に向く）で流す。`vitest` を直接実行すると `.env.local` の dev DB に繋がり、テストの片付けが dev DB を全部消す。

- [ ] 生成された migration が `DROP COLUMN "tags"` の 1 文だけ
- [ ] api・cron のテストがすべて通る（`content_sources` への insert に `tags` が無くても通る）
- [ ] `pnpm build` が通る（`content_sources.tags` を参照しているコードが残っていれば型エラーになる）
- [ ] dev DB で `pnpm --filter api db:migrate` の後、`pnpm db:seed:sample-passages` が通る
- [ ] dev の api・admin を起動し、ソースの一覧・編集（タグの付け替え）とユーザーの問題一覧のタグでの絞り込みが今までどおり動く
