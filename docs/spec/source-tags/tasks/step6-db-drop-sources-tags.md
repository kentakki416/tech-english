# step6-db-drop-sources-tags

使わなくなった `sources.tags`（jsonb の文字列の配列）の列を DB から消す。expand → contract の contract にあたる。方針は [README の既存のデータの移行](../README.md#既存のデータの移行)。

Drizzle のスキーマからは [step3](./step3-api-source-tags.md) で列の定義を外してある（DB の列だけが残っている）。この step は、スキーマと DB の差分から列を消す migration を作るだけ。

**step1〜5 を入れたデプロイの後の、別のデプロイで出す。** deploy workflow は migration をアプリより先に流す（`.github/workflows/deploy-aws-min.yml` の `build → migrate → deploy-api`）。step3 より前の api が動いている間に列を消すと、古い api が `sources.tags` を読んで失敗する。

## 前提

- [step3-api-source-tags](./step3-api-source-tags.md)：Drizzle のスキーマから `sources.tags` を外し、api・cron・seed が列を読み書きしていない
- step1〜5 を入れたデプロイが本番で済んでいる

## 対応内容

### 列を参照しているコードが残っていないことを確かめる

```bash
rg -n 'sources\.tags|jsonb\("tags"\)|jsonb_array_elements_text|\?\| *array|sources"?\."?tags' apps/*/src packages/db/src packages/db/drizzle/*.ts
```

何も出なければよい。出たら step3 の直し漏れなので先に直す。列は Drizzle のスキーマからもう外れているので、型付きの参照（`row.tags` など）は `pnpm build` の型エラーで見つかる。この grep は、型で見つからない生 SQL やスキーマ定義の残りを探すためのもの。`tags` の文字列だけで探すと、`pgTable("tags"` や中間テーブル経由の `tags: row.tags` に当たるので、列を指す形で探す。migration の SQL ファイルには過去の `tags` 列が出てくるが、探す場所に入れていないので当たらない。

### マイグレーション

```bash
pnpm --filter @repo/db build
pnpm --filter api db:generate --name drop_content_sources_tags
```

スキーマ（step3 で列の定義を外した）と、最新の migration の snapshot（列がある）の差分から生成される。生成された `migration.sql` を目で確認する。次の 1 文だけであること：

```sql
ALTER TABLE "sources" DROP COLUMN "tags";
```

ほかの差分（別の機能のテーブルの変更など）が混ざっていたら、その機能の migration が漏れているので、この PR では生成し直さずに原因を確かめる。

```bash
pnpm --filter api db:migrate
```

### 列に依存するテストを消す

`apps/api/test/schema/source-tags-migration.test.ts` を消す。step1 の migration から移行の SQL（`-- source-tags: 既存のタグの移行（ここから）`〜`（ここまで）`）を取り出して流すテストで、`sources.tags` 列が無いと流せない。列を消した後は二度と流れない SQL なので残す意味が無い（SQL 自体は migration のファイルに残る）。

`apps/api/test/schema/content-collection.test.ts` の既定値の期待値は、step3 でスキーマから列を外したときに直してある。

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
- [ ] api・cron のテストがすべて通る
- [ ] dev DB で `pnpm --filter api db:migrate` の後、`pnpm --filter api db:seed:sample-passages` が通る
- [ ] dev の api・admin を起動し、ソースの一覧・編集（タグの付け替え）とユーザーの問題一覧のタグでの絞り込みが今までどおり動く
