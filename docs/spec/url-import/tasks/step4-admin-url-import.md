# step4-admin-url-import

admin に「URL から追加」の画面を足す。仕様は [README](../README.md#確認と保存)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/admin/src/features/url-import/url-import.api.ts` | api の呼び出し（`import "server-only"`） |
| `apps/admin/src/app/(dashboard)/url-import/actions.ts` | Server Action（確認・保存） |
| `apps/admin/src/app/(dashboard)/url-import/page.tsx` | 画面 |
| `apps/admin/src/components/features/url-import/UrlImportForm.tsx` | URL の入力・確認の結果・保存の結果（client component） |
| `apps/admin/src/components/layout/nav-items.tsx` | メニューに「URL から追加」 |
| `docs/spec/url-import/README.md` | 「必要な画面」に画面の要素を足す |

### api の呼び出し（`url-import.api.ts`）

`content-source.api.ts` と同じ形で、`previewUrlImportResponseSchema`・`createUrlImportResponseSchema` で応答を検証する。

```ts
export const urlImportApi = {
  create: async (request: CreateUrlImportRequest): Promise<CreateUrlImportResponse> => ...,
  preview: async (request: PreviewUrlImportRequest): Promise<PreviewUrlImportResponse> => ...,
}
```

### Server Action（`actions.ts`）

```ts
export type UrlImportState =
  | { status: "idle" }
  | { message: string; status: "error"; url: string }
  | { preview: PreviewUrlImportResponse; status: "previewed"; url: string }
  | { result: CreateUrlImportResponse; status: "imported"; url: string }

export const previewUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => ...
export const createUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => ...
```

- `url` は `previewUrlImportRequestSchema` で検証し、不正なら「URL を確かめてください（https のページの URL）」
- api の 400 は `errorResponseSchema` で読み、`details[0].code` を `urlImportErrorCodeSchema` で読んで文言にする（下の表）。それ以外の失敗は「取り込みに失敗しました。時間をおいてもう一度お試しください。」
- 保存できたら `revalidatePath("/passages")`

| code | 文言 |
| --- | --- |
| `source_not_found` | このサイトのソースが登録されていません。先にソースを登録してください。（ソースの登録へのリンク） |
| `out_of_target_path` | ソースの対象パスに合わないページです。ソースの対象パス・除外パスを確かめてください。 |
| `robots_disallowed` | robots.txt で取得が禁止されているページです。 |
| `robots_unavailable` | robots.txt を読めませんでした。時間をおいてもう一度お試しください。 |
| `crawl_delay_too_long` | サイトの robots.txt の Crawl-delay が長いため、この画面からは取得できません。 |
| `throttled` | サイトが混雑しています（429 / 503）。時間をおいてもう一度お試しください。 |
| `http_error` | ページが HTTP {status} を返しました。 |
| `network_error` | ページを取得できませんでした（タイムアウト・接続エラー）。 |
| `not_html` | HTML のページではありません。 |
| `too_large` | ページが大きすぎます（2MB 超）。 |
| `redirect_not_allowed`・`blocked_url` | サイトの外を指す URL・リダイレクトは取得できません。 |
| `too_many_redirects` | リダイレクトが多すぎます。 |
| `redirected_out_of_target` | リダイレクトの行き先が、ソースの対象パスの外です。 |
| `extraction_failed` | 本文を抽出できませんでした。ソースの本文の CSS セレクタを確かめてください。 |

### 画面（`UrlImportForm.tsx`）

`useActionState` で 2 つのアクションを持つ。カードは `cardClass`、ボタンは `primaryButtonClass`・`outlineButtonClass`、状態は `Badge` を使う（ソースの画面と同じ）。

- 入力：URL（`inputClass`）と「確認する」。確認中はボタンを無効にして「確認しています…」
- 確認の結果：
  - ソース（表示名・ライセンス）、ページ（タイトル・URL・英単語数）
  - 塊の表：見出し、英単語数、保存したときにどうなるか（`new` は「本文候補になる」 success、`existing` は「本文候補がすでにある」 light、`generated_section` は「同じ見出しの問題がある」 warning、`not_candidate` は「本文候補にならない」 light と理由）、冒頭の文
  - 「本文候補として保存」（`new` か `existing` の塊が 1 つも無ければ無効）。押すと URL を hidden で送る
- 保存の結果：作った件数・却下した件数、優先した本文候補の一覧（`/passages/{id}` へのリンク、新しく作ったものに「新規」のバッジ）、「次の問題の生成で、ほかの本文候補より先に生成します。」の案内
- 理由の文言（`not_candidate`）：`too_short` は「短すぎる」、`too_long` は「長すぎる」、`too_much_code` は「コードが多い」、`not_english` は「英語でない」、`not_prose` は「文章でない」

### メニュー

`nav-items.tsx` の「問題」の次に `{ icon: <PlusIcon />, name: "URL から追加", path: "/url-import" }`。

## 動作確認

dev にサイトのソースが無いので、admin で登録する（無効のまま。cron の収集の対象にしない）。

| 項目 | 値 |
| --- | --- |
| 表示名 | Go 公式ドキュメント |
| 取得方法 | 公式ドキュメントのサイト |
| サイトの URL | `https://go.dev` |
| 対象パス | `/doc/**` |
| ライセンス | `CC-BY-4.0`（ライセンスの記載がある URL は `https://go.dev/copyright`） |

1. `/url-import` で `https://go.dev/doc/tutorial/getting-started` を確認し、ソースと塊の表が出ること。console のエラー 0 件
2. 保存して、作った件数と本文候補へのリンクが出ること。もう一度保存すると、作った件数が 0 で「本文候補がすでにある」になること
3. `https://example.com/` は「ソースが登録されていません」、`https://go.dev/blog/` は「対象パスに合わない」になること
4. DB で、作った本文候補に `generation_prioritized_at` が入っていること

```bash
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT id, status, generation_prioritized_at, title FROM passages WHERE generation_prioritized_at IS NOT NULL ORDER BY id"
```

- verify-web-page skill で `docs/screenshots/url-import/after.png`（確認の結果を出した状態）を撮る。新しい画面なので before は無い
