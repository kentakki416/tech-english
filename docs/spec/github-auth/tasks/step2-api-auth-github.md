# step2-api-auth-github

api に GitHub ログイン（`POST /api/auth/github`）とタイムゾーンの変更（`PATCH /api/user`）を足し、`GET /api/user` のレスポンスに `timezone` を加える。web / mobile の画面は step3 / step4。

## 前提

- [step1-db-user-timezone](./step1-db-user-timezone.md)
- local 用の GitHub OAuth App を作成済み（callback URL `http://localhost:3000/api/auth/callback/github`、構成は [GitHub OAuth App の構成](../README.md#github-oauth-app-の構成)）
- 仕様: [GitHub から取得する情報](../README.md#github-から取得する情報)、[必要な API](../README.md#必要な-api)。GitHub の API はテストではモックする

## 対応内容

### 1. 環境変数

`apps/api/src/env.ts` に `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` を足す（既存の `GOOGLE_CLIENT_*` と同じく `z.string().default("dummy")`）。値は `pnpm exec dotenvx set GITHUB_OAUTH_CLIENT_SECRET "..." -f .env.local` で入れる。デプロイ環境は `GOOGLE_CLIENT_*` と同じ場所（`scripts/deploy/seed-secrets.sh`、`infra/terraform/aws/env/{dev,prd}/main.tf`、`.github/workflows/deploy-aws-min.yml`）に並べて足す。

### 2. api-schema

```typescript
/** packages/schema/src/api-schema/user.ts */

/**
 * IANA タイムゾーン名。Intl.DateTimeFormat が受け付ける名前（UTC や別名も含む）を有効とする
 */
export const timezoneSchema = z.string().min(1).max(64).refine((value) => isValidTimeZone(value))

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** getUserResponseSchema に timezone: z.string() を足す（既存の並びのまま末尾） */

// ========================================================
// PATCH /api/user - タイムゾーンの変更
// ========================================================

export const updateUserRequestSchema = z.object({
  timezone: timezoneSchema,
})

/** getUserResponseSchema と同じ形を独立して定義する（共通スキーマは作らない） */
export const updateUserResponseSchema = z.object({
  id: z.number(),
  avatar_url: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  timezone: z.string(),
  created_at: z.string(),
})
```

```typescript
/** packages/schema/src/api-schema/auth.ts（timezoneSchema は ./user から import） */

// ========================================================
// POST /api/auth/github - GitHub OAuth の code を JWT に変換
// ========================================================

export const authGitHubRequestSchema = z.object({
  code: z.string().min(1),
  /** PKCE（RFC 7636）。43〜128 文字 */
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z.string().url(),
  /**
   * 初回作成時だけ使う。検証に通らない値でログインを失敗させないよう、未指定として扱う（DB の既定値になる）
   */
  timezone: timezoneSchema.optional().catch(undefined),
})

export const authGitHubResponseSchema = z.object({
  access_token: z.string(),
  is_new_user: z.boolean(),
  refresh_token: z.string(),
  /** updateUserResponseSchema と同じフィールド（id / avatar_url / email / name / timezone / created_at）を独立して書く */
  user: z.object({ ... }),
})
```

`Intl.supportedValuesOf("timeZone")` の一覧で検証しない。ICU の正規名だけの一覧で、`UTC` が含まれず、`Asia/Kolkata` のような新しい名前も欠けることがあるため（ブラウザや端末が返す名前と食い違う）。値は受け取ったまま保存する（日付の計算はすべて `Intl` に `timeZone` を渡して行うので、別名のままでよい）。

### 3. `GitHubOAuthClient`（`apps/api/src/client/github-oauth.ts`）

```typescript
export type GitHubUserInfo = {
  /** GitHub の数値 id を文字列にしたもの（auth_accounts.provider_account_id） */
  id: string
  avatarUrl: string | null
  /** primary かつ verified のメール。無ければ null */
  email: string | null
  login: string
  name: string | null
}

export type GetGitHubUserInfoInput = { code: string; codeVerifier: string; redirectUri: string }

export interface IGitHubOAuthClient {
  /** code が使えない（期限切れ・使用済み・verifier 不一致）ときは null。通信障害などは throw */
  getUserInfo(input: GetGitHubUserInfoInput): Promise<GitHubUserInfo | null>
}
```

実装の要点（`GoogleOAuthClient` と同じく Client ID / Secret をコンストラクタで受け、外部のレスポンスは Zod で検証する）:

1. `POST https://github.com/login/oauth/access_token` に `client_id` / `client_secret` / `code` / `code_verifier` / `redirect_uri` を `URLSearchParams` で送る（`Accept: application/json`）。HTTP が非 2xx なら throw
2. **GitHub は失敗も 200 + `{ error }` で返す**ので本文で判定する。`z.union([z.object({ access_token: z.string().min(1) }), z.object({ error: z.string() })])` で検証し、`error === "incorrect_client_credentials"`（設定ミス）は throw、それ以外の `error` は `null` を返す
3. `GET https://api.github.com/user` と `GET /user/emails` を `Promise.all` で呼ぶ。ヘッダは `Authorization: Bearer {token}`、`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`、`User-Agent: tech-english`（GitHub は UA 必須）。非 2xx は throw
4. `/user` は `{ avatar_url, id: number, login, name: string | null }`、`/user/emails` は `{ email, primary, verified }[]` で検証し、`emails.find((item) => item.primary && item.verified)?.email ?? null` を取る。GitHub の access token は返さず捨てる

### 4. Repository（`UserRepository` を拡張）

```typescript
/** apps/api/src/repository/user-repository.ts */
export type CreateUserInput = {
  avatarUrl?: string
  email?: string
  name?: string
  /** 省略すると DB の既定値（Asia/Tokyo） */
  timezone?: string
}

export type UpdateUserProfileInput = {
  avatarUrl: string | null
  name: string
}

export interface UserRepository {
  create(data: CreateUserInput, tx?: TransactionContext): Promise<User>
  findByEmail(email: string): Promise<User | null>
  findById(id: number): Promise<User | null>
  updateProfile(id: number, data: UpdateUserProfileInput): Promise<User>
  updateTimezone(id: number, timezone: string): Promise<User>
}
```

- Drizzle: `create` の `values` に `timezone: data.timezone`（`undefined` なら既定値）。`updateProfile` / `updateTimezone` は `update(users).set(...).where(eq(users.id, id)).returning()` で、行が無ければ `DrizzleMemoRepository.update` と同じく throw
- Prisma: `user.update({ data, where: { id } })`（無ければ P2025 で throw）
- 契約テスト（`test/repository/user-repository.test.ts`）: `create` に `timezone` を渡すと保存される／`updateProfile` は名前とアイコンだけが変わりメールとタイムゾーンは変わらない／`updateTimezone` で変わる／存在しない id の更新は throw

### 5. Service

```typescript
/** apps/api/src/service/auth-service.ts */
export const authenticateWithGitHub = async (
  input: { code: string; codeVerifier: string; redirectUri: string; timezone?: string },
  repo: Repositories,
  gitHubOAuthClient: IGitHubOAuthClient,
  tokenGenerators: TokenGenerators,
): Promise<Result<AuthenticateWithGitHubSuccess>> => {
  const gitHubUser = await gitHubOAuthClient.getUserInfo({
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri,
  })
  if (!gitHubUser) return err(unauthorizedError("GitHub authorization code is invalid"))

  /** 表示名は name、未設定なら login。ログインのたびに最新化する */
  const name = gitHubUser.name ?? gitHubUser.login
  const existingAccount = await repo.authAccountRepository.findByProvider("github", gitHubUser.id)

  if (existingAccount) {
    const user = await repo.userRepository.updateProfile(existingAccount.user.id, { avatarUrl: gitHubUser.avatarUrl, name })
    const { accessToken, refreshToken } = await issueTokens(user.id, repo, tokenGenerators)
    return ok({ accessToken, isNewUser: false, refreshToken, user })
  }

  /** メールが一致しても既存ユーザーに紐づけない。users.email の unique 衝突だけを避ける */
  const emailOwner = gitHubUser.email ? await repo.userRepository.findByEmail(gitHubUser.email) : null
  const user = await repo.transactionRunner.run(async (tx) => {
    const newUser = await repo.userRepository.create(
      {
        avatarUrl: gitHubUser.avatarUrl ?? undefined,
        email: emailOwner ? undefined : gitHubUser.email ?? undefined,
        name,
        timezone: input.timezone,
      },
      tx,
    )
    await repo.authAccountRepository.create({ provider: "github", providerAccountId: gitHubUser.id, userId: newUser.id }, tx)
    return newUser
  })
  const { accessToken, refreshToken } = await issueTokens(user.id, repo, tokenGenerators)
  return ok({ accessToken, isNewUser: true, refreshToken, user })
}
```

- `issueTokens(userId, repo, tokenGenerators)` は `authenticateWithGoogle` 末尾の「access 生成 → refresh 生成 → `refreshTokenRepository.save`」を切り出した内部関数（Google 側もこれを使う）。`AuthenticateWithGitHubSuccess` は Google と同じ形で別名定義する
- ログは Google と同じ粒度。`githubId` は debug、メール（PII）は出さない

```typescript
/** apps/api/src/service/user-service.ts */
export const updateUserTimezone = async (
  userId: number,
  input: { timezone: string },
  repo: { userRepository: UserRepository },
): Promise<Result<User>> => {
  /** 削除済みユーザーの access token が残っている場合（README「アカウント削除の処理」） */
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(unauthorizedError("User not found"))
  return ok(await repo.userRepository.updateTimezone(userId, input.timezone))
}
```

### 6. Controller / Router / DI

- `src/controller/auth/github.ts` の `AuthGitHubController`: `AuthGoogleController` と同じ構成（コンストラクタは `authAccountRepository, userRepository, refreshTokenRepository, transactionRunner, gitHubOAuthClient`）。`parseRequest(authGitHubRequestSchema, req.body)` → `service.auth.authenticateWithGitHub` → `parseResponse(authGitHubResponseSchema, ...)` で 200
- `src/controller/user/update.ts` の `UserUpdateController`: `parseRequest(updateUserRequestSchema, req.body)` → `service.user.updateUserTimezone(req.userId!, ...)` → 200。`UserGetController` のレスポンスに `timezone: result.value.timezone` を足す
- `auth-router.ts` に `github?: AuthGitHubController` → `router.post("/github", ...)`、`user-router.ts` に `update?: UserUpdateController` → `router.patch("/", ...)`
- `src/const/index.ts` の `PUBLIC_PATHS` に `"/api/auth/github"` を足す（`"/api/auth/google"` の前）
- `src/index.ts`: `new GitHubOAuthClient(env.GITHUB_OAUTH_CLIENT_ID, env.GITHUB_OAUTH_CLIENT_SECRET)` を外部 SaaS client の節で生成し、`authRouter({ ..., github })` / `userRouter({ get, update })` に渡す

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter api test
pnpm lint:fix
```

Service ユニット（`test/service/auth-service/authenticateWithGitHub.test.ts`、`test/service/user-service/updateUserTimezone.test.ts`）:

- [ ] 正常系: 既存アカウント → `updateProfile` が `{ avatarUrl, name }` で呼ばれ、`create` は呼ばれず `isNewUser: false`
- [ ] 正常系: `name` が null → `login` が名前になる
- [ ] 正常系: 新規 → `create` に `email` と `timezone`、`authAccountRepository.create` に `provider: "github"` と GitHub の id
- [ ] 正常系: 新規でメールが別ユーザーと一致 → `create` の `email` が `undefined`（既存ユーザーには触れない）
- [ ] 正常系: GitHub のメールが null → `findByEmail` を呼ばない
- [ ] 異常系: `getUserInfo` が null → 401 `UNAUTHORIZED`、Repository とトークン保存は呼ばれない
- [ ] 異常系: `getUserInfo` が throw → そのまま reject する
- [ ] `updateUserTimezone`: 正常系で更新後の `User`／異常系でユーザーが無ければ 401 で `updateTimezone` を呼ばない

Client（`test/client/github-oauth.test.ts`。`vi.spyOn(globalThis, "fetch")` で GitHub を差し替える）:

- [ ] token の交換に `code_verifier` と `redirect_uri` を送る
- [ ] `{ error: "bad_verification_code" }` → `null`／`incorrect_client_credentials` → throw／`/user` が 500 → throw
- [ ] primary かつ verified のメールだけを採る（primary でも未検証なら null）

Controller インテグレーション（`test/controller/auth/github.test.ts`、`test/controller/user/update.test.ts`、`get.test.ts`。`IGitHubOAuthClient` だけモック）:

- [ ] 新規 → 200（`toEqual` で全フィールド）、`users` に `timezone`、`auth_accounts` に `provider = "github"`、Redis に jti
- [ ] 既存 → 200 `is_new_user: false`、DB の名前とアイコンが GitHub の値に変わる
- [ ] 同じメールの Google ユーザーがいる → 別ユーザーが `email = null` で作られ、既存ユーザーは変わらない
- [ ] `timezone` が `"Mars/Base"` → 200 で `timezone` は `Asia/Tokyo`
- [ ] `code_verifier` 欠落・42 文字 → 400／`getUserInfo` が null → 401／throw → 500
- [ ] `PATCH /api/user`: 200 で DB が変わる／`UTC`・`Asia/Kolkata` も 200／不正なタイムゾーン（`Foo/Bar`）→ 400／トークンなし → 401／存在しないユーザーの token → 401
- [ ] `GET /api/user` のレスポンスに `timezone` が入る

実際の GitHub との交換（PKCE を含む）は step3 の手動確認で行う。
