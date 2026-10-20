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
| `apps/admin/src/features/url-import/url-import.labels.ts` | 塊の状態と、本文候補にならない理由のラベル |
| `packages/schema/src/api-schema/admin/url-import.ts` | `UrlImportErrorCode`（`urlImportErrorCodeSchema` の型） |
| `apps/admin/src/components/layout/nav-items.tsx` | メニューに「URL から追加」 |
| `docs/spec/url-import/README.md` | 「必要な画面」に画面の要素を足す |
| `apps/admin/CLAUDE.md` | 「接続済みの画面」とメニューの説明に「URL から追加」 |

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
  | { errorCode: UrlImportErrorCode | null; message: string; status: "error" }
  | { preview: PreviewUrlImportResponse; status: "previewed"; url: string }
  | { result: CreateUrlImportResponse; status: "imported" }

export const previewUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => ...
export const createUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => ...
```

- `url` は `previewUrlImportRequestSchema` で検証し、不正（`https` でないものを含む）なら「URL を確かめてください（https のページの URL）」。api には送らない
- api の 400 は `errorResponseSchema` で読み、`details[0].code` を `urlImportErrorCodeSchema` で読んで文言にする（下の表）。それ以外の失敗は「取り込みに失敗しました。時間をおいてもう一度お試しください。」
- 保存できたら `revalidatePath("/passages")`
- `errorCode` は api が返した取り込めない理由（URL の形の誤り・想定外の失敗は null）。画面が `source_not_found` のときにソースの登録へのリンクを出すのに使う

| code | 文言 |
| --- | --- |
| `source_not_found` | このサイトのソースが登録されていません。先にソースを登録してください。（ソースの登録へのリンク） |
| `github_source` | このサイトは GitHub のソースで収集しています。収集（collect:passages）で取り込んでください。 |
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
| `deadline_exceeded` | ページの取得が 20 秒以内に終わりませんでした。時間をおいてもう一度お試しください。 |

### 画面（`UrlImportForm.tsx`）

`useActionState` の 1 つの状態に、確認と保存の 2 つのアクションを form の hidden の `intent` で振り分ける（保存の結果を出したら確認の結果は消える）。送信は `onSubmit` から `startTransition` で呼ぶ（admin の規約。`<form action>` だと送信後に入力がリセットされる）。カードは `ComponentCard`、表の見出しは `tableHeadCellClass`、ボタンは `primaryButtonClass`、状態は `Badge` を使う。

- 入力：URL（`inputClass`）と「確認する」。確認中はボタンを無効にして「確認しています…」
- 確認の結果：
  - ソース（表示名・ライセンス）、ページ（タイトル・URL・英単語数）
  - 塊の表：見出し、英単語数、保存したときにどうなるか（`new` は「本文候補になる」 success、`existing` は「本文候補がすでにある（生成を優先）」 info、`duplicated` は「同じ内容の問題がある」 light、`generated_section` は「同じ見出しの問題がある」 warning、`not_candidate` は「本文候補にならない」 light と理由）、冒頭の文
  - 「本文候補として保存」（`new` か `existing` の塊が 1 つも無ければ無効）。押すと URL を hidden で送る
- 保存の結果：作った件数・却下した件数、優先した本文候補の一覧（`/passages/{id}` へのリンク、新しく作ったものに「新規」のバッジ）、「次の問題の生成で、ほかの本文候補より先に生成します。」の案内。優先した本文候補が 0 件（確認の後にページか本文候補の状態が変わった）なら、そのことを案内する
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
| ページの探し方 | 開始ページ `https://go.dev/doc/`（サイトのソースは sitemap か開始ページのどちらかが要る） |
| 対象パス | `/doc/**` |
| ライセンス | `CC-BY-4.0`（ライセンスの記載がある URL は `https://go.dev/copyright`） |

1. `/url-import` で `https://go.dev/doc/tutorial/getting-started` を確認し、ソースと塊の表が出ること。console のエラー 0 件
2. 保存して、作った件数と本文候補へのリンクが出ること。もう一度保存すると、作った件数が 0 で「本文候補がすでにある」になること
3. `https://example.com/` は「ソースが登録されていません」、`https://go.dev/blog/` は「対象パスに合わない」、`https://react.dev/learn` は「GitHub のソースで収集しています」、`http://go.dev/doc/` はフォームで止まること
4. DB で、作った本文候補に `generation_prioritized_at` が入っていること

```bash
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT id, status, generation_prioritized_at, title FROM passages WHERE generation_prioritized_at IS NOT NULL ORDER BY id"
```

- verify-web-page skill で `docs/screenshots/url-import/after.png`（確認の結果を出した状態）を撮る。新しい画面なので before は無い
