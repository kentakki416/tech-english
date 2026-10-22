# step4-api-admin-auth

admin 認証の DB・api・鍵の配布・admin の登録コマンドを作る。あわせて今の `X-Admin-Token` を消し、既存の admin のテストを admin の JWT に書き換える。admin の画面側（サインイン画面・cookie・proxy）は [step5](./step5-admin-auth-screens.md)。

この step の後は、api の `/api/admin/*` に admin の access token でだけ入れる（テストと curl で確かめる）。

設計: [admin 認証](../README.md#admin-認証) / [refresh token の保存と猶予](../README.md#refresh-token-の保存と猶予) / [移行の進め方](../README.md#移行の進め方) / [鍵の配布](../README.md#admin-の-jwt-の鍵の配布) / [登録コマンド](../README.md#admin-の登録コマンド) / [本番の Google OAuth クライアント](../README.md#本番の-google-oauth-クライアント)

## 前提

- step1〜3 とは独立
- **step5 と続けて merge する。** この step だけを main に入れると、ローカルの admin（`X-Admin-Token` を付けて呼ぶ）が api に 401 で弾かれ、画面が開けなくなる。PR の本文にも書く
- テストは `pnpm --filter api test` で流す（vitest を直接叩かない。dev の DB が消える）
- スキーマを変えたら `pnpm build`（root）で `@repo/domain` → `@repo/schema` の順にビルドしてから api を動かす

## 対応内容

### 変更するファイル

```
packages/domain/src/
├── rules/email.ts                                # 新設 normalizeEmail
├── types/admin.ts                                # 新設 Admin
└── index.ts
packages/db/
├── Dockerfile.migration                          # @repo/db の依存（@repo/domain）もビルドする
├── package.json                                  # admin:create
├── src/drizzle/schema/admin.ts                   # 新設
├── src/drizzle/schema/index.ts
├── drizzle/migrations/<timestamp>_add_admins/    # db:generate で作る
├── drizzle/create-admin.ts                       # 新設
└── drizzle/seed.ts                               # dev 用の admin
packages/logger/src/context.ts                    # LogContext に adminId
packages/schema/src/api-schema/
├── admin/auth.ts                                 # 新設
├── admin/me.ts                                   # 新設
└── index.ts
apps/api/
├── .env.local                                    # JWT_ADMIN_* を足し、ADMIN_API_TOKEN を消す
├── src/env.ts                                    # JWT_ADMIN_*・鍵の重複の検査。ADMIN_API_TOKEN・ADMIN_USE_DUMMY を消す
├── src/const/index.ts                            # ADMIN_PATH_PREFIX・ADMIN_PUBLIC_PATHS。PUBLIC_PATHS から /api/admin を外す
├── src/client/google-oauth.ts                    # emailVerified
├── src/lib/is-path-under-prefix.ts               # 新設（auth.ts の matchesPathPrefix を移して改名）
├── src/lib/admin-jwt.ts                          # 新設
├── src/lib/admin-token.ts                        # 削除
├── src/middleware/auth.ts                        # /api/admin を見ない
├── src/middleware/admin-auth.ts                  # 置き換え（Bearer の admin の JWT）
├── src/middleware/request-logger.ts              # 完了のログに adminId
├── src/repository/admin-repository.ts            # 新設 interface
├── src/repository/drizzle/admin-repository.ts    # 新設
├── src/repository/{index,drizzle/index}.ts
├── src/repository/redis/refresh-token-repository.ts  # キーの接頭辞
├── src/service/auth-service.ts                   # 型・定数の export、持ち主の Repository を受け取る
├── src/service/admin-auth-service.ts             # 新設
├── src/service/admin-service.ts                  # 新設
├── src/service/index.ts
├── src/controller/auth/refresh.ts                # tokenOwnerRepository
├── src/controller/admin/auth/{google,refresh,logout,dev-login}.ts  # 新設
├── src/controller/admin/me/get.ts                # 新設
├── src/routes/admin-router.ts                    # auth・me、mountAdminApi。router.use(adminAuthMiddleware) を外す
├── src/index.ts                                  # DI・mountAdminApi
└── test/...                                      # 後述
infra/terraform/aws/env/{dev,min,prd}/main.tf
scripts/deploy/seed-secrets.sh
.github/actions/run-one-shot-task/action.yml      # command の入力
.github/actions/run-deployed-migration/action.yml # command を渡す
.github/workflows/admin-create.yml                # 新設
.github/workflows/deploy-aws-min.yml              # SECRET_KEYS_JSON
turbo.json                                        # test:ci の env
```

### `packages/domain`

`src/types/admin.ts`:

```typescript
export type Admin = {
  id: number
  avatarUrl: string | null
  email: string
  lastSignedInAt: Date | null
  name: string | null
  createdAt: Date
  updatedAt: Date
}
```

`src/rules/email.ts`:

```typescript
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()
```

`src/index.ts` に、ファイル名の順で足す。

```typescript
export { normalizeEmail } from "./rules/email"
export type { Admin } from "./types/admin"
```

- `rules/source` の次に `rules/email`、`types/admin-stats` の前に `types/admin` を置く
- 実装では、`Admin.email` が小文字にそろえた値であること、`normalizeEmail` を admins の照合と登録の両方で使うことを定義の側に書く

### `packages/db`

`src/drizzle/schema/admin.ts`:

```typescript
import { sql } from "drizzle-orm"
import { check, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"

export const admins = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    avatarUrl: text("avatar_url"),
    email: text("email").notNull(),
    lastSignedInAt: timestamp("last_signed_in_at", { mode: "date", precision: 3 }),
    name: text("name"),
    ...timestamps,
  },
  (table) => [
    check("admins_email_check", sql`${table.email} = lower(btrim(${table.email}))`),
    uniqueIndex("admins_email_key").on(table.email),
  ],
)
```

- `schema/index.ts` の先頭に `export * from "./admin"` を足す
- migration は `pnpm --filter @repo/db db:generate --name add_admins` で作る。最新の `20261015111338_drop_content_sources_tags` の後にできる。テンプレートの `20261015074549_add_admins` はコピーしない（snapshot の連鎖が違う）
- 生成された SQL に `CREATE TABLE "admins"`・`admins_email_check`・`admins_email_key` だけがあることを確かめる（ほかのテーブルの差分が混ざっていたら止める）

`package.json` の `scripts` に `"admin:create": "tsx drizzle/create-admin.ts"` を足す（`@repo/domain` は既に `dependencies` にある）。

`drizzle/create-admin.ts`:

```typescript
/* eslint-disable no-console */
import { parseArgs } from "node:util"

import { normalizeEmail } from "@repo/domain"

import { createDrizzleClient } from "../src/drizzle/client"
import { admins } from "../src/drizzle/schema"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

const findErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof Error)) return undefined
  if ("code" in error && typeof error.code === "string") return error.code
  if ("cause" in error) return findErrorCode(error.cause)
  return undefined
}

const main = async () => {
  const { values } = parseArgs({ options: { email: { type: "string" } } })
  if (!values.email || !EMAIL_PATTERN.test(values.email)) {
    console.error("Usage: admin:create --email <email>")
    process.exit(1)
  }
  const email = normalizeEmail(values.email)

  const db = createDrizzleClient()
  try {
    const [created] = await db
      .insert(admins)
      .values({ email })
      .onConflictDoNothing({ target: admins.email })
      .returning({ id: admins.id })
    console.log(created ? `Created admin (id=${created.id})` : "Admin already exists")
  } finally {
    await db.$disconnect()
  }
}

main().catch((e: unknown) => {
  const code = findErrorCode(e)
  console.error(code ? `Failed to create admin (code=${code})` : "Failed to create admin")
  process.exit(1)
})
```

- 出力に email を出さない（Actions のログに入力は残るが、コマンドの出力にまで重ねない）。失敗したときも `e` をそのまま出さず、cause をたどって見つけた code（Postgres の SQLSTATE や `ECONNREFUSED` など）だけを出す。Drizzle のクエリのエラー（`DrizzleQueryError`）は message に params（= email）を含むため
- 実装では、使い方（ローカルの `pnpm --filter @repo/db admin:create --email ...` と、本番は `admin-create.yml` から流すこと）をファイルの冒頭に書く

`drizzle/seed.ts` に dev 用の admin を足し、`main` で `seedDevUsers` の後に呼ぶ（production では seed 自体がスキップされる）。

```typescript
const DEV_ADMIN_EMAIL = "admin@dev.local"

const seedDevAdmin = async () => {
  await db
    .insert(admins)
    .values({ email: DEV_ADMIN_EMAIL, name: "Admin (dev)" })
    .onConflictDoNothing({ target: admins.email })
  console.log(`Seeded dev admin: ${DEV_ADMIN_EMAIL}`)
}
```

`Dockerfile.migration` のビルドの行に `@repo/db` の依存を足す。今は `@repo/data-warehouse` の依存だけをビルドしており、`@repo/domain` の `dist/` が無いまま `admin:create` が落ちる。

```dockerfile
RUN pnpm turbo run build --filter=@repo/data-warehouse^... --filter=@repo/db^...
```

### `packages/logger`

`src/context.ts` の `LogContext` に `adminId?: number` を足す（`requestId` の前）。

### `packages/schema`

`api-schema/admin/auth.ts` と `api-schema/admin/me.ts` を新設し、`api-schema/index.ts` に `export * from "./admin/auth"`（`./admin/source` の前）と `export * from "./admin/me"`（`./admin/source` の後）を足す。`packages/schema/CLAUDE.md` のコメントのルール（エンドポイントの区切りとスキーマの説明）と、各スキーマに `z.infer` の型を並べる決まりに従う。

```typescript
import { z } from "zod"

import {
  authDevLoginRequestSchema,
  authGoogleRequestSchema,
  authLogoutRequestSchema,
  authLogoutResponseSchema,
  authRefreshRequestSchema,
  authRefreshResponseSchema,
} from "../auth"

export const adminAuthGoogleRequestSchema = authGoogleRequestSchema

export type AdminAuthGoogleRequest = z.infer<typeof adminAuthGoogleRequestSchema>

export const adminAuthGoogleResponseSchema = z.object({
  access_token: z.string(),
  admin: z.object({
    id: z.number(),
    avatar_url: z.string().nullable(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  refresh_token: z.string(),
})

export type AdminAuthGoogleResponse = z.infer<typeof adminAuthGoogleResponseSchema>
```

| エンドポイント | リクエスト | レスポンス |
| --- | --- | --- |
| `POST /api/admin/auth/google` | `adminAuthGoogleRequestSchema`（= `authGoogleRequestSchema`：`code`・`redirect_uri`） | `adminAuthGoogleResponseSchema`（上） |
| `POST /api/admin/auth/dev-login` | `adminAuthDevLoginRequestSchema`（= `authDevLoginRequestSchema`：`email`） | `adminAuthDevLoginResponseSchema`（google と同じ形を書き下す） |
| `POST /api/admin/auth/refresh` | `adminAuthRefreshRequestSchema`（= `authRefreshRequestSchema`） | `adminAuthRefreshResponseSchema`（= `authRefreshResponseSchema`） |
| `POST /api/admin/auth/logout` | `adminAuthLogoutRequestSchema`（= `authLogoutRequestSchema`） | `adminAuthLogoutResponseSchema`（= `authLogoutResponseSchema`：`{ message: "OK" }`） |
| `GET /api/admin/me` | なし | `getAdminMeResponseSchema`（下） |

- dev-login のレスポンスは google と同じ形でも、`packages/schema/CLAUDE.md` の「共通スキーマは作らない」に従って書き下す

`api-schema/admin/me.ts`:

```typescript
import { z } from "zod"

export const getAdminMeResponseSchema = z.object({
  id: z.number(),
  avatar_url: z.string().nullable(),
  email: z.string(),
  last_signed_in_at: z.string().nullable(),
  name: z.string().nullable(),
  created_at: z.string(),
})

export type GetAdminMeResponse = z.infer<typeof getAdminMeResponseSchema>
```

### `apps/api` の env と鍵

`src/env.ts`：`ADMIN_API_TOKEN` と `ADMIN_USE_DUMMY` を消し、JWT の鍵の並び（`JWT_ACCESS_SECRET` の後）に足す。

```typescript
  JWT_ADMIN_ACCESS_SECRET: z.string().min(32),

  JWT_ADMIN_REFRESH_SECRET: z.string().min(32),
```

`apiEnvSchema` の末尾で、JWT の鍵 4 つのうち同じ値があれば起動を止める。

```typescript
  .superRefine((env, ctx) => {
    const keys = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_ADMIN_ACCESS_SECRET", "JWT_ADMIN_REFRESH_SECRET"] as const
    keys.forEach((key, index) => {
      const duplicate = keys.slice(0, index).find((other) => env[other] === env[key])
      if (duplicate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${key} は ${duplicate} と別の値にする`, path: [key] })
      }
    })
  })
