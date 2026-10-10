# step3-web-github-login

web のログイン画面を本実装し、GitHub の OAuth（PKCE）でログインできるようにする。あわせて mobile 用の callback（code と state を app の custom scheme へ転送するだけ）を作る。

## 前提

- [step2-api-auth-github](./step2-api-auth-github.md)（`POST /api/auth/github`）
- 仕様: [web のフロー](../README.md#web-のフロー)、[mobile のフロー](../README.md#mobile-のフロー)、[既存の Google OAuth の扱い](../README.md#既存の-google-oauth-の扱い)
- デザイン: [UI 設計 > ログイン](../README.md#ログイン)。見た目の正本は `apps/web/src/app/mock/sign-in/`（モックは消さない）

## 対応内容

### 1. 環境変数と cookie

- `apps/web/src/env.ts` に `GITHUB_OAUTH_CLIENT_ID: z.string().default("dummy")` を足す（`.env.local` とデプロイ環境の web の env にも。Secret は持たない）
- `apps/web/src/libs/auth.ts` に OAuth の一時 cookie をまとめて扱う関数を足す。既存の `OAUTH_STATE_COOKIE` はそのまま使う

```typescript
export const OAUTH_CODE_VERIFIER_COOKIE = "app_oauth_code_verifier"
export const OAUTH_TIMEZONE_COOKIE = "app_oauth_timezone"

const OAUTH_COOKIE_MAX_AGE = 60 * 5

export type OAuthSession = { codeVerifier: string; state: string; timezone: string | null }

/** 認可画面へ行く前に保存する。GitHub からのトップレベルの戻りで送らせるため sameSite=lax */
export const saveOAuthSession = async (session: OAuthSession) => { /** 3 つの cookie を httpOnly / maxAge 5 分で set。timezone が null なら delete */ }

/** callback で 1 回だけ読み、その場で 3 つとも消す（使い回させない）。無い cookie は undefined */
export const takeOAuthSession = async (): Promise<{ codeVerifier?: string; state?: string; timezone?: string }> => { /** get → delete */ }
```

### 2. PKCE と認可 URL（`apps/web/src/libs/github-oauth.ts`）

```typescript
import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { env } from "@/env"

/** 読み取り専用のプロフィールとメールだけを要求する */
const GITHUB_SCOPE = "read:user user:email"

export const buildGitHubCallbackUrl = (): string => `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`

/** verifier は 32 byte の乱数を base64url にした 43 文字。challenge はその SHA-256（S256） */
export const createPkcePair = (): { codeChallenge: string; codeVerifier: string } => {
  const codeVerifier = randomBytes(32).toString("base64url")
  return { codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"), codeVerifier }
}

export const buildGitHubAuthorizeUrl = (input: { codeChallenge: string; redirectUri: string; state: string }): string => {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: input.redirectUri,
    scope: GITHUB_SCOPE,
    state: input.state,
  })
  return `https://github.com/login/oauth/authorize?${params.toString()}`
}
```

### 3. Server Action（`apps/web/src/app/sign-in/actions.ts` を書き換え）

`startGoogleOAuth` は削除する（唯一の呼び出し元の Google ボタンを外すため）。`/api/auth/callback/google`・web の `GOOGLE_CLIENT_ID`・api の Google 実装は残す（Google の削除は別タスクでまとめて行う）。

```typescript
"use server"

const TIMEZONE_MAX_LENGTH = 64

/**
 * GitHub OAuth の開始。state・code_verifier・ブラウザのタイムゾーンを cookie に保存して認可画面へ送る。
 * タイムゾーンの妥当性は api が検証する（通らなければ既定値で作られる）
 */
export const startGitHubOAuth = async (formData: FormData) => {
  const timezone = formData.get("timezone")
  const state = randomBytes(16).toString("hex")
  const { codeChallenge, codeVerifier } = createPkcePair()
  await saveOAuthSession({
    codeVerifier,
    state,
    timezone: typeof timezone === "string" && timezone.length <= TIMEZONE_MAX_LENGTH ? timezone : null,
  })
  redirect(buildGitHubAuthorizeUrl({ codeChallenge, redirectUri: buildGitHubCallbackUrl(), state }))
}
```

### 4. callback の Route Handler

`apps/web/src/app/api/auth/callback/github/route.ts`（既存の `callback/google/route.ts` と同じ形）:

1. `error` があれば `/sign-in?error=oauth_denied`、`code` か `state` が無ければ `invalid_request`
2. `takeOAuthSession()` で cookie を読んで消す。`state` 不一致か `codeVerifier` が無ければ `state_mismatch`
3. `POST {API_URL}/api/auth/github` に `{ code, code_verifier, redirect_uri: buildGitHubCallbackUrl(), timezone }` を送る（body は `AuthGitHubRequest` で型付け）。非 2xx は `auth_failed`
4. `authGitHubResponseSchema.parse` → `setAuthCookies(access_token, refresh_token)` → `/` へ redirect

`apps/web/src/app/api/auth/callback/github/mobile/route.ts`（mobile 用。web は code を使わない）:

```typescript
const APP_CALLBACK_URL = "techenglish://auth/callback"

const FORWARDED_PARAMS = ["code", "error", "state"] as const

/**
 * GitHub から戻った code と state を、そのまま app の custom scheme へ 302 で渡す
 */
export const GET = (req: NextRequest) => {
  const params = new URLSearchParams()
  for (const key of FORWARDED_PARAMS) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) params.set(key, value)
  }
  return NextResponse.redirect(`${APP_CALLBACK_URL}?${params.toString()}`, 302)
}
```

`src/proxy.ts` の `PUBLIC_PATHS` に `"/api/auth/callback/github"` を足す（セグメント境界の前方一致なので `/mobile` も含まれる）。

### 5. ルートレイアウトにフォントとダークテーマを移す

`apps/web/src/app/layout.tsx` を `app/mock/layout.tsx` と同じ設定にする（本番の画面すべてが使う。web の他の画面の step が先に移していれば不要）。

- `next/font/google` で Literata（normal / italic）・IBM Plex Sans JP（400〜700、`preload: false`）・IBM Plex Mono（400 / 500）を読み込み、変数名は `--font-literata` / `--font-plex-sans-jp` / `--font-plex-mono`（`globals.css` の `--font-reading` 等が参照している）
- `<html lang="ja">`、`<body>` の class は `{3 つの variable} min-h-dvh bg-canvas font-ui text-fg antialiased [color-scheme:dark] selection:bg-amber/30`。Geist は外す
- `metadata` は `title: "tech-english"`。`EventFlushOnHide` は残す

### 6. 本文の部品を共通部品に移植する

体験デモと解答画面（[reading-practice step6](../../reading-practice/tasks/step6-web-attempt.md) が再利用・拡張する）で同じ部品を使う。

| 移植元 | 移植先 | 変更点 |
| --- | --- | --- |
| `app/mock/_components/PassageReader.tsx` | `components/features/passage/PassageReader.tsx` | 型の import を `./types` に替える。描画と挙動は変えない |
| `app/mock/_components/passage-text.ts` | `components/features/passage/passage-text.ts` | 同上（`segmentText` / `lookUpDictionary` はデモ用にそのまま残す） |
| `app/mock/_components/Wordmark.tsx` | `components/ui/Wordmark.tsx` | `href` の既定値を `/` に |

```typescript
/** apps/web/src/components/features/passage/types.ts（表示用の型。API のレスポンス型ではない） */
export type ReaderBlockType = "code" | "heading" | "list_item" | "paragraph" | "quote"

