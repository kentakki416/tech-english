# step3-api-url-import

URL のページを取得・抽出して確認する API と、本文候補として保存する API を足す。仕様と理由は [README](../README.md)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/domain/src/const/url-import.ts`・`index.ts` | `URL_IMPORT_CHUNK_STATUSES`・`URL_IMPORT_ERROR_CODES`・`SUPERSEDED_PASSAGE_REJECT_REASON`（cron から移す） |
| `packages/content-extractor/src/web/web-page-client.ts` | `WebPageClientOptions.maxCrawlDelaySeconds`（省略時は `MAX_CRAWL_DELAY_SECONDS`） |
| `packages/schema/src/api-schema/admin/url-import.ts`・`index.ts` | リクエスト・レスポンスのスキーマ |
| `apps/api/src/env.ts`・`.env.example` | `COLLECT_WEB_CONTACT_URL`（任意） |
| `apps/api/src/client/page-extractor.ts` | `IPageExtractor` と、`@repo/content-extractor` を使うときに読む実装 |
| `apps/api/src/repository/url-import-repository.ts`・`drizzle/url-import-repository.ts`・`index.ts` | 文書の読み書き・本文候補の挿入・優先・却下 |
| `apps/api/src/service/url-import-service.ts`・`index.ts` | 確認と保存 |
| `apps/api/src/controller/admin/url-import/preview.ts`・`create.ts` | Controller |
| `apps/api/src/routes/admin-router.ts`・`src/index.ts` | ルートと DI |
| `apps/api/package.json` | `@repo/content-extractor: workspace:^` |
| `apps/cron/src/const/collection.ts` ほか | `SUPERSEDED_PASSAGE_REJECT_REASON` を `@repo/domain` から import する |
| `apps/api/test/` | 下の「動作確認」 |
| `docs/spec/content-collection/README.md`・`deferred-more-sources.md` | MVP 対象外の「管理画面からの収集の即時実行・抽出のプレビュー」のうち、URL の 1 ページの取り込みをこの機能で行うことを書く |

### ドメインの定数

```ts
export const URL_IMPORT_CHUNK_STATUSES = ["existing", "generated_section", "new", "not_candidate"] as const