```

- 実装では、写し間違えたときに何が起きるか（user のトークンが admin の API を通る、refresh token が access token として通る）を、この検査の側に書く

```bash
cd apps/api
pnpm exec dotenvx set JWT_ADMIN_ACCESS_SECRET "$(openssl rand -hex 32)" -f .env.local
pnpm exec dotenvx set JWT_ADMIN_REFRESH_SECRET "$(openssl rand -hex 32)" -f .env.local
```

- `.env.local` の `ADMIN_API_TOKEN=` の行を消す（暗号化された 1 行なので、行ごと消してよい）
- `test/vitest.setup.ts`：`ADMIN_API_TOKEN` の既定値を消し、`JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET` に 32 文字以上の既定値（一般ユーザーの鍵の既定値と別の値。例 `test-jwt-admin-access-secret-at-least-32-chars`）を足す
- `turbo.json` の `test:ci` の `env` に `JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET` を足す（名前の順）

### `lib/admin-jwt.ts`

```typescript
import { randomUUID } from "node:crypto"

import jwt, { type Secret, type SignOptions } from "jsonwebtoken"

import { env } from "../env"

const JWT_ADMIN_ACCESS_SECRET: Secret = env.JWT_ADMIN_ACCESS_SECRET
const JWT_ADMIN_REFRESH_SECRET: Secret = env.JWT_ADMIN_REFRESH_SECRET
const JWT_ACCESS_EXPIRATION = env.JWT_ACCESS_EXPIRATION as SignOptions["expiresIn"]
const JWT_REFRESH_EXPIRATION = env.JWT_REFRESH_EXPIRATION as SignOptions["expiresIn"]

