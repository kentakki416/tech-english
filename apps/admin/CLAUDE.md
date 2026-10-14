# apps/admin

Next.js 16 (App Router) の admin ダッシュボード（port 3030）。Tailwind CSS v4 + PostCSS。

## Commands

```bash
pnpm dev          # http://localhost:3030 で起動
pnpm build        # 本番ビルド
pnpm start        # 本番サーバー起動
```

## アーキテクチャ

`apps/web` と同じ App Router / API 通信ルールに従う（詳細は `apps/web/CLAUDE.md` を参照）。Admin 固有の方針のみここに記載する。

- 型・スキーマは `@repo/api-schema/admin/` から import（Admin 固有のレスポンスが必要な場合）
- Admin 向け API は `/api/admin/` 配下を呼び出す（API 側の方針は `apps/api/CLAUDE.md` の "Admin API 設計方針" 参照）

## 環境変数

`src/env.ts` に Zod スキーマをインラインで定義し、import 時に `safeParse` → 失敗なら `process.exit(1)`。先頭で `import "server-only"` しているので client component からは import できない。

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `ADMIN_API_TOKEN` | yes | - | api の `/api/admin/*` に `X-Admin-Token` として付ける共有シークレット（32 文字以上）。api の `ADMIN_API_TOKEN` と同じ値。`src/libs/api-client.ts` の外に出さない |
| `ADMIN_BASIC_AUTH_PASSWORD` | yes | - | 画面全体の Basic 認証のパスワード（12 文字以上） |
| `ADMIN_BASIC_AUTH_USER` | yes | - | 画面全体の Basic 認証のユーザー名 |
| `API_URL` | no | `http://localhost:8080` | Express API の origin |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |

値は `.env.local` に置き、**dotenvx で暗号化して git にコミットする**（api / web / cron / worker と同じ方式）。復号鍵は root の `.env.keys`（git 管理外）で、各 app の `.env.keys` はそこへの symlink。公開鍵は全 app で共有している。

`dev` / `build` / `start` はいずれも `dotenvx run -f .env.local -- ` を通す。

```bash
# 値を追加・変更するときは手書きせず dotenvx を使う
cd apps/admin && pnpm exec dotenvx set API_URL "http://localhost:8080" -f .env.local
```

## アクセス制御

