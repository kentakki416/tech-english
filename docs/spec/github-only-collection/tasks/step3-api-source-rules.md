# step3-api-source-rules

api のソースの登録・更新に、この spec の規則を入れる。

- GitHub のソースの `license_url` は、そのリポジトリのファイルの URL でなければ 400
- サイトのソースは production では 400。ローカルでは常に無効で作り・保存する
- サイトのソースのライセンスに `LicenseRef-personal-use` を許す（GitHub は許可リストだけ）
- 検出の API が、GitHub が見つけたライセンスのファイルの URL（`license_url`）も返す
- URL から追加の API を production では登録しない（404）

仕様と理由は README の[対象にできるリポジトリ](../README.md#対象にできるリポジトリ)・[ローカルの判定](../README.md#ローカルの判定)・[ライセンスの記載がある URL の検証](../README.md#ライセンスの記載がある-url-の検証)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/schema/src/api-schema/admin/source.ts` | ライセンスのスキーマ、`license_url` の検証、サイトの更新の `is_enabled`、検出のレスポンスの `license_url` |
| `apps/api/src/client/github-license.ts` | `html_url` も返す |
| `apps/api/src/service/source-service.ts` | サイトのソースを受け付けるかの判定、サイトは常に無効、検出の `licenseUrl` |
| `apps/api/src/controller/admin/source/create.ts`・`update.ts` | 判定の値をコンストラクタで受け取って service に渡す |
| `apps/api/src/controller/admin/source/source-mapper.ts` | サイトの `isEnabled` を常に false にする |
| `apps/api/src/controller/admin/source/detect-license.ts` | レスポンスの `license_url` |
| `apps/api/src/index.ts` | 判定の値の DI、URL から追加の Controller を production では作らない |
| `apps/api/test/**` | 下の「テスト」 |
| ドキュメント | 下の「ドキュメント」 |

### api-schema

ライセンスのスキーマを足す。

```ts
export const sourceLicenseSchema = z.enum(SOURCE_LICENSES)

export const personalUseLicenseSchema = z.literal(PERSONAL_USE_LICENSE)
```

- `sourceLicenseSchema` の JSDoc：ソースに入れられるライセンス（許可リストと個人の学習用）。個人の学習用はサイトのソースだけ
- `personalUseLicenseSchema` の JSDoc：個人の学習用のライセンスの値。admin が選択肢を組み立てるのに使う（admin は `@repo/domain` を import できない）

`sourceInputBaseSchema` から `license_spdx` を外し、取得方法ごとに持たせる。サイトの更新は `is_enabled` を受け取らない（登録と同じスキーマにする）。

```ts
const githubRepositoryInputSchema = sourceInputBaseSchema.extend({
  branch: z.string().trim().min(1).max(255),
  fetch_type: z.literal("github_repository"),
  is_enabled: z.boolean(),
  license_spdx: allowedLicenseSchema,
  public_url_strip_prefix: nullableTextSchema,
  public_url_template: webUrlSchema
    .refine((value) => value.includes("{path}"), { message: "Must include {path}" })
    .nullable(),
  repository: githubRepositorySchema,
})

const websiteInputSchema = sourceInputBaseSchema.extend({
  content_selector: nullableTextSchema,
  exclude_selectors: z.array(z.string().trim().min(1).max(200)).max(20),
  fetch_type: z.literal("website"),
  license_spdx: sourceLicenseSchema,
  sitemap_url: z.string().url().nullable(),
  site_url: httpsOriginSchema,
  start_url: z.string().url().nullable(),
})
```

```ts
export const updateSourceRequestSchema = z
  .discriminatedUnion("fetch_type", [githubRepositoryInputSchema, websiteInputSchema])
  .superRefine(validateSourceInput)
```

- `sitemap_url`・`start_url` は step5 で消すので、ここでは残す
- `websiteInputSchema` の JSDoc の「登録時は is_enabled を受け取らない」は「is_enabled は受け取らない（収集しないので常に無効）」にする。`createSourceRequestSchema`・`updateSourceRequestSchema` の JSDoc も同じく直す
- `sourceInputBaseSchema` の `license_spdx` にあった JSDoc（許可リスト外は 400）は、GitHub の `license_spdx` に移す

`validateSourceInput` に、GitHub の `license_url` の検証を足す。

```ts
const isRepositoryFileUrl = (url: string, repository: string): boolean => {
  const parsed = tryParseUrl(url)
  if (parsed === null || parsed.protocol !== "https:" || parsed.hostname !== "github.com") return false
  const [owner, name, kind, ref, ...path] = parsed.pathname.split("/").slice(1)
  return `${owner}/${name}`.toLowerCase() === repository
    && kind === "blob"
    && ref !== undefined && ref !== ""
    && path.some((segment) => segment !== "")
}
```

```ts
  if (value.fetch_type === "github_repository") {
    if (!isRepositoryFileUrl(value.license_url, value.repository)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be a file URL in the repository (https://github.com/{owner}/{repo}/blob/...)",
        path: ["license_url"],
      })
    }
    return
  }
```

- glob の検証の後、`if (value.fetch_type !== "website") return` の位置に置き換える
- `isRepositoryFileUrl` の JSDoc：リポジトリの中のファイルの URL か。owner・name は GitHub が大文字・小文字を区別しないので小文字で比べる（`repository` はスキーマで小文字にそろえてある）。ブランチ・タグ・コミットは問わない
- ブランチ名に `/` があっても、`ref` の後ろにパスが残るので通る（どこまでがブランチかは見ない）

レスポンス：

- `sourceBaseSchema` の `license_spdx` を外し、`sourceSchema` の GitHub に `allowedLicenseSchema`、サイトに `sourceLicenseSchema` を持たせる
- ソース一覧の `license_spdx` は `sourceLicenseSchema` にする
- 検出のレスポンスに `license_url` を足す

```ts
export const detectSourceLicenseResponseSchema = z.object({
  is_allowed: z.boolean(),
  license_spdx: z.string().nullable(),
  license_url: z.string().nullable(),
})
```

- JSDoc：`license_spdx` が null なのは GitHub がライセンスを判定できなかったとき（ファイルはあっても種類が分からない・複数ある）。`license_url` が null なのはライセンスのファイルが無いとき

### GitHub のライセンスのクライアント

```ts
export type DetectedLicense = {
  licenseSpdx: string | null
  licenseUrl: string
}

export interface IGitHubLicenseClient {
  detectLicense(repository: string): Promise<DetectedLicense | null>
}
```

```ts
const githubLicenseResponseSchema = z.object({
  html_url: z.string(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
})
```

```ts
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub license request failed: ${response.status}`)

    const body = githubLicenseResponseSchema.parse(await response.json())
    const spdxId = body.license?.spdx_id ?? null
    return { licenseSpdx: spdxId === NO_ASSERTION_SPDX_ID ? null : spdxId, licenseUrl: body.html_url }
