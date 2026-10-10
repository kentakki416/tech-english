# @repo/api-schema

API のリクエスト・レスポンススキーマを Zod で定義する共有パッケージです。

## 目次

- [設計の意図](#設計の意図)
- [概要](#概要)
- [使い方](#使い方)
  - [スキーマの定義](#スキーマの定義)
  - [API (controller) での利用](#api-controller-での利用)
  - [web での利用](#web-での利用)
- [Zod エラーのハンドリング](#zod-エラーのハンドリング)
- [開発ルール](#開発ルール)
  - [命名規則](#命名規則)
  - [コーディング規則](#コーディング規則)
  - [ファイル構成](#ファイル構成)
  - [コメントスタイル](#コメントスタイル)
- [注意事項](#注意事項)

## 設計の意図

**Zod スキーマを単一の正本にし、TypeScript 型は `z.infer` で自動生成する**（手書きの interface は持たない）。リクエスト / レスポンス契約を API とフロント間で型安全に共有する。

> 💡 スキーマ変更後は **`pnpm build` が必須**（依存アプリが古い型を見ないように）。エンドポイント種別ごとに個別スキーマを定義する。

## 概要

- Zod スキーマによる API のバリデーションと TypeScript 型の自動生成
- API サーバー (`apps/api`) とフロントエンド (`apps/web`, `apps/admin`, `apps/mobile`) で共通利用

## 使い方

### スキーマの定義

`src/api-schema/` に Zod スキーマを定義し、`src/api-schema/index.ts` からエクスポートします。

### API (controller) での利用

Controller は `parseRequest` / `parseResponse` ヘルパ越しにスキーマで入出力を検証する。

```typescript
import { createMemoRequestSchema, createMemoResponseSchema } from "@repo/api-schema"
import { parseRequest, parseResponse } from "../../lib/parse-schema"

async execute(req: Request, res: Response) {
  /** リクエスト body を検証（戻り値は createMemoRequest 型に確定） */
  const data = parseRequest(createMemoRequestSchema, req.body)

  const result = await service.memo.createMemo(data, { memoRepository: this._memoRepository })
  if (!result.ok) return sendError(req, res, result.error)

  /** レスポンスも返却前に検証する */
  const response = parseResponse(createMemoResponseSchema, { /* ... */ })
  return res.status(201).json(response)
}
```

### web での利用

基本は **型として** import する（ローカル独自定義は禁止）。API レスポンスを runtime 検証したい Route Handler でのみ `.parse()` を使う。

```typescript
/** 型として利用（Server Component / features） */
import type { GetUserResponse } from "@repo/api-schema"
const user = await apiClient.get<GetUserResponse>("/api/user")

/** Route Handler で API レスポンスを runtime 検証 */
import { authGoogleResponseSchema } from "@repo/api-schema"
const json = authGoogleResponseSchema.parse(await apiRes.json())
```

## Zod エラーのハンドリング

Zod 検証の失敗は **API と web で扱いが異なる**。

| 側 | 検証対象 | 失敗時の扱い |
| --- | --- | --- |
| **API: リクエスト** | `parseRequest`（`safeParse`）で body / params / query | `RequestSchemaMismatchError` を throw → グローバル例外ハンドラが **400**（`logger.warn`） |
| **API: レスポンス** | `parseResponse`（`safeParse`）で返却前の値 | `ResponseSchemaMismatchError` を throw → **500**（サーバ起因の契約違反、`logger.error`） |
| **web** | Route Handler で API レスポンスを `.parse()` | `ZodError` を throw → Next.js のエラー境界で処理（型用途では runtime 検証しない） |

- **API は Controller で try/catch しない。** Zod 失敗は専用エラーにラップして throw し、`unhandledExceptionHandler` が 400 / 500 に一元的に振り分ける（詳細は [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md)）。
- web は `@repo/api-schema` の **型を信頼して使う**のが基本で、runtime 検証は「契約をその場で固めたい Route Handler」に限定する。

## 開発ルール

### 命名規則
**パラメータ種別ごとに個別のスキーマを定義する**（共通スキーマは作らない。エンドポイントごとに独立した検証を行うため）。

| 種類 | 命名 | 例 |
|---|---|---|
| URL パラメータ（`/resource/:id` や `?foo=bar`） | `{action}{Domain}PathParamSchema` | `deleteMemoPathParamSchema` / `authGoogleCallbackPathParamSchema` |
| リクエストボディ（POST/PUT/PATCH） | `{action}{Domain}RequestSchema` | `createMemoRequestSchema` |
| レスポンス | `{action}{Domain}ResponseSchema` | `createMemoResponseSchema` |

### コーディング規則
- **型は `z.infer` で自動生成**し、手書きの interface は使わない
- **URL パラメータの ID 検証は `z.coerce.number().int().positive()`** で string → number の変換を Zod 側で行う（Controller で `Number()` しない）
- **すべてのリクエスト入力（body / params / query）は Zod で検証**する。`Number()` + `isNaN` や `parseInt` の inline 検証は使わない
- 一貫性のため例外を作らない。1 フィールドでも必ず Zod を通す

### ファイル構成

- API（エンドポイント）と 1 対 1 でファイルを作成する。アプリ固有のスキーマはサブディレクトリに分割する
  - 例: `api-schema/memo.ts`, `api-schema/admin/user.ts`
- Admin とアプリケーションでリクエスト・レスポンスが異なる場合、同じドメインでもアプリごとにファイルを分ける

### コメントスタイル

- `// ===...` でエンドポイントのセクション区切り
- `/** */` でスキーマ説明

```typescript
// ========================================================
// GET /api/memos - メモ一覧取得
// ========================================================

/**
 * メモ一覧取得のレスポンススキーマ
 */
export const getMemoListResponseSchema = z.object({ ... })
```

## 注意事項

- スキーマを変更した場合は `pnpm build` で再ビルドが必要です
- 新しい API エンドポイントを追加する際は、先にこのパッケージでスキーマを定義してください