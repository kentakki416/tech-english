# step5-api-admin-review-follow-ups

step3・step4 のレビューの確認事項（#82 の 1〜8）に対応する。仕様と理由は [README](../README.md)（「確認と保存」「api での取得と抽出」「必要な画面」）。#82 の 9（`.dockerignore`）は別の PR。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/domain/src/const/url-import.ts` | `deadline_exceeded` の説明を 15 秒に |
| `packages/schema/src/api-schema/admin/url-import.ts` | 塊に `same_content_passage` |
| `apps/api/src/client/page-fetcher.ts` | 取得の期限を 15 秒、`out_of_target_path` の detail にソースの表示名 |
| `apps/api/src/repository/url-import-page-cache-repository.ts`・`redis/url-import-page-cache-repository.ts`・`index.ts` | 取得・抽出したページを 10 分置く |
| `apps/api/src/service/url-import-service.ts` | ページの使い回し、塊の `sameContentPassage`、冒頭の文の「…」 |
| `apps/api/src/controller/admin/url-import/*.ts`・`src/index.ts` | キャッシュの Repository を渡す、`same_content_passage`、連絡先の URL の既定を `FRONTEND_URL` に |
| `apps/api/src/env.ts`・`CLAUDE.md` | `COLLECT_WEB_CONTACT_URL` の説明 |
| `apps/admin/src/app/(dashboard)/url-import/actions.ts` | 保存の失敗で確認の結果を残す、対象パスの外の文言にソース名、取得の期限の文言 |
| `apps/admin/src/components/features/url-import/UrlImportForm.tsx`・`features/url-import/url-import.labels.ts` | 同じ内容の本文候補の状態とリンク、保存の失敗、案内の文言 |
| `docs/spec/url-import/tasks/step4-admin-url-import.md` | 文言の表、Go のソースの本文の CSS セレクタ |

### ページの使い回し（`UrlImportPageCacheRepository`）

```ts
export type UrlImportPageCacheKey = {
  sourceId: number
  sourceUpdatedAt: Date
  url: string
}

export interface UrlImportPageCacheRepository {
  find(key: UrlImportPageCacheKey): Promise<FetchedPage | null>
  save(key: UrlImportPageCacheKey, page: FetchedPage): Promise<void>
}
```

- Redis のキーは `url_import_page:{sourceId}:{sourceUpdatedAt のミリ秒}:{url の SHA-256}`、TTL は 600 秒
- 値は JSON。読むときは Zod で形を確かめ、合わなければ null（取り直す）
- service（`fetchImportPage`）は、キャッシュにあればそれを使い、無ければ取得して置く。取得に失敗したときは置かない。キャッシュの読み書きの失敗は warn を出して続ける（取得して進める）

### 塊の同じ内容の本文候補

```ts
export type UrlImportChunk = {
  excerpt: string
  rejectReasons: ChunkRejectReason[]
  sameContentPassage: Pick<ImportPassage, "id" | "status"> | null
  status: UrlImportChunkStatus
  title: string
  wordCount: number
}
```

レスポンス：

```ts
same_content_passage: z.object({ id: z.number().int().positive(), status: adminPassageStatusSchema }).nullable(),
```

- 同じ `content_hash` の本文候補があれば入れる（状態を問わない）
- admin は `existing`・`duplicated` のときに、状態のラベル（`duplicated` だけ）と `/passages/{id}` へのリンク（「開く」）を出す。`duplicated` の表示は「同じ内容の本文候補がある」にする

### 冒頭の文

- 最初の見出しでないブロックの先頭 160 文字。160 文字を超えるときは切って「…」を付ける

### 取得の期限・対象パスの外・連絡先の URL

- `URL_IMPORT_FETCH_DEADLINE_MS = 15_000`
- `out_of_target_path` の detail は `source.name`。admin は「「{ソースの表示名}」の対象パスに合わないページです。ソースの対象パス・除外パスを確かめてください（.pdf などのページでない拡張子も対象外です）。」とソースの一覧へのリンク
- `src/index.ts` は `new PageFetcher(env.COLLECT_WEB_CONTACT_URL ?? env.FRONTEND_URL)`

### 保存の失敗（admin）

```ts
type UrlImportFailure = { errorCode: UrlImportErrorCode | null; message: string }

export type UrlImportState =
  | { status: "idle" }
  | ({ status: "error" } & UrlImportFailure)
  | { preview: PreviewUrlImportResponse; saveFailure: UrlImportFailure | null; status: "previewed"; url: string }
  | { result: CreateUrlImportResponse; status: "imported" }
```

- `createUrlImportAction` は、失敗したときに前の状態が `previewed` なら、その状態に `saveFailure` を付けて返す（確認の結果は残る）
- 画面は `saveFailure` を保存のボタンの上に出す

### 文言

- 保存の結果：「次の問題の生成で、ほかの本文候補より先に生成します。確認待ちの下書きが多いあいだは生成しません。」
- 確認の結果：「保存するまで DB には書きません。保存のときは確認した内容を保存します（10 分を過ぎたらページを取り直します）。」
- `deadline_exceeded`・入力欄の下の案内：20 秒 → 15 秒

## 動作確認

- `test/service/url-import-service/*.test.ts`：キャッシュにあれば取得しない、無ければ取得して置く、取得に失敗したら置かない、キャッシュの失敗でも取得して進む、`sameContentPassage`、冒頭の文の「…」
- `test/client/page-fetcher.test.ts`：期限が 15 秒、`out_of_target_path` の detail がソースの表示名
- `test/repository/url-import-page-cache-repository.test.ts`（実 Redis）：保存して読める、TTL、ソースの更新日時・URL が違えば別のキー、形が合わない値は null
- `test/controller/admin/url-import/*.test.ts`：`same_content_passage`、2 回目の確認はサイトに取りに行かない
- admin：Playwright で、確認の後の保存は取得しない（2 回目の確認も速い）、同じ内容の本文候補のリンク、対象パスの外の文言にソース名、保存の失敗で確認の結果が残る

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm --filter api exec tsc --noEmit
pnpm --filter admin exec tsc --noEmit
```

- dev の Go 公式ドキュメントのソースに、本文の CSS セレクタ `article.Doc`・除外する CSS セレクタ `.SiteBreadcrumb` を設定し、冒頭の文にパンくず（`Documentation`）が出ないことを確かめる
