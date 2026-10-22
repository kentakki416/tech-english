# step3-admin-source

admin のソース一覧・登録・編集の画面を作る。デザインは確定済みのモック（`apps/admin/src/app/(dashboard)/mock/sources/**`）を見た目の正本として移植し、ダミーデータを [step2](./step2-api-admin-source.md) の API に置き換える。画面の仕様は [README の UI 設計](../README.md#ui-設計)。

## 前提

- [step2-api-admin-source](./step2-api-admin-source.md)
- [question-generation step4-api-admin-auth](../../question-generation/tasks/step4-api-admin-auth.md)：admin の `src/proxy.ts`（Basic 認証）と、`apiClient` が `X-Admin-Token` を付けて api を呼ぶ状態になっている

## 対応内容

### 1. 移植の対応表

| モック | 本番 | 変えること |
| --- | --- | --- |
| `mock/sources/page.tsx` | `app/(dashboard)/sources/page.tsx` | `MOCK_SOURCES` → `sourceApi.getList()`。`MockStatePanel` / `STATES` / `searchParams.state` を消す |
| `mock/sources/SourceTable.tsx` | `components/features/source/SourceTable.tsx` | 行の型を API のレスポンスから作る。リンク先を `/sources/...` に |
| `mock/sources/[id]/page.tsx` | `app/(dashboard)/sources/new/page.tsx` と `[id]/page.tsx` | 新規と編集をページで分ける |
| `mock/sources/[id]/SourceForm.tsx` | `components/features/source/SourceForm.tsx` | `<form action>` + Server Action に。入力に `name` を付ける |
| `mock/_components/ui.ts` | `src/libs/ui-classes.ts` | そのままコピー（モックは後で消すので本番から `mock/` を import しない）。question-generation step6 が先に作っていればそれを使う |
| ― | `features/source/source.api.ts` | API 呼び出し（新規） |
| ― | `features/source/source.form.ts` | FormData → リクエストの変換（新規） |
| ― | `app/(dashboard)/sources/actions.ts` | 登録・更新の Server Action（新規） |
| ― | `app/api/sources/license/route.ts` | ライセンス検出の Route Handler（新規） |

モックのファイルは消さない（全画面の本実装後に消す）。型は `@/libs/mock-data` ではなく `@repo/api-schema` から取る。

### 2. API 呼び出し層

```ts
/** apps/admin/src/features/source/source.api.ts */
import "server-only"

export const sourceApi = {
  create: async (input: CreateSourceRequest): Promise<CreateSourceResponse> => {
    const raw = await apiClient.post<unknown>("/api/admin/source", input)
    return createSourceResponseSchema.parse(raw)
  },
  detectLicense: async (repository: string): Promise<DetectSourceLicenseResponse> => {
    const raw = await apiClient.get<unknown>(`/api/admin/source/license?repository=${encodeURIComponent(repository)}`)
    return detectSourceLicenseResponseSchema.parse(raw)
  },
  getDetail: async (id: number): Promise<GetSourceResponse> => { /* GET /api/admin/source/:id */ },
  getList: async (): Promise<GetSourceListResponse> => { /* GET /api/admin/source */ },
  update: async (id: number, input: UpdateSourceRequest): Promise<UpdateSourceResponse> => { /* PUT */ },
}
```

404（編集画面）と 409（重複）と 400（更新時の取得元の変更）は、question-generation step4 が `src/libs/api-client.ts` に入れた `ApiClientError`（`status` / `body`）で見分ける。

### 3. ソース一覧（`/sources`）

```tsx
/** apps/admin/src/app/(dashboard)/sources/page.tsx */
export default async function SourcesPage() {
  const { sources } = await sourceApi.getList()
  const disabledWebsites = sources.filter((source) => source.fetch_type === "website" && !source.is_enabled)
  return (
    <>
      <PageBreadcrumb pageTitle="ソース" />
      <div className="space-y-6">
        {/** モックと同じ info の案内（無効のサイトがあるときだけ） */}
        <ComponentCard desc="英文の取得元。有効なソースだけを毎日の収集（collect:passages）が取り込みます。" title="ソース一覧">
          <div className="flex justify-end">
            <Link className={primaryButtonClass} href="/sources/new">ソースを登録</Link>
          </div>
          <SourceTable sources={sources} />
        </ComponentCard>
      </div>
    </>
  )
}
```

`SourceTable`（Client Component。モックの列・`FILTERS`・`search`・`emptyMessage` をそのまま使う）：

- 行は `GetSourceListResponse["sources"][number]` に表示用の値を足して作る：`origin = repository ?? site_url`、`fetchTypeLabel`（GitHub / サイト）、`statusLabel`（有効 / 無効）、`lastCollectedLabel`
- 本文候補の列は `passage_counts` の `collected` / `draft` / `published` / `rejected`、取得失敗の列は `failed_page_count`（website のみ。GitHub は「―」）
- `getRowKey={(row) => row.id}`、`search={{ filterKeys: ["name", "origin"], ... }}`

日時は `src/libs/format-date.ts` に `formatDateTime(iso: string): string` を置き、`Intl.DateTimeFormat` の `timeZone: "Asia/Tokyo"` で `2026-10-10 03:00` の形にする（Server Component は UTC で動くため、タイムゾーンを明示する）。`null` は「未収集」。

### 4. 登録・編集（`/sources/new`、`/sources/[id]`）

- `new/page.tsx`：`<PageBreadcrumb pageTitle="ソースの登録" />` + `<SourceForm detail={null} />`（初期の取得方法は GitHub）
- `[id]/page.tsx`：`id` が `/^\d+$/` でなければ `notFound()`。`getDetail` が `ApiClientError` の 404 なら `notFound()`。`<PageBreadcrumb pageTitle={`ソースの編集：${detail.source.name}`} />` + `<SourceForm detail={detail} />`

`SourceForm`（Client Component）はモックの見た目・切り替えの state（`fetchType` / `discovery` / `detectedLicense` / `isEnabled`）をそのまま使い、次を変える。

```tsx
export function SourceForm({ detail }: { detail: GetSourceResponse | null }) {
  const source = detail?.source ?? null
  const action = source ? updateSourceAction.bind(null, source.id) : createSourceAction
  const [state, formAction, isPending] = useActionState(action, {})
  /** ... モックの state ... */
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form action={formAction} className="space-y-6 xl:col-span-2">
        <input name="fetch_type" type="hidden" value={fetchType} />
        <input name="is_enabled" type="hidden" value={String(isEnabled)} />
        {/** ... モックのカード。各入力に name を付ける ... */}
      </form>
      {/** 右の補助カード */}
    </div>
  )
}
```

- 入力の `name`：`name` / `kind`（ラジオ。値は `docs` / `github`）/ `tags` / `repository` / `branch` / `include_globs` / `exclude_globs` / `public_url_template` / `public_url_strip_prefix` / `site_url` / `discovery`（`sitemap` / `start`）/ `discovery_url` / `content_selector` / `exclude_selectors` / `license_spdx` / `license_url`
- 初期値は `source` の snake_case の値から入れる（モックの `source.origin` は `repository` / `site_url` に、`sitemapUrl` は `sitemap_url` に読み替え）
- `state.errors?.[field]?.[0]` を各入力の下に `text-error-500` の hint で出す。`state.message` はフォームの上に error の囲み（テンプレートの `Alert` と同じ配色）
- 送信ボタンは `isPending` の間 `disabled`
- 編集時の取得方法のカード（変更不可）と、新規サイトの収集スイッチ（オフで操作不可）はモックのまま
- ライセンス欄の `select` は state で持ち、検出結果を初期値に入れられるようにする

**ライセンスを検出**（GET 相当なので Server Action ではなく Route Handler を使う）：

```ts
/** apps/admin/src/app/api/sources/license/route.ts */
export async function GET(request: NextRequest) {
  const parsed = detectSourceLicenseQueryStringSchema.safeParse({ repository: request.nextUrl.searchParams.get("repository") })
  if (!parsed.success) return NextResponse.json({ error: "Invalid repository" }, { status: 400 })
  return NextResponse.json(await sourceApi.detectLicense(parsed.data.repository))
}
```

- `SourceForm` は `fetch("/api/sources/license?repository=...")` の結果で `detectedLicense` を入れ、`is_allowed` かつライセンス欄が未選択ならその値を選択する
- 表示はモックの文言。`license_spdx` が null なら「ライセンスを検出できませんでした」、許可リスト外なら「許可リストにないため登録できません」を足す

**右の補助カード**：編集時の「収集の状況」は `detail.source.last_collected_at`（`formatDateTime`）、`last_collected_commit_sha`（先頭 7 文字）、`detail.passage_counts` のバッジ、`detail.failed_pages`（website のみ）。「試し実行」は `source.id` を埋めたコマンド。新規時の「登録の前に確認すること」はモックのまま。

### 5. Server Action

```ts
/** apps/admin/src/app/(dashboard)/sources/actions.ts */
"use server"

export type SourceFormState = { errors?: Record<string, string[] | undefined>; message?: string }

export const createSourceAction = async (_prev: SourceFormState, formData: FormData): Promise<SourceFormState> => {
  const parsed = createSourceRequestSchema.safeParse(convertFormDataToSourceRequest(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  let id: number
  try {
    id = (await sourceApi.create(parsed.data)).id
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) return { message: "同じリポジトリ・サイトがすでに登録されています。" }
    return { message: "登録に失敗しました。時間をおいて再度お試しください。" }
  }
  revalidatePath("/sources")
  /** 試し実行のコマンド（id 入り）を見せるため、登録後は編集画面へ */
  redirect(`/sources/${id}`)
}
```

- `updateSourceAction(id, prev, formData)` も同じ形で `updateSourceRequestSchema` を使い、成功したら `revalidatePath("/sources")` と `revalidatePath(`/sources/${id}`)` をして一覧へ `redirect`。404 は「このソースは見つかりませんでした。」、400 は「取得した文書があるソースは、リポジトリ・サイトの URL を変えられません。変えたいときは別のソースとして登録してください。」（フォームの値は action で検証済みなので、API の 400 は取得元の変更）
- `redirect` は try-catch の外に書く（`apps/web/src/app/memos/actions.ts` と同じ）

`convertFormDataToSourceRequest(formData: FormData): unknown`（`features/source/source.form.ts`。純関数）：

- textarea（対象パス・除外パス・除外する CSS セレクタ）は改行で分けて trim、空行を捨てる。技術タグはカンマで分ける
- 空文字の任意項目（`public_url_template` / `public_url_strip_prefix` / `content_selector`）は `null`
- `discovery` が `sitemap` なら `sitemap_url = discovery_url`・`start_url = null`、`start` なら逆
- `fetch_type` に応じて、もう一方の取得方法の項目は入れない。`is_enabled` は `"true"` との比較

### 6. サイドバー

`components/layout/AppSidebar.tsx` に「tech-english」のグループを足し、`{ name: "ソース", path: "/sources" }` を置く（question-generation step6 が「問題」を同じグループに足す）。モックのグループは残す。

## 動作確認

```bash
pnpm --filter admin build
pnpm lint:fix
```

api（`ADMIN_API_TOKEN` 設定済み）と admin を起動し、`verify-web-page` skill の手順で Playwright MCP を使って確かめる（port 3030。Basic 認証は question-generation step4 の手順）。見た目はモック（`/mock/sources`・`/new`・`/1`・`/7`・`/6`）と並べて比べる。

- [ ] `/sources`：登録したソースが並び、検索（ソース名・リポジトリ・URL）と Filter（取得方法・状態）が効く。0 件のときは「まだソースがありません」
- [ ] 無効のサイトがあるときだけ上部に info の案内が出る
- [ ] `/sources/new`：取得方法を切り替えると取得元のカードとライセンスの警告がその場で切り替わる。サイトでは収集スイッチがオフで操作できない
- [ ] GitHub の登録：「ライセンスを検出」で検出結果の文言が出てライセンス欄に入る。登録すると編集画面に遷移し、値が保存されている
- [ ] サイトの登録：登録後の状態が「無効」
- [ ] 入力エラー（表示名が空、サイトの URL が http、sitemap が別オリジン、対象パスが空）が各欄の下に出る。登録済みのリポジトリは重複の文言が出る
- [ ] `/sources/{id}`：取得方法のカードが変更不可、収集の状況（件数のバッジ・取得失敗のページ）と試し実行のコマンドが出る。スイッチで有効にして保存すると一覧が「有効」になる
- [ ] 文書を取得したソースのリポジトリ・サイトの URL を変えて保存すると、取得元を変えられない旨の文言が出る（ライセンスは変えて保存できる）
- [ ] `/sources/999999` と `/sources/abc` が 404
- [ ] `browser_console_messages` の error が 0 件
- [ ] 新規ページなので after のスクリーンショットだけを `docs/screenshots/sources/after.png` に撮る