```

- `DetectedLicense` の JSDoc：`licenseSpdx` は GitHub が判定したライセンス（判定できなければ null。`NOASSERTION`）、`licenseUrl` は GitHub が見つけたライセンスのファイルの URL（`https://github.com/{owner}/{repo}/blob/{default branch}/{path}`）
- `detectLicense` の JSDoc：ライセンスのファイルが無い・リポジトリが無い（非公開を含む）なら null。通信障害や rate limit は throw

### service

サイトのソースを受け付けるかを、登録・更新の引数で受け取る。

```ts
export type SourceWritePolicy = {
  isWebsiteSourceAllowed: boolean
}

const WEBSITE_SOURCE_UNAVAILABLE_MESSAGE = "website sources are only available locally"

const disableWebsiteSource = (input: SourceInput): SourceInput =>
  input.fetchType === "website" ? { ...input, isEnabled: false } : input
```

```ts
export const createSource = async (
  input: SourceInput,
  repo: SourceWriteRepo,
  policy: SourceWritePolicy,
): Promise<Result<SourceWithTags>> => {
  if (input.fetchType === "website" && !policy.isWebsiteSourceAllowed) {
    logger.debug("SourceService: Website source is not available", { fetchType: input.fetchType })
    return err(badRequestError(WEBSITE_SOURCE_UNAVAILABLE_MESSAGE))
  }
```

```ts
  const result = await repo.sourceRepository.create(disableWebsiteSource(input))
```

```ts
export const updateSource = async (
  id: number,
  input: SourceInput,
  repo: SourceWriteRepo,
  policy: SourceWritePolicy,
): Promise<Result<SourceWithTags>> => {
  if (input.fetchType === "website" && !policy.isWebsiteSourceAllowed) {
    logger.debug("SourceService: Website source is not available", { id })
    return err(badRequestError(WEBSITE_SOURCE_UNAVAILABLE_MESSAGE))
  }
```

```ts
  const result = await repo.sourceRepository.update(id, disableWebsiteSource(input), { shouldResetCollectedCommit, shouldResetDocumentCache })
```

