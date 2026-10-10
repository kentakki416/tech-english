# packages/schema (`@repo/api-schema`)

API のリクエスト/レスポンス契約を Zod で定義する共有パッケージ。**全ての API スキーマは必ずここに定義し、API サーバーとフロントエンドアプリで import する**。これにより request/response 契約をスタック横断で型安全に共有する。

## Commands

```bash
pnpm build        # TypeScript をコンパイル
pnpm dev          # Watch モード
```

**スキーマ変更後は必ず `pnpm build` を実行**してから依存アプリを起動する。`@repo/domain` の定数を変更したときは `packages/domain` → `packages/schema` の順に build する（`pnpm build` を root で実行すれば turbo が順序を解決する）。

## ファイル構成

API（エンドポイント）と1対1でファイルを作成する。アプリ固有のスキーマはサブディレクトリに分割する。

- 例: `api-schema/category.ts`, `api-schema/admin/stats.ts`, `api-schema/admin/user.ts`
- Admin とアプリケーションでリクエスト・レスポンスが異なるため、同じドメインでもアプリごとにファイルを分ける

各エンドポイントは: リクエストスキーマ + レスポンススキーマ + `z.infer` で生成した TypeScript 型 をセットで定義する。

## コメントルール

`// ===...` でエンドポイントのセクション区切り + `/** */` でスキーマ説明:

```typescript
// ========================================================
// GET /api/categories - カテゴリー一覧取得
// ========================================================

/**
 * カテゴリー一覧取得のレスポンススキーマ
 */
export const getCategoryListResponseSchema = z.object({ ... })
```

## スキーマの命名規則

**パラメータ種別ごとに個別のスキーマを定義する**（共通スキーマは作らない。AI の観点からも例外を作らず、エンドポイントごとに独立した検証を行うため）。

| 種類 | 命名 | 例 |
|---|---|---|
| 路径パラメータ（`/resource/:id`） | `{action}{Domain}PathParamSchema` | `deleteMemoPathParamSchema` |
| クエリ文字列（`?foo=bar`） | `{action}{Domain}QueryStringSchema` | `getMemoQueryStringSchema` |
| リクエストボディ（POST/PUT） | `{action}{Domain}RequestSchema` | `createMemoRequestSchema` |
| レスポンス | `{action}{Domain}ResponseSchema` | `createMemoResponseSchema` |

- **型は `z.infer` で自動生成**し、手書きの interface は使わない
- **路径パラメータの ID 検証は `z.coerce.number().int().positive()`** で string → number の変換を Zod 側で行う（Controller で `Number()` しない）
- **すべてのリクエスト入力（body / params / query）は Zod で検証**する。`Number()` + `isNaN` や `parseInt` の inline 検証は使わない

## Zod 検証の適用範囲

- **body**: 必ず Zod 検証（複雑な構造・型安全性のため）
- **params (path)**: 必ず Zod 検証（`z.coerce.number().int().positive()` で数値変換も同時に）
- **query string**: 必ず Zod 検証（`z.coerce.number()` で coerce、`.min().max()` で範囲制約、`.optional()` / `.default()` で省略対応）

一貫性のため例外を作らない。簡単な 1 フィールドでも Zod を通す。

## 値の集合（enum）は `@repo/domain` から作る

会員種別のような enum 的な値の集合は `@repo/domain` が唯一の定義元。`z.enum([...])` に値を書き写さず、domain の定数から作る（方針は `packages/domain/README.md`）。

```typescript
import { MEMBERSHIP_TIERS } from "@repo/domain"

/**
 * 会員種別のスキーマ
 */
export const membershipTierSchema = z.enum(MEMBERSHIP_TIERS)
```

- domain から import してよいのは **定数だけ**。`Memo` などの型や関数は import しない（API 契約は `created_at: string` のように domain 型と形が違うので独立定義する）
- API 契約にしか存在しない値（health の `"ok" | "degraded"` など）は domain に置かず、ここに直接書いてよい
- 初めて domain を参照するときに `package.json` の `dependencies` へ `"@repo/domain": "workspace:^"` を追加する