export type ReaderBlock = { lang?: string; text: string; translationJa?: string; type: ReaderBlockType }

export type ReaderGlossaryEntry = {
  id: number
  blockIndex: number
  lemma: string
  meaningJa: string
  noteJa?: string
  partOfSpeech: string
  surface: string
}

export type ReaderWordLookup = { meaningJa: string; source: "dictionary" | "glossary"; surface: string }
```

### 7. ログイン画面

| ファイル | 内容 |
| --- | --- |
| `app/sign-in/page.tsx` | `app/mock/sign-in/page.tsx` を移植（Server Component）。`<a href="/mock/home">` を下の `GitHubSignInButton` に、`Wordmark` の `href` を `/sign-in` に替える。`?error=` があれば見出しの説明とボタンの間に `<p className="mt-6 text-sm text-wrong" role="alert">` で出す（文言は既存の `ERROR_MESSAGES` を流用し、`oauth_denied` は「GitHub アカウントへのアクセスが拒否されました。」）。開発環境（`NODE_ENV !== "production"`）だけ、注記の下に既存の dev ログインのリンク（`/api/dev/login?as=alice` / `bob`）を `text-xs text-fg-faint` で残す |
| `components/features/auth/GitHubSignInButton.tsx` | Client Component。下のコード |
| `components/features/auth/SignInDemo.tsx` | `app/mock/sign-in/SignInDemo.tsx` を移植。データは `@/libs/mock-data` ではなく下のデモ用データから取る |
| `components/features/auth/sign-in-demo-data.ts` | `DEMO_BLOCKS`（`MOCK_BLOCKS[0]` と `[5]`）、`DEMO_GLOSSARY`（`blockIndex === 5` の語句を `blockIndex: 1` にしたもの）、`DEMO_DICTIONARY`（`MOCK_DICTIONARY`）を **値ごとコピー** する（モックは後で消すので import しない） |

```tsx
"use client"