export type AdminAccessTokenPayload = {
  adminId: number
  exp?: number
  iat?: number
}

export type AdminRefreshTokenPayload = {
  adminId: number
  exp?: number
  iat?: number
  jti: string
}

export const generateAdminAccessToken = (adminId: number): string =>
  jwt.sign({ adminId }, JWT_ADMIN_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRATION })

export const generateAdminRefreshToken = (adminId: number): { jti: string; token: string } => {
  const jti = randomUUID()
  const token = jwt.sign({ adminId, jti }, JWT_ADMIN_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRATION })
  return { jti, token }
}

export const verifyAdminAccessToken = (token: string): AdminAccessTokenPayload | null => {
  try {
    const payload = jwt.verify(token, JWT_ADMIN_ACCESS_SECRET)
    if (typeof payload !== "object" || typeof payload.adminId !== "number" || "jti" in payload) return null
    return payload as AdminAccessTokenPayload
  } catch {
    return null
  }
}

export const verifyAdminRefreshToken = (token: string): AdminRefreshTokenPayload | null => {
  try {
    const payload = jwt.verify(token, JWT_ADMIN_REFRESH_SECRET)
    if (typeof payload !== "object" || typeof payload.adminId !== "number" || typeof payload.jti !== "string") {
      return null
    }
    return payload as AdminRefreshTokenPayload
  } catch {
    return null
  }
}
```

- 実装では、`verifyAdminAccessToken` が payload を確かめる理由（鍵を写し間違えて user のトークンや refresh token が署名を通っても落とす）を、この関数の側に書く

### パスの判定

`middleware/auth.ts` の `matchesPathPrefix` を `lib/is-path-under-prefix.ts` に移し、boolean を返す関数の命名（`is` で始める）に合わせて `isPathUnderPrefix` にする。小文字にそろえて比べる。

```typescript
export const isPathUnderPrefix = (path: string, prefix: string): boolean => {
  const normalizedPath = path.toLowerCase()
  const normalizedPrefix = prefix.toLowerCase()
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)
}
```

- 実装では、今の `matchesPathPrefix` の説明（segment 境界の例）に、大文字小文字を区別しない理由（Express 5 の mount と Router が区別しない）を足して、この関数の側に書く

`const/index.ts`:

```typescript
export const PUBLIC_PATHS: readonly string[] = [
  "/api/auth/github",
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/health",
  "/api/memo",
  ...DEV_ONLY_PUBLIC_PATHS,
]

export const ADMIN_PATH_PREFIX = "/api/admin"

const ADMIN_DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/auth/dev-login"]
  : []

export const ADMIN_PUBLIC_PATHS: readonly string[] = [
  "/auth/google",
  "/auth/logout",
  "/auth/refresh",
  ...ADMIN_DEV_ONLY_PUBLIC_PATHS,
]
```

- `PUBLIC_PATHS` から `/api/admin` とその説明を消す。`DEV_ONLY_PUBLIC_PATHS` は今のまま
- `ADMIN_PUBLIC_PATHS` は `ADMIN_PATH_PREFIX` からの相対。logout が公開のパスなのは、refresh token で本人を確かめるので access token が切れていても呼べるようにするため（定義の側に書く）

`middleware/auth.ts` の先頭:

```typescript
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (isPathUnderPrefix(req.path, ADMIN_PATH_PREFIX)) {
    return next()
  }

  if (PUBLIC_PATHS.some(p => isPathUnderPrefix(req.path, p))) {
```

- admin のパスは `adminAuthMiddleware` が認証する。ここで user のトークンとして検証すると admin のトークンが 401 になる。大文字小文字の違うパスもここで外れるが、admin の Router に届く前に mount の中の `adminAuthMiddleware` を必ず通る。この理由は `authMiddleware` の分岐の側に 1 か所だけ書く

### `middleware/admin-auth.ts`

今の `X-Admin-Token` の検査（`ADMIN_TOKEN_HEADER`・`isAdminTokenValid`）を、Bearer の admin の JWT の検査に置き換える。拒否したときに method と path を warn に残す作りは残す。

```typescript
import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"
import { logContext, logger } from "@repo/logger"

import { ADMIN_PUBLIC_PATHS } from "../const"
import { verifyAdminAccessToken } from "../lib/admin-jwt"

export interface AdminAuthRequest extends Request {
  adminId?: number
}

const isAdminPublicPath = (path: string): boolean => {
  const normalizedPath = path.toLowerCase().replace(/\/$/, "")
  return ADMIN_PUBLIC_PATHS.some(p => p.toLowerCase() === normalizedPath)
}

const rejectAdminRequest = (req: Request, res: Response, error: string) => {
  logger.warn("Admin authentication failed", { method: req.method, path: `${req.baseUrl}${req.path}` })
  const errorResponse: ErrorResponse = { error, status_code: 401 }
  return res.status(401).json(errorResponse)
}

export const adminAuthMiddleware = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
  if (isAdminPublicPath(req.path)) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return rejectAdminRequest(req, res, "No token provided")
  }

  const payload = verifyAdminAccessToken(authHeader.substring(7))
  if (!payload) {
    return rejectAdminRequest(req, res, "Invalid or expired token")
  }

  req.adminId = payload.adminId
  return logContext.run({ ...logContext.getStore(), adminId: payload.adminId }, () => next())
}
```

- 公開のパスは完全一致で比べる（大文字小文字と末尾の `/` は区別しない。下の階層は公開しない）
- `req.path` は mount からの相対（`/auth/google` など）
- `logContext.run` で `adminId` を足すのは、`requestLogger` が全体に掛かっていて、ここより先に動く（`userId` しか積めない）ため。以降のログに `adminId` が付く
- 上の 3 つの理由は実装の側（関数の説明）に書く

### `middleware/request-logger.ts`

完了のログ（`res.on("finish")`）に `adminId: (req as AdminAuthRequest).adminId` を足す（キーの順で `duration` の前）。`adminAuthMiddleware` はこのミドルウェアより後に動くので、終わった時点で読む。

### Google のクライアント

`client/google-oauth.ts`:

- `googleUserInfoResponseSchema` に `verified_email: z.boolean().optional()` を足す
- `GoogleUserInfo` に `emailVerified: boolean` を足し、`data.verified_email === true` を入れる
- 必須にしない。Google が項目を返さなかったときに、一般ユーザーの `POST /api/auth/google` まで 500 にしないため。無いときは未確認として扱う
- 既存のテスト（`test/controller/auth/google.test.ts`・`test/service/auth-service/authenticateWithGoogle.test.ts`）の `GoogleUserInfo` のモックに `emailVerified: true` を足す

### Repository

`repository/admin-repository.ts`:

```typescript
import { Admin } from "@repo/domain"