MVP の管理者は 1〜2 人なので、共有シークレットで保護する（設計は [question-generation の 管理画面のアクセス制御](../../docs/spec/question-generation/README.md#管理画面のアクセス制御)）。

- **画面**: `src/proxy.ts` が Basic 認証をかける（`_next/static`・`_next/image`・`favicon.ico`・`images/` 以外のすべて。モックの `/mock` も対象）。`images/`（`public/images` のテンプレートの静的画像）を除くのは、秘密を含まないうえ、next/image の最適化（`/_next/image`）がサーバーの内部から元の画像を認証なしで取得するため（Basic 認証をかけると最適化した画像が 401 で表示されない）。`ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` が未設定なら誰も通さない（fail closed）。`src/env.ts` は `server-only` なので proxy からは使わず `process.env` を直接読む。比較は `src/libs/basic-auth.ts`（`node:crypto` を使わない定数時間比較）
- **api**: `src/libs/api-client.ts` がすべてのリクエストに `X-Admin-Token: ADMIN_API_TOKEN` を付ける。トークンはブラウザに渡らない（Client Component の props やエラーに含めない）
- ローカルの資格情報は `.env.local`（dotenvx で暗号化済み）に入っている。値は `pnpm exec dotenvx get ADMIN_BASIC_AUTH_PASSWORD -f .env.local` で確認する

## API 接続の下地

admin は DB を直接触らず、必ず Express API を経由する。tech-english の画面（サイドバーの「tech-english」）は API に接続済みで、それ以外は TailAdmin テンプレートの画面がそのまま入っている（API 未接続）。

| ファイル | 役割 |
| --- | --- |
| `src/env.ts` | `API_URL` / `ADMIN_API_TOKEN` / Basic 認証の資格情報を Zod で検証。`server-only`。`api-client.ts` から import され、API を呼ぶ画面の読み込み時に検証が走る |
| `src/libs/api-client.ts` | `env.API_URL` を叩く `get` / `post` / `put` / `delete`。`X-Admin-Token` を付け、`!res.ok` なら `ApiClientError`（`status` / `body`）を投げる。`server-only` |
| `src/features/{feature}/{feature}.api.ts` | 機能ごとの API 呼び出し層（`server-only`）。レスポンスを `@repo/api-schema` のスキーマで parse して返す |
| `src/libs/ui-classes.ts` | 入力欄・カード・ボタンの共通クラス（テンプレートと同じ見た目）。デザインモックの `mock/_components/ui.ts` と同じ値で、本番の画面はこちらを使う（`mock/` を import しない） |
| `src/libs/format-date.ts` | `formatDateTime`：日時を日本時間の `2026-10-10 03:00` にする（Server Component は UTC で動くためタイムゾーンを明示） |

接続済みの画面：

| パス | 画面 | 実装 |
| --- | --- | --- |
| `/content-sources` | ソース一覧 | `app/(dashboard)/content-sources/page.tsx` + `components/features/content-source/SourceTable.tsx` |
| `/content-sources/new`・`/content-sources/[id]` | ソースの登録・編集 | `SourceForm.tsx` + `app/(dashboard)/content-sources/actions.ts`（Server Action）+ `app/api/content-sources/license/route.ts`（ライセンス検出の中継） |
| `/passages` | 問題一覧（`?status=` で状態を切り替え） | `app/(dashboard)/passages/page.tsx` + `components/features/passage/PassageTable.tsx` |
| `/passages/[id]` | 問題の確認・修正 | `PassageReview.tsx`（タブは `QuestionsTab` / `TranslationsTab` / `GlossaryTab` / `BodyTab` / `BasicsTab`、プレビューは `PassagePreview`、読み上げの音声は `PassageAudioCard`）+ `app/(dashboard)/passages/[id]/actions.ts`（Server Action）。フォームの状態と変換は `features/passage/passage.form.ts`、ラベルは `passage.labels.ts` |

問題の画面のメモ：

- プレビューの書体（Literata）は `app/(dashboard)/passages/layout.tsx` で読み込む
- 確認・修正のフォームは詳細から作る 1 つの state（`PassageForm`）。保存・公開・却下などは `useActionState` の 1 つの action に操作（command）として渡し、`startTransition` から呼ぶ。保存・状態の変更で詳細が取り直されたら（`status` と `updated_at` が変わったら）フォームを作り直す
- 読み上げの音声のカード（`PassageAudioCard`）は詳細の `audio` が null（下書きなどで音声の行も無い）なら出さない。状態（準備中・生成中・作成済み・失敗）と作成日時を出し（非公開に戻した問題の作成済みの音声は、本文を直したかもしれないので API が準備中を返す）、失敗のときは「再試行」（`retryPassageAudioAction`）、作成済みのときは「作り直す」（確認のダイアログの後に `regeneratePassageAudioAction`。依頼中〈`regenerate_requested_at` がある〉は「作り直しを待っています」を出してボタンは出さない）。作成済みで `last_error` があるのは voice の変更・作り直しに失敗して前の音声を出し続けているときで、エラーも出す。どちらの操作も 409 は「音声の状態が変わりました」。フォームとは別の `useTransition` で呼ぶので、未保存の修正は消えない
- 「公開する」と「要確認を解除」は未保存の修正があれば先に保存する（要確認の解除も `updated_at` を変えるので、そのままだとフォームが作り直されて修正が消える）。保存・公開の 400 の `details` は、リクエストを作ったときのフォームで設問・語句の `clientKey` に直してから該当の項目に印を付ける（エラーの後に設問を消しても印が別の設問に移らないように）

画面を API に繋ぐときは:

1. Server Component か Route Handler から `features/*.api.ts` 経由で `apiClient` を呼ぶ（`server-only` なので client component からは import できない）。一覧のように build 時に静的生成されると困るページは `await connection()` で動的にする
2. レスポンスは `@repo/api-schema` のスキーマで parse する。**独自に型を書かない**
3. client component にデータが必要な場合は Server Component で取得して props で渡す。Zod のスキーマ（値）を client component で import すると bundle に入るので、選択肢などの値も Server Component から props で渡す
4. 登録・更新は Server Action（`actions.ts`。先頭に `"use server"` と `import "server-only"`）。404 / 409 は `ApiClientError` の `status` で見分ける。フォームは `useActionState` を使い、`<form action>` ではなく `onSubmit` から `startTransition(() => formAction(formData))` で呼ぶ（`<form action>` だと React が送信後にフォームをリセットし、入力エラーのときに値が消える）

`@repo/*` のうち admin が import できるのは `@repo/api-schema` だけで、これは lint で強制している（`@repo/eslint-config/frontend-boundary`）。

## ダミーモード

API 側で `ADMIN_USE_DUMMY=true`（`apps/api/.env.local`）を設定すると DB なしでダミーデータが返るため、フロント開発時に活用する。

## 動作確認（必須）

UI コードを実装・修正したら **必ず Playwright MCP で実画面の動作確認** を行う（詳細は `apps/web/CLAUDE.md` の「動作確認（必須）」セクションを参照）。port は 3030。`pnpm build` だけで「動作確認済み」と報告するのは禁止。

## PR 作成時の before/after スクショ（必須）

見た目に影響する Admin の PR も `docs/screenshots/{feature}/{before,after}.png` を PR 本文に含める（詳細は `apps/web/CLAUDE.md` の「PR 作成時の before/after スクショ（必須）」セクションを参照）。
