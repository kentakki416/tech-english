# step3-api-url-import

URL のページを取得・抽出して確認する API と、本文候補として保存する API を足す。仕様と理由は [README](../README.md)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/domain/src/const/url-import.ts`・`types/url-import.ts`・`index.ts` | `URL_IMPORT_CHUNK_STATUSES`・`URL_IMPORT_ERROR_CODES` と型 |
| `packages/domain/src/const/passage.ts`・`types/passage.ts` | `SUPERSEDED_PASSAGE_REJECT_REASON`（cron から移す）・`CHUNK_REJECT_REASONS`（共有パッケージから移す）と `ChunkRejectReason` |
| `packages/content-extractor/src/web/web-page-client.ts`・`errors.ts` | `WebPageClientOptions.maxCrawlDelaySeconds`・`deadlineAt`、`WebDeadlineExceededError` |
| `packages/content-extractor/src/const.ts`・`document/passage-rules.ts`・`index.ts` | `buildCollectorUserAgent`、`ChunkRejectReason` を `@repo/domain` から使う |
| `packages/schema/src/api-schema/admin/url-import.ts`・`index.ts` | リクエスト・レスポンスのスキーマ |
| `apps/api/src/env.ts`・`.env.example` | `COLLECT_WEB_CONTACT_URL`（任意） |
| `apps/api/src/client/page-fetcher.ts` | `IPageFetcher` と、`@repo/content-extractor` を使うときに読む実装 |
| `apps/api/src/repository/url-import-repository.ts`・`drizzle/url-import-repository.ts`・`index.ts` | 文書の読み書き・本文候補の検索・挿入・優先・却下 |
| `apps/api/src/service/url-import-service.ts`・`index.ts` | 確認と保存 |
| `apps/api/src/controller/admin/url-import/preview.ts`・`create.ts` | Controller |
| `apps/api/src/routes/admin-router.ts`・`src/index.ts` | ルートと DI |
| `apps/api/package.json` | `@repo/content-extractor: workspace:^` |
| `apps/api/CLAUDE.md` | `COLLECT_WEB_CONTACT_URL`、Node 20.19 以上が要ること（`require(esm)`）、`client/page-fetcher` は使うときにパッケージを読むこと |
| `apps/cron/src/task/collect-passages.ts`・`const/collection.ts` ほか | User-Agent を `buildCollectorUserAgent` で作る、`SUPERSEDED_PASSAGE_REJECT_REASON` を `@repo/domain` から import する |
| `apps/api/test/` | 下の「動作確認」 |
| `docs/spec/content-collection/README.md`・`deferred-more-sources.md` | MVP 対象外の「管理画面からの収集の即時実行・抽出のプレビュー」のうち、URL の 1 ページの取り込みをこの機能で行うことを書く |

### ドメインの定数

`const/url-import.ts`：

```ts
export const URL_IMPORT_CHUNK_STATUSES = ["duplicated", "existing", "generated_section", "new", "not_candidate"] as const

export const URL_IMPORT_ERROR_CODES = [
  "blocked_url",
  "crawl_delay_too_long",
  "deadline_exceeded",
  "extraction_failed",
  "github_source",
  "http_error",
  "network_error",
  "not_html",
  "out_of_target_path",
  "redirect_not_allowed",
  "redirected_out_of_target",
  "robots_disallowed",
  "robots_unavailable",
  "source_not_found",
  "throttled",
  "too_large",
  "too_many_redirects",
] as const
```

`const/passage.ts`：

```ts
export const CHUNK_REJECT_REASONS = ["not_english", "not_prose", "too_long", "too_much_code", "too_short"] as const

export const SUPERSEDED_PASSAGE_REJECT_REASON = "切り分け直したため、前の切り分けの本文候補を外した"
```

- 型（`UrlImportChunkStatus`・`UrlImportErrorCode`・`ChunkRejectReason`）は `types/` に置く（`packages/domain/README.md` の構成）。JSDoc に各値の意味（README の「確認と保存」「取り込めないとき」の表）を書く
- 共有パッケージの `passage-rules.ts` の `ChunkRejectReason` は `@repo/domain` のものを使う

### 共有パッケージ（`@repo/content-extractor`）

`WebPageClientOptions`：

```ts
  deadlineAt?: number
  maxCrawlDelaySeconds?: number
