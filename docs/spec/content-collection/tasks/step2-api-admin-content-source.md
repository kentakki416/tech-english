# step2-api-admin-content-source

admin 向けのソースの一覧・詳細・登録・更新と、GitHub が検出したライセンスを返す API を作る。仕様は [README の必要な API](../README.md#必要な-api) と [ソース登録時の確認](../README.md#ソース登録時の確認)。

## 前提

- [step1-db-content-sources](./step1-db-content-sources.md)
- [question-generation step4-api-admin-auth](../../question-generation/tasks/step4-api-admin-auth.md)：`src/routes/admin-router.ts`、`adminAuthMiddleware`（`X-Admin-Token`）、`PUBLIC_PATHS` の `/api/admin`、env の `ADMIN_API_TOKEN` ができている。この step はそのルーターにルートを足すだけ

## 対応内容

| メソッド | パス | 成功 | 業務エラー |
| --- | --- | --- | --- |
| GET | `/api/admin/content-source` | 200 | ― |
| GET | `/api/admin/content-source/:id` | 200 | 404 |
| POST | `/api/admin/content-source` | 201 | 400（スキーマ）/ 409（`repository` / `site_url` の重複） |
| PUT | `/api/admin/content-source/:id` | 200 | 400（スキーマ・取得方法の変更・文書を取得したソースの `repository` / `site_url` の変更）/ 404 / 409 |
| GET | `/api/admin/content-source/license?repository=owner/name` | 200 | 400（形式） |

### 1. api-schema（`packages/schema/src/api-schema/admin/content-source.ts`）

`packages/schema/package.json` に `@repo/domain` が無ければ足す。`api-schema/index.ts` に `export * from "./admin/content-source"` を足す（ファイル名順で先頭）。

```ts
/** GitHub はリポジトリ名の大文字・小文字を区別しないので、小文字にそろえて保存・検索する */
const githubRepositorySchema = z.string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/)
  .transform((value) => value.toLowerCase())
const httpsOriginSchema = z.string().url()
  .refine((value) => new URL(value).protocol === "https:")
  .transform((value) => new URL(value).origin)
const globListSchema = z.array(z.string().trim().min(1).max(200)).max(50)
const nullableTextSchema = z.string().trim().min(1).max(500).nullable()

const sourceInputBaseSchema = z.object({
  exclude_globs: globListSchema,
  include_globs: globListSchema.min(1),
  kind: z.enum(SOURCE_KINDS),
  license_spdx: z.enum(ALLOWED_LICENSES),
  license_url: z.string().url(),
  name: z.string().trim().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
})
const githubRepositoryInputSchema = sourceInputBaseSchema.extend({
  branch: z.string().trim().min(1).max(255),
  fetch_type: z.literal("github_repository"),
  is_enabled: z.boolean(),
  public_url_strip_prefix: nullableTextSchema,
  public_url_template: z.string().url().refine((value) => value.includes("{path}")).nullable(),
  repository: githubRepositorySchema,
})
const websiteInputSchema = sourceInputBaseSchema.extend({
  content_selector: nullableTextSchema,
  exclude_selectors: z.array(z.string().trim().min(1).max(200)).max(20),
  fetch_type: z.literal("website"),
  sitemap_url: z.string().url().nullable(),
  site_url: httpsOriginSchema,
  start_url: z.string().url().nullable(),
})

/** 取得方法ごとの、フィールドをまたぐ検証 */
const validateSourceInput = (value: z.infer<typeof githubRepositoryInputSchema> | z.infer<typeof websiteInputSchema>, ctx: z.RefinementCtx) => {
  /** github: glob は "/" で始めない（リポジトリ内の相対パス）。website: glob は "/" で始める（URL のパス） */
  /** website: sitemap_url と start_url の少なくとも一方があり、どちらも site_url と同じオリジン */
}

export const createContentSourceRequestSchema = z
  .discriminatedUnion("fetch_type", [githubRepositoryInputSchema, websiteInputSchema])
  .superRefine(validateSourceInput)
export const updateContentSourceRequestSchema = z
  .discriminatedUnion("fetch_type", [githubRepositoryInputSchema, websiteInputSchema.extend({ is_enabled: z.boolean() })])
  .superRefine(validateSourceInput)
```

- 登録の website は `is_enabled` を受け取らない（Zod が捨てる）。必ず無効で作る
- 許可リスト外のライセンスは `z.enum(ALLOWED_LICENSES)` で 400 になる
- レスポンス：`contentSourceSchema` を `fetch_type` の discriminated union で定義する（共通：`id` / `exclude_globs` / `include_globs` / `is_enabled` / `kind` / `last_collected_at`（nullable）/ `license_spdx` / `license_url` / `name` / `tags` / `created_at` / `updated_at`。github：`branch` / `last_collected_commit_sha` / `public_url_strip_prefix` / `public_url_template` / `repository`。website：`content_selector` / `exclude_selectors` / `sitemap_url` / `site_url` / `start_url`）
- `passageCountsSchema`：`PASSAGE_STATUSES` の各状態をキーにした `z.number().int()` の object（`Object.fromEntries(PASSAGE_STATUSES.map(...))`。状態の値を書き写さない）
- `repository` は小文字にしてから扱う（`reactjs/react.dev` と `ReactJS/react.dev` を別のソースとして登録させない。検出ライセンス取得のクエリも同じ）

| スキーマ | 形 |
| --- | --- |
| `getContentSourceListResponseSchema` | `{ sources: { id, failed_page_count, fetch_type, is_enabled, kind, last_collected_at, license_spdx, name, passage_counts, repository: string \| null, site_url: string \| null }[] }` |
| `getContentSourcePathParamSchema` / `updateContentSourcePathParamSchema` | `{ id: z.coerce.number().int().positive() }` |
| `getContentSourceResponseSchema` | `{ failed_pages: { http_status, path }[], passage_counts, source: contentSourceSchema }` |
| `createContentSourceResponseSchema` / `updateContentSourceResponseSchema` | `contentSourceSchema` |
| `detectContentSourceLicenseQueryStringSchema` | `{ repository: githubRepositorySchema }` |
| `detectContentSourceLicenseResponseSchema` | `{ is_allowed: boolean, license_spdx: string \| null }`（`null` は GitHub が検出できなかった） |

### 2. Repository（`src/repository/content-source-repository.ts`）

```ts
type SourceInputBase = Pick<ContentSource, "excludeGlobs" | "includeGlobs" | "isEnabled" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "tags">

export type ContentSourceInput =
  | (SourceInputBase & Pick<GitHubRepositorySource, "branch" | "fetchType" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository">)
  | (SourceInputBase & Pick<WebsiteSource, "contentSelector" | "excludeSelectors" | "fetchType" | "sitemapUrl" | "siteUrl" | "startUrl">)

export type FailedPage = { httpStatus: number; path: string }
export type PassageCountRow = { count: number; sourceId: number; status: PassageStatus }
/** repository / site_url の unique 制約に違反したら duplicate（事前の重複検査と書き込みの間の競合） */
export type ContentSourceSaveResult = { kind: "duplicate" } | { kind: "saved"; source: ContentSource }
export type ContentSourceUpdateOptions = {
  /** last_collected_commit_sha を null に戻す */
  shouldResetCollectedCommit: boolean
  /** そのソースの source_documents の etag / last_modified / content_hash を null に戻す */
  shouldResetDocumentCache: boolean
}

export interface ContentSourceRepository {
  countFailedPagesBySource(): Promise<{ count: number; sourceId: number }[]>
  /** sourceId を省略すると全ソース分 */
  countPassagesBySource(sourceId?: number): Promise<PassageCountRow[]>
  create(input: ContentSourceInput): Promise<ContentSourceSaveResult>
  /** id の昇順 */
  findAll(): Promise<ContentSource[]>
  findById(id: number): Promise<ContentSource | null>
  findByRepository(repository: string): Promise<ContentSource | null>
  findBySiteUrl(siteUrl: string): Promise<ContentSource | null>
  /** path の昇順 */
  findFailedPages(sourceId: number): Promise<FailedPage[]>
  /** source_documents を 1 件でも持つか */
  hasSourceDocuments(sourceId: number): Promise<boolean>
  update(id: number, input: ContentSourceInput, options: ContentSourceUpdateOptions): Promise<ContentSourceSaveResult>
}
```

- **取得失敗のページ** は `source_documents.http_status >= 400`（[step6](./step6-cron-collect-website.md) が記録する）
- Drizzle の件数：`select({ count: count(), sourceId: sourceDocuments.sourceId, status: passages.status }).from(passages).innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id)).groupBy(sourceDocuments.sourceId, passages.status)`
- Prisma の件数：`groupBy` は関連先の列でまとめられないので `$queryRaw` で同じ SQL を書く（`count` は `bigint` で返るので `Number()`、`status` は `isPassageStatus` で検証）
- `_toDomain(row)`：`fetchType` で分岐し、取得方法ごとの必須列（`repository` / `branch` / `siteUrl`）が null なら throw（CHECK があるので通常は起きない）。Prisma 実装は `isSourceKind` / `isAllowedLicense` / `isSourceFetchType` でも検証し、jsonb は `z.array(z.string()).parse()` で配列に戻す
- `update` は `input.fetchType` の列だけを書き、`shouldResetCollectedCommit` なら `lastCollectedCommitSha: null` も書く。`shouldResetDocumentCache` なら同じトランザクションで `source_documents`（`source_id = id`）の `etag` / `last_modified` / `content_hash` を null にする。対象が無ければ throw（memo と同じ）
- `create` / `update` は unique 制約の違反を捕まえて `{ kind: "duplicate" }` を返す（Drizzle は `DrizzleQueryError` の `cause.code === "23505"`、Prisma は `code === "P2002"`。`@repo/db` は Prisma の値を出さないので形で判定する）。content_sources の unique 制約は主キーと `repository` / `site_url` だけなので、重複の登録とみなせる
- `src/repository/index.ts`・`drizzle/index.ts`・`prisma/index.ts` に足す

### 3. ライセンス検出の client（`src/client/github-license.ts`）

```ts
const githubLicenseResponseSchema = z.object({ license: z.object({ spdx_id: z.string().nullable() }).nullable() })

export interface IGitHubLicenseClient {
  /** 検出できなければ null（ライセンスファイルが無い・リポジトリが無い・NOASSERTION） */
  detectLicense(repository: string): Promise<string | null>
}

export class GitHubLicenseClient implements IGitHubLicenseClient {
  private _token: string | undefined

  constructor(token: string | undefined) {
    this._token = token
  }

  public async detectLicense(repository: string): Promise<string | null> {
    const [owner, name] = repository.split("/").map(encodeURIComponent)
    const response = await fetch(`https://api.github.com/repos/${owner}/${name}/license`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TechEnglishBot/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub license request failed: ${response.status}`)
    const spdxId = githubLicenseResponseSchema.parse(await response.json()).license?.spdx_id ?? null
    return spdxId === "NOASSERTION" ? null : spdxId
  }
}
```

`src/env.ts` に `GITHUB_LICENSE_TOKEN: z.string().optional()` を足す（未設定でも 60 req/h で動く）。

### 4. Service（`src/service/content-source-service.ts`、`service/index.ts` に `contentSource` として足す）

```ts
type ContentSourceRepo = { contentSourceRepository: ContentSourceRepository }
export type PassageCounts = Record<PassageStatus, number>

