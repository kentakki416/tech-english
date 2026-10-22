# step1-cron-github-only

cron の `collect:passages` を GitHub のソースだけにし、サイトの収集の処理・env・テストを消す。`@repo/content-extractor` のうち、cron のサイトの収集でしか使っていなかったもの（sitemap・リンクの発見・クロールのページの選び方）も消す。DB の列はまだ消さない（step5）。仕様と理由は [README の収集の対象](../README.md#収集の対象)と[収集（cron）](../README.md#収集cron)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/cron/src/service/collection/collect-website-source.ts` | 削除 |
| `apps/cron/src/service/collection/index.ts` | `collect-website-source` の re-export を消す |
| `apps/cron/src/service/collection/collect-passages.ts` | 取得方法の分岐・`refetchDays` を消し、`--source-id` のサイトのソースを throw |
| `apps/cron/src/service/collection/preview-source.ts` | サイトの試し実行を消し、サイトのソースを throw |
| `apps/cron/src/service/collection/types.ts` | `createWebPageClient`・`crawl_delay_too_long`・`throttled` を消す |
| `apps/cron/src/lib/format-dry-run.ts` | `not_fetched` とサイトの説明を消す |
| `apps/cron/src/const/collection.ts` | `MAX_CONSECUTIVE_NETWORK_ERRORS`・`COLLECT_RUN_INTERVAL_MS`・`GONE_HTTP_STATUSES` を消す |
| `apps/cron/src/env.ts` | `COLLECT_WEB_REQUEST_INTERVAL_MS`・`COLLECT_WEB_REFETCH_DAYS` を消す |
| `apps/cron/src/task/collect-passages.ts` | `WebPageClient` と `refetchDays` を消す |
| `apps/cron/src/repository/source-repository.ts`・`drizzle/source-repository.ts` | `findEnabled` を GitHub のソースだけにする |
| `apps/cron/src/repository/source-document-repository.ts`・`drizzle/source-document-repository.ts` | `findFetchQueue`・`markResponse`・`upsertDiscovered`・`DiscoveredDocumentInput` を消し、`MarkFetchedInput` から `etag`・`httpStatus`・`lastModified` を外す |
| `apps/cron/src/service/collection/collect-github-source.ts` | `markFetched` に渡す `etag`・`httpStatus`・`lastModified` を消す |
| `apps/cron/test/**` | 下の「テスト」 |
| `packages/content-extractor/src/parse-sitemap.ts` | 削除 |
| `packages/content-extractor/src/web/web-page-client.ts` | `fetchSitemapUrls`・`_fetchSitemap`・`_selectChildSitemapUrls`・`SitemapUrl` を消す |
| `packages/content-extractor/src/website-pages.ts` | `buildPageUrl`・`findFetchablePagePath`・`selectFetchablePagePaths`・`findStartPagePath` を消す |
| `packages/content-extractor/src/document/extract-document.ts`・`parse-html.ts` | ページのリンク（`ExtractedDocument.links`・`extractLinks`）を消す |
| `packages/content-extractor/src/const.ts` | `MAX_SITEMAP_BYTES`・`MAX_CHILD_SITEMAPS` を消す |
| `packages/content-extractor/src/index.ts`・`src/web/index.ts` | 消したものの export |
| `packages/content-extractor/test/**` | `parse-sitemap.test.ts` を消し、`web-page-client.test.ts` の sitemap のテストと、消した関数・リンクのテストを消す |
| `apps/api/test/client/page-fetcher.test.ts` | `IWebPageClient` の偽物から `fetchSitemapUrls` を消す |
| ドキュメント | 下の「ドキュメント」 |

### Repository

`findEnabled` は SQL で GitHub のソースだけを取り、戻り値を `GitHubRepositorySource[]` にする。`findById` は今のまま `Source` を返す（`--source-id` にサイトのソースを指定されたことを service が見分けるため）。

```ts
  findEnabled(): Promise<GitHubRepositorySource[]>
```

- interface の JSDoc：「is_enabled = true の GitHub のソースを last_collected_at の古い順（未収集が先）で返す。サイトのソースは収集しないので返さない」

```ts
  public async findEnabled(): Promise<GitHubRepositorySource[]> {
    const rows = await this._db
      .select()
      .from(sources)
      .where(and(eq(sources.isEnabled, true), eq(sources.fetchType, "github_repository")))
      .orderBy(sql`${sources.lastCollectedAt} ASC NULLS FIRST`, asc(sources.id))
    return rows
      .map((row) => this._toDomain(row))
      .filter((source): source is GitHubRepositorySource => source.fetchType === "github_repository")
  }
```

`source-document-repository.ts` は、クロールの待ち行列のメソッドと型を消す。

```ts
export type MarkFetchedInput = {
  blobSha: string | null
  commitSha: string | null
  contentHash: string | null
  extractionVersion: string
  fetchedAt: Date
  title: string | null
}

export interface SourceDocumentRepository {
  findBySourceId(sourceId: number): Promise<SourceDocument[]>
  findWithCollectedPassages(sourceId: number): Promise<SourceDocument[]>
  markFetched(id: number, input: MarkFetchedInput): Promise<void>
  upsertByPath(input: { path: string; sourceId: number; title: string | null }): Promise<SourceDocument>
}
```

- `MarkFetchedInput` の JSDoc の「取得方法ごとの項目は、該当しない方を null にする」は残す（`blobSha`・`commitSha` は GitHub だけ）
- `findWithCollectedPassages` の JSDoc の「サイトは対象パス外のページ（リンクをたどるための行）が多いので」を消し、「collected の本文候補を持つ文書（id の昇順）」だけにする
- drizzle の `markFetched` の `set` から `etag`・`httpStatus`・`lastModified` を外す（列は step5 まで残るが、GitHub の行は null のまま）。`_toDomain` は `SourceDocument` の型に合わせて今のまま（step5 で消す）
- `UPSERT_BATCH_SIZE`・`GONE_HTTP_STATUSES` の import など、消したメソッドだけが使っていたものも消す

### service

`collect-passages.ts`：

```ts
export type CollectPassagesInput = {
  githubMinRateLimitRemaining: number
  maxDocumentsPerSource: number
  maxPassagesPerRun: number
  now: Date
  sourceId: number | null
}

const findTargetSources = async (sourceId: number | null, repo: CollectionRepo): Promise<GitHubRepositorySource[]> => {
  if (sourceId === null) return repo.sourceRepository.findEnabled()
  const source = await repo.sourceRepository.findById(sourceId)
  if (!source) throw new Error(`Source not found: id=${sourceId}`)
  if (source.fetchType === "website") throw new Error(`Website sources are not collected: id=${sourceId}`)
  if (!source.isEnabled) {
    throw new Error(`Source is disabled: id=${sourceId} (disabled sources can only be previewed with --dry-run)`)
  }
  return [source]
}
```

ループの中は GitHub だけにする。

```ts
    if (isGitHubRateLimited) {
      logger.warn("GitHub rate limit is low; skipped", { sourceId: source.id })
      continue
    }

    try {
      const result = await collectGitHubSource(
        {
          maxDocuments: input.maxDocumentsPerSource,
          maxPassages: remainingPassages,
          minRateLimitRemaining: input.githubMinRateLimitRemaining,
          now: input.now,
          source,
        },
        repo,
        deps,
      )
```

- `collectPassages` の JSDoc から「サイトのソースには影響させない」と、サイトの 429 / 503・Crawl-delay の行を消す
- `findTargetSources` の JSDoc：「--source-id の指定があればそのソースだけ（無い・サイト・無効なら throw）、無ければ有効な GitHub のソースを古い順に」

`preview-source.ts`：サイトの関数（`buildPagePreview`・`previewWebsiteFromSitemap`・`previewWebsiteFromStartPage`・`previewWebsiteSource`）と `UNCONDITIONAL` を消す。

```ts
export const previewSource = async (
  input: PreviewInput,
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<SourcePreview> => {
  const source = await repo.sourceRepository.findById(input.sourceId)
  if (!source) throw new Error(`Source not found: id=${input.sourceId}`)
  if (source.fetchType === "website") throw new Error(`Website sources are not collected: id=${input.sourceId}`)
  return previewGitHubSource(input, source, deps)
}
```

`types.ts`：

```ts
export type CollectionDeps = {
  githubContentClient: IGitHubContentClient
}

export type SourceCollectionStatus =
  | "completed"
  | "limit_reached"
  | "rate_limited"
  | "up_to_date"
```

- `SourceCollectionStatus` の JSDoc からサイトの記述（「サイトは取得待ちの行を全部処理した」・`crawl_delay_too_long`・`throttled`）を消す

`format-dry-run.ts`：`DocumentPreview` から `not_fetched` を消し、`formatDocument` の分岐も消す。JSDoc のサイトの記述（`fetchedFrom` の「サイトはサイトの URL と sitemap か開始ページ」、`targetDocumentCount` の「サイトを開始ページからたどった場合は…」）を消す。

### task と env

```ts
  const userAgent = buildCollectorUserAgent(env.COLLECT_WEB_CONTACT_URL)
  const deps = {
    githubContentClient: new GitHubContentClient({ token: env.GITHUB_CONTENT_TOKEN, userAgent }),
  }
```

- `logger.info("collect-passages started", ...)` と `collectPassages` の入力から `refetchDays` を消す
- task の JSDoc の「admin側で登録した有効なソースから」は「admin で登録した有効な GitHub のソースから」にする
- `env.ts` から `COLLECT_WEB_REQUEST_INTERVAL_MS`・`COLLECT_WEB_REFETCH_DAYS` を消す。`COLLECT_WEB_CONTACT_URL` は GitHub API の User-Agent に使うので残し、JSDoc を「収集のリクエスト（GitHub API）の User-Agent に入れる…」にする

### `@repo/content-extractor`

cron のサイトの収集でしか使っていなかったものを消す。api の URL から追加が使うもの（`WebPageClient` の `loadRobots`・`isAllowedByRobots`・`fetchPage`、`isPassageTargetUrl`・`extractWebPage`・`normalizePageUrl`、取得のエラー）は残す。条件付きリクエスト（`ETag` / `Last-Modified`）は api が取得の結果を `source_documents` に書いているので、step5 で消す。

- `IWebPageClient` から `fetchSitemapUrls` を消す
- `ExtractedDocument.links` を消すのは、本文のブロック・切り分け・本文候補の条件を変えないので、`EXTRACTION_VERSION` は上げない
- `README.md` の「サイトの取得」の表から sitemap（`src/parse-sitemap.ts`・sitemap の大きさの上限）と、`website-pages.ts` の「開始ページの path、収集と試し実行で共有」を消す。「詳細は … `apps/cron/CLAUDE.md` の「サイトのクロール（website）」」は、api の URL から追加（`apps/api/CLAUDE.md` の「サイトのページの取得」）を指すようにする

### テスト

| ファイル | 内容 |
| --- | --- |
| `test/service/collection/collect-website-source.test.ts` | 削除 |
| `test/service/collection/collect-passages.test.ts` | サイトのテストを消し、「`--source-id` にサイトのソースを指定したら throw する」を足す |
| `test/service/collection/preview-source.test.ts` | サイトのテストを消し、「サイトのソースは throw する」を足す |
| `test/service/collection/helpers.ts` | `buildHtmlPage`・`buildOkPage`・`createFakeWebPageClient`・クロールの Repository の偽物・`createDeps` の webPageClient を消す。`buildWebsiteSource` は上の 2 つの throw のテストで使うので残す |
| `test/repository/drizzle/source-document-repository.test.ts` | `findFetchQueue`・`upsertDiscovered`・`markResponse` のテストを消し、`markFetched` の期待値から 3 つの列を外す |
| `test/repository/drizzle/source-repository.test.ts` | `findEnabled` の `where` の期待値を `and(eq(sources.isEnabled, true), eq(sources.fetchType, "github_repository"))` にする |
| `test/lib/format-dry-run.test.ts` | `not_fetched` のテストを消す |
| `test/service/collection/collect-github-source.test.ts` | `markFetched` の期待値から 3 つの列を外す |

足すテスト（`collect-passages.test.ts` の「異常系」）：

```ts
    it("--source-id にサイトのソースを指定したら収集せずに throw する", async () => {
      const repo = createRepo({ sources: [buildWebsiteSource({ id: 7, isEnabled: true })] })

      await expect(collectPassages(buildInput({ sourceId: 7 }), repo, createDeps()))
        .rejects.toThrow("Website sources are not collected: id=7")
    })
```

- `createRepo`・`buildInput`・`createDeps` は今の helpers の名前に合わせる。`preview-source.test.ts` も同じ形で書く

### ドキュメント

| ファイル | 直すところ |
| --- | --- |
| `apps/cron/CLAUDE.md` | 「含まれるタスク」の `collect:passages`（GitHub だけ）、「本文の抽出とサイトの取得」、collect:passages のファイルの表（`collect-website-source.ts` の行を消し、「GitHub とサイトで共有」を消す）、「抽出の版」「古い本文候補の却下」のサイトの記述、「サイトのクロール（website）」の節（消す）、環境変数の表（2 つを消し、`COLLECT_WEB_CONTACT_URL` の説明を GitHub API の User-Agent にする）、テスト戦略の `WebPageClient` の偽物と待ち行列の SQL |
| `apps/cron/README.md` | サイトの収集と `COLLECT_WEB_*` の記述 |
| `docs/spec/content-collection/README.md` | 冒頭（取得元は GitHub だけ。サイトはローカルの URL から追加だけ、と `../github-only-collection/README.md` へのリンク）、「実行の仕組み」（試し実行のサイトの記述・外部クライアントの `WebPageClient`・フローの `web`）、「サイトのクロール」（節を消し、やめたことと `../github-only-collection/deferred-website-collection.md` へのリンクだけにする）、「取得先の制限」（cron の記述を消し、URL から追加の api で使うことにする）、「調整できる箇所」の CSS セレクタの行と `EXTRACTION_VERSION` の「サイトは取り直しの順番が来たときに」、「実行の上限と失敗時の扱い」の `COLLECT_WEB_*` の 2 行とサイトの 429 / 503・404 / 410・`last_collected_at` の行、「フロー図」の website の分岐、「実装ステップ」の step6 に「github-only-collection でやめた」と添える |
| `docs/spec/passage-extraction-tuning/README.md` | サイトの取り直しでの切り分け直し（取得済みの文書への反映・抽出の版）と、404 / 410 のページの却下の記述を、「サイトの収集は github-only-collection でやめた」と書き換える（`../github-only-collection/README.md` へのリンク） |
| `docs/spec/question-generation/tasks/step7-infra-cron-schedules.md` | cron の env の `COLLECT_WEB_REQUEST_INTERVAL_MS`・`COLLECT_WEB_REFETCH_DAYS` を消す（`COLLECT_WEB_CONTACT_URL` は残す） |
| `docs/spec/README.md` | content-collection の概要を「GitHub リポジトリの Markdown を cron で収集し…」にする |

- 適用済みの step の手順書（`content-collection/tasks/step6-cron-collect-website.md` など）は当時の実装の記録なので書き換えない。先頭に「github-only-collection でサイトの収集をやめた」と 1 行だけ足す

## 動作確認

```bash
pnpm --filter @repo/content-extractor build
pnpm --filter @repo/content-extractor test
pnpm --filter cron test
pnpm --filter api test      # page-fetcher の偽物を直したため。vitest を直接叩かない（dev DB が消える）
pnpm --filter cron exec tsc --noEmit
pnpm --filter api exec tsc --noEmit
pnpm lint:fix
```

- [ ] `rg -n "website|WebPageClient|sitemap|COLLECT_WEB_RE" apps/cron/src` で、サイトのソースを throw するところ（`collect-passages.ts`・`preview-source.ts`）と `findEnabled` の型の絞り込み以外に出ない
- [ ] ローカルで GitHub のソースの収集が今までどおり動く

```bash
cd apps/cron
pnpm collect:passages --source-id=66 --dry-run
pnpm collect:passages --source-id=68 --dry-run   # サイトのソース。Website sources are not collected で exit 1
pnpm collect:passages                             # 有効な GitHub のソースだけを収集する
```