- 判定は、DB を読む前の入力の検査として先頭に置く（存在しない id の 404 より先）
- `SourceWritePolicy` の JSDoc：サイトのソースはローカル（`NODE_ENV !== "production"`）でだけ受け付ける。env を service で読まず、index.ts が値を渡す（テストで切り替えるため）
- `createSource` の「サイトは試し実行で本文を確かめてから有効にするため、無効で作る」は消す（理由は `disableWebsiteSource` の JSDoc に「サイトのソースは収集しないので常に無効（DB の `sources_website_disabled_check` も同じ）」と 1 か所だけ書く）
- 判定の値は Repository ではないので `repo` には入れず、引数を分ける

検出：

```ts
export const detectRepositoryLicense = async (
  repository: string,
  deps: { githubLicenseClient: IGitHubLicenseClient },
): Promise<Result<{ isAllowed: boolean; licenseSpdx: string | null; licenseUrl: string | null }>> => {
  const detected = await deps.githubLicenseClient.detectLicense(repository)
  const licenseSpdx = detected?.licenseSpdx ?? null
  return ok({
    isAllowed: licenseSpdx !== null && isAllowedLicense(licenseSpdx),
    licenseSpdx,
    licenseUrl: detected?.licenseUrl ?? null,
  })
}
```

### controller と mapper

```ts
export class AdminSourceCreateController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _tagRepository: TagRepository,
    private _policy: SourceWritePolicy,
  ) {}

  public async execute(req: Request, res: Response) {
    const data = parseRequest(createSourceRequestSchema, req.body)

    const result = await service.source.createSource(
      convertSourceRequestToInput(data),
      { sourceRepository: this._sourceRepository, tagRepository: this._tagRepository },
      this._policy,
    )
```

- `AdminSourceUpdateController` も同じ形にする
- `SourceWritePolicy` は `service/source-service.ts` から型で import する
- Controller の JSDoc の「website は無効の状態で作る」は「website はローカルでだけ受け付ける」にする

mapper のサイトの `isEnabled`：

```ts
    isEnabled: false,
```

- 「登録の website は is_enabled を受け取らない」の JSDoc は消す（リクエストに `is_enabled` が無いため。理由は service の `disableWebsiteSource`）

検出の controller：

```ts
    const response = parseResponse(detectSourceLicenseResponseSchema, {
      is_allowed: result.value.isAllowed,
      license_spdx: result.value.licenseSpdx,
      license_url: result.value.licenseUrl,
    })
```

### index.ts

```ts
const isLocalEnvironment = env.NODE_ENV !== "production"

const sourceWritePolicy = { isWebsiteSourceAllowed: isLocalEnvironment }
```

```ts
const adminSourceCreateController = new AdminSourceCreateController(sourceRepository, tagRepository, sourceWritePolicy)
const adminSourceUpdateController = new AdminSourceUpdateController(sourceRepository, tagRepository, sourceWritePolicy)
```

URL から追加の Controller は、ローカルでだけ作る。router は渡された Controller のルートだけを登録するので、production では `/api/admin/url-import` と `/api/admin/url-import/preview` が 404 になる（dev ログインと同じ形）。

```ts
const adminUrlImportCreateController = isLocalEnvironment
  ? new AdminUrlImportCreateController(
    sourceRepository,
    urlImportRepository,
    urlImportPageCacheRepository,
    transactionRunner,
    pageFetcher,
  )
  : undefined
const adminUrlImportPreviewController = isLocalEnvironment
  ? new AdminUrlImportPreviewController(
    sourceRepository,
    urlImportRepository,
    urlImportPageCacheRepository,
    pageFetcher,
  )
  : undefined
```

- `isLocalEnvironment` の JSDoc：dev / min / prd はどれも `NODE_ENV=production` で動くので、ローカルだけが true（サイトのソースと URL から追加はローカルだけ）
- 既にある `process.env.NODE_ENV !== "production"` の判定（dev ログイン・`/media`）は、この PR では置き換えない

### テスト

| ファイル | 内容 |
| --- | --- |
| `test/schema/admin-source-schema.test.ts` | `license_url` の検証、ライセンスの取得方法ごとの違い、サイトの更新の `is_enabled` |
| `test/client/github-license.test.ts` | `licenseUrl` を返す・`NOASSERTION` でも `licenseUrl` を返す・404 は null |
| `test/service/source-service/createSource.test.ts`・`updateSource.test.ts` | `isWebsiteSourceAllowed: false` のサイトは 400 で Repository を呼ばない、サイトは `isEnabled: false` で Repository に渡す |
| `test/service/source-service/detectRepositoryLicense.test.ts` | `licenseUrl` |
| `test/controller/admin/source/create.test.ts`・`update.test.ts` | production の設定（`isWebsiteSourceAllowed: false`）でサイトは 400、`license_url` がリポジトリの外なら 400（`details` の `path` が `["license_url"]`）、サイトの `LicenseRef-personal-use` は 201 / 200 で GitHub は 400 |
| `test/controller/admin/source/detect-license.test.ts` | `license_url` |
| `test/controller/admin/source/fixtures.ts` ほか | GitHub のソースの `license_url` をリポジトリのファイルの URL にする（テストが教える） |