/** 状態ごとの件数。行が無い状態は 0 で埋める */
const buildPassageCounts = (rows: PassageCountRow[], sourceId: number): PassageCounts => { /* PASSAGE_STATUSES から 0 埋め → 加算 */ }

export const getContentSources = async (repo: ContentSourceRepo): Promise<Result<{ failedPageCount: number; passageCounts: PassageCounts; source: ContentSource }[]>>
export const getContentSourceById = async (id: number, repo: ContentSourceRepo): Promise<Result<{ failedPages: FailedPage[]; passageCounts: PassageCounts; source: ContentSource }>>

export const createContentSource = async (input: ContentSourceInput, repo: ContentSourceRepo): Promise<Result<ContentSource>> => {
  if (await findDuplicateSource(input, repo)) return err(conflictError("Content source already registered"))
  /** サイトは試し実行で本文を確かめてから有効にするため、無効で作る */
  const result = await repo.contentSourceRepository.create(input.fetchType === "website" ? { ...input, isEnabled: false } : input)
  /** 事前の検査の後に同じ取得元が登録された（同時のリクエスト）。unique 制約で弾かれたので 409 */
  if (result.kind === "duplicate") return err(conflictError("Content source already registered"))
  return ok(result.source)
}

export const updateContentSource = async (id: number, input: ContentSourceInput, repo: ContentSourceRepo): Promise<Result<ContentSource>> => {
  const existing = await repo.contentSourceRepository.findById(id)
  if (!existing) return err(notFoundError("Content source not found"))
  if (existing.fetchType !== input.fetchType) return err(badRequestError("fetch_type cannot be changed"))
  /** 過去の問題の出典は、ソースの今の取得元と passages の source_path / source_commit_sha で組み立てるため */
  if (hasOriginChanged(existing, input) && await repo.contentSourceRepository.hasSourceDocuments(id)) {
    return err(badRequestError("repository / site_url cannot be changed after documents are collected"))
  }
  const duplicate = await findDuplicateSource(input, repo)
  if (duplicate && duplicate.id !== id) return err(conflictError("Content source already registered"))
  const shouldResetCollectedCommit = existing.fetchType === "github_repository"
    && input.fetchType === "github_repository" && hasCollectionScopeChanged(existing, input)
  const shouldResetDocumentCache = existing.fetchType === "website"
    && input.fetchType === "website" && hasExtractionChanged(existing, input)
  const result = await repo.contentSourceRepository.update(id, input, { shouldResetCollectedCommit, shouldResetDocumentCache })
  if (result.kind === "duplicate") return err(conflictError("Content source already registered"))
  return ok(result.source)
}

