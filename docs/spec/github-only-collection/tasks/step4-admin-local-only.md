# step4-admin-local-only

admin の「URL から追加」とサイトの取得方法をローカルだけにし、ソースのフォームを step3 の規則に合わせる。

- サイドバーの「URL から追加」と `/url-import` は production では出さない（404）
- ソースの登録の取得方法の「サイト」はローカルだけ。サイトのときは収集のスイッチ・試し実行を出さず、ライセンスに「個人の学習用」を足す
- GitHub のときは「ライセンスの記載がある URL」にリポジトリのファイルの URL を入れるよう案内し、「ライセンスを検出」で初期値を入れる
- ソース一覧のサイトの状態を「収集しない」にし、「無効のサイトのソースがあります」の案内を消す

ページの見つけ方（sitemap / 開始ページ）と取得失敗の表示は、API の項目と一緒に step5 で消す。仕様は README の[サイトのソース（ローカルだけ）](../README.md#サイトのソースローカルだけ)・[個人の学習用のライセンス](../README.md#個人の学習用のライセンス)・[URL から追加（ローカルだけ）](../README.md#url-から追加ローカルだけ)・[ローカルの判定](../README.md#ローカルの判定)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/admin/src/libs/environment.ts` | 新規。`isLocalEnvironment` |
| `apps/admin/src/components/layout/nav-items.tsx` | 「URL から追加」をローカルだけにする |
| `apps/admin/src/app/(dashboard)/url-import/page.tsx` | production では `notFound()` |
| `apps/admin/src/app/(dashboard)/sources/new/page.tsx`・`[id]/page.tsx` | 個人の学習用のライセンスの値を渡す |
| `apps/admin/src/components/features/source/SourceForm.tsx` | 取得方法の選択肢・ライセンスの選択肢・`license_url` の初期値と案内・サイトの収集のスイッチと試し実行 |
| `apps/admin/src/features/source/source.form.ts` | `is_enabled` を GitHub だけにする |
| `apps/admin/src/components/features/source/SourceTable.tsx` | サイトの状態を「収集しない」にする |
| `apps/admin/src/app/(dashboard)/sources/page.tsx` | 「無効のサイトのソースがあります」の案内を消す |
| `apps/admin/CLAUDE.md` | サイドバーと接続済みの画面の表の `/url-import` に「ローカルだけ」 |
| `docs/spec/content-collection/README.md` | 「必要な画面」「UI 設計」のソース一覧（サイトの状態は「収集しない」・無効のサイトの案内を消す）と登録・編集（取得方法の「サイト」はローカルだけ・サイトの収集のスイッチと試し実行を消す・ライセンスに個人の学習用・GitHub の `license_url` の案内と検出の初期値・`LICENSE_NOTE` の文言） |
| `docs/spec/url-import/README.md` | 「必要な画面」の URL から追加はローカルだけ（メニューに出さない・production では 404） |

### ローカルの判定

```ts
export const isLocalEnvironment = process.env.NODE_ENV !== "production"
```

- JSDoc：ローカル（`next dev`）だけ true。デプロイした admin は `next build` / `next start` で `production` になる。Next.js が build のときに `process.env.NODE_ENV` を値に置き換えるので、client component からも読める（`server-only` の `env.ts` を通さない）。サイトのソースと URL から追加をローカルだけにするのに使う
- proxy・サインイン画面の既存の `process.env.NODE_ENV` の判定は、この PR では置き換えない

### サイドバー

```tsx
const urlImportNavItem: NavItem = { icon: <PlusIcon />, name: "URL から追加", path: "/url-import" }

export const mainNavSection: NavSection = {
  items: [
    { icon: <GridIcon />, name: "ダッシュボード", path: "/" },
    { icon: <DocsIcon />, name: "問題", path: "/passages" },
    ...(isLocalEnvironment ? [urlImportNavItem] : []),
    { icon: <FolderIcon />, name: "ソース", path: "/sources" },
    { icon: <ListIcon />, name: "タグ", path: "/tags" },
    { icon: <UserCircleIcon />, name: "ユーザー", path: "/users" },
  ],
  title: "メニュー",
}
```

### URL から追加の画面

```tsx
export default async function UrlImportPage() {
  if (!isLocalEnvironment) notFound()
```

- 今のページの関数名・中身に合わせて、先頭に `notFound()` を足す。Server Action（`actions.ts`）は画面が無いと呼ばれず、呼ばれても api が 404 を返すので変えない

### ソースの登録・編集のページ

```tsx
      <SourceForm
        allowedLicenses={allowedLicenseSchema.options}
        detail={detail}
        personalUseLicense={personalUseLicenseSchema.value}
        tags={tags}
      />
```

- 登録（`new/page.tsx`）は `detail={null}`

### SourceForm

props に `personalUseLicense` を足す。JSDoc の「allowedLicenses はライセンス欄の選択肢…」に「personalUseLicense はサイトのソースだけが選べる個人の学習用の値」を足す。

取得方法の選択肢：

```tsx
const FETCH_TYPE_OPTIONS: { description: string, key: FetchType, label: string }[] = [
  { description: "README・RFC・docs ディレクトリ、GitHub に Markdown のソースがある公式ドキュメント", key: "github_repository", label: "GitHub リポジトリ" },
  { description: "ローカルだけ。URL から追加でページを取り込むためのサイト（収集はしない）", key: "website", label: "サイト（URL から追加）" },
]
```

```tsx
              {FETCH_TYPE_OPTIONS.filter((option) => isLocalEnvironment || option.key !== "website").map((option) => (
```

- 取得方法の切り替えの `setIsEnabled(option.key === "github_repository")` は消す（サイトは収集のスイッチを出さない）。サイトから GitHub に切り替えたとき、ライセンス欄が個人の学習用なら空に戻す

```tsx
                  onClick={() => {
                    setFetchType(option.key)
                    if (option.key === "github_repository" && licenseSpdx === personalUseLicense) setLicenseSpdx("")
                  }}
```

ライセンスの選択肢：

```tsx
  const licenseOptions = isWebsite ? [...allowedLicenses, personalUseLicense] : allowedLicenses
```

```tsx
                {licenseOptions.map((license) => (
                  <option key={license} value={license}>
                    {license === personalUseLicense ? "個人の学習用（ライセンスなし）" : license}
                  </option>
                ))}
```

「ライセンスの記載がある URL」を state で持ち、検出で空のときだけ初期値を入れる。

```tsx
  const [licenseUrl, setLicenseUrl] = useState<string>(source?.license_url ?? "")
```

```tsx
      const detectedLicenseUrl = result.license_url
      if (detectedLicenseUrl !== null) {
        setLicenseUrl((current) => (current === "" ? detectedLicenseUrl : current))
      }
```

```tsx
            <Field
              error={getFieldError("license_url")}
              hint={isWebsite
                ? "サイトのライセンス、または著作権・利用規約のページ。出典表示に出します。"
                : "リポジトリの中のライセンスのファイルの URL（https://github.com/{owner}/{repo}/blob/…）。出典表示に出します。"}
              htmlFor="license-url"
              label="ライセンスの記載がある URL"
            >
              <input className={`${inputClass} font-mono`} id="license-url" name="license_url" onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://..." value={licenseUrl} />
            </Field>
```

- `defaultValue` を `value` と `onChange` に変える（ライセンス欄と同じく state で持つ。送信は `onSubmit` からなので、入力エラーでも値は消えない）

案内の文言：

| 場所 | 文言 |
| --- | --- |
| `LICENSE_NOTE` | 「コードとドキュメントでライセンスが分かれているリポジトリでは、GitHub の検出はコードのライセンスのことがあります。ドキュメントの文章に掛かっているライセンスと、それが書かれたリポジトリの中のファイルを選んでください。」 |
| ライセンスの見出しの説明（`Section` の `desc`） | GitHub：「リポジトリの中にライセンスの記載があり、それが文章に掛かっているリポジトリだけを登録できます。許可リストにあるライセンスだけを選べます。」、サイト：「ライセンスの記載が無いサイトは「個人の学習用」を選びます（ローカルでだけ使えます）。」 |
| サイトの警告（`isWebsite` の囲み） | 見出し「サイトのソースはローカルでだけ使います」、本文「収集はせず、URL から追加で取り込むページのソースになります。ライセンスの記載があればそのライセンスを、無ければ「個人の学習用」を選んでください。」 |
| 登録の前に確認すること（右のカード） | GitHub：「リポジトリの中にライセンスの記載がある」「そのライセンスがドキュメントの文章に掛かっている（コードだけのライセンスではない）」「ライセンスが許可リストにある」「GitHub に Markdown のソースがあるドキュメントは、こちらで登録する」。サイト：「ローカルでだけ使う（自分で読むためのページ）」「robots.txt で対象パスが許可されている」「本文が JavaScript で描画されていない（取得した HTML に本文がある）」 |

- `LicenseDetectionMessage` に、検出した `license_url` を出す（「ライセンスのファイル：`LICENSE-DOCS.md`」のように、URL の最後のパスを等幅で）。`license_spdx` が null でも `license_url` があれば出す（`rust-lang/book` のようにファイルが 2 つある場合）

収集のスイッチと試し実行：

- 「収集」の `Section`（スイッチ）は GitHub のときだけ出す。サイトのときの「サイトのソースは無効の状態で登録されます…」の説明は消す
- hidden の `is_enabled` も GitHub のときだけ置く
- 右の「試し実行」のカードは GitHub のときだけ出す（サイトは `--dry-run` が throw するため）。説明の「サイトの CSS セレクタを調整するときに使います」は消す

`source.form.ts`：`is_enabled` を `common` から GitHub の分岐に移す。

```ts
  if (fetchType === "github_repository") {
    return {
      ...common,
      branch: getText(formData, "branch"),
      is_enabled: getText(formData, "is_enabled") === "true",
      public_url_strip_prefix: getNullableText(formData, "public_url_strip_prefix"),
      public_url_template: getNullableText(formData, "public_url_template"),
      repository: getText(formData, "repository").trim(),
    }
  }
```

### ソース一覧

- 状態の列は、サイトのソースなら `Badge color="light"` で「収集しない」（有効・無効を出さない）。Filter が見る状態のラベル（`statusLabel`）も「収集しない」にし、Filter の選択肢に「収集しない」を足す（「無効」で絞り込んだときにサイトのソースが混ざらないように）
- ソースが 0 件のときの文言は「GitHub のリポジトリを登録すると、翌日の収集から本文候補が作られます」にする（サイトは収集しない）
- `sources/page.tsx` の「無効のサイトのソースがあります」の案内を消す（サイトのソースは常に無効なので、ローカルでは常に出てしまう）
- 「取得失敗」の列は step5 で消す

### 編集の補助のカード

- サイトのソースの「収集の状況」の「最終収集」は出さない（収集しないので常に「未収集」になる）。本文候補の件数は出す

### mock

`/mock/sources` のモックは、step5 でクロールの項目と一緒に直す。

## 動作確認

```bash
pnpm --filter admin exec tsc --noEmit
pnpm --filter admin build
pnpm lint:fix
```

`verify-web-page` skill で、ローカル（3030）の画面を確かめる。before のスクショは main で撮っておく（ソース一覧・GitHub の登録・サイトの登録）。

- [ ] `/sources/new`：取得方法に「GitHub リポジトリ」と「サイト（URL から追加）」が出る。サイトを選ぶと、収集のスイッチと試し実行が消え、ライセンスに「個人の学習用（ライセンスなし）」が出る
- [ ] `/sources/new`（GitHub）：`reactjs/react.dev` で「ライセンスを検出」を押すと、ライセンスに `CC-BY-4.0`、URL に `https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md` が入る。URL を `https://creativecommons.org/licenses/by/4.0/` にして登録すると、URL の欄にエラーが出て入力が残る
- [ ] `/sources/new`（サイト）：ライセンスを「個人の学習用」にして登録でき、一覧の状態が「収集しない」
- [ ] `/sources/66`（GitHub）の保存が今までどおりできる。`/sources/68`（サイト）は保存しても無効のまま
- [ ] `/url-import` でサイトのソースのページを確認・保存できる（今までどおり）
- [ ] console の error が 0 件
- [ ] production の build（`pnpm --filter admin build && pnpm --filter admin start`）で、サイドバーに「URL から追加」が無く、`/url-import` が 404、`/sources/new` の取得方法に「サイト」が無い。port 3030 を使うので、先に dev の admin を止める（api はローカルのままでよい。確かめたら dev に戻す）
