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
| `API_URL` | no | `http://localhost:8080` | Express API の origin |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |

値は `.env.local` に置き、**dotenvx で暗号化して git にコミットする**（api / web / cron / worker と同じ方式）。復号鍵は root の `.env.keys`（git 管理外）で、各 app の `.env.keys` はそこへの symlink。公開鍵は全 app で共有している。

`dev` / `build` / `start` はいずれも `dotenvx run -f .env.local -- ` を通す。

```bash
# 値を追加・変更するときは手書きせず dotenvx を使う
cd apps/admin && pnpm exec dotenvx set API_URL "http://localhost:8080" -f .env.local
```

## API 接続の下地

admin は DB を直接触らず、必ず Express API を経由する。現状は TailAdmin テンプレートの画面がそのまま入っており **API には未接続**だが、繋ぐための足場は用意してある。

| ファイル | 状態 | 役割 |
| --- | --- | --- |
| `src/env.ts` | 配線済み（ただし未 import） | `API_URL` を Zod で検証。`server-only` |
| `src/libs/api-client.ts` | **未使用** | `env.API_URL` を叩く `get` / `post` / `put` / `delete`。`server-only` |
| `@repo/api-schema` | **未使用**（依存宣言のみ） | API のリクエスト / レスポンス Zod スキーマ |

画面を API に繋ぐときは:

1. Server Component か Route Handler から `apiClient` を呼ぶ（`server-only` なので client component からは import できない）
2. レスポンスは `@repo/api-schema` のスキーマで parse する。**独自に型を書かない**
3. client component にデータが必要な場合は Server Component で取得して props で渡す

`src/env.ts` はどこからも import されていないため **現状 env 検証は実行されない**（`api-client.ts` が未使用のため）。API に繋いだ時点で初めて検証が走る。

`@repo/*` のうち admin が import できるのは `@repo/api-schema` だけで、これは lint で強制している（`@repo/eslint-config/frontend-boundary`）。

## ダミーモード

API 側で `ADMIN_USE_DUMMY=true`（`apps/api/.env.local`）を設定すると DB なしでダミーデータが返るため、フロント開発時に活用する。

## 動作確認（必須）

UI コードを実装・修正したら **必ず Playwright MCP で実画面の動作確認** を行う（詳細は `apps/web/CLAUDE.md` の「動作確認（必須）」セクションを参照）。port は 3030。`pnpm build` だけで「動作確認済み」と報告するのは禁止。

## PR 作成時の before/after スクショ（必須）

見た目に影響する Admin の PR も `docs/screenshots/{feature}/{before,after}.png` を PR 本文に含める（詳細は `apps/web/CLAUDE.md` の「PR 作成時の before/after スクショ（必須）」セクションを参照）。
