import { GitHubSignInButton } from "@/components/features/auth/GitHubSignInButton"
import { SignInDemo } from "@/components/features/auth/SignInDemo"
import { Wordmark } from "@/components/ui/Wordmark"

import { startGitHubOAuth } from "./actions"

const isProduction = process.env.NODE_ENV === "production"

/**
 * dev-login で使えるショートネーム
 * packages/db/drizzle/seed.ts と apps/web/src/app/api/dev/login/route.ts と一致させる
 */
const DEV_LOGIN_USERS = ["alice", "bob"] as const

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "認証に失敗しました。もう一度お試しください。",
  invalid_request: "リクエストが不正です。",
  oauth_denied: "GitHub アカウントへのアクセスが拒否されました。",
  state_mismatch: "セッションが切れました。もう一度お試しください。",
}

type Props = {
  searchParams: Promise<{ error?: string }>
}

/**
 * ログイン画面。左に説明と「GitHub でログイン」、右に本文の部品を使った体験デモを置く
 */
export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams
  const errorMessage = error
    ? Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : "エラーが発生しました。"
    : null

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Wordmark href="/sign-in" />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <h1 className="text-[32px] leading-[1.4] font-semibold tracking-tight text-fg sm:text-[38px]">
            <span className="inline-block">公式ドキュメントの</span>
            <span className="inline-block">英語で、</span>
            <span className="inline-block">毎日 1 問。</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-[1.9] text-fg-muted">
            GitHub の README や公式ドキュメントの実際の英文を読んで、4 択の設問に答える長文読解です。わからない単語はその場で意味を確かめられます。
          </p>
          {errorMessage && (
            <p className="mt-6 text-sm text-wrong" role="alert">
              {errorMessage}
            </p>
          )}
          <GitHubSignInButton action={startGitHubOAuth} />
          <p className="mt-3 text-xs text-fg-faint">初回はアカウントが自動で作られます。GitHub のリポジトリにはアクセスしません。</p>
          {!isProduction && (
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
              <span>Dev Login (NODE_ENV !== &quot;production&quot;)</span>
              {DEV_LOGIN_USERS.map(user => (
                <a
                  className="underline underline-offset-2 hover:text-fg-muted"
                  href={`/api/dev/login?as=${user}`}
                  key={user}
                >
                  Login as {user}
                </a>
              ))}
            </p>
          )}
        </div>
        <SignInDemo />
      </main>
    </div>
  )
}