```

- `deadlineAt`（epoch ミリ秒）を過ぎるリクエストは送らずに `WebDeadlineExceededError` を throw する。リクエストの間隔を待った後の送る時刻が期限を過ぎるときも送らない。各リクエストのタイムアウトは `min(WEB_REQUEST_TIMEOUT_MS, deadlineAt - now)`。省略時は期限なし（収集は今のまま）
- `maxCrawlDelaySeconds` の省略時は `MAX_CRAWL_DELAY_SECONDS`
- `buildCollectorUserAgent(contactUrl: string | undefined): string` を `const.ts` に足し、cron の `task/collect-passages.ts` の組み立てを置き換える

テスト（`test/web/web-page-client.test.ts`）：期限を過ぎるリクエストを送らないこと、間隔を待つと期限を過ぎるときも送らないこと、`maxCrawlDelaySeconds` を超える Crawl-delay で `CrawlDelayTooLongError`。

### スキーマ（`api-schema/admin/url-import.ts`）

```ts
const urlImportUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", { message: "URL must use https" })

export const previewUrlImportRequestSchema = z.object({ url: urlImportUrlSchema })

export const previewUrlImportResponseSchema = z.object({
  chunks: z.array(z.object({
    excerpt: z.string(),
    reject_reasons: z.array(z.enum(CHUNK_REJECT_REASONS)),
    status: z.enum(URL_IMPORT_CHUNK_STATUSES),
    title: z.string(),
    word_count: z.number().int().nonnegative(),
  })),
  page: z.object({
    path: z.string(),
    title: z.string(),
    url: z.string(),
    word_count: z.number().int().nonnegative(),
  }),
  source: z.object({
    id: z.number().int().positive(),
    license_spdx: allowedLicenseSchema,
    name: z.string(),
  }),
})

export const createUrlImportRequestSchema = z.object({ url: urlImportUrlSchema })

export const createUrlImportResponseSchema = z.object({
  created_count: z.number().int().nonnegative(),
  passages: z.array(z.object({
    id: z.number().int().positive(),
    is_new: z.boolean(),
    title: z.string(),
  })),
  rejected_count: z.number().int().nonnegative(),
  source_document_id: z.number().int().positive(),
  source_id: z.number().int().positive(),
})

export const urlImportErrorCodeSchema = z.enum(URL_IMPORT_ERROR_CODES)
```

- スキーマの規約（`packages/schema/CLAUDE.md`）どおり、エンドポイントごとにセクションの区切りと JSDoc を書く。`urlImportUrlSchema` は 2 つのリクエストで同じ制約なのでファイルの中で共有する。`allowedLicenseSchema` は `content-source.ts` のものを使う
- `excerpt` は塊の最初の見出しでないブロックの先頭 160 文字
- `passages` は今回優先した `collected`（新しく作ったものと、同じ内容で既にあったもの）。`is_new` は今回作ったか
- `urlImportErrorCodeSchema` は admin が 400 の `details[0].code` を読むために出す

### クライアント（`client/page-fetcher.ts`）

```ts
export type FetchedPage = {
  chunks: PassageChunk[]
  contentHash: string
  etag: string | null
  extractionVersion: string
  fetchedUrl: string
  httpStatus: number
  lastModified: string | null
  path: string
  title: string
  wordCount: number
}

export type PageFetchResult =
  | { kind: "ok"; page: FetchedPage }
  | { code: UrlImportErrorCode; detail: string | null; kind: "failed" }

export interface IPageFetcher {
  fetchAndExtractPage(input: { now: Date; source: WebsiteSource; url: string }): Promise<PageFetchResult>
}

export class PageFetcher implements IPageFetcher {
  constructor(private _contactUrl: string | undefined) {}