export const URL_IMPORT_ERROR_CODES = [
  "blocked_url",
  "crawl_delay_too_long",
  "extraction_failed",
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

export const SUPERSEDED_PASSAGE_REJECT_REASON = "切り分け直したため、前の切り分けの本文候補を外した"
```

- 型（`UrlImportChunkStatus`・`UrlImportErrorCode`）も同じファイルに足す。JSDoc に各値の意味（README の「確認と保存」「取り込めないとき」の表）を書く

### スキーマ（`api-schema/admin/url-import.ts`）

```ts
const urlImportUrlSchema = z.string().trim().url().max(2048)

export const previewUrlImportRequestSchema = z.object({ url: urlImportUrlSchema })

export const previewUrlImportResponseSchema = z.object({
  chunks: z.array(z.object({
    excerpt: z.string(),
    reject_reasons: z.array(z.string()),
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
    license_spdx: z.string(),
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

- スキーマの規約（`packages/schema/CLAUDE.md`）どおり、エンドポイントごとにセクションの区切りと JSDoc を書く。`urlImportUrlSchema` は 2 つのリクエストで同じ制約なのでファイルの中で共有する
- `excerpt` は塊の最初の見出しでないブロックの先頭 160 文字
- `passages` は保存した後のその文書の `collected` のうち優先したもの（新しく作ったものと、同じ内容で既にあったもの）。`is_new` は今回作ったか
- `urlImportErrorCodeSchema` は admin が 400 の `details[0].code` を読むために出す

### クライアント（`client/page-extractor.ts`）

```ts
export type ExtractedPage = {
  candidates: PassageChunk[]
  chunks: PassageChunk[]
  contentHash: string
  etag: string | null
  finalUrl: string
  httpStatus: number
  lastModified: string | null
  path: string
  title: string
  wordCount: number
}

export type PageExtractionResult =
  | { kind: "ok"; page: ExtractedPage }
  | { code: UrlImportErrorCode; detail: string | null; kind: "failed" }

export interface IPageExtractor {
  extractPage(input: { source: WebsiteSource; url: string }): Promise<PageExtractionResult>
}

export class PageExtractor implements IPageExtractor {
  constructor(private _contactUrl: string | undefined) {}

  public async extractPage(input: { source: WebsiteSource; url: string }): Promise<PageExtractionResult> {
    const extractor = await import("@repo/content-extractor")
    const client = new extractor.WebPageClient({
      allowedOrigin: input.source.siteUrl,
      maxCrawlDelaySeconds: URL_IMPORT_MAX_CRAWL_DELAY_SECONDS,
      requestIntervalMs: URL_IMPORT_REQUEST_INTERVAL_MS,
      userAgent: extractor.buildCollectorUserAgent(this._contactUrl),
    })
    ...
  }
}
```

- 手順：`loadRobots` → `isAllowedByRobots` で禁止なら `robots_disallowed` → `fetchPage(url, { etag: null, lastModified: null })` → 行き先が `isPassageTargetUrl` に合わなければ `redirected_out_of_target` → `extractWebPage`（throw したら `extraction_failed`）
- `path` は `findFetchablePagePath` と同じく、正規化した URL の pathname
- 失敗の対応：`loadRobots` の throw（5xx・ネットワーク）は `robots_unavailable`、`CrawlDelayTooLongError` は `crawl_delay_too_long`、`WebSourceThrottledError` は `throttled`、`BlockedUrlError` は `blocked_url`、`http_error` は `http_error`（`detail` に status）、`network_error` は `network_error`、`skipped` の `reason` はそのまま（`not_html`・`too_large`・`redirect_not_allowed`・`too_many_redirects`。`robots_disallowed` は禁止）
- `URL_IMPORT_MAX_CRAWL_DELAY_SECONDS = 10`・`URL_IMPORT_REQUEST_INTERVAL_MS = 1000`。JSDoc に、API Gateway の 29 秒に収めるための値であることを書く
- `@repo/content-extractor` の値は `extractPage` の中で `import()` で読み、型だけを `import type` で読む。JSDoc に、jsdom などを読むのを使うときまで遅らせ、ほかの API のコールドスタートを遅くしないため、と書く
- User-Agent は、cron の `task/collect-passages.ts` が組み立てている形（`TechEnglishBot/1.0 (+url)`）を共有パッケージの `buildCollectorUserAgent(contactUrl: string | undefined): string` にして、cron と api の両方で使う。api では `PageExtractor` に `COLLECT_WEB_CONTACT_URL` を渡し、`extractPage` の中で `import()` した後に作る

### Repository（`url-import-repository.ts`）

```ts
export type DocumentPassage = Pick<Passage, "contentHash" | "generatedAt" | "id" | "status" | "title">

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
  findDocumentPassages(input: { path: string; sourceId: number }): Promise<DocumentPassage[]>
  insertCandidates(inputs: CandidateInput[], tx: TransactionContext): Promise<number[]>
  prioritizeCollected(
    input: { contentHashes: string[]; now: Date; sourceDocumentId: number },
    tx: TransactionContext,
  ): Promise<Pick<Passage, "id" | "title">[]>
  rejectCollected(
    input: { keepContentHashes: string[]; reason: string; sourceDocumentId: number },
    tx: TransactionContext,
  ): Promise<number>
  upsertFetchedDocument(input: FetchedDocumentInput, tx: TransactionContext): Promise<{ id: number }>
}
```

- `findDocumentPassages`：`source_documents` を `(source_id, path)` で引き、その文書の `passages` を返す（文書が無ければ空）
- `upsertFetchedDocument`：`(source_id, path)` で insert ... on conflict do update。取得の結果の列を書き、`blob_sha`・`commit_sha` は null、`sitemap_lastmod` は変えない
- `insertCandidates`：`on conflict (content_hash) do nothing` で挿入し、挿入した行の id を返す
- `prioritizeCollected`：その文書の `collected` で `content_hash` が `contentHashes` に入るものに、`generation_prioritized_at = coalesce(generation_prioritized_at, now)` を書いて返す（すでに優先していれば時刻を変えない）。`contentHashes` が空なら何もせず空
- `rejectCollected`：cron の `rejectCollected` と同じ条件（その文書の `collected` で `content_hash` が `keepContentHashes` に無いもの。空なら NOT IN を付けない）。件数を返す

### Service（`url-import-service.ts`）

```ts
type UrlImportRepo = {
  contentSourceRepository: Pick<ContentSourceRepository, "findAll">
  urlImportRepository: UrlImportRepository
}

type UrlImportDeps = { pageExtractor: IPageExtractor }

export const previewUrlImport = async (
  url: string,
  repo: UrlImportRepo,
  deps: UrlImportDeps,
): Promise<Result<UrlImportPreview>> => {
  const source = await findImportSource(url, repo)
  if (!source.ok) return source
  const extraction = await deps.pageExtractor.extractPage({ source: source.value, url })
  if (extraction.kind === "failed") return err(buildUrlImportError(extraction.code, extraction.detail))
  const passages = await repo.urlImportRepository.findDocumentPassages({ path: extraction.page.path, sourceId: source.value.id })
  return ok({ chunks: classifyChunks(extraction.page.chunks, passages), page: extraction.page, source: source.value })
}

export const importUrl = async (
  url: string,
  now: Date,
  repo: UrlImportRepo & { transactionRunner: TransactionRunner },
  deps: UrlImportDeps,
): Promise<Result<UrlImportResult>> => {
  const source = await findImportSource(url, repo)
  if (!source.ok) return source
  const extraction = await deps.pageExtractor.extractPage({ source: source.value, url })
  if (extraction.kind === "failed") return err(buildUrlImportError(extraction.code, extraction.detail))
  const { page } = extraction
  const saved = await repo.transactionRunner.run(async (tx) => {
    const document = await repo.urlImportRepository.upsertFetchedDocument({ ... }, tx)
    const generatedTitles = new Set(...)
    const candidatesToInsert = page.candidates.filter((candidate) => !generatedTitles.has(candidate.title))
    const createdIds = await repo.urlImportRepository.insertCandidates(..., tx)
    const keepContentHashes = candidatesToInsert.map((candidate) => candidate.contentHash)
    const prioritized = await repo.urlImportRepository.prioritizeCollected({ contentHashes: keepContentHashes, now, sourceDocumentId: document.id }, tx)
    const rejectedCount = await repo.urlImportRepository.rejectCollected({ keepContentHashes, reason: SUPERSEDED_PASSAGE_REJECT_REASON, sourceDocumentId: document.id }, tx)
    return { createdIds, documentId: document.id, prioritized, rejectedCount }
  })
  ...
}
```

- `findImportSource`：`findAll` のうち `fetchType === "website"` で、サイトの URL のオリジンが URL と同じもの。無ければ 400（`source_not_found`）。そのうち `isPassageTargetUrl` に合うもの（id の小さい方）。無ければ 400（`out_of_target_path`）。URL を `normalizePageUrl` で正規化できなければ 400（`url` の Zod の検証を通っても `https` でない URL はここで落とす。code は `blocked_url`）
- 見出しの確認（生成中・生成した本文候補の見出し）は、トランザクションの中で `findDocumentPassages` の結果から作る（`status` が `generating`・`draft`・`published` か、`rejected` で `generatedAt` がある）。この条件は cron の `findGeneratedOrGeneratingTitles` と同じ。純関数 `isGeneratedOrGenerating(passage)` にして、確認の分類と保存の両方で使う
  - `findDocumentPassages` にも `tx` を渡せるようにする（保存はトランザクションの中で読む）
- `classifyChunks`：`rejectReasons` があれば `not_candidate`、同じ `contentHash` の本文候補があれば `existing`、生成中・生成した本文候補と同じ見出しなら `generated_section`、それ以外は `new`
- 保存の後、`logger.info` に source・path・作った件数・優先した件数・却下した件数を出す
- `buildUrlImportError(code, detail)`：`badRequestError("URL could not be imported", [{ code, message: detail ?? code, path: ["url"] }])`

### Controller・ルート

- `POST /api/admin/url-import/preview`（`AdminUrlImportPreviewController`）：200
- `POST /api/admin/url-import`（`AdminUrlImportCreateController`）：201
- どちらも `parseRequest` / `parseResponse`、失敗は `sendError`。`/url-import/preview` を `/url-import` より先に登録する必要は無い（メソッドとパスが別）
- `src/index.ts` で `PageExtractor` を `new PageExtractor(env.COLLECT_WEB_CONTACT_URL)` で作り、Controller に渡す

## 動作確認

`test/service/url-import-service.test.ts`（Repository と `IPageExtractor` は `vi.fn()`）：

- 確認：同じオリジンのサイトのソースが無ければ `source_not_found`、対象パスの外なら `out_of_target_path`。GitHub のソースは当たらない。無効のソースも当たる
- 確認：抽出の失敗の code がそのまま 400 の `details[0].code` になる
- 確認：塊の分類（`not_candidate`・`existing`・`generated_section`・`new`）。生成した後に却下したもの（`generatedAt` あり）は `generated_section`、収集が外した却下（`generatedAt` なし）は数えない
- 保存：文書の upsert → 見出しで止めた塊を除いて挿入（`generationPrioritizedAt` に now）→ 残した塊のハッシュで優先 → 却下、が同じ `tx` で呼ばれる。`is_new` は挿入した id かどうか
- 保存：本文候補が 0 なら挿入・優先しない（文書は記録し、前の切り分けの `collected` は却下する）

`test/repository/url-import-repository.test.ts`（実 DB）：

- `upsertFetchedDocument` は同じ `(source_id, path)` の 2 回目で同じ行を更新する
- `insertCandidates` は同じ `content_hash` を飛ばし、挿入した id だけ返す
- `prioritizeCollected` はその文書の `collected` だけに時刻を入れ、すでに入っていれば変えない
- `rejectCollected` はその文書の `collected` で残すハッシュに無いものだけを却下する

`test/controller/admin/url-import/*.test.ts`（supertest。`IPageExtractor` は偽物を渡す）：

- 確認は 200 とレスポンスの形、取り込めないときは 400 と `details[0].code`
- 保存は 201、admin の認証が無ければ 401

`test/client/page-extractor.test.ts`：`@repo/content-extractor` の `WebPageClient` を `vi.mock` で差し替え、robots で禁止・リダイレクトで対象外・抽出の throw・各取得の失敗の code の対応を確かめる

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/api-schema build && pnpm --filter @repo/content-extractor build
pnpm --filter api test
pnpm --filter api exec tsc --noEmit
pnpm --filter cron test
pnpm --filter @repo/content-extractor test
```

- dev の api で、サイトのソース（step4 で登録する Go 公式ドキュメント）の URL を curl で確認・保存し、`passages` に `generation_prioritized_at` 付きの `collected` ができること（admin の JWT は `http://localhost:3030/api/dev/login` の cookie から取る）
