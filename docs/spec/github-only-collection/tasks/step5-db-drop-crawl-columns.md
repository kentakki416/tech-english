# step5-db-drop-crawl-columns

サイトのクロールにだけ使っていた DB の列を消し、その列を読み書きしていた api・admin・cron・`@repo/content-extractor` の処理を消す。

| 消すもの | 使っていたところ |
| --- | --- |
| `sources.sitemap_url`・`start_url` | ページの見つけ方 |
| `source_documents.etag`・`last_modified` | 条件付きリクエスト。URL から追加も取得の結果を書いていた |
| `source_documents.sitemap_lastmod` | sitemap での取り直し |
| `source_documents.http_status` | 取り直しの対象から外す・ソース一覧の「取得失敗」・編集の「取得に失敗しているページ」 |
| `source_documents_source_id_fetched_at_idx` | クロールの取得順 |

仕様と理由は README の[クロールの列の削除](../README.md#クロールの列の削除)。step1〜4 の後に出す。

**どの環境にもまだデプロイしていない前提で、列の定義を外す変更と列を消す migration を 1 つの PR に入れる。** この step より前にどこかの環境へデプロイしていたら、列の定義を外す PR（migration なし）と列を消す PR に分け、別々のデプロイで出す（[source-tags の step6](../../source-tags/tasks/step6-db-drop-sources-tags.md) と同じ）。

## 対応内容

### 変えるファイル

| 層 | ファイル | 内容 |
| --- | --- | --- |
| domain | `packages/domain/src/types/source-document.ts` | `etag`・`httpStatus`・`lastModified`・`sitemapLastmod` と、型の JSDoc のサイトのクロールの記述 |
| domain | `packages/domain/src/types/source.ts` | `WebsiteSource` の `sitemapUrl`・`startUrl` |
| db | `packages/db/src/drizzle/schema/source.ts` | `sitemapUrl`・`startUrl`、`sources_website_check` |
| db | `packages/db/src/drizzle/schema/source-document.ts` | 4 つの列と `source_documents_source_id_fetched_at_idx`、`fetchedAt` とテーブルの JSDoc |
| db | `packages/db/drizzle/migrations/` | `db:generate` で作るマイグレーション |
| content-extractor | `src/web/web-page-client.ts`・`src/web/index.ts`・`src/index.ts` | 条件付きリクエスト（`ConditionalRequest`・`If-None-Match` / `If-Modified-Since`・304 の `not_modified`）と、取得の結果の `etag`・`lastModified` |
| content-extractor | `src/website-pages.ts`・`README.md` | `extractWebPage` などが受け取る `WebsiteSource` から 2 つの項目が消えるのに合わせる。README の「条件付きリクエスト」 |
| api-schema | `packages/schema/src/api-schema/admin/source.ts` | 入力・レスポンスの `sitemap_url`・`start_url` と検証、一覧の `failed_page_count`、詳細の `failed_pages` |
| api | `src/repository/source-repository.ts`・`drizzle/source-repository.ts` | `SourceInput` の 2 つの項目、`FailedPage`・`countFailedPagesBySource`・`findFailedPages`・`FAILED_HTTP_STATUS`、update の `shouldResetDocumentCache` |
| api | `src/service/source-service.ts` | `getSources` の取得失敗の件数、`getSourceById` の取得に失敗したページ、`hasExtractionChanged`・`shouldResetDocumentCache` |
| api | `src/controller/admin/source/source-mapper.ts`・`detail.ts`・`list.ts` | 2 つの項目・`failed_pages`・`failed_page_count` |
| api | `src/repository/url-import-repository.ts`・`drizzle/url-import-repository.ts` | `FetchedDocumentInput` の `etag`・`httpStatus`・`lastModified` と、upsert で書く列 |
| api | `src/repository/redis/url-import-page-cache-repository.ts` | キャッシュの値の 3 つの項目 |
| api | `src/client/page-fetcher.ts`・`src/service/url-import-service.ts` | `FetchedPage` の 3 つの項目、`fetchPage` に渡す条件、文書の記録に渡す値 |
| cron | `src/repository/drizzle/source-document-repository.ts`・`source-repository.ts` | `_toDomain` の列 |
| admin | `src/features/source/source.form.ts`・`components/features/source/SourceForm.tsx` | ページの見つけ方（`discovery`）、取得に失敗しているページ |
| admin | `src/components/features/source/SourceTable.tsx` | 「取得失敗」の列 |
| admin | `src/app/(dashboard)/mock/**`・`src/libs/mock-data.ts` | モックを今の画面に合わせる（下の「mock」） |
| test | api・cron・content-extractor のテスト | 消した列・項目の期待値と fixture |
| docs | 下の「ドキュメント」 | |

### スキーマ

`sources`：

- `sitemapUrl`・`startUrl` を消す
- `sources_website_check` を `site_url` の NOT NULL だけにする

```ts
    check("sources_website_check", sql`${table.fetchType} <> 'website' OR ${table.siteUrl} IS NOT NULL`),
```

`source_documents`：

- `etag`・`httpStatus`・`lastModified`・`sitemapLastmod` と、`source_documents_source_id_fetched_at_idx` を消す（`index` の import も要らなくなれば消す）
- テーブルの JSDoc は「取得した文書（GitHub のファイル / URL から追加で取り込んだページ）。差分の検出・出典の組み立てに使う」にする
- `fetchedAt` の JSDoc は「最後に取得した時刻。NULL は未取得」にする（サイトの待ち行列・取得できなかったときの記述を消す）
- `path` の JSDoc の「サイトは URL のパス」は残す（URL から追加のページ）

```bash
pnpm --filter @repo/domain build
pnpm --filter @repo/db build
pnpm --filter api db:generate --name drop_crawl_columns
```

生成された `migration.sql` が次の文だけであることを確かめる（順番は drizzle-kit に任せる）。

```sql
DROP INDEX "source_documents_source_id_fetched_at_idx";
ALTER TABLE "source_documents" DROP COLUMN "etag";
ALTER TABLE "source_documents" DROP COLUMN "http_status";
ALTER TABLE "source_documents" DROP COLUMN "last_modified";
ALTER TABLE "source_documents" DROP COLUMN "sitemap_lastmod";
ALTER TABLE "sources" DROP CONSTRAINT "sources_website_check";
ALTER TABLE "sources" ADD CONSTRAINT "sources_website_check" CHECK ("sources"."fetch_type" <> 'website' OR "sources"."site_url" IS NOT NULL);
ALTER TABLE "sources" DROP COLUMN "sitemap_url";
ALTER TABLE "sources" DROP COLUMN "start_url";
```

- `sources_website_check` を消す文が、`sitemap_url`・`start_url` を消す文より前にあることを確かめる。Postgres は列を消すとその列を参照する CHECK も一緒に消すので、列を先に消すと、後の `DROP CONSTRAINT` が「存在しない」で失敗する。逆になっていたら入れ替える
- ほかの差分が混ざっていたら、別の機能の migration が漏れているので、生成し直さずに原因を確かめる

### `@repo/content-extractor`

`WebPageClient.fetchPage` は条件なしの取得だけにする。

```ts
  fetchPage(url: string): Promise<FetchPageResult>
```

- `ConditionalRequest` の型と `If-None-Match` / `If-Modified-Since` のヘッダ、304 の `not_modified` の結果を消す
- `FetchPageResult` の `ok` から `etag`・`lastModified` を消す
- `fetchPage` の引数・結果の JSDoc から条件付きリクエストの記述を消す
- `test/web/web-page-client.test.ts` の条件付きリクエストのテストを消す

### api

ソースの更新は、本文の CSS セレクタを変えても `source_documents` を書き換えない。URL から追加はページのキャッシュのキーにソースの更新日時を入れていて、設定を変えれば取り直すので、取得済みのページの値を消す理由がない（消していたのはクロールの 304・同じハッシュで止まらないようにするため）。

```ts
  const result = await repo.sourceRepository.update(id, disableWebsiteSource(input), { shouldResetCollectedCommit })
```

- `SourceRepository.update` の options から `shouldResetDocumentCache` を消し、drizzle の実装の `source_documents` の UPDATE を消す。`hasExtractionChanged` も消す
- `getSources` は `countFailedPagesBySource` を呼ばない。`getSourceById` は `findFailedPages` を呼ばない。service の戻り値の型から取得失敗の項目を外す
- URL から追加の文書の記録（`upsertFetchedDocument`）は `content_hash`・`extraction_version`・`fetched_at`・`title` を書く（`blob_sha`・`commit_sha` は null のまま）。`FetchedDocumentInput` の JSDoc の「sitemap_lastmod は変えない」は消す
- `page-fetcher.ts` は `fetchPage(url)` で取る。`FetchedPage` の `etag`・`httpStatus`・`lastModified` を消す（`httpStatus` は 200 しか入らなかった）
- Redis のキャッシュの値（`fetchedPageSchema`）から 3 つの項目を消す。スキーマは `strict` なので、ローカルに残った古い形の値は読めずにキャッシュの外れになり、ページを取り直す（古い値は 10 分で消える）

### api-schema

- `websiteInputSchema` から `sitemap_url`・`start_url` を消す。`validateSourceInput` のサイトの検証（どちらか一方が要る・同じオリジン）を消す
- `sourceSchema` のサイトから `sitemap_url`・`start_url` を消す
- ソース一覧の `failed_page_count`、ソース詳細の `failed_pages` を消す

### admin

- `source.form.ts` のサイトの分岐から `discovery`・`discovery_url` の変換を消す
- `SourceForm.tsx` のサイトの取得元のカードから「ページの見つけ方」（sitemap / 開始ページのラジオと URL の欄）を消す。`Discovery` の型と state も消す
- `SourceForm.tsx` の右の「収集の状況」の「取得に失敗しているページ」を消す
- `SourceTable.tsx` の「取得失敗」の列を消す

### cron

- `source-document-repository.ts`（drizzle）の `_toDomain` から 4 つの列を消す
- `source-repository.ts`（drizzle）の `_toDomain` のサイトの分岐から `sitemapUrl`・`startUrl` を消す
- テストの `buildRow` から列を消す

### mock

`/mock/sources` のモックを、step4 と step5 の画面に合わせる。

- 一覧：「取得失敗」の列と「無効のサイトのソースがあります」の案内を消し、サイトの状態を「収集しない」にする
- 登録・編集：サイトの「ページの見つけ方」・収集のスイッチ・試し実行・取得に失敗しているページを消し、ライセンスに「個人の学習用」を足す。取得方法の「サイト」の説明を step4 と同じにする
- `mock-data.ts` の `sitemapUrl`・`startUrl`・`failedPages` を消す
- `mock/page.tsx` のモックの一覧の説明に、サイトの未収集のモック（`/mock/sources/6`）の記述があれば消す

### テスト

| ファイル | 内容 |
| --- | --- |
| `apps/api/test/schema/content-collection.test.ts` | 消した列の既定値と、`sources_website_check`（sitemap / 開始ページ）のテストを、`site_url` の NOT NULL だけのテストにする |
| `apps/api/test/repository/source-repository.test.ts` | 2 つの項目、キャッシュを消すテスト、取得失敗の件数のテストを消す |
| `apps/api/test/repository/url-import-repository.test.ts`・`url-import-page-cache-repository.test.ts` | 3 つの項目 |
| `apps/api/test/controller/admin/source/*.test.ts`・`fixtures.ts` | 2 つの項目・`failed_pages`・`failed_page_count` |
| `apps/api/test/controller/admin/url-import/create.test.ts` | 文書の記録の期待値 |
| `apps/api/test/service/source-service/*.test.ts`・`fixtures.ts` | 取得失敗の項目、`shouldResetDocumentCache` |
| `apps/api/test/service/url-import-service/importUrl.test.ts`・`test/fixture/url-import.ts`・`test/fixture/passage.ts` | 3 つの項目、サイトのソースの `startUrl` |
| `apps/api/test/client/page-fetcher.test.ts` | `fetchPage` の引数と結果 |
| `apps/cron/test/repository/drizzle/*.test.ts` | `buildRow` の列 |
| `apps/cron/test/service/collection/helpers.ts` | `buildWebsiteSource` の 2 つの項目 |
| `packages/content-extractor/test/**` | 条件付きリクエストのテスト、`WebsiteSource` の fixture |

### ドキュメント

| ファイル | 直すところ |
| --- | --- |
| `docs/spec/content-collection/README.md` | 「ソースの登録」のサイトの項目（sitemap の URL・開始ページの URL を消す）、「必要な画面」のソース一覧の「取得に失敗しているページの数（サイト）」、「UI 設計」のソース一覧・登録・編集の取得失敗・ページの見つけ方、「必要な API」の更新の「CSS セレクタを変えると…消す」、「必要な DB 設計」の表と ER 図と制約（消した列・`sources_website_check`・index） |
| `docs/spec/url-import/README.md` | 「api での取得と抽出」の条件付きリクエストの記述、「保存」の文書の記録で書く列 |
| `apps/api/CLAUDE.md`・`packages/content-extractor/README.md` | 条件付きリクエストの記述 |
| `docs/spec/README.md` | github-only-collection のステータスを「完了」にし、url-import の概要に「ローカルだけ」を足す |

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/db build && pnpm --filter @repo/api-schema build && pnpm --filter @repo/content-extractor build
pnpm --filter api db:migrate
pnpm --filter @repo/content-extractor test
pnpm --filter api test      # test DB に migration が流れる。vitest を直接叩かない（dev DB が消える）
pnpm --filter cron test
pnpm build
pnpm lint:fix
```

- [ ] 生成された migration が上の文だけ
- [ ] `rg -n "sitemap_?[uU]rl|start_?[uU]rl|sitemap_?[lL]astmod|http_?[sS]tatus|last_?[mM]odified|\betag\b|failed_?[pP]age" apps/*/src packages/*/src` で、HTTP のレスポンスの status を見るところ（`WebPageClient` の取得・エラー）以外に出ない
- [ ] dev DB で `pnpm --filter api db:seed:sample-passages` が通る
- [ ] `verify-web-page` skill で、ソース一覧・GitHub とサイトのソースの編集・`/url-import` の確認と保存が動き、console の error が 0 件