  public async fetchAndExtractPage(input: { now: Date; source: WebsiteSource; url: string }): Promise<PageFetchResult> {
    const extractor = await import("@repo/content-extractor")
    const normalizedUrl = extractor.normalizePageUrl(input.url, input.source.siteUrl)
    ...
    const client = new extractor.WebPageClient({
      allowedOrigin: input.source.siteUrl,
      deadlineAt: input.now.getTime() + URL_IMPORT_FETCH_DEADLINE_MS,
      maxCrawlDelaySeconds: URL_IMPORT_MAX_CRAWL_DELAY_SECONDS,
      requestIntervalMs: URL_IMPORT_REQUEST_INTERVAL_MS,
      userAgent: extractor.buildCollectorUserAgent(this._contactUrl),
    })
    ...
  }
}
```

- 手順：URL を `normalizePageUrl` で正規化（クエリ・フラグメントを除く。できなければ `blocked_url`）→ `isPassageTargetUrl` に合わなければ `out_of_target_path` → `loadRobots` → `isAllowedByRobots` で禁止なら `robots_disallowed` → 正規化した URL を `fetchPage(url, { etag: null, lastModified: null })` → 行き先が `isPassageTargetUrl` に合わなければ `redirected_out_of_target` → `extractWebPage`（throw したら `extraction_failed`）
- `path` は正規化した URL の pathname、`extractionVersion` は `EXTRACTION_VERSION`、`chunks` は条件を満たさない塊も含む（`rejectReasons` で見分ける）
- 失敗の対応：`loadRobots` の throw（5xx・ネットワーク）は `robots_unavailable`、`CrawlDelayTooLongError` は `crawl_delay_too_long`、`WebSourceThrottledError` は `throttled`、`BlockedUrlError` は `blocked_url`、`WebDeadlineExceededError` は `deadline_exceeded`、`http_error` は `http_error`（`detail` に status）、`network_error` は `network_error`、`skipped` の `reason` はそのまま（`not_html`・`too_large`・`redirect_not_allowed`・`too_many_redirects`。`robots_disallowed` は禁止）
- `URL_IMPORT_FETCH_DEADLINE_MS = 20_000`・`URL_IMPORT_MAX_CRAWL_DELAY_SECONDS = 10`・`URL_IMPORT_REQUEST_INTERVAL_MS = 1000`。JSDoc に、API Gateway と Lambda の 29 秒に収めるための値であることを書く
- `@repo/content-extractor` の値は `fetchAndExtractPage` の中で `import()` で読み、型だけを `import type` で読む。JSDoc に、jsdom などを読むのを使うときまで遅らせ、ほかの API のコールドスタートを遅くしないため、と書く。service・Repository は値として import しない

### Repository（`url-import-repository.ts`）

```ts
export type ImportPassage = Pick<Passage, "contentHash" | "generatedAt" | "id" | "status" | "title">

export type FetchedDocumentInput = {
  contentHash: string
  etag: string | null
  extractionVersion: string
  fetchedAt: Date
  httpStatus: number
  lastModified: string | null
  path: string
  sourceId: number
  title: string
}

export type CandidateInput = Pick<Passage, "blocks" | "contentHash" | "sourceDocumentId" | "sourcePath" | "sourceRetrievedAt" | "title" | "wordCount">
  & { generationPrioritizedAt: Date }

export interface UrlImportRepository {
  findDocumentPassages(input: { path: string; sourceId: number }, tx?: TransactionContext): Promise<ImportPassage[]>
  findPassagesByContentHashes(contentHashes: string[], tx?: TransactionContext): Promise<ImportPassage[]>
  insertCandidates(inputs: CandidateInput[], tx: TransactionContext): Promise<number[]>
  prioritizeCollected(input: { contentHashes: string[]; now: Date }, tx: TransactionContext): Promise<Pick<Passage, "id" | "title">[]>
  rejectCollected(
    input: { keepContentHashes: string[]; reason: string; sourceDocumentId: number },
    tx: TransactionContext,
  ): Promise<number>
  upsertFetchedDocument(input: FetchedDocumentInput, tx: TransactionContext): Promise<{ id: number }>
}
```

- `findDocumentPassages`：`source_documents` を `(source_id, path)` で引き、その文書の `passages` を返す（文書が無ければ空）。同じ見出しの問題の判定に使う
- `findPassagesByContentHashes`：`content_hash` が入るものを、文書を問わずに返す（`content_hash` は全体で unique）。空なら空
- `upsertFetchedDocument`：`(source_id, path)` で insert ... on conflict do update。取得の結果の列を書き、`blob_sha`・`commit_sha` は null、`sitemap_lastmod` は変えない
- `insertCandidates`：`on conflict (content_hash) do nothing` で挿入し、挿入した行の id を返す
- `prioritizeCollected`：`collected` で `content_hash` が入るものに `generation_prioritized_at = coalesce(generation_prioritized_at, now)` を書いて返す（文書で絞らない。すでに優先していれば時刻を変えない）。空なら何もせず空
- `rejectCollected`：cron の `rejectCollected` と同じ条件（その文書の `collected` で `content_hash` が `keepContentHashes` に無いもの。空なら NOT IN を付けない）。件数を返す

### Service（`url-import-service.ts`）

```ts
type UrlImportRepo = {
  contentSourceRepository: Pick<ContentSourceRepository, "findAll">
  urlImportRepository: UrlImportRepository
}