export const detectRepositoryLicense = async (
  repository: string,
  deps: { githubLicenseClient: IGitHubLicenseClient },
): Promise<Result<{ isAllowed: boolean; licenseSpdx: string | null }>>
```

- `findDuplicateSource`：github は `findByRepository`、website は `findBySiteUrl`
- `hasCollectionScopeChanged`：`repository` / `branch` / `includeGlobs` / `excludeGlobs` のどれかが変わったら true。**取得範囲が変わったら `last_collected_commit_sha` を null に戻す**（戻さないと、最新コミットが前回と同じ間は新しい対象パスが収集されない。[GitHub API での取得と差分検出](../README.md#github-api-での取得と差分検出) の手順 1）
- `hasOriginChanged`：github は `repository`（大文字・小文字の違いは変更とみなさない。GitHub のリンクは 404 にならないため）、website は `site_url` が変わったら true。**文書を取得したソースでは取得元の変更を 400 にする**（過去の問題の出典が別のリポジトリ・サイトを指して 404 になるため。変えたいときは別のソースとして登録する）。ライセンス（`license_spdx` / `license_url`）の変更は許す（誤登録の訂正は過去の問題の出典にも反映されるのが正しい）
- `hasExtractionChanged`：`contentSelector` / `excludeSelectors` のどれかが変わったら true。**本文の抽出の設定が変わったら取得済みの文書の `etag` / `last_modified` / `content_hash` を消す**（消さないと、ページが変わらない間は 304 か同じハッシュで止まり、新しいセレクタで抽出し直されない）
- `isAllowed` は `isAllowedLicense(licenseSpdx)`

### 5. Controller / Router / DI

- Controller：`src/controller/admin/content-source/{list,detail,create,update,detect-license}.ts`（`AdminContentSourceListController` など）。書き方は `controller/memo/` と同じ（`parseRequest` → service → `sendError` / `parseResponse`）
- snake_case ⇔ camelCase の変換は create / update / detail で共通なので `controller/admin/content-source/content-source-mapper.ts` に `convertContentSourceRequestToInput` / `convertContentSourceToResponse` を置く（日時は `toISOString()`）
- 一覧の `repository` / `site_url` は取得方法でないほうを `null` にする

```ts
/** src/routes/admin-router.ts（question-generation step4 で作成済み）の AdminRouterControllers に足す */
contentSourceCreate?: AdminContentSourceCreateController
contentSourceDetail?: AdminContentSourceDetailController
contentSourceDetectLicense?: AdminContentSourceDetectLicenseController
contentSourceList?: AdminContentSourceListController
contentSourceUpdate?: AdminContentSourceUpdateController