/**
 * 「GitHub でログイン」。送信時にブラウザのタイムゾーンを足して Server Action を呼ぶ
 */
export function GitHubSignInButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form
      action={async (formData) => {
        formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)
        await action(formData)
      }}
      className="mt-8"
    >
      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button className="（モックの <a> の class から mt-8 を除いたもの） disabled:opacity-70" disabled={pending} type="submit">
      {/** モックと同じ GitHub マークの svg */}
      GitHub でログイン
    </button>
  )
}
```

page からは `<GitHubSignInButton action={startGitHubOAuth} />` と渡す。

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm dev
pnpm --filter web build
pnpm lint:fix
curl -sI "http://localhost:3000/api/auth/callback/github/mobile?code=abc&state=xyz"
```

`verify-web-page` skill で実画面を確認する（新規ページのため before なし）。

- [ ] 未ログインで `/sign-in` が開け、console の error が 0 件。`/mock/sign-in` と見た目が一致する（スマホ幅では説明とボタン → デモの順）
- [ ] デモで単語をクリックするとカードが出て、「訳」で和訳に切り替わる
- [ ] Google のボタンが無く、開発環境では dev ログインのリンクがある
- [ ] 「GitHub でログイン」→ 認可 URL に `code_challenge`・`code_challenge_method=S256`・`scope=read:user user:email` が付いている
- [ ] 許可すると `/` に戻り、`app_access_token` / `app_refresh_token` が入り、`app_oauth_*` の cookie は消えている
- [ ] DB の `users.timezone` がブラウザのタイムゾーン、`auth_accounts.provider` が `github`
- [ ] 2 回目のログインで同じユーザーになり、GitHub 側で名前を変えると DB に反映される
- [ ] 認可画面で「Cancel」→ `/sign-in?error=oauth_denied`、callback の `state` を書き換えて開く → `state_mismatch`
- [ ] 認可画面を開いた状態で DevTools から `app_oauth_code_verifier` を別の 43 文字に書き換えて許可 → `auth_failed`（GitHub が PKCE を検証していることの確認。[mobile のフロー](../README.md#mobile-のフロー) の確認事項）
- [ ] mobile 用 callback の curl が `302` で `location: techenglish://auth/callback?code=abc&state=xyz`
- [ ] 既存のメモの画面・`/mock/**` が壊れていない（ルートレイアウトの変更の影響確認）
