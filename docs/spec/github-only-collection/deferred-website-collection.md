# 収集を GitHub に絞る：サイトの収集を戻すとき

[`README.md`](./README.md) でやめたサイト（取得方法が `website`）の収集を、デプロイした環境でもう一度使うときの設計と、戻すもの。

## 目次

- [着手トリガー](#着手トリガー)
- [対象範囲](#対象範囲)
- [設計案](#設計案)
- [既存仕様との差分（着手時のチェックリスト）](#既存仕様との差分着手時のチェックリスト)

## 着手トリガー

- GitHub に Markdown のソースが無く、許可リストのライセンスで公開しているドキュメントのサイト（go.dev・docs.python.org など）を、デプロイした環境で題材にしたい
- 許諾を得た技術ブログ・JavaScript で描画するサイト（[deferred-more-sources](../content-collection/deferred-more-sources.md)）に着手したい（どちらもサイトの収集が前提）

## 対象範囲

| | 今 | 着手後 |
| --- | --- | --- |
| GitHub のリポジトリの収集 | ✅ | ✅ |
| サイトの収集（cron のクロール） | ❌ | ✅ |
| サイトのソースの登録 | ローカルだけ | デプロイした環境でも |
| URL から追加 | ローカルだけ | デプロイした環境でも（許可リストのライセンスのサイトだけ） |
| 個人の学習用のライセンス | ローカルのサイトのソースだけ | 変えない（デプロイした環境には入れない） |

## 設計案

- やめる前の実装（step1・step5 で消したもの）を git の履歴から戻す。設計の正本は、やめる前の [content-collection](../content-collection/README.md) の「サイトのクロール」「取得先の制限」「実行の上限と失敗時の扱い」（この spec の step5 で書き直す前の版）
- 戻すときは、デプロイした環境では個人の学習用のサイトのソースを収集も取り込みもしないことを、api と cron の両方で守る（個人の学習用のソースはローカルにしか無い前提を崩さない）

## 既存仕様との差分（着手時のチェックリスト）

- [ ] `sources.sitemap_url`・`start_url`、`source_documents.etag`・`last_modified`・`sitemap_lastmod`・`http_status` と `source_documents_source_id_fetched_at_idx` を足し直す migration
- [ ] `sources_website_check` に sitemap・開始ページの条件を戻す
- [ ] cron の `collectWebsiteSource`・Repository のクロールのメソッド（`findFetchQueue`・`upsertDiscovered`・`markResponse`）・`createWebPageClient` の DI・終わり方（`throttled`・`crawl_delay_too_long`）・env の `COLLECT_WEB_REQUEST_INTERVAL_MS` と `COLLECT_WEB_REFETCH_DAYS` を戻す（step1）
- [ ] `@repo/content-extractor` の、収集だけが使っていた機能を戻す。sitemap の解析・ページのリンク・クロールのページの選び方（step1）と、条件付きリクエスト（step5）
- [ ] cron の `findEnabled` の取得方法の絞り込みと、`--source-id` のサイトのソースの throw を外す
- [ ] api の「サイトのソースはローカルだけ」と「URL から追加はローカルだけ」を外す。サイトのソースの `is_enabled` を受け取る
- [ ] DB の `sources_website_disabled_check` を外す（サイトのソースを有効にできるようにする）
- [ ] admin のサイトのフォーム（ページの見つけ方・収集のスイッチ・試し実行）、ソース一覧の「取得失敗」の列と「無効のサイトのソースがあります」の案内を戻す
- [ ] cron のスケジュールを Terraform に足すとき（[question-generation の step7](../question-generation/tasks/step7-infra-cron-schedules.md)）、戻した 2 つの env も足す