/** GET /api/admin/content-source/license は /:id より先に登録する（"license" が :id に一致して 400 になるため） */
```

`src/index.ts`：`DrizzleContentSourceRepository(db)` と `GitHubLicenseClient(env.GITHUB_LICENSE_TOKEN)` を作り、各 Controller を `adminRouter({...})` に渡す。

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter api test
pnpm lint:fix
```

Service のユニットテスト（`test/service/content-source-service/*.test.ts`。Repository と `IGitHubLicenseClient` は `vi.fn()`）：

- 正常系
  - [ ] `getContentSources`：ソースごとに件数が集計され、行の無い状態は 0、取得失敗の件数が付く。ソース 0 件で空配列
  - [ ] `createContentSource`：website は `is_enabled: true` を渡しても `isEnabled: false` で `create` が呼ばれる。github は渡した値のまま
  - [ ] `updateContentSource`：`includeGlobs` / `branch` を変えると `shouldResetCollectedCommit: true`、`name` だけなら false、website は常に false。website の `contentSelector` / `excludeSelectors` を変えると `shouldResetDocumentCache: true`
  - [ ] 文書を取得したソースでもライセンスは変えられる。`repository` の大文字・小文字の違いだけなら取得元の変更とみなさない。文書が無ければ `repository` / `site_url` を変えられる
  - [ ] 同じ id のソースが `findByRepository` で返っても 409 にならない
  - [ ] `detectRepositoryLicense`：`MIT` は `isAllowed: true`、`GPL-3.0` は false、`null` はそのまま