type UrlImportDeps = { pageFetcher: IPageFetcher }

export const previewUrlImport = async (
  url: string,
  now: Date,
  repo: UrlImportRepo,
  deps: UrlImportDeps,
): Promise<Result<UrlImportPreview>> => {
  const source = await findImportSource(url, repo)
  if (!source.ok) return source
  const fetched = await deps.pageFetcher.fetchAndExtractPage({ now, source: source.value, url })
  if (fetched.kind === "failed") return err(buildUrlImportError(fetched.code, fetched.detail))
  const [documentPassages, sameContentPassages] = await Promise.all([
    repo.urlImportRepository.findDocumentPassages({ path: fetched.page.path, sourceId: source.value.id }),
    repo.urlImportRepository.findPassagesByContentHashes(fetched.page.chunks.map((chunk) => chunk.contentHash)),
  ])
  return ok({ chunks: classifyChunks(fetched.page.chunks, documentPassages, sameContentPassages), page: fetched.page, source: source.value })
}

export const importUrl = async (
  url: string,
  now: Date,
  repo: UrlImportRepo & { transactionRunner: TransactionRunner },
  deps: UrlImportDeps,
): Promise<Result<UrlImportResult>> => {
  ...
  const saved = await repo.transactionRunner.run(async (tx) => {
    const document = await repo.urlImportRepository.upsertFetchedDocument({ ... }, tx)
    const documentPassages = await repo.urlImportRepository.findDocumentPassages({ path: page.path, sourceId: source.value.id }, tx)
    const generatedTitles = new Set(documentPassages.filter(isGeneratedOrGenerating).map((passage) => passage.title))
    const candidatesToInsert = page.chunks.filter((chunk) => chunk.rejectReasons.length === 0 && !generatedTitles.has(chunk.title))
    const createdIds = await repo.urlImportRepository.insertCandidates(..., tx)
    const keepContentHashes = candidatesToInsert.map((candidate) => candidate.contentHash)
    const prioritized = await repo.urlImportRepository.prioritizeCollected({ contentHashes: keepContentHashes, now }, tx)
    const rejectedCount = await repo.urlImportRepository.rejectCollected({ keepContentHashes, reason: SUPERSEDED_PASSAGE_REJECT_REASON, sourceDocumentId: document.id }, tx)
    return { createdIds, documentId: document.id, prioritized, rejectedCount }
  })
  ...
}
```

- `findImportSource`：`findAll` のうち、`fetchType === "website"` でサイトの URL が `new URL(url).origin` と同じもの（`site_url` は登録のときにオリジンに正規化していて unique なので 1 つ）。無ければ、`github_repository` で `publicUrlTemplate` のオリジンが同じものがあれば 400（`github_source`）、それも無ければ 400（`source_not_found`）。対象パスの判定はクライアントが行う（`out_of_target_path`）
- `isGeneratedOrGenerating(passage)`：`status` が `generating`・`draft`・`published` か、`rejected` で `generatedAt` がある。cron の `findGeneratedOrGeneratingTitles` と同じ条件（JSDoc に、条件を変えるときは cron も直すと書く）
- `classifyChunks`：`rejectReasons` があれば `not_candidate`。同じ `contentHash` の本文候補があれば、`collected` なら `existing`、それ以外の状態なら `duplicated`。その文書に同じ見出しの `isGeneratedOrGenerating` な本文候補があれば `generated_section`。それ以外は `new`
- 保存の後、`logger.info` に source・path・作った件数・優先した件数・却下した件数を出す
- `buildUrlImportError(code, detail)`：`badRequestError("URL could not be imported", [{ code, message: detail ?? code, path: ["url"] }])`
- `UrlImportPreview`・`UrlImportResult` の型は service に置く（Controller が response に変える）

### Controller・ルート

- `POST /api/admin/url-import/preview`（`AdminUrlImportPreviewController`）：200
- `POST /api/admin/url-import`（`AdminUrlImportCreateController`）：201
- どちらも `parseRequest` / `parseResponse`、失敗は `sendError`
- `src/index.ts` で `PageFetcher` を `new PageFetcher(env.COLLECT_WEB_CONTACT_URL)` で作り、Controller に渡す

## 動作確認

`test/service/url-import-service/previewUrlImport.test.ts`・`importUrl.test.ts`（Repository と `IPageFetcher` は `vi.fn()`）：

- 確認：同じオリジンの website のソースが無ければ `source_not_found`、GitHub のソースの公開ページのオリジンなら `github_source`。無効のソースも当たる
- 確認：取得・抽出の失敗の code がそのまま 400 の `details[0].code` になる
- 確認：塊の分類（`not_candidate`・`existing`・`duplicated`・`generated_section`・`new`）。別の文書の同じ内容の `collected` は `existing`。生成した後に却下したもの（`generatedAt` あり）は `generated_section` の判定に数え、収集が外した却下（`generatedAt` なし）は数えない
- 保存：文書の upsert → 同じ見出しの問題がある塊を除いて挿入（`generationPrioritizedAt` に now）→ 残した塊のハッシュで優先 → 却下、が同じ `tx` で呼ばれる。`is_new` は挿入した id かどうか
- 保存：本文候補が 0 なら挿入・優先しない（文書は記録し、前の切り分けの `collected` は却下する）

`test/repository/url-import-repository.test.ts`（実 DB）：

- `upsertFetchedDocument` は同じ `(source_id, path)` の 2 回目で同じ行を更新する
- `insertCandidates` は同じ `content_hash` を飛ばし、挿入した id だけ返す
- `findPassagesByContentHashes` は別の文書の行も返す
- `prioritizeCollected` は `collected` だけに時刻を入れ（別の文書のものも）、すでに入っていれば変えない
- `rejectCollected` はその文書の `collected` で残すハッシュに無いものだけを却下する

`test/controller/admin/url-import/*.test.ts`（supertest。`IPageFetcher` は偽物を渡す）：

- 確認は 200 とレスポンスの形、取り込めないときは 400 と `details[0].code`、`http` の URL は 400
- 保存は 201、admin の認証が無ければ 401

`test/client/page-fetcher.test.ts`：`@repo/content-extractor` の `WebPageClient` を `vi.mock` で差し替え、正規化（クエリを除く）・対象パスの外・robots で禁止・リダイレクトで対象外・抽出の throw・期限・各取得の失敗の code の対応を確かめる

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/api-schema build && pnpm --filter @repo/content-extractor build
pnpm --filter @repo/content-extractor test
pnpm --filter api test
pnpm --filter api exec tsc --noEmit
pnpm --filter cron test
```

ビルドした api が、本番と同じ経路（CommonJS の dist → `import()` → パッケージの CommonJS → `require(esm)` で unified）でパッケージを読めることを、Node 20 で確かめる（vitest と tsx はこの経路を通らない）。

```bash
pnpm --filter api build
cd apps/api && npx -y -p node@20 node -e "import('@repo/content-extractor').then((m) => console.log(typeof m.extractWebPage, typeof m.WebPageClient))"
docker build -f apps/api/Dockerfile -t tech-english-api:url-import .
```

- dev の api で、サイトのソース（step4 で登録する Go 公式ドキュメント）の URL を curl で確認・保存し、`passages` に `generation_prioritized_at` 付きの `collected` ができること（admin の JWT は `http://localhost:3030/api/dev/login` の cookie から取る）