export type RecordAdminSignInInput = {
  profile?: { avatarUrl: string | null; name: string }
  signedInAt: Date
}

export interface AdminRepository {
  findByEmail(email: string): Promise<Admin | null>
  findById(id: number): Promise<Admin | null>
  recordSignIn(id: number, data: RecordAdminSignInInput): Promise<Admin>
}
```

- `profile` は Google から取った名前とアイコン。dev ログインでは渡さず、今の値のままにする（型の側に書く）
- `repository/drizzle/admin-repository.ts` の `DrizzleAdminRepository` はテンプレートの同じファイルを写す（`DrizzleUserRepository` と同じ形。`_toDomainAdmin` で row → domain。`recordSignIn` は `last_signed_in_at` と、`profile` があれば `name` / `avatar_url` を更新して `returning()`）
- `repository/index.ts` と `repository/drizzle/index.ts` の先頭に `export * from "./admin-repository"` を足す

`repository/redis/refresh-token-repository.ts`：キーの接頭辞をコンストラクタで受け取り、2 つのキーの両方に掛ける。

```typescript
export class IoRedisRefreshTokenRepository implements RefreshTokenRepository {
  private _keyPrefix: string
  private _redis: Redis

  constructor(redis: Redis, keyPrefix = "refresh_token") {
    this._keyPrefix = keyPrefix
    this._redis = redis
  }

  private _keyOf(jti: string): string {
    return `${this._keyPrefix}:${jti}`
  }

  private _rotatedKeyOf(jti: string): string {
    return `${this._keyPrefix}_rotated:${jti}`
  }
}
```

- 今のモジュールの関数 `keyOf` / `rotatedKeyOf` をメソッドにし、`save` / `findUserId` / `delete` / `saveRotatedTokens` / `findRotatedTokens` から使う。既定の接頭辞で、今のキー（`refresh_token:{jti}` / `refresh_token_rotated:{jti}`）と同じになる
- admin 用は `index.ts` で `new IoRedisRefreshTokenRepository(redis, "admin_refresh_token")` として作る

### Service

`service/auth-service.ts`：

- `TokenGenerators` / `RefreshVerifier` と `REFRESH_TTL_SECONDS` を export する（`RefreshTokensSuccess` は既に export している）
- `refreshTokens` と `reuseRotatedTokens` の `repo.userRepository`（`findById` だけを使っている）を、`repo.tokenOwnerRepository` にする

```typescript
export type TokenOwnerRepository = {
  findById(id: number): Promise<{ id: number } | null>
}

