# テストルール

テストランナーは **Vitest**（`describe` / `it` / `expect` / `vi` は `globals: true` でグローバル展開されるため import 不要）。レイヤーごとにテスト種別を分け、`正常系` / `異常系` で分類する。

## 目次

- [レイヤー別のテスト種別](#レイヤー別のテスト種別)
- [正常系 / 異常系で分類する](#正常系--異常系で分類する)
- [Controller 統合テストのモック方針](#controller-統合テストのモック方針)
- [アサーションの書き方](#アサーションの書き方)
- [テストの耐久性（文言に依存しない）](#テストの耐久性文言に依存しない)
- [境界値テスト](#境界値テスト)
- [テストのためだけの export](#テストのためだけの-export)
- [関連ドキュメント](#関連ドキュメント)

## レイヤー別のテスト種別

| レイヤ | テスト種別 | 場所 | 依存 |
|---|---|---|---|
| **Service** | ユニットテスト | `apps/api/test/service/` | DB 不要。`vi.fn()` で Repository をモック。高速・並列 |
| **Controller** | 統合テスト | `apps/api/test/controller/` | 自前インフラ（Postgres / Redis）は**本物**、`supertest` で HTTP から検証 |
| **Repository**（DB） | 契約テスト | `apps/api/test/repository/` | Postgres は**本物**。Drizzle / Prisma の両実装を `describe.each` で同じケースにかけ、振る舞いが揃っていることを検証 |
| cron / worker | ユニットテスト | 各 `test/` | DB client / Redis を mock（DB / Redis 不要） |

- **Service ユニットテスト**は「何が起きたか（呼び出し・戻り値）」を検証する責務。
- **Controller 統合テスト**は「実際に永続層が意図通り変化したか」を検証する責務。

## 正常系 / 異常系で分類する

**テストケースは `describe` を入れ子にして必ず分類する**。トップレベル `describe` はテスト対象（関数名 / エンドポイント）、その直下に `describe("正常系")` と `describe("異常系")` を置いて `it` をぶら下げる。

| 分類 | 対象 |
|---|---|
| **正常系** | 入力が正しく処理が成功するケース（Service なら `ok: true`、Controller なら 2xx） |
| **異常系** | 業務エラー（4xx）、バリデーションエラー、想定外の例外、境界値で除外されるケースなど正常系以外すべて |

```typescript
describe("getMemoById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("メモが存在する場合、ok: true とメモを返す", async () => { /* ... */ })
  })

  describe("異常系", () => {
    it("メモが存在しない場合、ok: false と NOT_FOUND を返す", async () => { /* ... */ })
    it("DB 障害時にエラーをスローする", async () => { /* ... */ })
  })
})
```

## Controller 統合テストのモック方針

| 種類 | 例 | 扱い | 理由 |
|---|---|---|---|
| 自前インフラ | Postgres / Redis | **本物**（テスト用 DB に接続） | キー名・TTL・型変換・SQL の誤りは mock では検出できない |
| 外部 SaaS / ネットワーク | Google OAuth / S3 / 課金 API | **モック** | 外部依存・遅い・課金・異常系再現が難しい |
| ピュアロジック | 計算・変換関数 | モック不要 | Service ユニットテストで網羅 |

- 自前 Redis を `vi.fn()` で差し替えるのは Controller 統合テストでは**禁止**。`new IoRedisRefreshTokenRepository(testRedis)` で実 Redis を注入し、`beforeEach` で `cleanupTestRedis()` を呼んで分離する。
- モックは **デフォルト `vi.fn()`**。`vi.mock()` は import パスに結合しリファクタリング耐性が低いため非推奨。
- モック関数の引数型は `vi.fn<(_0: ArgType) => ReturnType>()` の形で明示する。

## アサーションの書き方

**「メソッドが呼ばれた」だけの検証は Controller 統合テストでは不十分**。Postgres / Redis の**最終状態**を直接確認する。また 1 フィールドずつではなく**オブジェクト全体を一括検証**する。

```typescript
/** ✅ Postgres の最終状態を確認 */
const [created] = await testDb.select().from(users).where(eq(users.email, "new@example.com"))
expect(created).toMatchObject({ email: "new@example.com", name: "New User" })

/** ✅ API レスポンスは toEqual で全フィールド完全一致（契約変更を検出） */
expect(res.status).toBe(200)
expect(res.body).toEqual({
  access_token: expect.any(String),
  is_new_user: true,
  refresh_token: expect.any(String),
  user: { avatar_url: "...", created_at: expect.any(String), email: "new@example.com", id: expect.any(Number), name: "New User" },
})
```

| 対象 | 推奨マッチャー | 理由 |
|---|---|---|
| API レスポンス（外部契約） | `toEqual` + `expect.any(...)` | フィールド増減で落ちる方が望ましい（契約変更の見落とし防止） |
| DB 行（内部状態） | `toMatchObject` | id / timestamp は内部詳細なので省略 OK |
| Redis / 単一値 | `toBe` | 1 値なので一括にする意味がない |

## テストの耐久性（文言に依存しない）

**エラーメッセージなどの文字列は assertion しない**。文言変更・i18n・ログ改善のたびに無関係なテストが落ちるため。

```typescript
/** ❌ 文言に依存（禁止） */
expect(res.body.error).toBe("Invalid memo ID")
await expect(uploadCsv(...)).rejects.toThrow("すでにアップロード済みです")

/** ✅ Service: Result の構造だけ検証 */
const result = await uploadCsv(...)
expect(result.ok).toBe(false)
if (!result.ok) {
  expect(result.error.statusCode).toBe(409)
  expect(result.error.type).toBe("CONFLICT")
}

/** ✅ Controller: ステータスと存在だけ検証 */
expect(res.status).toBe(400)
expect(res.body.error).toBeDefined()  // 文言は照合しない
```

## 境界値テスト

日付フィルタや条件分岐を含む API では**境界値のテストを必ず追加**する。月フィルタなら **前月末日・当月初日・当月末日・翌月初日** の 4 点をデータに含め、当月分だけが返ることを検証する。

```typescript
await testDb.insert(transactions).values([
  { transactionDate: new Date("2026-02-28"), description: "前月末" },  // 含まれない
  { transactionDate: new Date("2026-03-01"), description: "当月初" },  // 含まれる
  { transactionDate: new Date("2026-03-31"), description: "当月末" },  // 含まれる
  { transactionDate: new Date("2026-04-01"), description: "翌月初" },  // 含まれない
])
const res = await request(app).get("/api/transactions").query({ month: 3, year: 2026 })
expect(res.body.transactions).toHaveLength(2)
```

## テストのためだけの export

テストから直接呼びたい内部の関数・定数は、個別に `export` せず、**ファイル末尾の `forTesting` にまとめる**。export している側でも import している側でも、テスト用だとすぐ分かるようにするため。

```typescript
/** src/bullmq-queue.ts */
const isTerminalJobFailure = (params: { ... }): boolean => ...  // export しない

/**
 * テストからだけ使う
 */
export const forTesting = { isTerminalJobFailure }
```

```typescript
/** test/is-terminal-job-failure.test.ts */
import { forTesting } from "../src/bullmq-queue"

const { isTerminalJobFailure } = forTesting
```

- テスト以外のコードから `forTesting` を import・参照すると lint エラーになる（`packages/eslint-config/test-only-exports.js`）
- `forTesting` を持つファイルは、`index.ts` で `export *` せず名前を列挙して re-export する。`export *` だとパッケージの公開 API に漏れ、同じ index で 2 つ以上あると TS2308 で衝突する（lint では検出できない）

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`../../apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md) | テスト戦略・耐久性・モック方針・境界値テストの詳細（正典） |
| [error-handling.md](./error-handling.md) | 検証対象となる `Result<T>` の構造 |