`admin-source-schema.test.ts` に足すテスト：

```ts
describe("createSourceRequestSchema の license_url", () => {
  describe("正常系", () => {
    it.each([
      "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      "https://github.com/ReactJS/React.dev/blob/main/LICENSE-DOCS.md",
      "https://github.com/reactjs/react.dev/blob/v19.0.0/README.md",
      "https://github.com/reactjs/react.dev/blob/feature/docs/LICENSE",
    ])("%s はリポジトリのファイルの URL なので通る", (licenseUrl) => {
      expect(createSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_url: licenseUrl }).success).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each([
      "https://creativecommons.org/licenses/by/4.0/",
      "https://github.com/facebook/react/blob/main/LICENSE",
      "https://github.com/reactjs/react.dev",
      "https://github.com/reactjs/react.dev/tree/main/src",
      "https://github.com/reactjs/react.dev/blob/main/",
      "http://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      "https://raw.githubusercontent.com/reactjs/react.dev/main/LICENSE-DOCS.md",
    ])("%s はリポジトリのファイルの URL ではないので license_url のエラーになる", (licenseUrl) => {
      const result = createSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_url: licenseUrl })

      expect(result.success).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(["license_url"])
    })
  })
})

describe("createSourceRequestSchema の license_spdx", () => {
  describe("正常系", () => {
    it("サイトのソースは LicenseRef-personal-use を選べる", () => {
      expect(createSourceRequestSchema.safeParse({ ...WEBSITE_REQUEST, license_spdx: "LicenseRef-personal-use" }).success).toBe(true)
    })
  })

  describe("異常系", () => {
    it("GitHub のソースは LicenseRef-personal-use を選べない", () => {
      expect(createSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_spdx: "LicenseRef-personal-use" }).success).toBe(false)
    })
  })
})
```

- `WEBSITE_REQUEST` が無ければ、`GITHUB_REQUEST` と同じく今のテストのサイトのリクエストを定数にする
- `updateSourceRequestSchema` のテストに「サイトの `is_enabled` は捨てる（結果に `is_enabled` が無い）」を足す

### ドキュメント

| ファイル | 直すところ |
| --- | --- |
| `apps/api/CLAUDE.md` | 「Admin API 設計方針」の URL から追加とソースの登録（サイトはローカルだけ・GitHub の `license_url`）、「サイトのページの取得（@repo/content-extractor）」に URL から追加はローカルだけ |
| `docs/spec/content-collection/README.md` | 「使える英文の条件」（ライセンスがリポジトリの中にあり文章に掛かっていること）、「ソースの登録」（取得方法の `website` はローカルだけ・個人の学習用・`license_url` の条件・有効 / 無効はサイトでは常に無効）、「ソース登録時の確認」（GitHub の検出は `license_url` も初期値に入れる・サイトはローカルだけ）、「必要な API」の登録・更新・検出の行、許可リストの表の下の注記（「react.dev はコードが MIT、ドキュメントが CC-BY-4.0」は今のリポジトリと違う〈`LICENSE-DOCS.md` だけで、GitHub の検出も CC-BY-4.0〉ので、例を外して「コードとドキュメントでライセンスが分かれているリポジトリでは、ドキュメントに掛かっているライセンスと、それが書かれたリポジトリの中のファイルを登録する」にする） |
| `docs/spec/url-import/README.md` | 冒頭・「受け付ける URL」（ローカルだけ。サイトのソースはローカルにしかない。個人の学習用のサイトも取り込める）、「必要な API」（production では 404）、「必要な画面」（ローカルだけ） |

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api test      # vitest を直接叩かない（dev DB が消える）
pnpm --filter api exec tsc --noEmit
pnpm --filter admin exec tsc --noEmit   # api-schema の型の変更が admin でも通るか（admin の画面の変更は step4）
pnpm lint:fix
```

- [ ] 上のコマンドがすべて通る
- [ ] `index.ts` の `isLocalEnvironment` の分岐はテストでは通らない（テストは `NODE_ENV=test`）。dev ログインと同じ形（Controller を `undefined` にすると router がルートを登録しない）になっていることを差分で確かめる
- [ ] 画面からの確認（GitHub の `license_url` のエラー・検出の初期値・サイトの個人の学習用・URL から追加）は step4 で行う
