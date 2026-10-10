# step4-api-admin-auth

admin 用の API（`/api/admin/*`）と admin 画面を共有シークレットで保護する。api に `adminAuthMiddleware` と `admin-router.ts` を作り、admin に Basic 認証と `X-Admin-Token` の付与を入れる。ルート（ソース・問題）はまだ足さない。

## 前提

- 実装の順番（取り決めの 5.6）で、reading-practice step1 / learning-record step1 / study-reminder step1 のテーブルが入った後に着手する（コード上の依存は無い）
- 保護の方式と理由は README の [管理画面のアクセス制御](../README.md#管理画面のアクセス制御)
- この step の後に [content-collection step2-api-admin-content-source](../../content-collection/tasks/step2-api-admin-content-source.md) と [step5-api-admin-passage](./step5-api-admin-passage.md) が `admin-router.ts` にルートを足す

## 対応内容

### 1. api の env

`apps/api/src/env.ts` に足す（JWT の secret と同じく 32 文字以上）。値は `pnpm exec dotenvx set ADMIN_API_TOKEN "..." -f .env.local` で入れる（`openssl rand -hex 32` 等で作る）。

```typescript
/**
 * admin のサーバー側だけが持つ共有シークレット。X-Admin-Token ヘッダと比較する
 */
ADMIN_API_TOKEN: z.string().min(32),
```

`test/vitest.setup.ts` にテスト用の既定値（32 文字以上）を足す。

### 2. トークンの比較（`apps/api/src/lib/admin-token.ts`）

`crypto.timingSafeEqual` は長さが違うと throw するので、両方を SHA-256 にしてから比べる（長さも漏らさない）。

```typescript
import { createHash, timingSafeEqual } from "node:crypto"

const digest = (value: string): Buffer => createHash("sha256").update(value).digest()

/**
 * X-Admin-Token が ADMIN_API_TOKEN と一致するかを定数時間で比べる
 */
export const isAdminTokenValid = (token: string | undefined, expected: string): boolean =>
  token !== undefined && token.length > 0 && timingSafeEqual(digest(token), digest(expected))
```

### 3. `adminAuthMiddleware`（`apps/api/src/middleware/admin-auth.ts`）

```typescript
export const ADMIN_TOKEN_HEADER = "x-admin-token"

/**
 * /api/admin/* の認証。ユーザーの JWT は見ない（/api/admin は PUBLIC_PATHS に入れてある）
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isAdminTokenValid(req.header(ADMIN_TOKEN_HEADER), env.ADMIN_API_TOKEN)) return next()
  const errorResponse: ErrorResponse = { error: "Invalid admin token", status_code: 401 }
  return res.status(401).json(errorResponse)
}
```

- ヘッダが無い・違う・空文字はすべて同じ 401（どれが原因か返さない）。`logger.warn` に `method` / `path` を残す（トークンの値はログに出さない）

### 4. `PUBLIC_PATHS`（`apps/api/src/const/index.ts`）

`"/api/admin"` を足す（ユーザーの JWT 認証の対象外にする。`matchesPathPrefix` によりセグメント境界で一致するので `/api/admin-foo` は対象外のまま）。コメントに「代わりに admin-router の `adminAuthMiddleware` で保護する」と書く。

### 5. `admin-router.ts`（`apps/api/src/routes/admin-router.ts`）

```typescript
/**
 * admin 向けのルーター。すべてのルートの前に adminAuthMiddleware を通す
 */
export const adminRouter = (): Router => {
  const router = Router()
  router.use(adminAuthMiddleware)
  return router
}
```

- **ルートを最初に足す step（content-collection step2 か step5 のどちらか先）が `controllers` 引数を足す。** 形はリソースごとにネストした `AdminRouterControllers = { contentSource?: {...}, passage?: {...} }` とし、既存の router と同じく渡されたコントローラーのルートだけを登録する。パスは `/content-source/...`、`/passage/...`
- `apps/api/src/index.ts` で `apiRateLimiter` の後、`/api/auth` などと並べてマウントする

```typescript
app.use("/api/admin", adminRouter())
```

### 6. `apps/api/CLAUDE.md` の「Admin API 設計方針」の書き換え

見出しから「（未実装）」を外し、次の内容にする。

- すべて `/api/admin/` 配下に置き、`src/routes/admin-router.ts` にマッピングする（リソースごとに `controllers.contentSource` / `controllers.passage` のようにネストして渡す）
- **認証は `X-Admin-Token` ヘッダ**。`adminAuthMiddleware`（`src/middleware/admin-auth.ts`）が `ADMIN_API_TOKEN` と定数時間で比較する。ユーザーの JWT 認証の対象外にするため `/api/admin` を `PUBLIC_PATHS` に入れている。**`/api/admin` 配下のルートは必ず admin-router に足す**（別の router に足すと無認証で公開される）
- Controller は `src/controller/admin/{resource}/{action}.ts`、Service は `src/service/{content-source,admin-passage}-service.ts`。ユーザー向けと同じ Repository を使う
- スキーマは `@repo/api-schema` の `admin/` に置く（既存の記述を残す）
- 管理者が増えたら GitHub ログイン + 権限管理に移行する（question-generation の README へのリンク）
- 「認証は当面無し（`PUBLIC_PATHS`）」の行は消す。`ADMIN_USE_DUMMY` の記述はこの step では触らない

`環境変数` の節に `ADMIN_API_TOKEN` があることも書く。

### 7. admin の env（`apps/admin/src/env.ts`）

```typescript
/** api の /api/admin/* に X-Admin-Token として付ける。api の ADMIN_API_TOKEN と同じ値 */
ADMIN_API_TOKEN: z.string().min(32),
ADMIN_BASIC_AUTH_PASSWORD: z.string().min(12),
ADMIN_BASIC_AUTH_USER: z.string().min(1),
```

`apps/admin/CLAUDE.md` の環境変数の表にも足す。値は dotenvx で入れる。

### 8. admin の Basic 認証（`apps/admin/src/proxy.ts` を新設）

`apps/web/src/proxy.ts` と同じく `proxy` と `config.matcher` を export する（`_next/static`・`_next/image`・`favicon.ico` 以外のすべて。`/mock` も保護する）。

```typescript
const REALM = "tech-english admin"

export const proxy = (req: NextRequest) => {
  const user = process.env.ADMIN_BASIC_AUTH_USER
  const password = process.env.ADMIN_BASIC_AUTH_PASSWORD
  /** 未設定なら誰も通さない（fail closed） */
  if (user && password && isBasicAuthValid(req.headers.get("authorization"), user, password)) {
    return NextResponse.next()
  }
  return new NextResponse("Authentication required", {
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
    status: 401,
  })
}
```

- `src/env.ts` は `server-only` を import しているので proxy からは使わず、`process.env` を直接読む（必須の検査は `src/env.ts` 側で、api client の読み込み時に走る）
- `isBasicAuthValid` は `src/libs/basic-auth.ts` に置く純関数。`Basic ` を外して `atob` し、最初の `:` で user と password に分け、**長さが違っても早期 return しない定数時間の比較**（文字ごとの XOR を OR で溜める）で両方を比べる。proxy のランタイムに依存しないよう `node:crypto` は使わない

### 9. admin の api client（`apps/admin/src/libs/api-client.ts`）

- すべてのリクエストに `X-Admin-Token: env.ADMIN_API_TOKEN` を付ける（ヘッダの組み立てを 1 か所にまとめる）
- エラー時に status とボディを捨てない。web の `ApiClientError`（`status` / `body`）と同じクラスを置き、`!res.ok` なら投げる。step6 の Server Action が 400（公開の条件の一覧）と 409 を画面に出すのに使う
- トークンはこのモジュール（`server-only`）の外に出さない。Client Component に渡す props やエラーのボディにも含めない

## 動作確認

```bash
pnpm --filter api test
pnpm --filter api lint
pnpm --filter admin lint && pnpm --filter admin build
```

`test/lib/admin-token.test.ts`：

- [ ] 一致で true、1 文字違い・長さ違い・空文字・undefined で false（長さ違いで throw しない）

`test/controller/admin/auth.test.ts`（`createTestApp()` に `app.use("/api/admin", adminRouter())` を載せる。ルートが無いので認証を通れば 404）：

- [ ] 正常系：正しい `X-Admin-Token` で 404（認証を通過）。Bearer トークンが無くても 401 にならない
- [ ] 異常系：ヘッダなし・違う値・空文字で 401 とエラーボディ
- [ ] 異常系：ユーザーの有効な JWT（`createTestUser`）だけを付けても 401
- [ ] 既存の `/api/user` などは引き続き JWT が無ければ 401（`PUBLIC_PATHS` の追加で緩んでいない）

手動確認：

- [ ] `pnpm --filter admin dev` で http://localhost:3030 を開くと Basic 認証のダイアログが出る。正しい値で入れ、違う値では 401
- [ ] `curl -i http://localhost:8080/api/admin/passage` が 401、`-H "X-Admin-Token: ..."` 付きで 401 以外
- [ ] ブラウザの開発者ツールで、admin のページやレスポンスに `ADMIN_API_TOKEN` の値が含まれていない
