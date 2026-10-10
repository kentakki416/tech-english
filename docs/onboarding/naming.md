# 命名規則（ファイル名 / 変数名 / 関数名）

全アプリ共通の命名規則。ESLint（`@typescript-eslint/naming-convention` ほか）で機械的に強制されるものも多い。ファイル編集後は `pnpm lint:fix` を実行する。

## 目次

- [ファイル名](#ファイル名)
- [変数名](#変数名)
- [関数名](#関数名)
- [型・スキーマの命名](#型スキーマの命名)
- [関連ドキュメント](#関連ドキュメント)

## ファイル名

| 対象 | 規則 | 例 |
|---|---|---|
| ディレクトリ | kebab-case | `user-profile/`, `api-schema/` |
| 一般ファイル（hooks / utils / lib 等） | kebab-case | `use-auth.ts`, `api-client.ts`, `format-date.ts` |
| Component を export するファイル | PascalCase | `UserProfile.tsx`, `LoginForm.tsx`, `Button.tsx` |
| テストファイル | テスト対象の関数名 + `.test.ts` | `getUserById.test.ts`, `authenticateWithGoogle.test.ts` |

- フロントの `features/` 内はドット区切りで役割を表す: `{name}.api.ts` / `{name}.entity.ts` / `{name}.store.ts`（zustand ストア）。
- API スキーマはエンドポイントと 1 対 1（`api-schema/category.ts`）。アプリ固有はサブディレクトリに分ける（`api-schema/admin/stats.ts`）。

## 変数名

- **case**: camelCase / UPPER_CASE（定数）/ PascalCase（型・コンポーネント・クラス）。
- **`const` を優先**し、`let` / `var` は再代入が必要な場合のみ。
- **オブジェクトのキーはアルファベット順にソート**（2 個以上のとき）。例外:
  - `id` は常に先頭
  - `createdAt` / `updatedAt` / `deletedAt`（および snake_case の同等物）は常に末尾
  - 例: `{ id, color, name, sortOrder, createdAt, updatedAt }`
- **`private` なクラスメンバー（メソッド・プロパティ・constructor parameter property）は `_` プレフィックス必須**。`constructor` 以外のメンバーは `public` / `private` を明示する。

```typescript
class DrizzleUserRepository implements UserRepository {
  constructor(private readonly _db: DrizzleClient) {}

  public async findById(id: number): Promise<User | null> {
    const [row] = await this._db.select().from(users).where(eq(users.id, id))
    return row ? this._toDomain(row) : null
  }

  private _toDomain(row: UserRow): User {
    return { id: row.id, name: row.name }
  }
}
```

### プロジェクト固有: zustand store のアクション名

zustand store のアクション関数名には **`Store` を含める**（例: `addStoreMemo`, `deleteStoreMemo`, `updateStoreMemo`）。API 呼び出しやイベントハンドラの関数名（`deleteMemo` 等）と衝突し、再帰呼び出しなどのバグを引き起こすため。

## 関数名

- **case**: camelCase / PascalCase。Promise を返す関数には `async` を付ける。
- **関数スタイル**:
  - API / cron / worker: `function` 宣言を使わず **`const` + アロー関数**（例: `export const foo = async () => {}`）
  - web / admin / mobile: **コンポーネントは `function`** に統一
- **必ず動詞から始める**（`getUserById` / `createOrder` / `sendWelcomeMail`）。名詞だけの関数名（`userValidation`, `orderTotal`）は使わない。
- **boolean を返す関数は `is` / `should` / `can` / `has` などの述語プレフィックスで始める**（`isActiveUser`, `shouldRetryJob`, `canEditMemo`, `hasAdminRole`）。
  - **例外**: 複数の条件をまとめて検証する関数は `check` / `verify` / `validate` から始めてよい（`checkOrderPreconditions`, `verifyWebhookSignature`, `validateCsvRow`）。ただし単一条件の真偽判定には `check` を使わず、述語プレフィックスを優先する。
  - **例外**: 処理を実行して成否を boolean で返すアクション系の関数は、述語プレフィックスにせず動作を表す動詞のままにする（`tryRefresh`, `saveDraft`）。述語プレフィックスの対象は「判定だけを行う関数」。
- **処理内容が明確にわかる名前にする**。抽象的すぎる名前を避け、何をするかを具体的に表す。

| ❌ 悪い例 | ✅ 良い例 |
|---|---|
| `parseCsvLine` | `splitCsvLineWithQuotes` |
| `toHalfWidth` | `convertFullWidthToHalfWidth` |
| `parseAmount` | `convertCommaAmountToNumber` |

## 型・スキーマの命名

- **型は PascalCase**。API スキーマから生成する型は手書きの interface を使わず `z.infer` で自動生成する。
- **API スキーマ**（`@repo/api-schema`）はパラメータ種別ごとに個別定義する（共通スキーマは作らない）:

| 種類 | 命名 | 例 |
|---|---|---|
| パスパラメータ（`/resource/:id`） | `{action}{Domain}PathParamSchema` | `deleteMemoPathParamSchema` |
| クエリ文字列（`?foo=bar`） | `{action}{Domain}QueryStringSchema` | `getMemoQueryStringSchema` |
| リクエストボディ（POST/PUT） | `{action}{Domain}RequestSchema` | `createMemoRequestSchema` |
| レスポンス | `{action}{Domain}ResponseSchema` | `createMemoResponseSchema` |

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`../../CLAUDE.md`](../../CLAUDE.md) | Code Style and Linting / Class member style / 命名規則（正典） |
| [`../../packages/schema/CLAUDE.md`](../../packages/schema/CLAUDE.md) | スキーマの命名規則の詳細 |