- 異常系
  - [ ] `getContentSourceById` / `updateContentSource` が存在しない id で 404
  - [ ] `updateContentSource` で取得方法を変えると 400（`update` は呼ばれない）
  - [ ] `repository` / `site_url` の重複で 409（`create` / `update` は呼ばれない）
  - [ ] `create` / `update` が `duplicate` を返したら 409（事前の検査と書き込みの間の競合）
  - [ ] 文書を取得したソースの `repository` / `site_url` を変えると 400（`update` は呼ばれない）

Repository の契約テスト（`test/repository/content-source-repository.test.ts`。`describe.each` で Drizzle / Prisma）：

- [ ] github / website それぞれ `create` → `findById` / `findByRepository` / `findBySiteUrl` で同じ値が返る（`toEqual`）
- [ ] `update` が渡した列を書き、`shouldResetCollectedCommit` のときだけ `lastCollectedCommitSha` が null になる。`shouldResetDocumentCache` のときだけ、そのソースの `source_documents` の `etag` / `last_modified` / `content_hash` が null になる（他のソースの行は変わらない）。存在しない id で throw
- [ ] `create` / `update` が登録済みの `repository` / `site_url` で throw せず `{ kind: "duplicate" }` を返し、行は変わらない（`update` は `shouldResetDocumentCache` でも `source_documents` を変えない）
- [ ] `hasSourceDocuments` が `source_documents` の有無を返す
- [ ] `countPassagesBySource`（全件 / 1 ソース）と `countFailedPagesBySource`・`findFailedPages` が `testDb` で入れた `source_documents` / `passages` と一致する（`http_status` が 304 / 200 の行は数えない）

Controller のインテグレーションテスト（`test/controller/admin/content-source/*.test.ts`。実 DB、`IGitHubLicenseClient` だけ fake。`X-Admin-Token` は question-generation step4 のテストと同じ付け方）：

- 正常系
  - [ ] GET 一覧：200。`testDb` で入れた passages の状態別件数と取得失敗の件数が返る（`toEqual` + `expect.any`）
  - [ ] GET 詳細：github / website それぞれの形で 200、website は `failed_pages` が path 順
  - [ ] POST：github は 201 で DB に保存される。website は `is_enabled: true` を送っても DB は false
  - [ ] PUT：内容と `is_enabled` が更新される。`include_globs` を変えると DB の `last_collected_commit_sha` が null になる。website の `content_selector` を変えると `source_documents` の `etag` / `last_modified` / `content_hash` が null になる。文書を取得したソースでも `license_spdx` は変えられる
  - [ ] POST：`repository` を小文字にそろえて保存する
  - [ ] GET license：fake が `MIT` を返すと `{ is_allowed: true, license_spdx: "MIT" }`、null なら `license_spdx: null`
- 異常系
  - [ ] POST が 400：github で `repository` 無し、website で `sitemap_url` と `start_url` が両方 null、`license_spdx: "CC-BY-SA-4.0"`、`site_url` が http、`sitemap_url` が別オリジン、website の glob が "/" で始まらない
  - [ ] POST が 409：登録済みの `repository`（大文字・小文字だけが違うものも）
  - [ ] PUT が 400：文書を取得したソースの `repository` / `site_url` を変える（DB は変わらない）
  - [ ] PUT が 400（`fetch_type` を変える）/ 404、GET 詳細が 404、`:id` が数値でないと 400
  - [ ] GET license が 400：`repository=../etc`、`repository=owner`