export const refreshTokens = async (
  input: { refreshToken: string },
  repo: { refreshTokenRepository: RefreshTokenRepository; tokenOwnerRepository: TokenOwnerRepository },
  verifier: RefreshVerifier,
  generators: TokenGenerators
): Promise<Result<RefreshTokensSuccess>> => {
```

- 一般ユーザーの `AuthRefreshController` は `{ refreshTokenRepository, tokenOwnerRepository: this._userRepository }` を渡す。admin は `adminRepository` を渡す（`UserRepository` も `AdminRepository` も `findById` を持つので、そのまま渡せる）
- 持ち主が居ないときの 401（jti を消す）と、猶予の再利用は今のまま。ログの項目名とエラーの文言の `user` は、持ち主の意味に読み替えられる範囲なので変えない
- `TokenOwnerRepository` を受け取る理由（admin の refresh でも同じ持ち主の確かめと猶予を使う）は型の側に書く

`service/admin-auth-service.ts`:

```typescript
import { Admin, normalizeEmail } from "@repo/domain"
import { err, forbiddenError, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { type IGoogleOAuthClient } from "../client/google-oauth"
import { AdminRepository, RefreshTokenRepository } from "../repository"

import { REFRESH_TTL_SECONDS, type TokenGenerators } from "./auth-service"

export type AuthenticateAdminSuccess = {
  accessToken: string
  admin: Admin
  refreshToken: string
}

const DEV_ADMIN_EMAIL_DOMAIN = "@dev.local"

type Repositories = {
  adminRepository: AdminRepository
  refreshTokenRepository: RefreshTokenRepository
}

const issueAdminTokens = async (
  adminId: number,
  repo: { refreshTokenRepository: RefreshTokenRepository },
  tokenGenerators: TokenGenerators,
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = tokenGenerators.generateAccessToken(adminId)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(adminId)
  await repo.refreshTokenRepository.save(jti, adminId, REFRESH_TTL_SECONDS)
  return { accessToken, refreshToken }
}

export const authenticateAdminWithGoogle = async (
  input: { code: string; redirectUri: string },
  repo: Repositories,
  googleAuthClient: IGoogleOAuthClient,
  tokenGenerators: TokenGenerators,
): Promise<Result<AuthenticateAdminSuccess>> => {
  logger.info("AdminAuthService: Starting Google authentication")

  const googleUser = await googleAuthClient.getUserInfo(input.code, input.redirectUri)
  if (!googleUser.emailVerified) {
    logger.info("AdminAuthService: Google email is not verified", { googleId: googleUser.id })
    return err(forbiddenError("Google email is not verified"))
  }

  const admin = await repo.adminRepository.findByEmail(normalizeEmail(googleUser.email))
  if (!admin) {
    logger.info("AdminAuthService: Google account is not an admin", { googleId: googleUser.id })
    return err(forbiddenError("Not an admin"))
  }

  const signedInAdmin = await repo.adminRepository.recordSignIn(admin.id, {
    profile: { avatarUrl: googleUser.picture ?? null, name: googleUser.name },
    signedInAt: new Date(),
  })
  const tokens = await issueAdminTokens(admin.id, repo, tokenGenerators)

  logger.info("AdminAuthService: Admin signed in", { adminId: admin.id })

  return ok({ ...tokens, admin: signedInAdmin })
}

export const loginAsDevAdmin = async (
  input: { email: string },
  repo: Repositories,
  tokenGenerators: TokenGenerators,
): Promise<Result<AuthenticateAdminSuccess>> => {
  const email = normalizeEmail(input.email)
  if (!email.endsWith(DEV_ADMIN_EMAIL_DOMAIN)) {
    return err(notFoundError("Dev admin not found"))
  }

  const admin = await repo.adminRepository.findByEmail(email)
  if (!admin) {
    return err(notFoundError("Dev admin not found"))
  }

  const signedInAdmin = await repo.adminRepository.recordSignIn(admin.id, { signedInAt: new Date() })
  const tokens = await issueAdminTokens(admin.id, repo, tokenGenerators)

  logger.info("AdminAuthService: dev-login success", { adminId: admin.id })

  return ok({ ...tokens, admin: signedInAdmin })
}
```

- email は PII なのでログに出さない（`googleId` だけ）
- `admins` の行はここで作らない（事前登録制）
- dev ログインは `@dev.local` の admin しか受け付けない。production のガードは呼び出し側（index.ts・router・controller・`ADMIN_PUBLIC_PATHS`）で行う
- テンプレートの `refreshAdminTokens` は作らない（[README](../README.md#refresh-token-の保存と猶予)）
- 上の理由は、それぞれの関数の説明に書く

`service/admin-service.ts`:

```typescript
import { Admin } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { AdminRepository } from "../repository"

export const getAdminById = async (
  adminId: number,
  repo: { adminRepository: AdminRepository },
): Promise<Result<Admin>> => {
  const admin = await repo.adminRepository.findById(adminId)
  if (!admin) {
    logger.debug("AdminService: Admin not found", { adminId })
    return err(unauthorizedError("Admin no longer exists"))
  }
  return ok(admin)
}
```

- 無いときは 404 ではなく 401。トークンの admin が `admins` から消されたときで、admin の画面はサインイン画面に戻す（関数の説明に書く）

`service/index.ts` に、ファイル名の順で `export * as adminAuth from "./admin-auth-service"`（`adminPassage` の前）と `export * as admin from "./admin-service"`（`adminPassage` と `adminStats` の間）を足す。

### Controller / Router / DI

| Controller | 処理 |
| --- | --- |
| `controller/admin/auth/google.ts`（`AdminAuthGoogleController`） | `service.adminAuth.authenticateAdminWithGoogle` に、admin 用の発行関数（`generateAdminAccessToken` / `generateAdminRefreshToken`）と admin 用の refresh token の Repository を渡す。レスポンスは `adminAuthGoogleResponseSchema` |
| `controller/admin/auth/refresh.ts`（`AdminAuthRefreshController`） | `service.auth.refreshTokens` に、admin 用の Repository・検証関数・発行関数を渡す（下） |
| `controller/admin/auth/logout.ts`（`AdminAuthLogoutController`） | `service.auth.logout` に、admin 用の検証関数（`verifyAdminRefreshToken` を `{ jti, userId: adminId }` に詰め替える）と Repository を渡す。無効なトークンでも 200（今の logout と同じ） |
| `controller/admin/auth/dev-login.ts`（`AdminAuthDevLoginController`） | production なら 404。`service.adminAuth.loginAsDevAdmin`。レスポンスは `adminAuthDevLoginResponseSchema` |
| `controller/admin/me/get.ts`（`AdminMeGetController`） | `req.adminId!` で `service.admin.getAdminById`。レスポンスは `getAdminMeResponseSchema`（日時は `toISOString()`、`last_signed_in_at` は無ければ null） |

- google・logout・dev-login・me はテンプレートの同じファイルを写す。dev-login の多重ガード（index.ts・router・controller・`ADMIN_PUBLIC_PATHS`）の説明は、テンプレートと同じく controller の入口に 1 か所だけ書く

`controller/admin/auth/refresh.ts`（テンプレートの `refreshAdminTokens` の代わりに `service.auth.refreshTokens` を呼ぶ）:

```typescript
export class AdminAuthRefreshController {
  constructor(
    private _adminRepository: AdminRepository,
    private _adminRefreshTokenRepository: RefreshTokenRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    logger.info("AdminAuthRefreshController: Rotating refresh token")

    const { refresh_token: refreshToken } = parseRequest(adminAuthRefreshRequestSchema, req.body)

    const result = await service.auth.refreshTokens(
      { refreshToken },
      { refreshTokenRepository: this._adminRefreshTokenRepository, tokenOwnerRepository: this._adminRepository },
      (token) => {
        const payload = verifyAdminRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.adminId } : null
      },
      { generateAccessToken: generateAdminAccessToken, generateRefreshToken: generateAdminRefreshToken },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(adminAuthRefreshResponseSchema, {
      access_token: result.value.accessToken,
      refresh_token: result.value.refreshToken,
    })

    return res.status(200).json(response)
  }
}
```

`routes/admin-router.ts`：

- `router.use(adminAuthMiddleware)` を外す。認証は `mountAdminApi` で mount の中に置く
- `AdminRouterControllers` に `auth` と `me` を足す。既存の `source` / `passage` / `stats` / `tag` / `user` のネストとルートはそのまま。キーは `auth`・`source`・`me`・`passage`・`stats`・`tag`・`user` の順に並べる

```typescript
type AdminRouterControllers = {
  auth?: {
    devLogin?: AdminAuthDevLoginController
    google?: AdminAuthGoogleController
    logout?: AdminAuthLogoutController
    refresh?: AdminAuthRefreshController
  }
  me?: {
    get?: AdminMeGetController
  }
}

export const adminRouter = (controllers: AdminRouterControllers): Router => {
  const router = Router()

  const auth = controllers.auth ?? {}

  if (auth.google) {
    const controller = auth.google
    router.post("/auth/google", async (req, res) => controller.execute(req, res))
  }

  const me = controllers.me ?? {}

  if (me.get) {
    const controller = me.get
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  return router
}

export const mountAdminApi = (app: Express, router: Router): void => {
  app.use(ADMIN_PATH_PREFIX, adminAuthMiddleware, router)
}
```

- `auth.devLogin`（`POST /auth/dev-login`）・`auth.refresh`（`POST /auth/refresh`）・`auth.logout`（`POST /auth/logout`）も同じ形で、`auth.google` の後に登録する。`me` の後に既存のルートを今の順で続ける
- 各ルートの上の `GET /api/admin/...` の説明は、今の router と同じ書き方にそろえる
- `adminRouter` の説明の「/api/admin は PUBLIC_PATHS に入っていて…必ずこのルーターに足す」を、「`/api/admin` の下のルートは必ずこのルーターに足し、`mountAdminApi` で mount する（`adminAuthMiddleware` を通すため）」に直す
- `mountAdminApi` の説明に、admin のミドルウェアを全体ではなく mount の中に置く理由（Express 5 の大文字小文字）と、index.ts とテストで同じ組み方にするためにまとめていることを書く

`src/index.ts`:

```typescript
const adminRepository = new DrizzleAdminRepository(db)
const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(redis, "admin_refresh_token")

const adminAuthDevLoginController = process.env.NODE_ENV !== "production"
  ? new AdminAuthDevLoginController(adminRepository, adminRefreshTokenRepository)
  : undefined
const adminAuthGoogleController = new AdminAuthGoogleController(adminRepository, adminRefreshTokenRepository, googleOAuthClient)
const adminAuthLogoutController = new AdminAuthLogoutController(adminRefreshTokenRepository)
const adminAuthRefreshController = new AdminAuthRefreshController(adminRepository, adminRefreshTokenRepository)
const adminMeGetController = new AdminMeGetController(adminRepository)

mountAdminApi(
  app,
  adminRouter({
    auth: {
      devLogin: adminAuthDevLoginController,
      google: adminAuthGoogleController,
      logout: adminAuthLogoutController,
      refresh: adminAuthRefreshController,
    },
    source: {
      create: adminSourceCreateController,
      detail: adminSourceDetailController,
      detectLicense: adminSourceDetectLicenseController,
      list: adminSourceListController,
      update: adminSourceUpdateController,
    },
    me: { get: adminMeGetController },
    passage: {
      detail: adminPassageDetailController,
      list: adminPassageListController,
      publish: adminPassagePublishController,
      regenerate: adminPassageRegenerateController,
      regenerateAudio: adminPassageRegenerateAudioController,
      reject: adminPassageRejectController,
      resolveAttention: adminPassageResolveAttentionController,
      restore: adminPassageRestoreController,
      retryAudio: adminPassageRetryAudioController,
      unpublish: adminPassageUnpublishController,
      update: adminPassageUpdateController,
    },
    stats: {
      overview: adminStatsOverviewController,
      passageDetail: adminPassageStatsDetailController,
      passageList: adminPassageStatsListController,
    },
    tag: {
      create: adminTagCreateController,
      delete: adminTagDeleteController,
      list: adminTagListController,
      update: adminTagUpdateController,
    },
    user: {
      attempts: adminUserAttemptsController,
      calendar: adminUserCalendarController,
      detail: adminUserDetailController,
      list: adminUserListController,
    },
  }),
)
```

- Repository は今の `adminStatsRepository` などの並びに、Controller は「Admin のソース管理 Controller」の前に置く
- `mountAdminApi` は今の `app.use("/api/admin", adminRouter(...))` と同じ位置（`apiRateLimiter` の後）。その上の説明（「`/api/admin` は PUBLIC_PATHS に入っているので…」）は消す
- 一般ユーザーの `AuthRefreshController` には `userRepository` を渡したまま（中で `tokenOwnerRepository` として service に渡す）

### `X-Admin-Token` の削除

| 対象 | 対応 |
| --- | --- |
| `src/lib/admin-token.ts`・`test/lib/admin-token.test.ts` | 削除 |
| `src/middleware/admin-auth.ts` の `ADMIN_TOKEN_HEADER` | 削除（上で置き換え） |
| `src/env.ts` の `ADMIN_API_TOKEN` | 削除 |
| `.env.local` / `test/vitest.setup.ts` の `ADMIN_API_TOKEN` | 削除 |
| 既存の admin のテスト 23 ファイル（147 か所） | admin の JWT に書き換える（[動作確認](#既存の-admin-のテストの書き換え)） |

`grep -rn "ADMIN_API_TOKEN\|X-Admin-Token\|x-admin-token\|ADMIN_TOKEN_HEADER\|ADMIN_USE_DUMMY" apps/api` が何も返さないこと。

### Terraform

`env/{dev,min,prd}/main.tf` に、既存の JWT の鍵と同じ形で足す。

```hcl
resource "random_password" "jwt_admin_access_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

resource "random_password" "jwt_admin_refresh_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}
```

`module "app_secrets"` の `initial_values` の JWT の行:

```hcl
    JWT_ACCESS_SECRET        = random_password.jwt_access_secret.result
    JWT_REFRESH_SECRET       = random_password.jwt_refresh_secret.result
    JWT_ADMIN_ACCESS_SECRET  = random_password.jwt_admin_access_secret.result
    JWT_ADMIN_REFRESH_SECRET = random_password.jwt_admin_refresh_secret.result
    JWT_ACCESS_EXPIRATION    = "15m"
    JWT_REFRESH_EXPIRATION   = "30d"
```

- `random_password` は今の `jwt_access_secret` / `jwt_refresh_secret` の後に置く。その上の説明（鍵が変わると全員がログアウトする・`ignore_changes` で守る・rotate は `terraform taint`）は admin の鍵にも当てはまるので、「Access / Refresh」を「一般ユーザーと admin の Access / Refresh」に直す
- `initial_values` の残りのキー（`DB_PASSWORD`・`REDIS_*` など）は今のまま
- dev / prd は `local.secret_keys.api` に `"JWT_ADMIN_ACCESS_SECRET", "JWT_ADMIN_REFRESH_SECRET"` を足す（JWT の鍵の行の次）
- min の api は Lambda なので、`.github/workflows/deploy-aws-min.yml` の `SECRET_KEYS_JSON` に足す（名前の順で `JWT_ACCESS_SECRET` の後）
- `initial_values` に足すのは新しく作る環境のため。既存の環境は `ignore_changes` で反映されないので `seed-secrets.sh` で入れる。この事情は `initial_values` の上の今の説明に 1 行足す

### `scripts/deploy/seed-secrets.sh`

先に、今の secret の読み込みの失敗を止まるように変える。

```bash
CURRENT=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --query SecretString --output text) || {
  echo "ERROR: failed to read ${SECRET_NAME}. Run terraform apply first, or check AWS credentials" >&2
  exit 1
}
```

外部の secret の後に、admin の鍵を無いときだけ生成して足す。

```bash
echo "==> Admin JWT secrets (generated if missing)"
for key in JWT_ADMIN_ACCESS_SECRET JWT_ADMIN_REFRESH_SECRET; do
  if [ -z "$(echo "$CURRENT" | jq -r --arg k "$key" '.[$k] // empty')" ]; then
    add_kv "$key" "$(openssl rand -hex 32)" "generated"
  else
    echo "  - $key (exists, kept)"
  fi
done
```

- 依存コマンドの確認に `openssl` を足す
- 冒頭の説明の「Terraform が管理する JWT_* は触らない」に、admin の鍵は無いときだけ生成すること（あれば触らない。作り直すと全 admin のセッションが切れる）を足す。`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` の説明に「admin の Google のサインインが使う」を足す
- 読み込みの失敗で止める理由（鍵を必ず生成するようになると、失敗したときに生成した 2 つだけで secret 全体を上書きする）は、読み込みの側に書く

### admin の登録 workflow

`.github/actions/run-one-shot-task/action.yml` に `command`（JSON の配列の文字列。省略可）の入力を足し、指定されたらコンテナの起動コマンドを差し替える。コンテナの名前はタスク定義の family と同じ（ecs-workload module の決まり）。

```yaml
  command:
    description: コンテナの起動コマンドを差し替える JSON の配列 (例 ["pnpm","--silent","--dir","packages/db","admin:create","--email","a@example.com"])。省略したらタスク定義のまま
    required: false
    default: ""
```

「Run task and wait for it to stop」の `env` に `COMMAND: ${{ inputs.command }}` を足し、`run-task` に渡す。

```bash
OVERRIDES_ARGS=()
if [ -n "${COMMAND}" ]; then
  OVERRIDES_ARGS=(--overrides "$(jq -cn --arg name "${FAMILY}" --argjson command "${COMMAND}" \
    '{containerOverrides: [{name: $name, command: $command}]}')")
fi
RUN_RESULT=$(aws ecs run-task \
  --cluster "${CLUSTER}" \
  --task-definition "${TASK_DEFINITION}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=${ASSIGN_PUBLIC_IP}}" \
  "${OVERRIDES_ARGS[@]}")
```

`.github/actions/run-deployed-migration/action.yml` にも `command`（省略可）を足し、`run-one-shot-task` に渡す。

`.github/workflows/admin-create.yml`:

```yaml
name: Admin Create

on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        type: choice
        options:
          - dev
          - min
          - prd
      email:
        description: "admin にする Google アカウントの email"
        required: true
        type: string

concurrency:
  group: deploy-aws-${{ inputs.environment }}
  cancel-in-progress: false

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: ap-northeast-1

jobs:
  create:
    name: Create admin (${{ inputs.environment }})
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v4

      - name: Build command
        id: command
        env:
          EMAIL: ${{ inputs.email }}
        run: |
          set -euo pipefail
          if ! [[ "${EMAIL}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
            echo "::error::Invalid email"
            exit 1
          fi
          echo "command=$(jq -cn --arg email "${EMAIL}" '["pnpm","--silent","--dir","packages/db","admin:create","--email",$email]')" >> "$GITHUB_OUTPUT"

      - name: Configure AWS credentials with OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Run admin:create
        uses: ./.github/actions/run-deployed-migration
        with:
          environment: ${{ inputs.environment }}
          task-definition: tech-english-${{ inputs.environment }}-migration
          command: ${{ steps.command.outputs.command }}
```

- 実装では、冒頭に workflow の役目（最後に deploy した migration のイメージで `admin:create` を流す。登録済みなら何もしない）を、`postgres-migrate.yml` と同じ形で書く。入力を `env` で渡してシェルに直接展開しない理由（コマンドの注入）と、email の正規表現が `$` や `'` を通さないことは、その step の側に書く
- `concurrency` は deploy と同じ group にする（`postgres-migrate.yml` と同じ）
- 起動コマンドは `pnpm --silent --dir packages/db admin:create`。pnpm が出す起動行（`> tsx drizzle/create-admin.ts "--email" "..."`）は CloudWatch Logs に入り、Actions のログにも写る。pnpm 9 は `--filter` だと `--silent` でも起動行を出すので、`--dir`（migration イメージの WORKDIR の `/app` からの相対）で動かす。この理由は Build command の step の側に書く

### ドキュメント

| ファイル | 直すこと |
| --- | --- |
| `apps/api/CLAUDE.md` | 「Admin API 設計方針」：認証は Bearer の admin の JWT（`adminAuthMiddleware`、`lib/admin-jwt.ts`）、`mountAdminApi` で mount の中に置く理由、`ADMIN_PUBLIC_PATHS`、`/api/admin` の下のルートは必ず admin-router に足す、Service に `admin-auth-service` / `admin-service`、refresh は `service.auth.refreshTokens` に `adminRepository` を渡す。`ADMIN_USE_DUMMY` と「管理者が増えたら GitHub ログイン + 権限管理に移行する」の行を消す。「環境変数」の `ADMIN_API_TOKEN` の段落を `JWT_ADMIN_ACCESS_SECRET` / `JWT_ADMIN_REFRESH_SECRET`（必須・32 文字以上・JWT の鍵 4 つは別の値）に置き換える |
| `docs/onboarding/auth.md` | 「Admin API（`/api/admin/`）は現時点は認証なし」を消し、「admin の認証」の節を足す（[README の admin 認証](../README.md#admin-認証) の表・proxy での更新・関連ファイルを短くまとめ、詳細は admin-template の README へリンク） |
| `docs/spec/question-generation/README.md` | 「管理画面のアクセス制御」の見出しは残し、中身を「admin-template で `admins` テーブル + admin 専用の JWT + Google のサインインに置き換えた。Basic 認証と `X-Admin-Token` は廃止」とリンクに書き換える。「必要な API」の「admin 向け（`X-Admin-Token` 必須）」を「admin 向け（admin の access token が必要）」にする |
| `docs/spec/github-auth/README.md` | MVP 対象外の「admin の GitHub ログインと権限管理（`users.role`）」を、「admin のログインは admin-template で `admins` テーブル + Google にした。権限（role）は admin-template の MVP 対象外」に直す |
| `docs/spec/admin-users/README.md` | 関連 spec の「（Basic 認証 + `X-Admin-Token`）」、個人情報の扱いの「Basic 認証と `X-Admin-Token` で守られている」、必要な API の「`X-Admin-Token` が必要」を admin のサインイン（admin-template へのリンク）に直す。MVP 対象外の「管理者ごとのログイン・権限」から「ログイン」を外す |
| `docs/spec/admin-users/deferred-user-actions.md` | 対象範囲の「管理者の見分け」の MVP の列を「✅（admin-template の admin ごとのサインイン）」、着手後を「役割（role）」にする。「管理者の操作の記録と権限」の「GitHub ログインと `users.role`」の行を、`admins` に役割を足す形に直す |
| `docs/spec/source-tags/README.md`・`docs/spec/admin-dashboard/README.md` | 「（Basic 認証 + `X-Admin-Token`）」「`X-Admin-Token` が必要」の 1 行を admin のサインインに直す |
| `docs/deploy/prd.md` | 「Phase 5: GitHub OAuth App」の後に「Google OAuth クライアント（admin 用）」を足す（[README の手順](../README.md#本番の-google-oauth-クライアント)）。Phase 7 に、admin の JWT の鍵は `seed-secrets.sh` が無ければ生成すること、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を export することを足す。Phase 8 の後に「admin を登録する」（Admin Create を流す）を足す。既存の環境への反映の順番（下）も書く |
| `docs/setup/infra.md` | 「9. seed-secrets.sh で外部 Secret を投入」に、admin の JWT の鍵が無ければ生成されることを足す |

完了した spec の step（`question-generation/tasks/step4-api-admin-auth.md` など）は当時の記録なので書き換えない。

### 既存の環境への反映の順番

step5 を main に入れた後、deploy の前に環境ごとに次を行う（`docs/deploy/prd.md` にも書く）。

1. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を export して `scripts/deploy/seed-secrets.sh <env>` を流す。admin の鍵が Secrets Manager に入る
2. Terraform を apply する（dev / prd は ECS の `secret_keys` が増える）
3. deploy する（migration で `admins` ができ、api が新しい鍵を読む）
4. 「Admin Create」で admin を登録する

1 より先に 2 / 3 を行うと、ECS のタスクが起動できない（Secrets Manager に無いキーを参照するため）。min は deploy の検査（`missing keys`）で止まる。

## 動作確認

### テスト

`test/controller/helper.ts` に `createTestAdmin()`（`admins` に行を作り、admin の access token を返す）を足す。テンプレートの同じ関数を写す。

| テスト | 種類 | 確かめること |
| --- | --- | --- |
| `test/repository/admin-repository.test.ts`（新設） | 実 DB | `findByEmail` / `findById` / `recordSignIn`（profile ありは 3 列、なしは `last_signed_in_at` だけが変わる。`updated_at` も変わる）。大文字や前後に空白のある email は CHECK 制約で insert できない |
| `test/repository/refresh-token-repository.test.ts`（追加） | 実 Redis | 接頭辞 `admin_refresh_token` で作ると、キーが `admin_refresh_token:{jti}` と `admin_refresh_token_rotated:{jti}` になる。既定の接頭辞のキーとは混ざらない（同じ jti で両方に保存しても、互いに読めない・消えない） |
| `test/service/auth-service/refreshTokens.test.ts`（変更） | ユニット | `repo` のキーを `tokenOwnerRepository` に変える。今のテストはそのまま通る |
| `test/service/admin-auth-service/authenticateAdminWithGoogle.test.ts`（新設） | ユニット | 正常系：登録済み → トークンと更新済みの admin、email の大文字小文字の違いでも一致する。異常系：未確認の email → 403 / 未登録 → 403（どちらもトークンを発行せず、`recordSignIn` を呼ばない） |
| `test/service/admin-auth-service/loginAsDevAdmin.test.ts`（新設） | ユニット | 正常系：`@dev.local` の admin → トークン、`last_signed_in_at` だけ更新。異常系：`@dev.local` 以外の登録済みの admin → 404 / 未登録 → 404 |
| `test/service/admin-service/getAdminById.test.ts`（新設） | ユニット | 正常系：居れば admin。異常系：居なければ 401 |
| `test/controller/admin/auth/google.test.ts`（新設） | インテグレーション | 正常系：200・DB の 3 列・Redis の `admin_refresh_token:{jti}`。異常系：未登録 403 / 未確認 403（Redis に何も残らない） |
| `test/controller/admin/auth/refresh.test.ts`（新設） | インテグレーション | 正常系：admin の refresh token でローテーションでき、旧 jti が消えて `admin_refresh_token_rotated:{jti}` ができる。30 秒以内に同じ refresh token をもう一度使うと同じペア。異常系：user の refresh token では 401 / `admins` から消えた admin は 401 で jti が消える / Redis の一般ユーザーのキー（`refresh_token:*`）には何も書かない |
| `test/controller/admin/auth/logout.test.ts`（新設） | インテグレーション | 正常系：admin の refresh token で無効にでき、access token なしでも呼べる。異常系：user の refresh token でも 200（冪等）で、`admin_refresh_token:*` は残る |
| `test/controller/admin/auth/dev-login.test.ts`（新設） | インテグレーション | 正常系：`admin@dev.local` で 200。異常系：`@dev.local` 以外の email は 404 |
| `test/controller/admin/me/get.test.ts`（新設） | インテグレーション | 正常系：admin のトークンで 200（レスポンスを `toEqual`）。異常系：トークンなし 401 / user の access token で 401 / `admins` から消した admin のトークンで 401 |
| `test/controller/admin/auth.test.ts`（作り直す） | インテグレーション | `mountAdminApi` の認証の境界。admin のトークンなら認証を通る（ルートが無いので 404）。異常系：Authorization なし 401 / user の access token 401 / admin の refresh token を access として使うと 401 / user の鍵で `{ adminId }` を署名したトークン 401 / **user の access token で `/API/ADMIN/passage`・`/Api/Admin/passage` も 401**（大文字小文字ですり抜けない）/ `/api/admin-foo` は segment 境界で一致しないので user の認証が掛かる / 拒否したときに method と path を warn に残し、送られたトークンをログに出さない |
| `test/controller/user/get.test.ts`（追加） | インテグレーション | **admin の access token で `/api/user` が 401** |
| `test/middleware/admin-auth.test.ts`（新設） | ユニット | `ADMIN_PUBLIC_PATHS` は大文字と末尾の `/` の違いを含めて素通り / `/auth/google/x` は公開のパスにならない / payload に `adminId` が無い・`jti` があるトークンは 401 / 通ったら `req.adminId` が入る |
| `test/lib/is-path-under-prefix.test.ts`（新設） | ユニット | 完全一致 / segment 境界 / 大文字小文字を区別しない / `-foo` は一致しない |
| `test/lib/admin-token.test.ts` | — | 削除 |

### 既存の admin のテストの書き換え

`test/controller/admin/` の 22 ファイル（source 5・passage 11・stats 1・tag 4・user 1）を、同じ形で書き換える。

```typescript
const app = createTestApp()

mountAdminApi(app, adminRouter({
  tag: { list: new AdminTagListController(new DrizzleTagRepository(testDb)) },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

const res = await request(app).get("/api/admin/tag").set("Authorization", `Bearer ${adminToken}`)
```

- `app.use("/api/admin", adminRouter(...))` → `mountAdminApi(app, adminRouter(...))`（`createTestApp()` と `attachUnhandledExceptionHandler` はそのまま。`user.test.ts` のように `userRouter` も並べるファイルもあるため、admin だけの app を作る関数は足さない）
- `.set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)` → `.set("Authorization", \`Bearer ${adminToken}\`)`
- `cleanupTestData()` は全テーブルを空にするので、admin はテストごとに `beforeEach` で作る
- 「X-Admin-Token が無いと 401 を返す」は「Authorization が無いと 401 を返す」にする
- `ADMIN_TOKEN_HEADER`・`env` の import が要らなくなったら消す

```bash
pnpm --filter api test
pnpm --filter api lint
```

### 手元で API を叩く

```bash
pnpm --filter @repo/db db:migrate && pnpm --filter @repo/db db:seed
pnpm --filter api dev

TOKEN=$(curl -s -X POST http://localhost:8080/api/admin/auth/dev-login \
  -H "Content-Type: application/json" -d '{"email":"admin@dev.local"}' | jq -r .access_token)

curl -s http://localhost:8080/api/admin/me -H "Authorization: Bearer ${TOKEN}" | jq
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/admin/passage -H "Authorization: Bearer ${TOKEN}"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/user -H "Authorization: Bearer ${TOKEN}"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/admin/passage -H "X-Admin-Token: anything"
```

| 呼び出し | 期待 |
| --- | --- |
| `/api/admin/me` | 200 で `admin@dev.local` |
| `/api/admin/passage`（admin のトークン） | 200 |
| `/api/user`（admin のトークン） | 401 |
| `/api/admin/passage`（`X-Admin-Token`） | 401 |
| web で alice としてログインしたときの user の access token で `/API/ADMIN/me` | 401 |
| `redis-cli -p 6380 keys 'admin_refresh_token*'` | dev-login の jti のキーがある。`refresh_token:*` には増えていない |

### admin の登録コマンド

```bash
pnpm --filter @repo/db admin:create --email Someone@Example.com
pnpm --filter @repo/db admin:create --email Someone@Example.com
pnpm --filter @repo/db admin:create --email not-an-email
```

- 1 回目は `Created admin`、2 回目は `Admin already exists`。DB には `someone@example.com` で入る
- 3 回目は終了コード 1

### workflow と deploy

- dev で [反映の順番](#既存の環境への反映の順番) のとおりに流し、api が起動すること（`/api/health/ready` が 200）
- dev で「Admin Create」を流し、ログに `Created admin` が出て終了コード 0。同じ email でもう一度流すと `Admin already exists`
- email に `a@b.c; rm -rf /` のような値を入れると、Build command の step で止まる
